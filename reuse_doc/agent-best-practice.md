
# My Assistant Agent 开发规范文档

## 名词解释

注：此处的线程不是多线程并发中的线程，而是表达一个对话的完整列表。

## 1. Agent 核心接口规范

### 1.1 必须实现的接口

```javascript
constructor(metadata, settings) {
    this.metadata = metadata;
    this.settings = settings;
    // 初始化LLM客户端
}

async initialize() { // Base Agent已经实现，如果没有特殊的，就可以不自己实现
    // 设置默认状态
    this.settings = this.settings || {};
    this.settings.briefStatus = this.settings.briefStatus || { phase: "initial_phase" };
    
    // 初始化阶段处理器
    await this._initializeStateHandlers();
}

/*
 * 初始化状态处理器
 * 子类应覆盖此方法以初始化其特定的状态处理器
 */
async _initializeStateHandlers() {
    // 子类应实现此方法
    this.stateHandlers = {
        initial_phase: new SomeStateHandler({/*...*/})
    };
}

static async create(metadata, settings) { // Base Agent已经实现，如果没有特殊的，就可以不自己实现
    const agent = new this(metadata, settings);
    await agent.initialize();
    return agent;
}

async executeTask(task, thread) {
    if (task.name === 'chatPair') { // 额外支持的各种task
        return new Response(task.meta.bot);
    } else {
        // 默认使用状态处理流程
        return this._handleMessageProcessing(task, thread);
    }
}

async loadOperations(agent) { //主Agent才必须实现，子Agent不需要
    return [/* 操作列表 */];
}
```

## 2. 状态管理最佳实践

### 2.1 状态处理结构

```javascript
// 状态处理器基类
class StateHandler {
    constructor(config = {}) {
        this.phase = config.phase;
        this.nextPhase = config.nextPhase;
    }
    
    async handle(task, thread, agent) {
        // 处理逻辑
        // ...
        
        // 建议状态更新
        this._suggestPhaseUpdate(task, thread);
        
        return new Response(responseText);
    }
    
    _suggestPhaseUpdate(task, thread) {
        const currentSettings = task.host_utils.threadRepository.getThreadSettings(thread.id) || {};
        const updatedSettings = {
            ...currentSettings,
            _phaseUpdateSuggestion: {
                phase: this.nextPhase
            }
        };
        task.host_utils.threadRepository.updateThreadSettings(thread, updatedSettings);
    }
}
```

### 2.2 状态应用与处理委托

```javascript
// 在Agent类中实现
async _handleMessageProcessing(task, thread) {
    // 必须先应用状态更新建议
    this._applyPhaseUpdateSuggestion(task, thread);
    
    // 然后根据当前状态选择处理器
    const currentStage = this.settings.briefStatus.phase;
    const handler = this.stateHandlers[currentStage];

    if (!handler) {
        throw new Error(`找不到 ${currentStage} 阶段处理器`);
    }

    return handler.handle(task, thread, this);
}

_applyPhaseUpdateSuggestion(task, thread) {
    const currentSettings = task.host_utils.threadRepository.getThreadSettings(thread.id) || {};
    
    if (currentSettings._phaseUpdateSuggestion) {
        // 如果不是retry任务，应用状态更新
        if (task.meta._ui_action === 'retry') {
            // 如果是retry任务，只移除建议但不应用
            const updatedSettings = { ...currentSettings };
            delete updatedSettings._phaseUpdateSuggestion;
            task.host_utils.threadRepository.updateThreadSettings(thread, updatedSettings);
        } else {
           const newPhase = currentSettings._phaseUpdateSuggestion.phase;
            
            this.settings.briefStatus = {
                ...this.settings.briefStatus,
                phase: newPhase
            };
            
            const updatedSettings = {
                ...currentSettings,
                briefStatus: this.settings.briefStatus
            };
            
            delete updatedSettings._phaseUpdateSuggestion;
            task.host_utils.threadRepository.updateThreadSettings(thread, updatedSettings);
        }
    }
}
```

## 3. 子线程交互模型

### 3.1 概述与核心理念

子线程交互模型是一种设计模式，用于处理需要多步骤完成的复杂消息生成过程。它创建了一个嵌套的执行环境，允许在单个消息响应中执行多轮交互处理。

核心理念:

- 完整性: 处理需要多步骤才能完成的复杂任务
- 封装性: 将复杂处理过程封装在子线程中，不影响主线程
- 自动化: 系统自动执行一系列步骤，无需用户干预
- 高质量: 通过多步骤反思和改进，提升最终输出质量

### 3.2 架构设计

