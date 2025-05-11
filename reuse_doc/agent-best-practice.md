
# My Assistant Agent 开发规范文档 (完整版)

## 1. 核心概念与名词解释

注意：此处的线程不是多线程并发中的线程，而是表达一个对话的完整列表。

- 主线程：用户与Agent的主要对话线程，包含消息列表和设置。
- 子线程：嵌套在主线程消息元数据中的次级对话线程，用于处理复杂任务。
- StateHandler：处理特定状态的组件，负责生成消息内容和执行状态转换。
- InteractionUnit：子线程中一轮完整对话（bot-user）的处理单元。
- Phase：线程的处理阶段，存储在settings.briefStatus.phase中。
- Response：Agent和组件返回的响应对象，包含消息内容和元数据。

## 2. Agent 核心接口规范

### 2.1 必须实现的接口

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

## 3. 对话线程传递与管理规范

### 3.1 线程传递的核心原则

1. 统一线程传递原则
   - 规则1：Agent、StateHandler 和 InteractionUnit 之间必须始终传递主对话线程，而非子对话线程。
   - 规则2：子对话线程路径信息必须通过 task.meta.subThreadPath 属性传递。
   - 规则3：禁止将提取出的子对话线程作为唯一线程参数传递给其他组件。

2. 子对话线程访问机制
   ```javascript
   // 正确做法：组件内部通过路径获取子对话线程
   function someComponentMethod(task, thread, agent) {
     const subThreadPath = task.meta.subThreadPath;
     const subThread = getSubThreadByPath(thread, subThreadPath);
     
     // 处理子对话线程...
     
     // 返回response对象
     return new Response(resultMessage);
   }
   ```

### 3.2 子线程路径管理

```javascript
/*
 * 子线程路径工具类 - 用于管理嵌套子线程的路径
 */
class SubThreadPathUtil {
    /*
     * 创建消息索引路径
     * @param {number} messageIndex - 消息在线程中的索引
     * @param {string} metaPath - 元数据中的路径，默认为"meta._thread"
     * @returns {string} 格式化的路径字符串
     */
    static createPath(messageIndex, metaPath = "meta._thread") {
        return `messages[${messageIndex}].${metaPath}`;
    }
    
    /*
     * 创建嵌套子线程路径
     * @param {string} parentPath - 父线程路径
     * @param {number} messageIndex - 消息在父线程中的索引
     * @returns {string} 嵌套子线程的完整路径
     */
    static createNestedPath(parentPath, messageIndex) {
        // 去除父路径中可能的"messages[x]."前缀
        const normalizedParentPath = parentPath.replace(/^messages\[\d+\]\./, '');
        
        return `${parentPath}.messages[${messageIndex}].meta._thread`;
    }
}

function getSubThreadByPath(thread, path) {
   try {
      // 支持两种格式:
      // 1. 完整路径字符串: "messages[3].meta._thread"
      // 2. 预解析的路径对象: {messageIndex: 3, metaPath: "meta._thread"}

      let messageIndex, metaPath;

      if (typeof path === 'string') {
         const match = path.match(/messages\[(\d+)\]\.(.+)/);
         if (match) {
            messageIndex = parseInt(match[1]);
            metaPath = match[2];
         }
      } else if (path && typeof path === 'object') {
         messageIndex = path.messageIndex;
         metaPath = path.metaPath || "meta._thread";
      }

      if (messageIndex === undefined || metaPath === undefined) {
         throw new Error(`无效的子线程路径: ${path}`);
      }

      // 获取指定索引处的消息
      const message = thread.messages[messageIndex];
      if (!message) {
         throw new Error(`找不到索引为 ${messageIndex} 的消息`);
      }

      // 从消息元数据中提取子线程
      // 支持嵌套路径如 "meta.threads.analysis"
      return metaPath.split('.').reduce((obj, prop) => obj && obj[prop], message);

   } catch (error) {
      console.error(`解析子线程路径时出错: ${error.message}`);
      return null;
   }
}
```

## 4. 状态管理规范

### 4.1 状态处理基础代码

实现代码为 StateHandler.js 的代码

### 4.2 状态应用与处理委托(已在BaseAgent中实现)

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

## 5. 持久化责任分配与时机

