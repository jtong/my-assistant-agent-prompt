基于您的要求，我将简化规范并基于旧版进行修改，保留不冲突的内容，更新冲突部分。以下是简化版规范：

# My Assistant Agent 简化设计规范

## 1. 核心概念

- 主线程：用户与Agent的主要对话线程，包含消息列表和设置
- 子线程：嵌套在父线程消息元数据中的次级对话线程，用于处理复杂任务
- StateHandler：主线程专属，处理特定状态的组件，负责生成消息内容和执行状态转换
- MessageGenerator：子线程专属，负责生成bot消息内容的组件，不拥有phase和nextPhase，也不负责状态更新建议
- InteractionUnit：子线程中一轮完整对话的处理单元，包括Feedbacker、Starter和Requester
- Phase：线程的处理阶段，存储在`settings.briefStatus.phase`中

## 2. 类继承与持有关系

### 2.1 继承关系

```
BaseAgent <- 主线程Agent
SubThreadAgent <- 子线程Agent  
StateHandler <- 具体状态处理器（主线程专用）
MessageGenerator <- 具体消息生成器（子线程专用）
InteractionUnitBase <- Feedbacker/Starter/Requester
```

### 2.2 持有关系（关键约束）

主线程Agent持有关系：
- 主线程Agent 持有多个 StateHandler

子线程Agent持有关系：
- 子线程Agent 持有多个 InteractionUnit
- Feedbacker 必须持有一个 MessageGenerator
- Starter 只能持有一个 Feedbacker（不能持有其他类型）
- Requester 只能持有一个 MessageGenerator（不能持有其他类型）

```
BaseAgent (主线程Agent基类)
    ↓
主线程Agent → StateHandler (多个，处理不同状态)

SubThreadAgent (子线程Agent基类)  
    ↓
子线程Agent → InteractionUnit (多个，处理不同阶段)
          ↙              ↓                    ↘
    Starter → Feedbacker    Requester → MessageGenerator    Feedbacker → MessageGenerator
```

### 2.3 StateHandler vs MessageGenerator 核心区别

StateHandler（主线程专用）：
- 拥有 `phase` 和 `nextPhase` 属性
- 负责状态更新建议：`_suggestPhaseUpdate(task, thread)`
- 使用 `threadRepository.updateThreadSettings()` 更新线程设置

MessageGenerator（子线程专用）：
- 只有 `phase` 属性（仅用于记录当前所处阶段）
- 没有 `nextPhase` 属性
- 不负责状态更新建议
- 只专注于生成bot消息内容

## 3. 线程传递与访问规范

### 3.1 核心原则（严格遵循）

- 必须始终传递主线程对象，而非子线程对象
- 子线程路径通过 `task.meta.subThreadPath` 属性传递
- 子线程路径格式: `"messages.{索引}.meta._thread"`
- 严禁将提取的子线程作为参数传递给其他组件

### 3.2 子线程访问标准模式

```javascript
// 正确方式 - 总是传递主线程
function someMethod(task, thread, agent) {
  const subThreadPath = task.meta.subThreadPath;
  const subThread = getSubThreadByPath(thread, subThreadPath);
  // 处理子线程...
}

// 错误方式 - 不要直接传递子线程
function wrongMethod(subThread, agent) { /* 严格禁止 */ }
```

## 4. 状态管理机制

### 4.1 状态存储与责任分配

- 状态存储在 `settings.briefStatus.phase`
- 状态更新使用建议-应用两步机制
- 状态更新建议存储在 `_phaseUpdateSuggestion`
- 主线程：StateHandler 负责状态建议
- 子线程：Feedbacker 负责状态建议，MessageGenerator 不参与

### 4.2 状态处理流程（BaseAgent已实现）

```javascript
// StateHandler 建议状态更新
_suggestPhaseUpdate(task, thread) {
  const currentSettings = task.host_utils.threadRepository.getThreadSettings(thread.id) || {};
  const updatedSettings = {
    ...currentSettings,
    _phaseUpdateSuggestion: { phase: this.nextPhase }
  };
  task.host_utils.threadRepository.updateThreadSettings(thread, updatedSettings);
}

// Agent应用状态更新建议（BaseAgent中已实现，不要重写）
_applyPhaseUpdateSuggestion(task, thread) {
  // 先应用状态，再选择处理器
  // retry任务跳过状态更新但移除建议
}
```

## 5. 交互单元职责与执行流程

### 5.1 三种交互单元的职责

- Feedbacker: 处理完整的bot-user交互对，必须持有MessageGenerator
- Starter: 启动交互流程，生成初始user消息，只能持有Feedbacker
- Requester: 处理简单的单次请求-响应，只能持有MessageGenerator

### 5.2 执行流程

- Feedbacker流程: 委托MessageGenerator生成bot消息 → 分析bot结果 → 生成user反馈
- Starter流程: 生成初始user消息 → 委托Feedbacker处理后续交互
- Requester流程: 生成初始user消息 → 委托MessageGenerator生成bot响应

### 5.3 状态管理责任

