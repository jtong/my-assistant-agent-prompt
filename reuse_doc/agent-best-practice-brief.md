
# My Assistant Agent 简化设计规范

## 1. 核心概念

- 主线程：用户与Agent的主要对话线程，包含消息列表和设置
- 子线程：嵌套在父线程消息元数据中的次级对话线程，用于处理复杂任务
- StateHandler：处理特定状态的组件，负责生成消息内容和执行状态转换
- InteractionUnit：子线程中一轮完整对话的处理单元，包括Responsor、Starter和Requester
- Phase：线程的处理阶段，存储在`settings.briefStatus.phase`中

## 2. 类继承与持有关系

### 2.1 继承关系

```
BaseAgent <- 主线程Agent
SubThreadAgent <- 子线程Agent
StateHandler <- 具体状态处理器
InteractionUnit <- Responsor/Starter/Requester
```

### 2.2 持有关系（关键）

- 主线程Agent 持有多个 StateHandler
- 子线程Agent 持有多个 InteractionUnit
- Responsor 必须持有 StateHandler
- Starter 只能持有 Responsor
- Requester 只能持有 StateHandler

![持有关系示意图](https://example.com/diagram.svg)

```
BaseAgent (主线程Agent基类)
    ↓
主线程Agent → StateHandler (多个，处理不同状态)
                  ↓
              SubThreadAgent (子线程Agent基类)
                  ↓
              子线程Agent → InteractionUnit (多个，处理不同阶段)
                          ↙                 ↓                         ↘
                  Starter → Responsor     Requester → StateHandler    Responsor → StateHandler
```

## 3. 线程传递与访问规范

### 3.1 核心原则

- 必须始终传递主线程对象，而非子线程对象
- 子线程路径通过 `task.meta.subThreadPath` 属性传递
- 子线程路径格式: `"messages.{索引}.meta._thread"`
- 严禁将提取的子线程作为参数传递给其他组件

### 3.2 子线程访问

```javascript
// 正确方式
function someMethod(task, thread, agent) {
  const subThreadPath = task.meta.subThreadPath;
  const subThread = getSubThreadByPath(thread, subThreadPath);
  // 处理子线程...
}

// 错误方式 - 不要直接传递子线程
function wrongMethod(subThread, agent) { /* ... */ }
```

## 4. 状态管理机制

### 4.1 状态存储与更新

- 状态存储在 `settings.briefStatus.phase`
- 状态更新使用建议-应用两步机制
- 状态更新建议存储在 `_phaseUpdateSuggestion`

### 4.2 状态处理流程

```javascript
// 状态处理器建议状态更新
_suggestPhaseUpdate(task, thread) {
  const currentSettings = task.host_utils.threadRepository.getThreadSettings(thread.id) || {};
  const updatedSettings = {
    ...currentSettings,
    _phaseUpdateSuggestion: { phase: this.nextPhase }
  };
  task.host_utils.threadRepository.updateThreadSettings(thread, updatedSettings);
}

// Agent应用状态更新建议
_applyPhaseUpdateSuggestion(task, thread) {
  const currentSettings = task.host_utils.threadRepository.getThreadSettings(thread.id) || {};
  if (currentSettings._phaseUpdateSuggestion) {
    // 跳过retry任务的状态更新
    if (task.meta._ui_action === 'retry') {
      const updatedSettings = { ...currentSettings };
      delete updatedSettings._phaseUpdateSuggestion;
      task.host_utils.threadRepository.updateThreadSettings(thread, updatedSettings);
    } else {
      // 更新内存中的状态
      this.settings.briefStatus.phase = currentSettings._phaseUpdateSuggestion.phase;
      // 更新线程设置并移除建议
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

## 5. 交互单元职责与执行流程

### 5.1 三种交互单元

- Responsor: 处理bot-user交互对，必须持有StateHandler
- Starter: 启动交互流程，只能持有Responsor
- Requester: 处理简单的单次请求-响应，只能持有StateHandler

### 5.2 执行流程

- Responsor流程: StateHandler生成bot消息 → 分析bot结果 → 生成user反馈
- Starter流程: 生成初始user消息 → 委托Responsor处理
- Requester流程: 生成初始user消息 → StateHandler生成bot响应

## 6. 持久化机制

### 6.1 持久化职责分配

- InteractionUnit: 负责bot和user消息的持久化
- StateHandler: 负责状态变更和子线程创建的持久化
- Agent: 负责委托StateHandler处理任务，不直接持久化

### 6.2 关键持久化时机

- 子线程创建后
- 消息添加到子线程后
- 状态更新建议添加后
- 复杂操作完成后

```javascript
// 创建子线程后持久化
lastMessage.meta._thread = subThread;
task.host_utils.threadRepository.updateMessage(thread, lastMessage.id, {
  meta: lastMessage.meta
});

// 添加消息后持久化
subThread.messages.push(newMessage);
task.host_utils.threadRepository.saveThread(thread);
```

### 6.3 跳过Bot消息创建机制

在某些情况下，StateHandler 可能需要直接更新已经存在的消息，而不是创建新的消息：

```javascript
// 在StateHandler中
const response = new Response(finalContent);
response.meta = { 
  ...response.meta,
  skipBotMessageCreation: true 
};
return response;
```
## 7. 子线程初始化模式

### 7.1 主线程创建子线程（两步法）

1. 准备阶段: 创建占位消息（UI展示）
2. 执行阶段: 创建实际子线程并处理

```javascript
// 准备阶段 - 创建占位消息
class SubThreadPreparationHandler extends StateHandler {
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
      meta: { originalQuery: task.message?.text }
    }));
    
    // 3. 建议状态更新
    this._suggestPhaseUpdate(task, thread);
    return response;
  }
}