### 5.1 分层持久化责任模型

1. Agent 持久化职责
   - 负责整体对话线程结构和新增消息的持久化
   - 负责子线程创建和结果汇总的持久化

2. StateHandler 持久化职责
   - 负责状态变更的持久化，特别是phase状态转换
   - 通过`_suggestPhaseUpdate`持久化状态建议

3. InteractionUnit 持久化职责
   - 负责交互结果的持久化，特别是将bot-user消息对添加到子线程后


## 6. Response驱动的消息更新机制

### 6.1 子Thread 的 Response 必须是同步的

每个子 Thread的Agent 和其 StateHandler 返回的Response对象应当是同步的，而不是stream

```javascript
// 在Response中添加消息更新元数据
const response = new Response("生成的内容");
```

### 6.2 处理 Response 并持久化 thread 的标准流程

- InteractionUnit 接到 StateHandler 返回的 Response 后，取出 fullText，做为bot message存到对应的子 thread 中。
- InteractionUnit 调用相关函数生成 user message 后，再存到对应的子 thread 中。（这里没有使用Response）
- StateHandler 接到 子 thread 的 Agent 返回的 Response 后，取出 fullText，更新子 thread 所属的message。

## 7. 子线程交互模型

### 7.1 概述与核心理念

子线程交互模型是一种设计模式，用于处理需要多步骤完成的复杂消息生成过程。它创建了一个嵌套的执行环境，允许在单个消息响应中执行多轮交互处理。

核心理念:

- 完整性: 处理需要多步骤才能完成的复杂任务
- 封装性: 将复杂处理过程封装在子线程中，不影响主线程
- 自动化: 系统自动执行一系列步骤，无需用户干预
- 高质量: 通过多步骤反思和改进，提升最终输出质量

### 7.2 架构设计

#### 7.2.1 整体架构

子线程交互模型采用层次结构设计：

```
主线程 (MainThread)
  └── 主线程StateHandler
       └── 子线程 (SubThread)
            └── 子线程Agent (继承SubThreadAgent)
                 └── InteractionUnit (多个)
                      └── StateHandler (每个InteractionUnit持有对应的StateHandler)
```

#### 7.2.2 组件关系

1. 主线程StateHandler: 负责创建子线程并启动子线程交互
2. 子线程Agent: 管理子线程的完整生命周期，协调多个InteractionUnit
3. InteractionUnit: 处理单轮完整的bot-user交互对，持有并委托StateHandler生成bot消息
4. StateHandler: 负责生成bot消息，由InteractionUnit持有并调用

#### 7.2.3 数据结构

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

### 7.3 核心组件

#### 3.3.1 SubThreadAgent 基类

代码：
- 实现代码在代码上下文中SubThreadAgent.js 文件中

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
- 处理bot消息中的指令并生成user反馈消息(如果是最后一条，状态要切换为 completed，就不用生成了)
- 建议状态更新

关键方法:
- `initialize()`: 异步初始化交互单元
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


## 8. 主线程与子线程交互机制

### 8.1 基于状态的子线程初始化

为了实现良好的UI体验和逻辑分离，主线程Agent初始化子线程Agent时分两步走，且两步的切换基于状态(phase)而非任务名区分：