#### 3.2.1 整体架构

子线程交互模型采用层次结构设计：

```
主线程 (MainThread)
  └── 主线程StateHandler
       └── 子线程 (SubThread)
            └── 子线程Agent (继承SubThreadAgent)
                 └── InteractionUnit (多个)
                      └── StateHandler (每个InteractionUnit持有对应的StateHandler)
```

#### 3.2.2 组件关系

1. 主线程StateHandler: 负责创建子线程并启动子线程交互
2. 子线程Agent: 管理子线程的完整生命周期，协调多个InteractionUnit
3. InteractionUnit: 处理单轮完整的bot-user交互对，持有并委托StateHandler生成bot消息
4. StateHandler: 负责生成bot消息，由InteractionUnit持有并调用

#### 3.2.3 数据结构

子线程存储在主线程消息的元数据中：

```javascript
// 主线程消息结构
{
  id: "msg_1",
  sender: "bot",
  text: "主线程消息内容",
  meta: {
    _thread: {  // 子线程存储在这里
      messages: [],
      settings: {
        briefStatus: { phase: "initial_phase" }
      },
      // 其他子线程属性...
    }
  }
}
```

### 3.3 核心组件

#### 3.3.1 SubThreadAgent基类

职责:
- 封装子线程处理的通用逻辑
- 管理并执行一系列InteractionUnit
- 控制交互流程状态迁移
- 判断何时完成交互流程
- 汇总结果并生成最终响应

关键方法:
- `initialize()`: 初始化Agent及其交互单元
- `executeTask(task, thread)`: 执行任务，主入口点
- `_executeSubThreadInteraction(task, thread)`: 执行子线程交互流程
- `_executeInteractionUnits(task, subThread)`: 执行一系列交互单元
- `_summarizeResults(results, subThread)`: 汇总交互结果

#### 3.3.2 InteractionUnit

职责:
- 处理一轮完整的bot-user交互
- 持有并委托StateHandler生成bot消息
- 处理bot消息中的指令并生成user反馈消息
- 建议状态更新

关键方法:
- `execute(task, thread, agent)`: 执行完整的交互单元
- `_executeBotMessageGeneration(task, thread, agent)`: 委托StateHandler生成bot消息
- `generateUserMessage(botMessage, task, thread, agent)`: 处理bot指令并生成user反馈
- `_suggestPhaseUpdate(task, thread)`: 建议下一个状态阶段

#### 3.3.3 StateHandler与InteractionUnit的关系

- StateHandler专注于生成bot消息内容
- InteractionUnit持有StateHandler实例
- InteractionUnit委托StateHandler生成bot消息
- InteractionUnit处理bot消息指令并生成用户反馈
- 两者共享同一状态阶段(phase)信息

### 3.4 子线程创建与存储

当需要在单个消息处理过程中进行多轮交互时：

```javascript
// 在主线程StateHandler中
async handle(task, thread, agent) {
    // 创建子线程结构
    const subThread = {
        messages: [],
        id: `sub_${thread.id}_${Date.now()}`
    };
    
    // 存储在消息元数据中
    const message = thread.messages[thread.messages.length - 1];
    if (!message.meta) message.meta = {};
    message.meta._thread = subThread;
    
    // 初始化并调用子线程Agent
    const mySubThreadAgent = await MySubThreadAgent.create(/* metadata, settings */);
    return await mySubThreadAgent.executeTask(/* task */, thread); // 注意：始终传递的都是完整的主thread，因为Agent永远都是处理主thread或最后一个message的子thread，所以它可以根据自己的定位找到对应的thread，或者在task的meta里放上自己要主要处理的子thread的属性path，一样可以传递。
}
```

### 3.5 子线程Agent规范

子线程Agent应该继承SubThreadAgent基类，而不是直接继承BaseAgent:

```javascript
// SubThreadAgent是所有子线程Agent的基类，封装了通用逻辑
class SubThreadAgent extends BaseAgent {
    // 基本实现，包含子线程通用逻辑
}

// 具体业务的子线程Agent继承SubThreadAgent
class MySubThreadAgent extends SubThreadAgent {
    // 实现特定业务逻辑
    async _initializeInteractionUnits() {/* ... */}
    async _loadSystemPrompt() {/* ... */}
    _summarizeResults(results, subThread) {/* ... */}
}
```

### 3.6 子线程的多轮交互模式

子线程内部实现了一种特定的交互模式:

1. Bot指令/内容生成:
   - 指令类型: 查询信息、修改文件、执行操作等
   - 内容生成: 生成代码、文本或其他内容，并提供保存或使用的建议
   - Bot消息同时包含生成的内容和执行指导

