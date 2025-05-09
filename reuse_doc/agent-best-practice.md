# My Assistant Agent 开发规范文档（精简版）

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

/**
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

## 3. 子线程模型最佳实践

### 3.1 子线程的本质与结构

子线程是一种设计模式，用于处理需要多步骤完成的复杂消息生成过程。它创建了一个嵌套的执行环境，允许在单个消息响应中执行多轮交互处理。

```
主线程Agent
  └── 主线程StateHandler
       └── 子线程 {messages:[...]}
            └── 子线程Agent
                 └── 子线程StateHandler
```

### 3.2 子线程创建与存储

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
    const subThreadAgent = await SubThreadAgent.create(/* metadata, settings */);
    return await subThreadAgent.executeTask(/* task */, thread); // 注意：始终传递的都是完整的主thread，因为Agent永远都是处理主thread或最后一个message的子thread，所以它可以根据自己的定位找到对应的thread，或者在task的meta里放上自己要主要处理的子thread的属性path，一样可以传递。
}
```

注：如果你传递给executeTask的thread不是主thread，是对你的否定。

### 3.3 子线程Agent规范

子线程Agent遵循与主Agent相同的核心接口规范:

```javascript
class SubThreadAgent extends BaseAgent {
    // 标准的Agent接口实现
    constructor(metadata, settings) {/* ... */}
    async initialize() {/* ... */}
    async executeTask(task, thread) {/* ... */}
    
    // 已经由BaseAgent实现的方法，默认不需要覆盖，除非有逻辑差异
    _handleMessageProcessing(task, thread) {/* ... */}
    _applyPhaseUpdateSuggestion(task, thread) {/* ... */}
    static async create(metadata, settings) {/* ... */}

}
```

### 3.4 子线程的多轮交互模式

子线程内部实现了一种 问题-工具-反馈 的循环模式:

1. AI指令: 子线程中的bot消息是AI生成的操作指令
2. 执行结果: 子线程中的user消息是执行操作的结果反馈
3. 重复循环: 多轮交互直到完成任务

```
子线程.messages = [
  {sender: "bot", text: "需要读取文件X"},
  {sender: "user", text: "文件X内容是: ..."},
  {sender: "bot", text: "需要搜索关键词Y"},
  {sender: "user", text: "搜索结果: ..."},
  ...直到完成
]
```

### 3.5 关键设计原则

1. 职责分离:
   - 子线程Agent 负责整体流程协调
   - 子线程StateHandler 负责具体步骤处理
   - 每个组件只关注自己的责任范围

2. 状态管理一致性:
   - 子线程Agent使用与主Agent相同的状态管理机制
   - 状态处理器提供单步能力，Agent负责流程编排

3. 处理策略多样性:
   - 状态处理器可以实现简单处理或复杂的ReAct模式
   - 处理策略选择取决于任务的复杂性和需求

4. 数据隔离:
   - 子线程状态对主线程透明
   - 只有最终结果会传递回主线程
   - 子线程生命周期仅限于单个消息的生成过程

### 3.6 子线程模型最佳实践要点

1. 子线程创建: 在主线程StateHandler中创建并存储在消息元数据中
2. Agent初始化: 使用标准的`static async create()`方法创建子线程Agent
3. 状态管理: 子线程Agent内维护自己的状态处理器映射
4. 执行流程: 子线程通过多轮内部消息交互完成复杂任务
5. 结果合成: 子线程执行完毕后，将最终结果作为Response返回

通过这种子线程模型，可以在单个消息处理中实现复杂的多步骤流程，同时保持代码的模块化和责任清晰。

## 4. 关键规范总结

1. Agent与Thread关系：
   - 一个 Agent 对应管理一个 Thread
   - 每个消息处理可使用 `message.meta._thread` 存储子线程

2. 状态管理核心原则：
   - 状态存储在 `settings.briefStatus.phase`
   - 状态迁移使用建议-应用两步机制
   - 状态迁移建议存储在 `thread.settings._phaseUpdateSuggestion`
   - 先应用状态，再选择处理器处理任务
   - Retry时清除迁移建议但不改变状态

3. 代码组织原则：
   - 使用 `StateHandler` 子类处理特定状态的消息
   - 状态处理器应专注于单一职责
   - Agent通过委托模式将消息处理转发给状态处理器

遵循这些规范可确保 Agent 实现的一致性、可维护性和可扩展性。


## 命名要求

- Agent的类命名必须使用Agent结尾
- 业务必须要在类命名上体现出来，而不是仅仅提现设计的命名
- 每一个子Agent都要有配套的自己的 StateHandler 文件，而不是所有层级的StateHandler子类在一个文件中。

## 复用要求

- 所有的 StateHandler 子类都要继承 StateHandler，而不是自己搞一个父类。
- 所有的Agent都要继承 BaseAgent 父类， _applyPhaseUpdateSuggestion 和 初始化 briefStatus 都用同样的代码，这代码要在BaseAgent里。

## 子线程嵌套模式抽象数据结构设计

在上述最佳实践下，数据结构如下，以下面的数据结构来实现相关的Agent推理逻辑。

### 核心架构

```
主线程
  └── 消息
       └── 一级子线程 (存储在消息元数据中)
            └── 消息
                 └── 二级子线程 (存储在消息元数据中)
                      └── 消息
                           └── 三级子线程 (可继续嵌套)
```

### 关键特性

1. 嵌套结构：每个子线程存储在父线程消息的 `meta._thread` 字段中
2. 状态传递：子线程处理完成后，结果通过父线程层层传递
3. 阶段隔离：每个子线程处理特定任务，有自己独立的状态管理

### 状态管理

- 每个线程有独立的 `settings.briefStatus.phase` 标记当前状态。
- 状态变更通过 `settings.briefStatus._suggestPhaseUpdate` 机制实现

### 数据流动

1. 输入下沉：任务要求从父线程传递到子线程
2. 多轮处理：子线程中执行多轮交互完成任务
3. 结果上浮：处理结果从子线程返回到父线程
4. 层层传递：结果可能经过多层子线程处理

### 实现要点

- 线程创建：在处理器中创建子线程并存储在消息元数据中
- 状态追踪：每个线程层级独立管理自己的状态
- 结果汇总：子线程完成后，将结果传递给父线程
- 资源管理：子线程完成任务后正确关闭和清理

这种模式适用于需要多步骤、多层次处理的复杂任务，每个子线程专注于特定子任务的处理。