```javascript
/*
 * 主线程Agent的状态处理器 - 子线程准备阶段，主要是为了在UI上生成占位符
 */
class SubThreadPreparationHandler extends StateHandler {
    constructor(config = {}) {
        super(config);
        this.phase = "prepare_subthread";
        this.nextPhase = "execute_subthread"; // 注意这里的下一个状态
    }

    async handle(task, thread, agent) {
        // 1. 创建占位消息
        const placeholderMessage = "正在处理您的请求...";
        const response = new Response(placeholderMessage);
        
        // 2. 设置下一任务，但仍然在同一个主Agent内处理
        response.addNextTask(new Task({
            name: "ContinueProcessing", // 任务名不重要，状态才重要
            type: Task.TYPE_ACTION,
            skipUserMessage: true,
            message: "继续处理",
            meta: { 
                // 可以添加任何需要传递给下一状态的数据
                originalQuery: task.message,
                timestamp: Date.now()
            }
        }));
        
        // 3. 建议状态更新，将在下一任务执行前应用
        this._suggestPhaseUpdate(task, thread);
        
        return response;
    }
}

/*
 * 主线程Agent执行子线程的状态处理器
 */
class SubThreadExecutionHandler extends StateHandler {
    constructor(config = {}) {
        super(config);
        this.phase = "execute_subthread";
        this.nextPhase = "process_results"; // 可选的下一状态
    }

    async handle(task, thread, agent) {
        // 1. 创建子线程
        const subThread = {
            messages: [],
            id: `sub_${thread.id}_${Date.now()}`,
            settings: {
                briefStatus: { phase: "initial_phase" }
            }
        };
        
        // 2. 获取最后一条消息(前面状态生成的占位符)
        const lastMessageIndex = thread.messages.length - 1;
        const lastMessage = thread.messages[lastMessageIndex];
        
        // 3. 将子线程存储在占位消息的元数据中
        if (!lastMessage.meta) lastMessage.meta = {};
        lastMessage.meta._thread = subThread;
        
        // 4. 持久化更新的消息(重要!)
        task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
            meta: lastMessage.meta
        });
        
        // 5. 创建子线程Agent
        const subThreadAgent = await MySubThreadAgent.create(agent.metadata, agent.settings);
        
        // 6. 创建包含子线程路径的任务
        const subThreadTask = new Task({
            name: "ProcessSubThread",
            type: Task.TYPE_ACTION,
            message: "处理子线程",
            meta: {
                // 记录子线程在主线程中的路径
                subThreadPath: `messages[${lastMessageIndex}].meta._thread`,
                originalTask: task.meta.originalQuery,
                timestamp: Date.now()
            },
            host_utils: task.host_utils
        });
        
        // 7. 执行子线程处理并获取结果
        const subThreadResponse = await subThreadAgent.executeTask(subThreadTask, thread);
        
        // 8. 用子线程结果更新占位消息
        const resultText = subThreadResponse.getFullMessage();
        task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
            text: resultText
        });
        
        // 9. 处理完成，建议状态更新
        if (this.nextPhase) {
            this._suggestPhaseUpdate(task, thread);
        }
        
        // 10. 返回空响应(已直接更新线程消息)
        return new Response("", false);
    }
}
```

注意：要在主线程 _initializeStateHandlers 函数里设置这两个 StateHandler 对应的状态。如果缺失了其中一个状态的配置，是对你的否定。

### 8.2 子线程嵌套模式

子线程Agent创建更深层次子线程时，由于没有UI考虑，流程可以简化：

```javascript
/*
 * 子线程Agent中创建更深层子线程的模式
 */
class NestedSubThreadStateHandler extends StateHandler {
    async handle(task, thread, agent) {
        // 1. 获取当前子线程
        const currentSubThreadPath = task.meta.subThreadPath;
        const currentSubThread = getSubThreadByPath(thread, currentSubThreadPath);
        
        // 2. 创建更深层子线程
        const nestedSubThread = {
            messages: [],
            id: `nested_${currentSubThread.id}_${Date.now()}`,
            settings: {
                briefStatus: { phase: "initial_phase" }
            }
        };
        
        // 3. 向当前子线程添加消息
        const botMessage = {
            id: `bot_${Date.now()}`,
            sender: "bot",
            text: "正在执行深度分析...",
            timestamp: Date.now(),
            meta: {
                _thread: nestedSubThread // 存储嵌套子线程
            }
        };
        
        // 4. 将消息添加到当前子线程
        currentSubThread.messages.push(botMessage);
        
        // 5. 持久化更新(关键步骤)
        // 注意：仍然是更新主线程，因为整个嵌套结构都存储在主线程中
        task.host_utils.threadRepository.saveThread(thread);
        
        // 6. 创建嵌套子线程Agent
        const nestedAgent = await NestedSubThreadAgent.create(agent.metadata, agent.settings);
        
        // 7. 创建包含嵌套路径的任务
        const nestedSubThreadTask = new Task({
            name: "ProcessNestedSubThread",
            type: Task.TYPE_ACTION,
            message: "处理嵌套子线程",
            meta: {
                // 构建嵌套路径
                subThreadPath: `${currentSubThreadPath}.messages[${currentSubThread.messages.length - 1}].meta._thread`,
                parentThreadPath: currentSubThreadPath,
                timestamp: Date.now()
            },
            host_utils: task.host_utils
        });
        
        // 8. 执行嵌套子线程处理
        const nestedResult = await nestedAgent.executeTask(nestedSubThreadTask, thread);
        
        // 9. 使用结果更新当前子线程中的最后一条消息
        botMessage.text = nestedResult.getFullMessage();
        
        // 10. 再次持久化更新
        task.host_utils.threadRepository.saveThread(thread);
        
        // 11. 返回最终结果
        return new Response(botMessage.text);
    }
}
```