2. User执行反馈:
   - User消息仅包含执行结果的反馈
   - User不会生成内容，只是报告程序执行的结果
   - 典型反馈包括：操作成功、写入位置、错误信息等

```
// 子线程交互示例
子线程.messages = [
  // 示例1：Bot生成代码并提供存储建议
  {sender: "bot", text: "我已生成监控脚本代码：\n```js\nfunction monitor() {\n  console.log('监控中');\n}\n```\n请将此代码保存到/scripts/monitor.js并设置执行权限"},
  {sender: "user", text: "操作完成：代码已保存到/scripts/monitor.js，并已设置可执行权限"},
  
  // 示例2：Bot请求修改文件
  {sender: "bot", text: "任务：请修改配置文件'/etc/config.json'，将maxConnections值更新为100"},
  {sender: "user", text: "修改结果：配置文件已更新，新值已生效"},
  
  // 示例3：Bot执行数据分析并提供结果
  {sender: "bot", text: "我已分析日志数据，结果如下：\n- 错误率：2.3%\n- 峰值时间：14:00-16:00\n- 异常IP：192.168.1.15\n请将分析结果保存到/reports/analysis.txt"},
  {sender: "user", text: "保存完成：分析结果已写入/reports/analysis.txt"}
]
```

### 3.7 交互单元模式

```javascript
/*
 * 交互单元 - 负责一轮完整的bot-user交互
 */
class InteractionUnit {
    /*
     * 构造交互单元
     * @param {Object} config - 配置选项
     * @param {string} config.phase - 对应的状态阶段
     * @param {string} config.nextPhase - 完成后的下一个状态阶段
     * @param {StateHandler} config.stateHandler - 关联的状态处理器
     */
    constructor(config = {}) {
        this.phase = config.phase;
        this.nextPhase = config.nextPhase;
        
        // 持有对应的StateHandler
        this.stateHandler = config.stateHandler || 
            new DefaultStateHandler({ phase: this.phase, nextPhase: this.nextPhase });
    }
    
    /*
     * 执行完整的交互单元
     * @param {Object} task - 当前任务对象
     * @param {Object} thread - 线程对象
     * @param {Object} agent - Agent实例
     * @returns {Promise<Object>} - 包含bot和user消息的结果对象
     */
    async execute(task, thread, agent) {
        // 1. 委托StateHandler生成bot消息
        const botMessageText = await this._executeBotMessageGeneration(task, thread, agent);
        
        // 2. 创建bot消息对象
        const botMessage = {
            id: `sub_bot_${Date.now()}`,
            sender: "bot",
            text: botMessageText,
            timestamp: Date.now()
        };
        
        // 3. 处理指令并生成user反馈
        const userMessageText = await this.generateUserMessage(botMessage, task, thread, agent);
        
        // 4. 创建user消息对象
        const userMessage = {
            id: `sub_user_${Date.now()}`,
            sender: "user",
            text: userMessageText,
            timestamp: Date.now()
        };
        
        // 5. 建议状态更新
        this._suggestPhaseUpdate(task, thread);
        
        // 6. 返回完整的交互结果
        return {
            botMessage,
            userMessage
        };
    }
    
    /*
     * 委托StateHandler生成bot消息
     * @param {Object} task - 当前任务对象
     * @param {Object} thread - 线程对象
     * @param {Object} agent - Agent实例
     * @returns {Promise<string>} - bot消息内容
     */
    async _executeBotMessageGeneration(task, thread, agent) {
        if (!this.stateHandler) {
            throw new Error("缺少StateHandler，无法生成bot消息");
        }
        
        // 调用StateHandler的handle方法生成消息
        const response = await this.stateHandler.handle(task, thread, agent);
        return response.getFullMessage();
    }
    
    /*
     * 处理bot指令并生成user反馈
     * @param {Object} botMessage - bot消息对象
     * @param {Object} task - 当前任务对象
     * @param {Object} thread - 线程对象
     * @param {Object} agent - Agent实例
     * @returns {Promise<string>} - user反馈消息内容
     */
    async generateUserMessage(botMessage, task, thread, agent) {
        throw new Error("必须由子类实现");
    }
    
    /*
     * 建议下一个阶段
     * @param {Object} task - 当前任务对象
     * @param {Object} thread - 线程对象
     */
    _suggestPhaseUpdate(task, thread) {
        if (!this.nextPhase) return;
        
        const currentSettings = thread.settings || {};
        
        // 添加阶段更新建议到设置中
        const updatedSettings = {
            ...currentSettings,
            _phaseUpdateSuggestion: {
                phase: this.nextPhase
            }
        };
        
        // 更新线程设置
        thread.settings = updatedSettings;
    }
}
```