// 执行阶段 - 创建和处理子线程
class SubThreadExecutionHandler extends StateHandler {
  async handle(task, thread, agent) {
    // 1. 创建子线程
    const subThread = { 
      messages: [], 
      settings: { briefStatus: { phase: "initial_phase" } } 
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
        originalTask: task.meta.originalQuery
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

### 7.2 子线程Agent初始化

```javascript
class MySubThreadAgent extends SubThreadAgent {
  async _initializeInteractionUnits() {
    // 1. 先初始化所有StateHandler
    const handler1 = await StateHandler1.create({/*...*/});
    const handler2 = await StateHandler2.create({/*...*/});
    
    // 2. 再初始化Responsor
    const responsor = await MyResponsor.create({
      stateHandler: handler2
    });
    
    // 3. 最后配置交互单元
    this.interactionUnits = {
      initial_phase: await MyStarter.create({
        responsor: responsor  // Starter只能持有Responsor
      }),
      second_phase: responsor,
      third_phase: await MyRequester.create({
        stateHandler: handler1  // Requester只能持有StateHandler
      })
    };
  }
}
```

## 8. LLM调用规范

### 8.1 使用AIAdapter

```javascript
// 正确方式 - 使用AIAdapter
const AIAdapter = require('../my_assistant_agent_util/AIAdapter');
// 使用适配器同步调用AI
const response = await AIAdapter.chat(messages, { // 必须使用thread.messages格式的数据
  systemMessage: "系统提示",
  stream: false // 在SubThread里都是同步调用
});

const responseText  = response.choices[0].message.content;
// 创建响应对象
const response = new Response(responseText);

// 错误方式 - 直接调用LLM API
const response = await openai.chat.completions.create({/*...*/});
```

## 9. 命名与文件组织

### 9.1 文件结构

```
- [Business]Agent.js                  // 主Agent
- [Business]StateHandlers.js          // 主Agent状态处理器
- /[business_process]/                // 子线程目录
  - [BusinessProcess]Agent.js         // 子线程Agent
  - [BusinessProcess]InteractionUnits.js // 子线程交互单元
  - [BusinessProcess]StateHandlers.js    // 子线程状态处理器
  - /[nested_task]/                      // 嵌套子线程目录
    - [NestedTask]Agent.js               // 嵌套子线程Agent
    - [NestedTask]InteractionUnits.js    // 嵌套子线程交互单元
    - [NestedTask]StateHandlers.js       // 嵌套子线程状态处理器
- /prompt/                               // 提示词目录
  - [phase_name]_system_prompt.md        // 阶段提示词
```

### 9.2 命名规范

- Agent: `[业务名称]Agent` - 例如`ArticleCreationAgent`
- 状态处理器: `[业务阶段]Handler` - 例如`RequirementClarificationHandler`
- 交互单元:
  - Responsor: `[业务功能]Responsor`
  - Starter: `[业务功能]Starter`
  - Requester: `[业务功能]Requester`
- 状态名称: 使用snake_case - 例如`data_preparation`

## 10. 关键实现细节

### 10.1 Agent必须实现的接口

```javascript
constructor(metadata, settings) {
  this.metadata = metadata;
  this.settings = settings;
}

async _initializeStateHandlers() {
  this.stateHandlers = {
    initial_phase: new InitialPhaseHandler({/*...*/})
  };
}

async executeTask(task, thread) {
  return this._handleMessageProcessing(task, thread);
}
```

## 11. 最佳实践

### 11.1 严格禁止

- 修改继承类(BaseAgent/SubThreadAgent)的核心方法签名
- 直接传递子线程作为函数参数(必须用路径)
- 在不同层次的Agent之间共享StateHandler类
- Starter持有非Responsor类型的组件
- Requester持有非StateHandler类型的组件
- 同一状态处理器在不同子线程间共享实例

### 11.2 必须遵循

- 继承正确的基类: 主线程Agent继承BaseAgent，子线程Agent继承SubThreadAgent
- 复用基类功能: 优先使用基类中已实现的功能，如`_applyPhaseUpdateSuggestion`
- 保持职责分离: StateHandler生成内容，InteractionUnit管理交互流程
- 正确的持有关系: 严格遵守Responsor、Starter和Requester的持有规则
- 持久化及时性: 关键操作后立即持久化，保证数据完整性
- 统一线程传递: 始终传递主线程，通过路径访问子线程

### 11.3 关键接口签名（不可修改）

```javascript
// 这些方法签名不得修改
async executeTask(task, thread) {...}
async handle(task, thread, agent) {...}
async execute(task, thread, agent) {...}
async generateUserMessage(botMessage, task, thread, agent) {...}
_suggestPhaseUpdate(task, thread) {...}
_applyPhaseUpdateSuggestion(task, thread) {...}
```