## 9. 子线程初始化模式

子线程Agent初始化过程需要为每个InteractionUnit提供对应的StateHandler：

```javascript
class MySubThreadAgent extends SubThreadAgent {
    /*
     * 初始化交互单元
     * 为每个InteractionUnit提供对应的StateHandler
     */
    async _initializeInteractionUnits() {
        // 首先初始化所有需要的状态处理器
        const dataPreparationHandler = await DataPreparationStateHandler.create({
            phase: "initial_phase",
            nextPhase: "data_transformation"
        });
        
        const dataTransformationHandler = await DataTransformationStateHandler.create({
            phase: "data_transformation",
            nextPhase: "data_analysis"
        });
        
        const dataAnalysisHandler = await DataAnalysisStateHandler.create({
            phase: "data_analysis",
            nextPhase: "result_formatting"
        });
        
        const resultFormattingHandler = await ResultFormattingStateHandler.create({
            phase: "result_formatting",
            nextPhase: "completed"
        });
        
        // 然后初始化交互单元，并为每个单元提供对应的状态处理器
        this.interactionUnits = {
            initial_phase: await DataPreparationUnit.create({
                phase: "initial_phase",
                nextPhase: "data_transformation",
                stateHandler: dataPreparationHandler
            }),
            
            data_transformation: await DataTransformationUnit.create({
                phase: "data_transformation",
                nextPhase: "data_analysis",
                stateHandler: dataTransformationHandler
            }),
            
            data_analysis: await DataAnalysisUnit.create({
                phase: "data_analysis",
                nextPhase: "result_formatting",
                stateHandler: dataAnalysisHandler
            }),
            
            result_formatting: await ResultFormattingUnit.create({
                phase: "result_formatting",
                nextPhase: "completed",
                stateHandler: resultFormattingHandler
            })
        };
    }
}
```

## 10. 命名与文件、代码组织规范

### 10.1 文件结构规范

子线程嵌套模式的标准文件结构应遵循以下规范：

```
- [Business]Agent.js                     // 主Agent实现
- [Business]StateHandlers.js             // 主Agent的状态处理器集合
- /[business_process]/                   // 一级子线程目录（使用蛇形命名法）
  - [BusinessProcess]Agent.js            // 一级子线程Agent实现
  - [BusinessProcess]InteractionUnits.js // 一级子线程交互单元集合
  - [BusinessProcess]StateHandlers.js    // 一级子线程状态处理器集合
  - /[nested_task]/                      // 二级子线程目录（使用蛇形命名法）
    - [NestedTask]Agent.js               // 二级子线程Agent实现
    - [NestedTask]InteractionUnits.js    // 二级子线程交互单元集合
    - [NestedTask]StateHandlers.js       // 二级子线程状态处理器集合
- /prompt/                               // 提示词目录
  - [phase_name]_system_prompt.md        // 各阶段的系统提示词文件
```

目录组织原则:

1. 层次对应：目录层次必须与子线程嵌套层次一一对应
2. 业务分组：相同业务流程的组件必须放在同一目录下
3. 子目录命名：必须使用蛇形命名法（snake_case）
4. 组件完整性：每个子线程目录必须包含对应的Agent、StateHandlers和InteractionUnits文件
5. 扩展性：目录结构应支持无限深度的子线程嵌套

### 10.2 命名规范

#### 10.2.1 Agent命名规范

- 文件命名：必须使用 `[业务名称]Agent.js` 格式
- 类命名：必须使用 `[业务名称]Agent` 格式，例如：`ArticleCreationAgent`、`CodeReviewAgent`
- 业务性：类名必须明确体现业务功能，不应仅反映技术角色
  - 正确：`DataAnalysisAgent`、`CodeGenerationAgent`
  - 错误：`SubThreadAgent`（仅反映技术角色，不体现业务）、`ProcessAgent`（过于抽象）