- MessageGenerator: 只生成内容，不参与状态管理
- Feedbacker: 负责子线程中的状态更新建议
- StateHandler: 负责主线程中的状态更新建议

## 6. 持久化机制

### 6.1 持久化职责分配

- InteractionUnit: 负责自己生成的bot和user消息的持久化
- StateHandler: 负责状态变更和子线程创建的持久化
- MessageGenerator: 不负责任何持久化操作
- Agent: 负责委托处理，不直接持久化

### 6.2 关键持久化时机与方法

```javascript
// 子线程创建后持久化
lastMessage.meta._thread = subThread;
task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
  meta: lastMessage.meta
});

// Feedbacker持久化bot消息
subThread.messages.push(botMessage);
task.host_utils.threadRepository.saveThread(thread);

// Feedbacker持久化user消息
subThread.messages.push(userMessage);  
task.host_utils.threadRepository.saveThread(thread);
```

### 6.3 跳过Bot消息创建机制

当StateHandler已经创建并更新了占位消息时：

```javascript
// 在StateHandler中
const response = new Response(finalContent);
response.meta = { 
  ...response.meta,
  skipBotMessageCreation: true 
};
return response;
```

## 7. LLM调用规范

### 7.1 统一使用AIAdapter

```javascript
// 正确方式 - 使用AIAdapter（统一接口）
const AIAdapter = require('../my_assistant_agent_util/AIAdapter');

// 子线程中同步调用
const response = await AIAdapter.chat(messages, { // messages必须是thread.messages格式
  systemMessage: "系统提示",
  stream: false
});
const responseText = response.choices[0].message.content;

// 主线程中流式调用
const stream = await AIAdapter.chat(messages, {
  systemMessage: systemPrompt,
  stream: true
});
const response = new Response('');
response.setStream(agent.createStream(stream));

// 错误方式 - 直接调用LLM API
const response = await openai.chat.completions.create({/*...*/}); // 严格禁止
```

## 8. 子线程初始化模式

### 8.1 主线程创建子线程（强制两步法）

必须分为prepare和execute两个状态，用于UI体验优化：

```javascript
// 第一步：准备阶段（UI占位）
class SubThreadPreparationHandler extends StateHandler {
  constructor(config = {}) {
    super(config);
    this.phase = "prepare_subthread";
    this.nextPhase = "execute_subthread"; // 必须设置为执行阶段
  }
  
  async handle(task, thread, agent) {
    const placeholderMessage = "正在处理您的请求...";
    const response = new Response(placeholderMessage);
    
    response.addNextTask(new Task({
      name: "ContinueProcessing", // 任务名不重要，状态才重要
      type: Task.TYPE_ACTION,
      skipUserMessage: true,
      meta: { originalQuery: task.message?.text }
    }));
    
    this._suggestPhaseUpdate(task, thread);
    return response;
  }
}

// 第二步：执行阶段（实际处理）  
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
      settings: { briefStatus: { phase: "initial_phase" } } 
    };
    
    // 2. 获取占位消息
    const lastMessageIndex = thread.messages.length - 1;
    const lastMessage = thread.messages[lastMessageIndex];
    
    // 3. 存储子线程
    if (!lastMessage.meta) lastMessage.meta = {};
    lastMessage.meta._thread = subThread;
    
    // 4. 立即持久化（关键）
    task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
      meta: lastMessage.meta
    });
    
    // 5. 创建并执行子线程Agent
    const subThreadAgent = await MySubThreadAgent.create(agent.metadata, agent.settings);
    const subThreadTask = new Task({
      name: "ProcessSubThread",
      meta: {
        subThreadPath: `messages.${lastMessageIndex}.meta._thread`,
        originalTask: task.meta.originalQuery
      },
      host_utils: task.host_utils
    });
    
    const subThreadResponse = await subThreadAgent.executeTask(subThreadTask, thread);
    
    if (this.nextPhase) {
      this._suggestPhaseUpdate(task, thread);
    }
    
    return subThreadResponse;
  }
}
```

注意：主线程Agent的`_initializeStateHandlers`必须配置这两个状态，缺失任何一个都是错误的。

### 8.2 子线程Agent初始化顺序

```javascript
class MySubThreadAgent extends SubThreadAgent {
  async _initializeInteractionUnits() {
    // 1. 先初始化所有MessageGenerator
    const generator1 = await MessageGenerator1.create({/*...*/});
    const generator2 = await MessageGenerator2.create({/*...*/});
    
    // 2. 再初始化Feedbacker（持有MessageGenerator）
    const feedbacker = await MyFeedbacker.create({
      phase: "some_phase",
      nextPhase: "next_phase", 
      messageGenerator: generator2
    });
    
    // 3. 最后配置交互单元
    this.interactionUnits = {
      initial_phase: await MyStarter.create({
        phase: "initial_phase",
        nextPhase: "some_phase",
        feedbacker: feedbacker  // Starter只能持有Feedbacker
      }),
      some_phase: feedbacker,
      simple_task: await MyRequester.create({
        phase: "simple_task", 
        nextPhase: "completed",
        messageGenerator: generator1  // Requester只能持有MessageGenerator
      })
    };
  }
}
```