### 3.8 子线程初始化模式

子线程Agent初始化过程需要为每个InteractionUnit提供对应的StateHandler：

```javascript
class MySubThreadAgent extends SubThreadAgent {
    /*
     * 初始化交互单元
     * 为每个InteractionUnit提供对应的StateHandler
     */
    async _initializeInteractionUnits() {
        // 首先初始化所有需要的状态处理器
        const dataPreparationHandler = new DataPreparationStateHandler({
            phase: "initial_phase",
            nextPhase: "data_transformation"
        });
        
        const dataTransformationHandler = new DataTransformationStateHandler({
            phase: "data_transformation",
            nextPhase: "data_analysis"
        });
        
        const dataAnalysisHandler = new DataAnalysisStateHandler({
            phase: "data_analysis",
            nextPhase: "result_formatting"
        });
        
        const resultFormattingHandler = new ResultFormattingStateHandler({
            phase: "result_formatting",
            nextPhase: "completed"
        });
        
        // 然后初始化交互单元，并为每个单元提供对应的状态处理器
        this.interactionUnits = {
            initial_phase: new DataPreparationUnit({
                phase: "initial_phase",
                nextPhase: "data_transformation",
                stateHandler: dataPreparationHandler
            }),
            
            data_transformation: new DataTransformationUnit({
                phase: "data_transformation",
                nextPhase: "data_analysis",
                stateHandler: dataTransformationHandler
            }),
            
            data_analysis: new DataAnalysisUnit({
                phase: "data_analysis",
                nextPhase: "result_formatting",
                stateHandler: dataAnalysisHandler
            }),
            
            result_formatting: new ResultFormattingUnit({
                phase: "result_formatting",
                nextPhase: "completed",
                stateHandler: resultFormattingHandler
            })
        };
    }
}
```

## 4. 实现指南

### 4.1 SubThreadAgent基类实现

```javascript
/*
 * 子线程Agent基类 - 封装子线程处理的通用逻辑
 * 所有具体业务的子线程Agent应继承此类
 */
class SubThreadAgent extends BaseAgent {
    /*
     * 构造函数
     * @param {Object} metadata - Agent元数据
     * @param {Object} settings - Agent设置
     */
    constructor(metadata, settings) {
        super(metadata, settings);
        this.interactionUnits = {};
        this.systemPrompt = null;
    }
    
    /*
     * 初始化Agent
     */
    async initialize() {
        // 调用父类初始化
        await super.initialize();
        
        // 初始化交互单元
        await this._initializeInteractionUnits();
        
        // 加载系统提示词
        this.systemPrompt = await this._loadSystemPrompt();
    }
    
    /*
     * 初始化交互单元
     * 子类应覆盖此方法，并确保为每个InteractionUnit提供对应的StateHandler
     */
    async _initializeInteractionUnits() {
        // 子类应覆盖此方法
        this.interactionUnits = {};
    }
    
    /*
     * 加载系统提示词
     * @returns {Promise<string>} 系统提示词
     */
    async _loadSystemPrompt() {
        // 子类应覆盖此方法
        return "Default system prompt";
    }
    
    /*
     * 执行任务 - 主要入口点
     * @param {Object} task - 当前任务
     * @param {Object} thread - 主线程对象
     * @returns {Promise<Response>} 处理结果
     */
    async executeTask(task, thread) {
        // 处理子线程交互
        if (task.name === 'ExecuteSubThreadInteraction') {
            return this._executeSubThreadInteraction(task, thread);
        }
        
        // 处理其他类型的任务
        return super.executeTask(task, thread);
    }
    
    /*
     * 执行子线程交互流程
     * @param {Object} task - 当前任务
     * @param {Object} thread - 主线程对象
     * @returns {Promise<Response>} 处理结果
     */
    async _executeSubThreadInteraction(task, thread) {
        // 获取子线程引用
        const subThreadPath = task.meta.subThreadPath;
        const subThread = this._getSubThreadByPath(thread, subThreadPath);
        
        // 初始化子线程设置
        if (!subThread.settings) {
            subThread.settings = {
                briefStatus: { phase: "initial_phase" }
            };
        }
        
        // 1. 添加系统提示 (可选)
        if (this.systemPrompt && subThread.messages.length === 0) {
            await this._initializeSubThreadConversation(task, subThread);
        }
        
        // 2. 执行交互单元序列
        const results = await this._executeInteractionUnits(task, subThread);
        
        // 3. 汇总结果并返回
        const finalResult = this._summarizeResults(results, subThread);
        return new Response(finalResult);
    }
    
    /*
     * 执行一系列交互单元
     * @param {Object} task - 当前任务
     * @param {Object} subThread - 子线程对象
     * @returns {Promise<Array>} 交互结果数组
     */
    async _executeInteractionUnits(task, subThread) {
        const results = [];
        let isComplete = false;
        
        while (!isComplete) {
            // 获取当前状态
            const currentPhase = subThread.settings.briefStatus.phase;
            
            // 尝试获取对应的交互单元
            const unit = this.interactionUnits[currentPhase];
            
            if (!unit) {
                // 如果没有找到交互单元，检查是否达到终止状态
                if (this._isTerminalState(currentPhase)) {
                    isComplete = true;
                    continue;
                } else {
                    throw new Error(`找不到状态对应的交互单元: ${currentPhase}`);
                }
            }
            
            // 执行当前交互单元
            const result = await unit.execute(task, subThread, this);
            results.push(result);
            
            // 添加消息到子线程
            subThread.messages.push(result.botMessage);
            subThread.messages.push(result.userMessage);
            
            // 应用状态更新
            this._applyPhaseUpdateSuggestion(task, subThread);
            
            // 检查是否到达终止状态
            if (this._isTerminalState(subThread.settings.briefStatus.phase)) {
                isComplete = true;
            }
        }
        
        return results;
    }
    
    /*
     * 判断是否为终止状态
     * @param {string} phase - 当前状态
     * @returns {boolean} 是否为终止状态
     */
    _isTerminalState(phase) {
        // 子类可覆盖此方法以提供特定的终止状态逻辑
        return phase === "completed";
    }
    
    /*
     * 汇总交互结果
     * @param {Array} results - 交互结果数组
     * @param {Object} subThread - 子线程对象
     * @returns {string} 最终结果
     */
    _summarizeResults(results, subThread) {
        // 默认实现 - 子类可覆盖此方法
        const userMessages = subThread.messages.filter(m => m.sender === "user");
        if (userMessages.length > 0) {
            return userMessages[userMessages.length - 1].text;
        }
        return "子线程执行完成，但未生成结果";
    }
}
```

