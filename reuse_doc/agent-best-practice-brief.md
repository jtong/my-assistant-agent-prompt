
# My Assistant Agent 开发规范简明指南

## 1. 核心概念与关系

- 主线程: 用户与Agent的主对话线程
- 子线程: 嵌套在消息元数据中的次级对话线程，存储在`message.meta._thread`
- 状态(Phase): 处理阶段，存储在`settings.briefStatus.phase`
- StateHandler: 处理特定状态的组件，生成消息内容
- InteractionUnit: 子线程中一轮完整对话处理单元，持有并委托StateHandler

核心关系:
- 每个Agent拥有多个StateHandler（每个状态一个）
- 每个SubThreadAgent拥有多个InteractionUnit（每个状态一个）
- 每个InteractionUnit持有一个专属的StateHandler实例

## 2. 类的职责与继承体系

### 2.1 Agent 类族
- BaseAgent: 所有主线程Agent的基类
    - 负责状态处理和任务路由
    - 必须使用其`_handleMessageProcessing`和`_applyPhaseUpdateSuggestion`方法

- SubThreadAgent: 所有子线程Agent的基类
    - 管理子线程交互单元执行
    - 不得修改其`_executeInteractionUnits`方法

### 2.2 处理器类族
- StateHandler: 所有状态处理器的基类
    - 实现`handle(task, thread, agent)`方法处理特定状态
    - 使用`_suggestPhaseUpdate`提出状态转换建议

- InteractionUnit: 交互单元基类
    - 实现`execute(task, thread, agent)`协调bot-user交互
    - 实现`generateUserMessage`处理bot指令生成用户反馈
    - 必须持有对应的StateHandler实例

### 2.3 AIAdapter 通信规范

AIAdapter 是统一管理 AI 通信的单例适配器，所有 AI 调用必须通过此适配器进行：

- 目的：所有 AI 调用统一通过 Adapter 接口进行，避免各种 AI 服务的 API 和数据结构直接入侵代码，降低对特定 AI 服务的依赖
- 规则：适配器只发送第一层消息，自动排除子线程和虚拟消息，并处理格式转换

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

- 使用：在 StateHandler 中调用 AIAdapter 而非直接调用 AI 服务

```javascript
// 在 StateHandler.handle 方法中
async handle(task, thread, agent) {
    const AIAdapter = require('../my_assistant_agent_util/AIAdapter');
    const systemPrompt = "您是..."; // 系统提示词
    
    // 使用 AIAdapter 处理 AI 通信
    const stream = await AIAdapter.chat(thread, {
        systemMessage: systemPrompt,
        stream: true
    });
    
    const response = new Response('');
    response.setStream(agent.createStream(stream));
    return response;
}
```

## 3. 线程管理关键规则

### 3.1 线程传递原则
- 必须始终传递主线程对象，通过路径访问子线程
- 子线程路径通过`task.meta.subThreadPath`属性传递
- 严禁将提取的子线程作为参数传递给其他组件

### 3.2 子线程访问标准方法
```javascript
// 标准子线程访问方式
const subThreadPath = task.meta.subThreadPath;
const subThread = getSubThreadByPath(thread, subThreadPath);
// 然后操作子线程...
```

## 4. 主线程创建子线程的两阶段流程

### 4.1 准备阶段（UI优先）
```javascript
// PrepareSubThreadHandler
async handle(task, thread, agent) {
    // 1. 创建占位消息
    const placeholderMessage = "正在处理...";
    const response = new Response(placeholderMessage);
    
    // 2. 添加下一任务（跳过用户输入）
    response.addNextTask(new Task({
        name: "ContinueProcessing",
        type: Task.TYPE_ACTION,
        skipUserMessage: true,
        meta: { originalQuery: task.message?.text }
    }));
    
    // 3. 建议状态更新
    this._suggestPhaseUpdate(task, thread);
    
    return response;
}
```

### 4.2 执行阶段（创建并处理子线程）
```javascript
// ExecuteSubThreadHandler
async handle(task, thread, agent) {
    // 1. 创建子线程
    const subThread = { messages: [], settings: { briefStatus: { phase: "initial_phase" } } };
    
    // 2. 存储在占位消息的元数据中
    const lastMessageIndex = thread.messages.length - 1;
    const lastMessage = thread.messages[lastMessageIndex];
    if (!lastMessage.meta) lastMessage.meta = {};
    lastMessage.meta._thread = subThread;
    
    // 3. 持久化更新（关键步骤）
    task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
        meta: lastMessage.meta
    });
    
    // 4. 创建子线程Agent并执行
    const subThreadAgent = await MySubThreadAgent.create(agent.metadata, agent.settings);
    const subThreadTask = new Task({
        name: "ProcessSubThread",
        meta: { subThreadPath: `messages.${lastMessageIndex}.meta._thread` },
        host_utils: task.host_utils
    });
    
    // 5. 执行子线程处理
    const subThreadResponse = await subThreadAgent.executeTask(subThreadTask, thread);
    
    // 6. 更新占位消息为最终结果
    lastMessage.text = subThreadResponse.getFullMessage();
    task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
        text: lastMessage.text
    });
    
    // 7. 建议状态更新
    this._suggestPhaseUpdate(task, thread);
    
    return new Response("");
}
```

