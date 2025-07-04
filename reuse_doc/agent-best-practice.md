# My Assistant Agent 开发规范文档

## 1. 核心概念与名词解释

注意：此处的线程不是多线程并发中的线程，而是表达一个对话的完整列表。

- 主线程：用户与Agent的主要对话线程，包含消息列表和设置。
- 子线程：嵌套在上级线程（也称作父线程）消息元数据中的次级对话线程，用于处理复杂任务。上级线程可以是主线程也可以是其他子线程
- StateHandler：主线程Agent专属的概念，处理特定状态的组件，负责生成消息内容和执行状态转换。
- MessageGenerator：子线程专属的概念，负责生成bot消息内容的组件，不拥有phase和nextPhase，也不负责状态更新建议。
- InteractionUnit：子线程中一轮完整对话的处理单元，包括 Feedbacker、Starter 和 Requester。
- Phase：线程的处理阶段，存储在settings.briefStatus.phase中。
- Response：Agent和组件返回的响应对象，包含消息内容和元数据。

## 1.1 缩写
- 主Agent： 直接处理用户输入的顶层Agent，同时也是主线程的Agent的意思

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

### 2.2 AIAdapter 通信规范

AIAdapter 是统一管理 AI 通信的单例适配器，所有 AI 调用必须通过此适配器进行：

- 目的：所有 AI 调用统一通过 Adapter 接口进行，避免各种 AI 服务的 API 和数据结构直接入侵代码，降低对特定 AI 服务的依赖
- 规则：适配器只发送第一层消息，自动排除子线程和虚拟消息，并处理格式转换，接口是thread的messages属性的数据。

```javascript
// 在 Agent 构造函数中初始化
constructor(metadata, settings) {
   super(metadata, settings);

   // 初始化 AIAdapter 而非直接创建 AI 客户端
   const AIAdapter = require('../my_assistant_agent_util/AIAdapter');
   AIAdapter.initialize(metadata, settings);

   // 不再需要: this.openai = new OpenAI(...);
   // 不再需要: this.model = model;
}
```

- 使用：在需要调用 AI 时，调用 AIAdapter 而非直接调用 AI 服务

```javascript
const AIAdapter = require('../my_assistant_agent_util/AIAdapter');

// 消息准备工作由调用者负责
const messages = thread.messages.filter(msg => !msg.isVirtual); // 只是举例，具体构造messages的逻辑根据场景生成，但注意保证无副作用

// 使用适配器调用 AI
const stream = await AIAdapter.chat(messages, { //注意，这里的messages是thread的messsages属性的数据结构，要严格使用该数据结构的数据
   systemMessage: "你是一个助手",
   stream: true
});

// 创建响应对象
const response = new Response('');
response.setStream(agent.createStream(stream));

return response;

//....
// 使用适配器同步调用AI
const response = await AIAdapter.chat(messages, { // 必须使用thread.messages格式的数据
    systemMessage: "系统提示",
    stream: false // 在SubThread里都是同步调用
});

const responseText  = response.choices[0].message.content;
// 创建响应对象
const response = new Response(responseText);
```

### 2.3 StateHandler vs MessageGenerator 的区别

StateHandler（主线程专用）：
```javascript
class StateHandler {
    constructor(config = {}) {
        this.phase = config.phase;           // 拥有phase
        this.nextPhase = config.nextPhase;   // 拥有nextPhase
    }

    // 负责建议状态更新
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

    async handle(task, thread, agent) {
        // 处理逻辑...
        this._suggestPhaseUpdate(task, thread);  // 负责状态更新建议
        return response;
    }
}
```

MessageGenerator（子线程专用）：
```javascript
class MessageGenerator {
    constructor(config = {}) {
        this.phase = config.phase; // 仅用于记录当前所处阶段，不负责状态管理
        // 注意：不再有nextPhase属性
    }

    async _initialize() {
        // 子类异步初始化逻辑
    }

    static async create(config = {}) {
        const generator = new this(config);
        await generator._initialize();
        return generator;
    }

    async handle(task, thread, agent) {
        // 只负责生成bot消息内容，不处理状态更新
        throw new Error("必须由子类实现");
    }
}
```

## 3. 对话线程传递与管理规范

### 3.1 线程传递的核心原则