### 4.2 在主线程中启动子线程交互

```javascript
/*
 * 在主线程的StateHandler中启动子线程交互
 */
class MainThreadStateHandler extends StateHandler {
    async handle(task, thread, agent) {
        // 创建子线程
        const subThread = {
            messages: [],
            id: `sub_${thread.id}_${Date.now()}`,
            meta: {
                // 子线程相关元数据
            },
            settings: {
                briefStatus: { phase: "initial_phase" }
            }
        };
        
        // 存储在消息元数据中
        const lastMessage = thread.messages[thread.messages.length - 1];
        if (!lastMessage.meta) lastMessage.meta = {};
        lastMessage.meta._thread = subThread;
        
        // 创建子线程Agent
        const mySubThreadAgent = await MySubThreadAgent.create(/* metadata, settings */);
        
        // 创建任务对象
        const subThreadTask = new Task({
            name: 'ExecuteSubThreadInteraction',
            type: Task.TYPE_ACTION,
            message: "执行子线程交互",
            meta: {
                subThreadPath: `messages[${thread.messages.length - 1}].meta._thread`,
                timestamp: Date.now()
            },
            host_utils: task.host_utils
        });
        
        // 执行子线程交互
        const result = await mySubThreadAgent.executeTask(subThreadTask, thread);
        
        // 构建最终响应
        const response = new Response(`处理结果：\n\n${result.getFullMessage()}`);
        
        return response;
    }
}
```

注意：上级Agent的StateHandler只能初始化下级Agent，下级的不能初始化上级的，避免循环依赖。

## 5. 业务示例：数据处理流水线

### 5.1 定义数据处理Agent