## 5. 子线程Agent初始化标准模式

```javascript
// 子线程Agent中必须实现的方法
async _initializeInteractionUnits() {
    // 1. 先创建所有StateHandler实例
    const initialPhaseHandler = await InitialPhaseHandler.create({
        phase: "initial_phase",
        nextPhase: "next_phase"
    });
    
    const nextPhaseHandler = await NextPhaseHandler.create({
        phase: "next_phase",
        nextPhase: "completed"
    });
    
    // 2. 然后创建InteractionUnit并传入对应的StateHandler
    this.interactionUnits = {
        initial_phase: await InitialPhaseUnit.create({
            phase: "initial_phase",
            nextPhase: "next_phase",
            stateHandler: initialPhaseHandler // 注意这里传入了handler实例
        }),
        
        next_phase: await NextPhaseUnit.create({
            phase: "next_phase",
            nextPhase: "completed",
            stateHandler: nextPhaseHandler // 注意这里传入了handler实例
        })
    };
}
```

## 6. 持久化关键时机

### 6.1 必须立即持久化的时机
1. 创建子线程后：使用`updateMessage`更新元数据
2. 添加子线程消息后：使用`saveThread`保存整个线程
3. 状态更新建议后：使用`updateThreadSettings`保存设置
4. 更新占位消息内容后：使用`updateMessage`更新文本

### 6.2 嵌套结构持久化规则
- 任何子线程修改后，必须持久化最外层主线程
- 即使修改多层嵌套的子线程，也是调用一次`saveThread(thread)`

### 6.3 跳过Bot消息创建机制
- 在某些情况下，StateHandler 可能需要直接更新已经存在的消息，而不是创建新的消息。例如，当StateHandler 已经创建并更新了一个占位消息时，可以使用 `skipBotMessageCreation` 标志告知 InteractionUnit 跳过创建新的bot消息。
- InteractionUnit 在执行过程中会检查 Response 的 meta 中是否包含 `skipBotMessageCreation` 标志，如果存在则不创建新的bot消息，而是使用子线程中已有的最后一条bot消息。
- 这种机制特别适用于需要显示进度的场景，如初始显示"正在生成..."，然后更新为最终结果的情况。

## 7. 文件结构与命名规范

### 7.1 标准目录结构
```
- [Business]Agent.js                    // 主Agent
- [Business]StateHandlers.js            // 主Agent状态处理器
- /[business_process]/                  // 子线程目录
  - [BusinessProcess]Agent.js           // 子线程Agent
  - [BusinessProcess]StateHandlers.js   // 子线程状态处理器
  - [BusinessProcess]InteractionUnits.js // 子线程交互单元
  - /[nested_task]/                     // 嵌套子线程目录
    - [NestedTask]Agent.js              // 嵌套子线程Agent
    - [NestedTask]StateHandlers.js
    - [NestedTask]InteractionUnits.js
```

### 7.2 命名规则
- Agent类: `[业务名称]Agent` (如`ArticleCreationAgent`)
- StateHandler类: `[状态名称]Handler` (如`RequirementClarificationHandler`)
- InteractionUnit类: `[状态名称]Unit` (如`OutlineGenerationUnit`)
- 状态名称: 使用snake_case (如`initial_phase`, `content_generation`)

## 8. 禁忌和注意事项

### 8.1 严格禁止
- 禁止修改继承类(BaseAgent/SubThreadAgent)的核心方法签名
- 禁止直接传递子线程作为函数参数(必须用路径)
- 禁止同一状态处理器在不同子线程间共享实例
- 禁止在不同层次的Agent之间共享StateHandler类

### 8.2 必须遵循
- 每个状态必须有对应的StateHandler
- 子线程Agent必须继承SubThreadAgent
- 必须按照"先StateHandler后InteractionUnit"的顺序初始化
- 必须在消息添加到子线程后立即持久化

## 9. 工具函数与复用

### 9.1 必须复用的工具
- `getSubThreadByPath`: 通过路径获取子线程
- `my_assistant_agent_util`: 公共工具库
- BaseAgent的状态处理与应用方法

### 9.2 优先使用的模式
- 使用Response对象返回结果
- 使用Task对象定义下一步任务
- 使用两阶段处理创建子线程
- 使用状态机控制处理流程

## 10. 关键接口签名（不可修改）

```javascript
// 这些方法签名不得修改
async executeTask(task, thread) {...}
async handle(task, thread, agent) {...}
async execute(task, thread, agent) {...}
async generateUserMessage(botMessage, task, thread, agent) {...}
_suggestPhaseUpdate(task, thread) {...}
_applyPhaseUpdateSuggestion(task, thread) {...}
```

通过遵循这份规范，开发者可以确保自己的Agent实现与现有代码保持一致，同时理解系统设计背后的原则和约定。