1. 统一线程传递原则
    - 规则1：Agent、StateHandler 和 InteractionUnit 之间必须始终传递主对话线程，而非子对话线程。
    - 规则2：子对话线程路径信息必须通过 task.meta.subThreadPath 属性传递。
    - 规则3：禁止将提取出的子对话线程作为唯一线程参数传递给其他组件。
    - 规则4：InteractionUnit的Starter、Feedbacker和Requester必须遵循相同的线程传递规则，不得直接操作子线程。
    - 规则5：子线程路径必须使用统一格式，优先使用字符串形式："messages.{索引}.meta._thread"。只有在特殊情况下才使用对象形式：{messageIndex: 索引, metaPath: "meta._thread"}。

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
/
 * 根据路径获取子线程
 * @param {Object} thread - 主线程对象
 * @param {string|Object} path - 子线程路径，支持两种格式：
 *   - 对象形式: {messageIndex: 3, metaPath: "meta._thread"}
 *   - 直接访问路径，如: "messages.3.meta._thread"
 * @returns {Object|null} 子线程对象或null（如果路径无效）
 */
function getSubThreadByPath(thread, path) {
    try {
        let messageIndex, metaPath;

        // 处理对象形式的路径
        if (path && typeof path === 'object') {
            messageIndex = path.messageIndex;
            metaPath = path.metaPath || "meta._thread";
        }
        // 处理字符串形式的路径（直接的JavaScript访问路径）
        else if (typeof path === 'string') {
            const parts = path.split('.');
            if (parts[0] === 'messages' && !isNaN(parts[1])) {
                messageIndex = parseInt(parts[1]);
                metaPath = parts.slice(2).join('.');
            }
        }

        // 验证路径有效性
        if (messageIndex === undefined || metaPath === undefined) {
            throw new Error(`无效的子线程路径: ${path}`);
        }

        // 确保消息索引在有效范围内
        if (!thread?.messages || messageIndex < 0 || messageIndex >= thread.messages.length) {
            throw new Error(`消息索引 ${messageIndex} 超出范围`);
        }

        // 获取消息并访问指定路径
        const message = thread.messages[messageIndex];
        return metaPath.split('.').reduce((obj, prop) => obj?.[prop], message);

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

## 5. 持久化机制与责任分配

### 5.1 持久化基本原则

1. 完整性原则：每次持久化必须保存完整的数据状态
2. 及时性原则：关键操作完成后立即持久化
3. 层次性原则：修改嵌套结构时，保存最外层主线程
4. 一致性原则：确保内存中的thread对象与持久化后的状态完全一致

### 5.2 持久化职责分配

1. Agent 职责：
    - 主线程Agent：负责委托StateHandler进行处理
    - 子线程Agent：负责委托InteractionUnit进行处理

2. StateHandler 职责（仅主线程）：
    - 线程结构和整体状态的持久化
    - 子线程创建和结果汇总时负责持久化
    - 状态变更建议的持久化
    - 使用`threadRepository.updateMessage`和`threadRepository.saveThread`

3. MessageGenerator 职责（仅子线程）：
    - 仅负责生成bot消息内容
    - 不负责任何持久化操作
    - 不负责状态更新建议

4. InteractionUnit 职责（仅子线程）：
    - 分步持久化bot和user消息：
        - Feedbacker负责状态更新建议并持久化bot-user消息对
            - 先持久化bot消息
            - 再持久化user消息
        - Starter负责生成和持久化初始user消息，并委托Feedbacker后续处理
        - Requester负责生成和持久化初始user消息和响应的bot消息
    - 每次添加消息后立即调用`threadRepository.saveThread()`

持久化责任链：
- 组件负责持久化自己生成或修改的内容
- Agent负责委托StateHandler或InteractionUnit处理任务，不直接持久化
- StateHandler负责持久化状态变更和子线程创建
- Feedbacker负责持久化完整的bot-user消息对和状态建议
- Starter负责持久化初始user消息并委托Feedbacker
- Requester负责持久化初始user消息和bot响应

### 5.3 必须持久化的关键时机点

1. 子线程创建完成后（StateHandler中）：
   ```javascript
   lastMessage.meta._thread = subThread;
   task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
       meta: lastMessage.meta
   });
   ```

2. 状态更新建议添加后（StateHandler中）：
   ```javascript
   task.host_utils.threadRepository.updateThreadSettings(thread, updatedSettings);
   ```

3. Starter生成初始user消息后：
   ```javascript
   // 创建user消息对象
   const userMessage = {
       id: `sub_user_${Date.now()}`,
       sender: "user",
       text: userMessageText,
       timestamp: Date.now()
   };
   
   // 添加到子线程并立即持久化
   subThread.messages.push(userMessage);
   task.host_utils.threadRepository.saveThread(thread);
   ```

4. Feedbacker生成bot消息后：
   ```javascript
   // 创建bot消息对象
   const botMessageText = response.getFullMessage();
   const botMessage = {
       id: `sub_bot_${Date.now()}`,
       sender: "bot",
       text: botMessageText,
       timestamp: Date.now()
   };
   
   // 添加到子线程并立即持久化
   subThread.messages.push(botMessage);
   task.host_utils.threadRepository.saveThread(thread);
   ```

5. Feedbacker生成user消息后：
   ```javascript
   // 创建user消息对象
   const userMessage = {
       id: `sub_user_${Date.now()}`,
       sender: "user",
       text: userMessageText,
       timestamp: Date.now()
   };
   
   // 添加到子线程并立即持久化
   subThread.messages.push(userMessage);
   task.host_utils.threadRepository.saveThread(thread);
   ```

6. Requester生成user消息和bot消息后：
   ```javascript
   // 添加user消息到子线程并立即持久化
   subThread.messages.push(userMessage);
   task.host_utils.threadRepository.saveThread(thread);
   
   // 添加bot消息到子线程并立即持久化
   subThread.messages.push(botMessage);
   task.host_utils.threadRepository.saveThread(thread);
   ```

### 5.4 持久化方法选择标准

1. 使用updateMessage：
    - 仅修改单个消息且不涉及结构变化时
    - 例：更新占位消息内容

2. 使用updateThreadSettings：
    - 仅修改线程设置（如状态）时
    - 例：更新阶段状态

3. 使用saveThread：
    - 修改多个消息或线程结构变化时
    - 添加新消息到线程时
    - 完成复杂操作需确保数据一致性时

### 5.5 嵌套结构持久化规则

1. 向上传播原则：
    - 修改任何深度的子线程后，保存最外层主线程
    - 子线程存储在主线程的消息元数据中，需要完整持久化

2. 完整持久化示例（StateHandler中）：
   ```javascript
   // 修改深层子线程
   const outlineThread = getSubThreadByPath(thread, outlineThreadPath);
   outlineThread.messages.push(newMessage);
   
   // 直接持久化主线程，一次性保存所有变更
   task.host_utils.threadRepository.saveThread(thread);
   ```

## 6 Response驱动的消息更新机制

### 6.1 子Thread 的 Response 必须是同步的

每个子Thread的Agent和其MessageGenerator返回的Response对象应当是同步的，而不是stream：

```javascript
// 在Response中添加消息更新元数据
const response = new Response("生成的内容");
```

### 6.2 处理 Response 并持久化 thread 的标准流程

- InteractionUnit 接到 MessageGenerator 返回的 Response 后，取出 fullText，做为bot message存到对应的子 thread 中，并立即持久化
- InteractionUnit 调用相关函数生成 user message 后，再存到对应的子 thread 中，并立即持久化（这里没有使用Response）
- StateHandler 接到 子 thread 的 Agent 返回的 Response 后，直接返回，由持有自己的 InteractionUnit 或 Agent 持久化 Response 对应的 message。

### 6.3 跳过Bot消息创建机制

在某些情况下，StateHandler 可能需要直接更新已经存在的消息，而不是创建新的消息。例如，当StateHandler 已经创建并更新了一个占位消息时，可以使用 `skipBotMessageCreation` 标志告知 Feedbacker 跳过创建新的bot消息：

```javascript
// 在StateHandler中
// 直接更新了已有消息后
const response = new Response(finalContent);
response.meta = { 
    ...response.meta,
    skipBotMessageCreation: true 
};
return response;
```

Feedbacker 在执行过程中会检查 Response 的 meta 中是否包含 `skipBotMessageCreation` 标志：

```javascript
// 在Feedbacker的execute方法中
if (response.meta && response.meta.skipBotMessageCreation) {
    // 不创建新消息，而是使用子线程中已有的最后一条bot消息
    const botMessages = subThread.messages.filter(msg => msg.sender === "bot");
    botMessage = botMessages[botMessages.length - 1];
} else {
    // 创建新的bot消息
    // ...
}
```

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
                 └── InteractionUnit (Starter/Feedbacker/Requester)
                      └── MessageGenerator (每个 Feedbacker/Requester 持有对应的MessageGenerator)
```

#### 7.2.2 核心组件

子线程交互模型中有四类核心组件：

1. MessageGenerator: 负责生成bot消息内容，专注于特定阶段的内容生成逻辑
2. InteractionUnit: 交互单元基类，提供共享的基础功能
3. Feedbacker: 负责处理完整的bot-user交互对，持有MessageGenerator
4. Starter: 负责启动交互流程，只能持有Feedbacker
5. Requester: 负责简单的单次请求-响应交互，只能持有MessageGenerator

这些组件是同一抽象层次的概念，分别负责不同的职责域：
- MessageGenerator专注于内容生成
- InteractionUnit专注于交互流程管理

#### 7.2.2.1 InteractionUnit的三种类型

InteractionUnit有三个子类，用于处理不同的交互场景：

1. Feedbacker - 反馈处理器:
    - 职责：对AI生成的结果进行反馈并引导AI继续进行后续任务
    - 流程：委托MessageGenerator生成bot消息 → 分析bot结果 → 生成user反馈引导后续任务
    - 场景：适用于需要对AI输出进行评估、反馈并引导其进行下一步工作的情况
    - 特点：必须持有一个MessageGenerator来生成bot消息

2. Starter - 启动器:
    - 职责：启动新的交互流程，以user消息开始
    - 流程：生成初始user消息 → 委托Feedbacker处理响应
    - 场景：适用于需要启动多轮交互流程的情况
    - 特点：只能持有Feedbacker，用于多轮交互流程

3. Requester - 请求器:
    - 职责：执行简单的单次请求-响应交互
    - 流程：生成初始user消息 → 委托MessageGenerator生成bot响应
    - 场景：适用于只需要单次响应的简单场景
    - 特点：只能持有MessageGenerator，用于简单的单次交互

### 7.3 数据结构

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

### 7.4 核心组件详解

#### 7.4.1 SubThreadAgent 基类

代码：
- 实现代码在代码上下文中 SubThreadAgent.js 文件中

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

#### 7.4.2 MessageGenerator 基类

```javascript
/
 * 消息生成器基类 - 负责生成bot消息内容（子线程专用）
 */
class MessageGenerator {
    constructor(config = {}) {
        this.phase = config.phase; // 保留phase便于记录当前所处阶段
    }

    async _initialize() {
        // 子类在这里初始化一些需要异步初始化的，如果有的话。
    }

    static async create(config = {}) {
        const generator = new this(config);
        await generator._initialize();
        return generator;
    }

    async handle(task, thread, agent) {
        throw new Error("必须由子类实现");
    }
}
```

#### 7.4.3 Feedbacker

代码：
- 实现代码在代码上下文中 InteractionUnit.js 文件中

职责:
- 处理一轮完整的bot-user交互
- 持有并委托MessageGenerator生成bot消息
- 处理bot消息中的指令并生成user反馈消息(如果是最后一条，状态要切换为 completed，就不用生成了)
- 负责状态更新建议

关键方法:
- `initialize()`: 异步初始化交互单元
- `execute(task, thread, agent)`: 执行完整的交互单元，包括委托MessageGenerator生成bot消息和调用相关函数处理bot指令并生成user反馈
- `generateUserMessage(botMessage, task, thread, agent)`: 处理bot指令并生成user反馈
- `_suggestPhaseUpdate(task, thread)`: 建议下一个状态阶段

```javascript
/
 * 反馈处理器类 - 处理完整的bot-user交互对
 */
class Feedbacker extends InteractionUnitBase {
    constructor(config = {}) {
        super(config);

        // 存储MessageGenerator实例
        this.messageGenerator = config.messageGenerator;

        if (!this.messageGenerator) {
            throw new Error("Feedbacker必须持有一个MessageGenerator");
        }
    }

    // 负责状态更新建议
    _suggestPhaseUpdate(task, thread) {
        const subThreadPath = task.meta.subThreadPath;
        const subThread = getSubThreadByPath(thread, subThreadPath);

        if (this.nextPhase && subThread) {
            if (!subThread.settings) subThread.settings = {};
            subThread.settings.briefStatus = subThread.settings.briefStatus || {};
            subThread.settings.briefStatus.phase = this.nextPhase;
        }
    }

    async execute(task, thread, agent) {
        const subThreadPath = task.meta.subThreadPath;
        const subThread = getSubThreadByPath(thread, subThreadPath);

        // 1. 委托MessageGenerator生成bot消息
        const response = await this.messageGenerator.handle(task, thread, agent);

        // 2. 创建bot消息对象
        const botMessage = {
            id: `sub_bot_${Date.now()}`,
            sender: "bot",
            text: response.getFullMessage(),
            timestamp: Date.now()
        };

        // 3. 添加bot消息到子线程并立即持久化
        subThread.messages.push(botMessage);
        task.host_utils.threadRepository.saveThread(thread);

        // 4. 处理指令并生成user反馈
        const userMessageText = await this.generateUserMessage(botMessage, task, thread, agent);

        // 5. 创建user消息对象
        const userMessage = {
            id: `sub_user_${Date.now()}`,
            sender: "user",
            text: userMessageText,
            timestamp: Date.now()
        };

        // 6. 添加user消息到子线程
        subThread.messages.push(userMessage);

        // 7. 建议状态更新
        if (this.nextPhase) {
            this._suggestPhaseUpdate(task, thread);
        }

        // 8. 持久化更新
        task.host_utils.threadRepository.saveThread(thread);

        // 9. 返回完整的交互结果
        return {
            botMessage,
            userMessage
        };
    }

    async generateUserMessage(botMessage, task, thread, agent) {
        throw new Error("必须由子类实现");
    }
}
```

MessageGenerator 与 Feedbacker 的关系：

- MessageGenerator专注于生成bot消息内容
- Feedbacker 持有MessageGenerator实例
- Feedbacker 委托MessageGenerator生成bot消息
- Feedbacker 处理bot消息指令并生成用户反馈
- 两者共享同一状态阶段(phase)信息

#### 7.4.4 Starter 关键函数

1. execute(task, thread, agent)
    - 功能：启动一个新的交互流程
    - 参数：
        - task: 当前任务对象
        - thread: 主线程对象
        - agent: Agent实例
    - 返回值：包含消息对象的结果
    - 处理流程：
        - 调用generateInitialUserMessage生成初始user消息
        - 将user消息保存到子线程并持久化
        - 委托持有的Feedbacker执行后续流程
        - 建议状态更新并返回结果

2. generateInitialUserMessage(task, thread, agent)
    - 功能：生成启动交互流程的初始user消息
    - 参数：
        - task: 当前任务对象
        - thread: 主线程对象
        - agent: Agent实例
    - 返回值：string类型，表示生成的初始user消息内容
    - 特点：必须由子类实现，用于定制特定场景的初始消息

#### 7.4.5 Requester 关键函数

1. execute(task, thread, agent)
    - 功能：执行简单的单次请求-响应交互
    - 参数：
        - task: 当前任务对象
        - thread: 主线程对象
        - agent: Agent实例
    - 返回值：包含消息对象的结果
    - 处理流程：
        - 调用generateInitialUserMessage生成初始user消息
        - 将user消息保存到子线程并持久化
        - 委托持有的MessageGenerator生成bot响应
        - 将bot响应保存到子线程并持久化
        - 建议状态更新并返回结果

2. generateInitialUserMessage(task, thread, agent)
    - 功能：生成请求的初始user消息
    - 参数：
        - task: 当前任务对象
        - thread: 主线程对象
        - agent: Agent实例
    - 返回值：string类型，表示生成的初始user消息内容
    - 特点：必须由子类实现，用于定制特定场景的初始消息

### 7.5 组件关系和执行流程

#### 7.5.1 Feedbacker执行流程:
```
委托MessageGenerator.handle() → bot消息 → 分析bot结果 → generateUserMessage()生成反馈 → user消息
```

#### 7.5.2 Starter执行流程:
```
generateInitialUserMessage() → user消息 → Feedbacker.execute() → [bot消息 → user反馈消息]
```

#### 7.5.3 Requester执行流程:
```
generateInitialUserMessage() → user消息 → MessageGenerator.handle() → bot消息
```

### 7.6 使用场景示例

#### 7.6.1 场景1：使用Starter启动多轮交互流程

```javascript
class DataRequestStarter extends Starter {
    async generateInitialUserMessage(task, thread, agent) {
        const dataType = task.meta.dataType || "用户数据";
        return `请提供${dataType}的分析结果，按照以下格式输出：...`;
    }
}

// 配置
await DataRequestStarter.create({
    phase: "data_request",
    nextPhase: "data_processing",
    feedbacker: dataProcessingFeedbacker  // Starter只能持有Feedbacker
})
```

#### 7.6.2 场景2：使用Feedbacker对AI输出进行评估和引导

```javascript
class CodeReviewFeedbacker extends Feedbacker {
    async generateUserMessage(botMessage, task, thread, agent) {
        // 分析AI生成的代码评审结果
        const reviewContent = botMessage.text;
        
        // 根据分析结果，生成引导性反馈
        if (reviewContent.includes("性能问题")) {
            return "你的代码评审很好，但请进一步详细说明如何优化这些性能问题。请提供具体的代码示例。";
        } else {
            return "请补充安全性评估，特别是关于输入验证和数据处理的部分。";
        }
    }
}
```

#### 7.6.3 场景3：使用Requester进行简单的单次交互

```javascript
class SimpleQueryRequester extends Requester {
    async generateInitialUserMessage(task, thread, agent) {
        const queryType = task.meta.queryType || "基本信息";
        return `请简要提供关于${queryType}的信息，无需详细分析。`;
    }
}

// 配置
await SimpleQueryRequester.create({
    phase: "simple_query",
    nextPhase: "completed",
    messageGenerator: simpleQueryMessageGenerator  // Requester只能持有MessageGenerator
})
```

### 7.7 SubThreadAgent集成 InteractionUnit 的方式

SubThreadAgent的`_initializeInteractionUnits`方法需要配置Starter、Feedbacker和Requester：

```javascript
async _initializeInteractionUnits() {
    // 初始化所有消息生成器
    const initialPhaseGenerator = await InitialPhaseMessageGenerator.create({/*...*/});
    const dataAnalysisGenerator = await DataAnalysisMessageGenerator.create({/*...*/});
    const simpleQueryGenerator = await SimpleQueryMessageGenerator.create({/*...*/});
    const resultFormattingGenerator = await ResultFormattingMessageGenerator.create({/*...*/});
    
    // 创建反馈处理器
    const dataAnalysisFeedbacker = await DataAnalysisFeedbacker.create({
        phase: "data_analysis",
        nextPhase: "result_formatting",
        messageGenerator: dataAnalysisGenerator
    });
    
    // 配置交互单元
    this.interactionUnits = {
        // 使用Starter启动多轮交互流程
        initial_phase: await DataRequestStarter.create({
            phase: "initial_phase",
            nextPhase: "data_analysis",
            feedbacker: dataAnalysisFeedbacker  // Starter只能持有Feedbacker
        }),
        
        // 使用Requester处理简单查询
        simple_query: await SimpleQueryRequester.create({
            phase: "simple_query",
            nextPhase: "data_analysis",
            messageGenerator: simpleQueryGenerator  // Requester只能持有MessageGenerator
        }),
        
        // 使用Feedbacker处理中间交互
        data_analysis: dataAnalysisFeedbacker,
        
        // 使用Feedbacker完成最终处理
        result_formatting: await ResultFormattingFeedbacker.create({
            phase: "result_formatting",
            nextPhase: "completed",
            messageGenerator: resultFormattingGenerator
        })
    };
}
```

### 7.8 最佳实践

1. 选择合适的交互单元类型:
    - 使用Starter：当需要启动完整的多轮交互流程时
    - 使用Feedbacker：当需要对AI输出进行反馈并引导后续任务时
    - 使用Requester：当只需要简单的单次请求-响应交互时

2. 交互单元持有组件的选择:
    - Starter只能持有Feedbacker：用于启动需要多轮交互的流程
        - 适用场景：需要多轮交互精炼结果
        - 适用场景：需要针对AI输出进行反馈和引导
    - Requester只能持有MessageGenerator：用于简单的单次交互
        - 适用场景：只需要一次性生成内容，不需要后续反馈
        - 适用场景：初始化配置或简单查询
    - Feedbacker必须持有MessageGenerator：用于生成bot消息和处理反馈

3. 状态流转设计:
    - Starter和Requester通常对应流程的初始阶段
    - Feedbacker通常用于中间和最终阶段
    - 确保状态流转路径覆盖所有可能的情况

4. 消息持久化时机:
    - Starter生成初始user消息后立即持久化
    - Requester生成初始user消息和bot响应后立即持久化
    - Feedbacker生成bot消息和user消息后立即持久化
    - 所有交互单元在生成或修改消息后立即持久化
    - 状态更新前确保所有消息已持久化

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
        // 1. 创建占位消息，仅作占位显示，会在execute_subthread结束时，用子线程结果更新占位消息
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
                subThreadPath: `messages.${lastMessageIndex}.meta._thread`,
                originalTask: task.meta.originalQuery,
                timestamp: Date.now()
            },
            host_utils: task.host_utils
        });
        
        // 7. 执行子线程处理并获取结果
        const subThreadResponse = await subThreadAgent.executeTask(subThreadTask, thread);
        
        // 8. 处理完成，建议状态更新
        if (this.nextPhase) {
            this._suggestPhaseUpdate(task, thread);
        }
        
        // 9. 返回响应(已直接更新线程消息)
        return subThreadResponse;
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
class NestedSubThreadMessageGenerator extends MessageGenerator {
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
                subThreadPath: `${currentSubThreadPath}.messages.${currentSubThread.messages.length - 1}.meta._thread`,
                parentThreadPath: currentSubThreadPath,
                timestamp: Date.now()
            },
            host_utils: task.host_utils
        });
        
        // 8. 执行嵌套子线程处理
        const nestedResult = await nestedAgent.executeTask(nestedSubThreadTask, thread);
        
        // 9. 更新占位消息为最终结果
        const finalResult = nestedResult.getFullMessage();
        botMessage.text = finalResult;
        
        // 10. 持久化最终结果
        task.host_utils.threadRepository.saveThread(thread);
        
        // 11. 返回最终结果
        return new Response(finalResult);
    }
}
```

## 9. 子线程初始化模式

子线程Agent初始化流程必须遵循以下顺序：

1. 首先初始化所有需要的MessageGenerator实例
2. 然后使用这些MessageGenerator初始化相应的Feedbacker实例
3. 最后根据需要初始化Starter实例（只能持有Feedbacker）和Requester实例（只能持有MessageGenerator）
4. 将所有交互单元（Starter、Feedbacker和Requester）按阶段配置到interactionUnits对象中

这种初始化顺序确保了组件之间的依赖关系正确建立，具体参考如下：

```javascript
class MySubThreadAgent extends SubThreadAgent {
    /*
     * 初始化交互单元
     * 为每个阶段提供对应的InteractionUnit (Starter/Feedbacker/Requester)
     */
    async _initializeInteractionUnits() {
        // 首先初始化所有需要的MessageGenerator
        const dataPreparationGenerator = await DataPreparationMessageGenerator.create({
            phase: "initial_phase"
        });
        
        const dataTransformationGenerator = await DataTransformationMessageGenerator.create({
            phase: "data_transformation"
        });
        
        const simpleQueryGenerator = await SimpleQueryMessageGenerator.create({
            phase: "simple_query"
        });
        
        const dataAnalysisGenerator = await DataAnalysisMessageGenerator.create({
            phase: "data_analysis"
        });
        
        const resultFormattingGenerator = await ResultFormattingMessageGenerator.create({
            phase: "result_formatting"
        });
        
        // 然后初始化Feedbacker交互单元
        const dataTransformationFeedbacker = await DataTransformationFeedbacker.create({
            phase: "data_transformation",
            nextPhase: "data_analysis",
            messageGenerator: dataTransformationGenerator
        });
        
        // 配置交互单元，注意Starter只能持有Feedbacker，Requester只能持有MessageGenerator
        this.interactionUnits = {
            // 使用Starter启动流程，只能持有Feedbacker
            initial_phase: await DataPreparationStarter.create({
                phase: "initial_phase",
                nextPhase: "data_transformation",
                feedbacker: dataTransformationFeedbacker  // Starter只能持有Feedbacker
            }),
            
            // 使用Requester处理简单查询
            simple_query: await SimpleQueryRequester.create({
                phase: "simple_query",
                nextPhase: "data_analysis",
                messageGenerator: simpleQueryGenerator  // Requester只能持有MessageGenerator
            }),
            
            // 其他阶段使用Feedbacker处理
            data_transformation: dataTransformationFeedbacker,
            // ...其他阶段的交互单元
        };
    }
}
```

## 10. 命名与文件、代码组织规范

### 10.1 文件结构规范

子线程嵌套模式的标准文件结构应遵循以下规范：

```
- [Business]Agent.js                        // 主Agent实现
- [Business]StateHandlers.js                // 主Agent的状态处理器集合
- /[business_process]/                      // 一级子线程目录（使用蛇形命名法）
  - [BusinessProcess]Agent.js               // 一级子线程Agent实现
  - [BusinessProcess]InteractionUnits.js    // 一级子线程交互单元集合
  - [BusinessProcess]MessageGenerators.js   // 一级子线程消息生成器集合
  - /[nested_task]/                         // 二级子线程目录（使用蛇形命名法）
    - [NestedTask]Agent.js                  // 二级子线程Agent实现
    - [NestedTask]InteractionUnits.js       // 二级子线程交互单元集合
    - [NestedTask]MessageGenerators.js      // 二级子线程消息生成器集合
- /prompt/                                  // 提示词目录
  - [phase_name]_system_prompt.md           // 各阶段的系统提示词文件
```

目录组织原则:

1. 层次对应：目录层次必须与子线程嵌套层次一一对应
2. 业务分组：相同业务流程的组件必须放在同一目录下
3. 子目录命名：必须使用蛇形命名法（snake_case）
4. 组件完整性：每个子线程目录必须包含对应的Agent、MessageGenerators和InteractionUnits文件
5. 扩展性：目录结构应支持无限深度的子线程嵌套

### 10.2 命名规范

#### 10.2.1 Agent命名规范

- 文件命名：必须使用 `[业务名称]Agent.js` 格式
- 类命名：必须使用 `[业务名称]Agent` 格式，例如：`ArticleCreationAgent`、`CodeReviewAgent`
- 业务性：类名必须明确体现业务功能，不应仅反映技术角色
    - 正确：`DataAnalysisAgent`、`CodeGenerationAgent`
    - 错误：`SubThreadAgent`（仅反映技术角色，不体现业务）、`ProcessAgent`（过于抽象）

#### 10.2.2 MessageGenerator命名规范

- 文件命名：必须使用 `[对应Agent前缀]MessageGenerators.js` 格式
- 类命名：必须使用 `[业务阶段名称]MessageGenerator` 格式
    - 例如：`RequirementClarificationMessageGenerator`、`CodeGenerationMessageGenerator`
- 独立性：每个子线程的消息生成器必须放置在各自的文件中，不应将不同层级的生成器混合在一个文件中

#### 10.2.3 交互单元命名规范

- 文件命名：必须使用 `[对应Agent前缀]InteractionUnits.js` 格式
- 类命名：
    - Feedbacker类必须使用 `[业务功能]Feedbacker` 格式
    - Starter类必须使用 `[业务功能]Starter` 格式
    - Requester类必须使用 `[业务功能]Requester` 格式
    - 例如：`DataTransformationFeedbacker`、`InitialQueryStarter`、`SimpleQueryRequester`
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

#### 10.2.7 交互单元组织规范

1. 组件分离原则：
    - 每个子线程的InteractionUnit类（Starter、Feedbacker和Requester）必须集中在一个文件中
    - 文件命名为 `[BusinessProcess]InteractionUnits.js`
    - 禁止将不同子线程的InteractionUnit混合在同一文件中

2. 类型明确性：
    - 所有Starter类必须明确继承自Starter基类
    - 所有Feedbacker类必须明确继承自Feedbacker基类
    - 所有Requester类必须明确继承自Requester基类
    - 禁止使用泛化的InteractionUnit作为直接父类

3. 持有关系规范：
    - Feedbacker必须持有一个MessageGenerator
    - Starter只能持有一个Feedbacker
    - Requester只能持有一个MessageGenerator

### 10.3 复用要求

- 所有的StateHandler子类都要继承StateHandler，而不是自己搞一个父类
- 所有的MessageGenerator子类继承MessageGenerator
- 主线程Agent继承BaseAgent，子线程Agent继承SubThreadAgent
- _applyPhaseUpdateSuggestion和初始化briefStatus都用同样的代码，这代码要在BaseAgent里
- 所有Feedbacker类必须继承Feedbacker基类
- 所有Starter类必须继承Starter基类
- 所有Requester类必须继承Requester基类
- 共用逻辑应提取到基类或工具函数中

## 11. 最佳实践总结

### 11.1 设计原则

1. 职责分离:
    - 主线程Agent继承BaseAgent，负责主要交互
    - 子线程Agent继承SubThreadAgent，负责子线程交互流程管理
    - StateHandler专注于主线程的状态管理和消息生成
    - MessageGenerator专注于子线程的内容生成，不参与状态管理
    - Feedbacker持有MessageGenerator并专注于处理bot消息指令和生成user反馈，负责子线程状态建议
    - Starter负责启动交互流程，生成初始user消息并委托Feedbacker
    - Requester负责简单的单次请求-响应交互
    - 每个组件只关注自己的责任范围

2. 状态驱动:
    - 使用状态驱动的交互流程控制模式
    - 主线程：StateHandler负责状态管理
    - 子线程：Feedbacker负责状态建议，MessageGenerator不参与状态管理
    - 通过状态迁移建议实现流程控制

3. 线程传递:
    - 始终传递主线程对象，通过路径访问子线程
    - 禁止直接传递子线程对象作为参数
    - 使用task.meta.subThreadPath传递子线程路径

4. 持久化职责:
    - Agent：负责线程结构和最终结果持久化
    - StateHandler：负责状态转换的持久化
    - MessageGenerator：仅负责内容生成，不负责持久化
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
    - 主线程：StateHandler负责状态建议
    - 子线程：Feedbacker负责状态建议

3. 子线程交互模型：
    - 主线程Agent继承BaseAgent，使用StateHandler
    - 子线程Agent继承SubThreadAgent，使用MessageGenerator和InteractionUnit
    - Feedbacker持有对应的MessageGenerator生成bot消息并处理反馈
    - Starter只能持有Feedbacker，负责启动多轮交互流程
    - Requester只能持有MessageGenerator，负责简单的单次交互
    - MessageGenerator负责生成bot消息内容，不参与状态管理
    - 交互单元协作模式：
        - Starter启动流程 → Feedbacker处理中间交互 → 最终Feedbacker完成处理
        - Requester执行简单的单次请求-响应交互
    - 多轮交互完成后汇总结果返回给主线程

4. 持久化最佳实践：
    - 分层持久化责任模型明确各组件职责
    - Starter负责持久化初始user消息
    - Feedbacker负责持久化bot-user消息对和状态建议
    - Requester负责持久化初始user消息和bot响应
    - MessageGenerator不负责任何持久化操作
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
    - StateHandler文件仅用于主线程
    - MessageGenerators文件仅用于子线程

8. 组件持有关系：
    - Feedbacker必须持有一个MessageGenerator
    - Starter只能持有一个Feedbacker
    - Requester只能持有一个MessageGenerator
    - StateHandler为主线程Agent专属

遵循这些规范可确保 Agent 实现的一致性、可维护性和可扩展性，尤其是在处理复杂的多步骤任务时，能够提供高质量的输出结果。