```javascript
/*
 * 数据处理流水线Agent - 专门处理数据转换和分析流程
 * 继承自SubThreadAgent而非BaseAgent
 */
class DataPipelineAgent extends SubThreadAgent {
    async _initializeInteractionUnits() {
        // 首先创建所有状态处理器
        const dataPreparationHandler = new DataPreparationStateHandler({
            phase: "initial_phase",
            nextPhase: "data_transformation"
        });
        
        const dataTransformationHandler = new DataTransformationStateHandler({
            phase: "data_transformation",
            nextPhase: "data_analysis"
        });
        
        const dataAnalysisHandler = new DataAnalysisStateHandler({
            phase: "data_analysis",
            nextPhase: "result_formatting"
        });
        
        const resultFormattingHandler = new ResultFormattingStateHandler({
            phase: "result_formatting",
            nextPhase: "completed"
        });
        
        // 然后创建交互单元，将对应的状态处理器传递给每个交互单元
        this.interactionUnits = {
            initial_phase: new DataPreparationUnit({
                phase: "initial_phase",
                nextPhase: "data_transformation",
                stateHandler: dataPreparationHandler
            }),
            
            data_transformation: new DataTransformationUnit({
                phase: "data_transformation",
                nextPhase: "data_analysis",
                stateHandler: dataTransformationHandler
            }),
            
            data_analysis: new DataAnalysisUnit({
                phase: "data_analysis",
                nextPhase: "result_formatting",
                stateHandler: dataAnalysisHandler
            }),
            
            result_formatting: new ResultFormattingUnit({
                phase: "result_formatting",
                nextPhase: "completed",
                stateHandler: resultFormattingHandler
            })
        };
    }
    
    async _loadSystemPrompt() {
        return `你是一个数据处理助手，负责数据准备、转换、分析和结果格式化。
请按照流水线步骤处理数据并生成结果报告。`;
    }
    
    _isTerminalState(phase) {
        return phase === "completed";
    }
    
    _summarizeResults(results, subThread) {
        // 提取最终处理结果
        const resultMessage = subThread.messages.find(msg => 
            msg.sender === "user" && msg.text.includes("处理完成：")
        );
        
        if (resultMessage) {
            const match = resultMessage.text.match(/处理完成：\s*\n([\s\S]+)/);
            if (match) {
                return match[1];
            }
        }
        
        // 默认汇总逻辑
        return super._summarizeResults(results, subThread);
    }
}
```

### 5.2 定义状态处理器

```javascript
/*
 * 数据准备状态处理器 - 负责生成bot消息
 */
class DataPreparationStateHandler extends StateHandler {
    async handle(task, thread, agent) {
        const dataSource = thread.meta?.dataSource || "未指定数据源";
        
        // 生成数据准备代码和指令
        const prepCode = `function prepareData(source) {
  const data = loadData(source);
  return data.filter(row => row.value !== null);
}`;
        
        const responseText = `我已生成数据准备代码：\n\`\`\`javascript\n${prepCode}\n\`\`\`\n请将此代码保存到/tmp/data_prep.js并执行，处理数据源：${dataSource}`;
        
        // 建议状态更新
        this._suggestPhaseUpdate(task, thread);
        
        return new Response(responseText);
    }
}

/*
 * 数据转换状态处理器
 */
class DataTransformationStateHandler extends StateHandler {
    async handle(task, thread, agent) {
        // 获取预处理结果
        const previousMessages = thread.messages || [];
        const prepMessage = previousMessages.find(msg => 
            msg.sender === "user" && msg.text.includes("执行结果：代码已保存")
        );
        
        // 生成转换代码
        const transformCode = `function transformData(data) {
  return data.map(record => ({
    id: record.id,
    value: record.value * 2,
    category: categorize(record.value)
  }));
}

function categorize(value) {
  if (value < 10) return "low";
  if (value < 50) return "medium";
  return "high";
}`;
        
        const responseText = `基于预处理结果，我已生成数据转换代码：\n\`\`\`javascript\n${transformCode}\n\`\`\`\n请将此代码保存到/tmp/transform.js并执行，处理/tmp/prepared_data.json文件`;
        
        // 建议状态更新
        this._suggestPhaseUpdate(task, thread);
        
        return new Response(responseText);
    }
}

/*
 * 数据分析状态处理器
 */
class DataAnalysisStateHandler extends StateHandler {
    async handle(task, thread, agent) {
        // 生成分析代码
        const analysisCode = `function analyzeData(data) {
  const stats = {
    total: data.length,
    categories: {},
    average: calculateAverage(data),
    distribution: calculateDistribution(data)
  };
  
  // 计算每个类别的统计信息
  const categories = [...new Set(data.map(item => item.category))];
  categories.forEach(category => {
    const items = data.filter(item => item.category === category);
    stats.categories[category] = {
      count: items.length,
      percentage: (items.length / data.length * 100).toFixed(2) + '%',
      avgValue: calculateAverage(items)
    };
  });
  
  return stats;
}`;
        
        const responseText = `现在需要对转换后的数据进行分析，我已生成分析代码：\n\`\`\`javascript\n${analysisCode}\n\`\`\`\n请将此代码保存到/tmp/analysis.js并执行，处理/tmp/transformed_data.json文件`;
        
        // 建议状态更新
        this._suggestPhaseUpdate(task, thread);
        
        return new Response(responseText);
    }
}