## 9. 命名与文件组织

### 9.1 文件结构

```
- [Business]Agent.js                        // 主Agent
- [Business]StateHandlers.js                // 主Agent状态处理器
- /[business_process]/                      // 子线程目录（蛇形命名）
  - [BusinessProcess]Agent.js               // 子线程Agent
  - [BusinessProcess]InteractionUnits.js    // 子线程交互单元
  - [BusinessProcess]MessageGenerators.js   // 子线程消息生成器
  - /[nested_task]/                         // 嵌套子线程目录
    - [NestedTask]Agent.js                  // 嵌套Agent
    - [NestedTask]InteractionUnits.js       // 嵌套交互单元  
    - [NestedTask]MessageGenerators.js      // 嵌套消息生成器
- /prompt/                                  // 提示词目录
  - [phase_name]_system_prompt.md           // 阶段提示词
```

### 9.2 命名规范

- Agent: `[业务名称]Agent` - 例如`ArticleCreationAgent`
- 状态处理器: `[业务阶段]Handler` - 例如`RequirementClarificationHandler`
- 消息生成器: `[业务阶段]MessageGenerator` - 例如`DataAnalysisMessageGenerator`
- 交互单元:
  - Feedbacker: `[业务功能]Feedbacker` - 例如`DataTransformationFeedbacker`
  - Starter: `[业务功能]Starter` - 例如`DataPreparationStarter`
  - Requester: `[业务功能]Requester` - 例如`SimpleQueryRequester`
- 状态名称: 使用snake_case - 例如`data_preparation`、`completed`

### 9.3 代码组织原则

- 每个子线程有独立的文件集合（Agent、InteractionUnits、MessageGenerators）
- StateHandler文件仅用于主线程
- MessageGenerator文件仅用于子线程
- 禁止跨层级混用组件

## 10. 关键实现细节

### 10.1 Agent必须实现的接口（签名不可修改）

```javascript
constructor(metadata, settings) {
  super(metadata, settings);  // 调用父类构造函数
  // 初始化Agent特有属性
}

async _initializeStateHandlers() {  // 主线程Agent实现
  this.stateHandlers = {
    prepare_subthread: new SubThreadPreparationHandler({/*...*/}),
    execute_subthread: new SubThreadExecutionHandler({/*...*/})
  };
}

async _initializeInteractionUnits() {  // 子线程Agent实现
  // 按正确顺序初始化MessageGenerator -> Feedbacker -> 配置InteractionUnit
}

async executeTask(task, thread) {  // 继承自基类，通常不需要重写
  return this._handleMessageProcessing(task, thread);
}
```

### 10.2 关键方法签名（严禁修改）

```javascript
// 这些方法签名在整个系统中保持一致，不得修改
async executeTask(task, thread) {...}           // Agent接口
async handle(task, thread, agent) {...}         // StateHandler/MessageGenerator接口  
async execute(task, thread, agent) {...}        // InteractionUnit接口
async generateUserMessage(botMessage, task, thread, agent) {...}  // Feedbacker接口
async generateInitialUserMessage(task, thread, agent) {...}       // Starter/Requester接口
_suggestPhaseUpdate(task, thread) {...}         // 状态建议接口
_applyPhaseUpdateSuggestion(task, thread) {...} // 状态应用接口（BaseAgent已实现）
```

## 11. 最佳实践与禁止事项

### 11.1 严格禁止

- 修改基类关键方法签名：如`executeTask`、`_applyPhaseUpdateSuggestion`等
- 传递子线程对象：必须传递主线程+路径方式访问
- 违反持有关系：Starter持有非Feedbacker、Requester持有非MessageGenerator等
- 跨层级复用组件：主线程使用MessageGenerator、子线程使用StateHandler
- MessageGenerator处理状态：MessageGenerator不得调用状态更新相关方法
- 直接调用LLM API：必须通过AIAdapter统一调用

### 11.2 必须遵循

- 继承正确基类：主线程Agent继承BaseAgent，子线程Agent继承SubThreadAgent
- 复用基类功能：使用基类中的`_applyPhaseUpdateSuggestion`、`createStream`等方法
- 职责分离：StateHandler负责主线程状态，MessageGenerator只生成内容，InteractionUnit管理交互
- 持久化及时性：关键操作后立即调用`saveThread()`或`updateMessage()`
- 两步子线程初始化：必须实现prepare和execute两个状态
- 正确的组件初始化顺序：MessageGenerator → Feedbacker → 配置InteractionUnit

### 11.3 复用要求

- 所有StateHandler子类继承`StateHandler`基类
- 所有MessageGenerator子类继承`MessageGenerator`基类
- 所有InteractionUnit子类继承对应的基类（`Feedbacker`、`Starter`、`Requester`）
- 主线程Agent继承`BaseAgent`，子线程Agent继承`SubThreadAgent`
- 优先使用基类中已实现的功能，避免重复实现

遵循这些规范可确保Agent实现的一致性、可维护性和可扩展性，防止破坏系统架构和接口约定。