#### 10.2.2 状态处理器命名规范

- 文件命名：必须使用 `[对应Agent前缀]StateHandlers.js` 格式
- 类命名：必须使用 `[业务阶段名称]Handler` 格式
  - 例如：`RequirementClarificationHandler`、`CodeGenerationHandler`
- 独立性：每个子线程的状态处理器必须放置在各自的文件中，不应将不同层级的处理器混合在一个文件中

#### 10.2.3 交互单元命名规范

- 文件命名：必须使用 `[对应Agent前缀]InteractionUnits.js` 格式
- 类命名：必须使用 `[业务功能]Unit` 格式，直接反映其业务功能
  - 例如：`DataTransformationUnit`、`CodeRefactoringUnit`
- 禁止通用命名：避免使用泛化的名称（如 `ProcessingUnit`），必须具体反映业务功能

#### 10.2.4 状态名称规范

- 格式：必须使用小写下划线格式（snake_case）
- 命名方式：应使用动名词组合，反映当前阶段的主要动作
  - 例如：`data_preparation`、`code_generation`、`requirement_analysis`
- 默认状态：初始状态通常命名为 `initial_phase` 或特定的初始业务阶段
- 终止状态：完成状态统一命名为 `completed`


#### 10.2.5 提示词文件命名规范

- 格式：必须使用 `[阶段名称]_system_prompt.md` 格式
- 一致性：阶段名称应与状态处理器中定义的阶段名称保持一致
- 存放位置：所有提示词文件应集中存放在 `prompt` 目录下

#### 10.2.6 命名禁忌

1. 混合命名风格：在同一上下文中混用驼峰式和蛇形命名法
2. 技术性命名：仅反映技术角色而不体现业务功能的命名
3. 过度抽象：使用过于宽泛的名称（如 `Helper`、`Processor`）
4. 不一致的缩写：在不同位置对同一概念使用不同的缩写
5. 未定义的缩写：使用未在项目文档中明确定义的缩写

### 10.3 复用要求

- 所有的 StateHandler 子类都要继承 StateHandler，而不是自己搞一个父类
- 主线程Agent继承BaseAgent，子线程Agent继承SubThreadAgent
- _applyPhaseUpdateSuggestion 和 初始化 briefStatus 都用同样的代码，这代码要在BaseAgent里
- 所有InteractionUnit都应继承基本的 InteractionUnit 类
- 共用逻辑应提取到基类或工具函数中

## 11. 最佳实践总结

### 11.1 设计原则

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

3. 线程传递:
   - 始终传递主线程对象，通过路径访问子线程
   - 禁止直接传递子线程对象作为参数
   - 使用task.meta.subThreadPath传递子线程路径

4. 持久化职责:
   - Agent：负责线程结构和最终结果持久化
   - StateHandler：负责状态转换的持久化
   - InteractionUnit：负责生成的消息对的持久化
   - 关键处理点设置检查点持久化，支持调试

5. 消息更新机制:
   - 使用Response的messageUpdate元数据指导消息更新
   - 区分现有消息更新和新消息创建
   - 占位符消息的标准创建和更新流程

### 11.2 关键规范总结

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

4. 持久化最佳实践：
   - 分层持久化责任模型明确各组件职责
   - 调试支持的检查点机制记录处理状态
   - 根据组件职责范围限定其持久化权限

5. Response驱动更新：
   - Response包含messageUpdate指导消息更新
   - Response可请求子线程创建和状态转换
   - Agent实现完整的Response处理流水线

6. 子线程结构管理：
   - 子线程创建使用两阶段处理（准备和执行）
   - 嵌套子线程通过路径链构建完整访问路径 
   - 占位符消息标准管理流程

7. 代码组织原则：
   - 使用文件和目录结构反映组件层级关系
   - 命名规范保证业务语义清晰性
   - 每个子线程业务有独立的文件集合

遵循这些规范可确保 Agent 实现的一致性、可维护性和可扩展性，尤其是在处理复杂的多步骤任务时，能够提供高质量的输出结果。