/*
 * 结果格式化状态处理器
 */
class ResultFormattingStateHandler extends StateHandler {
    async handle(task, thread, agent) {
        // 生成格式化代码
        const formattingCode = `function formatResults(analysisResults) {
  const report = {
    title: "数据分析报告",
    timestamp: new Date().toISOString(),
    summary: \`共分析${analysisResults.total}条记录，平均值为${analysisResults.average}\`,
    categoryBreakdown: Object.entries(analysisResults.categories).map(([name, stats]) => ({
      name,
      count: stats.count,
      percentage: stats.percentage,
      averageValue: stats.avgValue
    })),
    recommendations: generateRecommendations(analysisResults)
  };
  
  return JSON.stringify(report, null, 2);
}`;
        
        const responseText = `最后需要将分析结果格式化为报告，我已生成格式化代码：\n\`\`\`javascript\n${formattingCode}\n\`\`\`\n请将此代码保存到/tmp/formatter.js并执行，处理/tmp/analysis_results.json文件，生成最终HTML报告`;
        
        // 建议状态更新
        this._suggestPhaseUpdate(task, thread);
        
        return new Response(responseText);
    }
}
```

### 5.3 定义交互单元

```javascript
/*
 * 数据准备交互单元 - 持有对应的StateHandler
 */
class DataPreparationUnit extends InteractionUnit {
    /*
     * 生成用户反馈消息
     * 注意：bot消息已由持有的StateHandler生成，这里只处理用户反馈
     */
    async generateUserMessage(botMessage, task, thread, agent) {
        // 执行bot消息中的指令，并返回结果
        return `执行结果：代码已保存到/tmp/data_prep.js并执行完成。\n数据已加载并过滤，共处理1024条记录，有效记录985条。预处理数据已保存到/tmp/prepared_data.json`;
    }
}

/*
 * 数据转换交互单元
 */
class DataTransformationUnit extends InteractionUnit {
    async generateUserMessage(botMessage, task, thread, agent) {
        // 执行反馈
        return `转换完成：代码已保存到/tmp/transform.js并执行。\n数据已转换，分类结果：低值(167条)，中值(423条)，高值(395条)。转换后数据已保存到/tmp/transformed_data.json`;
    }
}

/*
 * 数据分析交互单元
 */
class DataAnalysisUnit extends InteractionUnit {
    async generateUserMessage(botMessage, task, thread, agent) {
        // 执行反馈，包含分析结果
        return `分析完成：代码已保存到/tmp/analysis.js并执行。\n分析结果：\n- 总记录数：985\n- 平均值：47.2\n- 类别分布：低(16.9%)，中(42.9%)，高(40.2%)\n分析报告已保存到/tmp/analysis_results.json`;
    }
}

/*
 * 结果格式化交互单元
 */
class ResultFormattingUnit extends InteractionUnit {
    async generateUserMessage(botMessage, task, thread, agent) {
        // 执行反馈，包含最终结果
        return `处理完成：\n数据流水线已全部执行，最终报告已生成并保存到/tmp/final_report.html\n\n主要发现：\n1. 高值类别占比40.2%，显著高于预期\n2. 数据转换后分布更均匀，适合后续建模\n3. 建议重点关注中值类别，增长潜力最大`;
    }
}
```

## 6. 子线程嵌套模式抽象数据结构设计

在上述最佳实践下，数据结构设计如下：

### 6.1 核心架构

```
主线程
  └── 消息
       └── 一级子线程 (存储在消息元数据中)
            └── 消息
                 └── 二级子线程 (存储在消息元数据中)
                      └── 消息
                           └── 三级子线程 (可继续嵌套)
```

### 6.2 关键特性

1. 嵌套结构：每个子线程存储在父线程消息的 `meta._thread` 字段中
2. 状态传递：子线程处理完成后，结果通过父线程层层传递
3. 阶段隔离：每个子线程处理特定任务，有自己独立的状态管理

### 6.3 状态管理

- 每个线程有独立的 `settings.briefStatus.phase` 标记当前状态
- 状态变更通过 `settings.briefStatus._suggestPhaseUpdate` 机制实现
- 状态处理器与交互单元共享相同的状态信息

### 6.4 数据流动

1. 输入下沉：任务要求从父线程传递到子线程
2. 多轮处理：子线程中执行多轮交互完成任务
3. 结果上浮：处理结果从子线程返回到父线程
4. 层层传递：结果可能经过多层子线程处理

## 7. 最佳实践

### 7.1 设计原则

1. 职责分离:
   - 主线程Agent继承BaseAgent，负责主要交互
   - 子线程Agent继承SubThreadAgent，负责子线程交互流程管理
   - StateHandler专注于生成bot消息
   - InteractionUnit持有StateHandler并专注于处理bot消息指令和生成user反馈
   - 每个组件只关注自己的责任范围

2. 状态驱动:
   - 使用状态驱动的交互流程控制模式
   - 保持与主线程相同的状态管理机制
   - 通过状态迁移建议实现流程控制

3. 封装复杂性:
   - 子线程交互对主线程透明
   - 只将最终结果返回给主线程
   - 内部交互过程完全封装

4. 交互职责划分:
   - Bot消息(由StateHandler生成)包含指令和生成的内容，以及执行建议
   - User消息(由InteractionUnit生成)只包含执行结果的反馈，不生成内容
   - 子线程执行程序逻辑，而不是生成新内容

### 7.2 常见问题与解决方案

1. 状态管理:
   - 问题: 子线程状态与主线程状态混淆
   - 解决方案: 确保子线程有独立的settings和briefStatus

2. 结果提取:
   - 问题: 难以从复杂交互中提取最终结果
   - 解决方案: 在子类中覆盖`_summarizeResults`方法，实现特定的结果提取逻辑

3. 交互终止条件:
   - 问题: 交互循环无法适当终止
   - 解决方案: 实现合适的终止状态检查和最大交互次数限制

4. 错误处理:
   - 问题: 子线程中的错误影响主线程
   - 解决方案: 在子线程Agent中实现健壮的错误处理逻辑

### 7.3 扩展子线程模型

1. 嵌套子线程:
   - 支持在子线程的交互单元中创建更深层次的子线程
   - 适用于需要更复杂分解的任务

2. 并行子线程:
   - 同时启动多个子线程处理不同方面的任务
   - 最后合并结果

3. 自适应交互流程:
   - 基于上下文动态决定下一个交互单元
   - 不局限于固定的状态转换序列

## 8. 命名与组织规范

### 8.1 命名要求

- Agent的类命名必须使用Agent结尾
- 业务必须要在类命名上体现出来，而不是仅仅提现设计的命名
- 每一个子Agent都要有配套的自己的 StateHandler 文件，而不是所有层级的StateHandler子类在一个文件中
- InteractionUnit类名应直接反映其功能，例如：`DataTransformationUnit`
- 状态名称应使用小写下划线格式，例如：`data_transformation`

### 8.2 文件组织

- 每种类型的子线程Agent应有独立的文件，每个子线程Agent有对应的StateHandler和InteractionUnit文件
- 相关的StateHandler和InteractionUnit应组织在同一个目录中
- 共用的基类和工具函数放在单独的文件中

### 8.3 复用要求

- 所有的 StateHandler 子类都要继承 StateHandler，而不是自己搞一个父类
- 主线程Agent继承BaseAgent，子线程Agent继承SubThreadAgent
- _applyPhaseUpdateSuggestion 和 初始化 briefStatus 都用同样的代码，这代码要在BaseAgent里
- 所有InteractionUnit都应继承基本的 InteractionUnit 类
- 共用逻辑应提取到基类或工具函数中

## 9. 关键规范总结

1. Agent与Thread关系：
   - 一个 Agent 对应管理一个 Thread
   - 每个消息处理可使用 `message.meta._thread` 存储子线程

2. 状态管理核心原则：
   - 状态存储在 `settings.briefStatus.phase`
   - 状态迁移使用建议-应用两步机制
   - 状态迁移建议存储在 `thread.settings._phaseUpdateSuggestion`
   - 先应用状态，再选择处理器处理任务
   - Retry时清除迁移建议但不改变状态

3. 子线程交互模型：
   - 主线程Agent继承BaseAgent
   - 子线程Agent继承SubThreadAgent
   - InteractionUnit持有对应的StateHandler
   - StateHandler负责生成bot消息内容
   - InteractionUnit处理bot指令并生成user反馈
   - 多轮交互完成后汇总结果返回给主线程

4. 代码组织原则：
   - 使用 `StateHandler` 子类处理特定状态的bot消息生成
   - 使用 `InteractionUnit` 子类处理子线程中的完整bot-user消息对
   - 状态处理器和交互单元应专注于单一职责
   - Agent通过委托模式将消息处理转发给状态处理器或交互单元

遵循这些规范可确保 Agent 实现的一致性、可维护性和可扩展性，尤其是在处理复杂的多步骤任务时，能够提供高质量的输出结果。