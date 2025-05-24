
# Agent 功能测试简化规范

## 1. 测试目的

验证 Agent 及其子线程在特定阶段的功能，无需从头执行完整流程。

## 2. 关键机制

### 2.1 控制测试起点 (必要)

通过预设线程状态，从任意阶段开始测试：

```javascript
// 测试数据 - 控制起始状态
const testThread = {
    settings: {
        briefStatus: { phase: "content_writing" } // 主线程起始状态
    },
    messages: [
        // 历史消息...
        {
            meta: {
                _thread: {
                    settings: {
                        briefStatus: { phase: "write_section" } // 子线程起始状态
                    },
                    messages: [
                        // 已有的子线程消息...
                    ]
                }
            }
        }
    ]
};
```

### 2.2 控制测试终点 (可选)

通过覆盖 `_isTerminalState` 方法提前结束测试：

```javascript
// 覆盖终止状态判断
const originalIsTerminalState = agent._isTerminalState;
agent._isTerminalState = function(phase) {
    // 达到特定阶段就结束
    if (phase === "data_analysis") return true;
    return originalIsTerminalState.call(this, phase);
};
```

### 2.3 结果保存 (必要)

保存测试结果为 JSON 和 YAML 格式：

```javascript
function saveTestResults(thread) {
    // 保存 JSON
    fs.writeFileSync('output/result.json', JSON.stringify(thread, null, 2));
    
    // 保存 YAML
    const yaml = require('js-yaml');
    fs.writeFileSync(
        'output/result.yaml',
        yaml.dump(thread, { indent: 2, lineWidth: -1 })
    );
}
```

## 3. 基本测试结构

```javascript
async function runTest() {
    // 1. 准备从特定阶段开始的线程
    const thread = testData.testThread;
    const host_utils = createHostUtils(thread);
    
    // 2. 准备任务
    const task = new Task({
        name: "TestTask",
        meta: { subThreadPath: "messages.1.meta._thread" },
        host_utils
    });

    // 3. 初始化Agent
    const agent = await SomeAgent.create(metadata, settings);
    
    // 4. 可选：控制终止点
    agent._isTerminalState = phase => phase === "target_phase";
    
    // 5. 执行测试
    const response = await agent.executeTask(task, thread);
    
    // 6. 保存结果
    saveTestResults(thread);
}
```

## 4. 测试辅助工具

```javascript
// 获取子线程
function getSubThreadByPath(thread, path) {
    const parts = path.split('.');
    return parts.reduce((obj, prop, i) => {
        if (i === 0 && prop === 'messages') return obj.messages;
        if (!isNaN(prop)) return obj[parseInt(prop)];
        return obj[prop];
    }, thread);
}

// 打印线程结构
function printThreadStructure(thread, depth = 0) {
    console.log(`${'  '.repeat(depth)}Phase: ${thread.settings?.briefStatus?.phase}`);
    thread.messages?.forEach((msg, i) => {
        if (msg.meta?._thread) {
            console.log(`${'  '.repeat(depth)}SubThread in message[${i}]:`);
            printThreadStructure(msg.meta._thread, depth + 1);
        }
    });
}
```

## 5. 示例测试用例

```javascript
// 从内容编写阶段开始测试
async function testContentWriting() {
    // 1. 准备线程 - 设置为内容编写阶段
    const thread = JSON.parse(JSON.stringify(testData.testThread));
    const subThread = getSubThreadByPath(thread, "messages.1.meta._thread");
    subThread.settings.briefStatus.phase = "write_section";
    
    // 2. 添加必要的历史消息模拟前序步骤
    subThread.messages = [
        { sender: "user", text: "请生成内容" },
        { sender: "bot", text: "这是大纲..." }
    ];
    
    // 3. 执行测试...
    
    // 4. 保存结果
    saveTestResults(thread);
}
```

## 关键要点

1. 起点控制：预设线程和子线程状态，模拟执行到特定阶段
2. 终点控制：可选择在特定阶段提前结束测试
3. 结果保存：双格式保存结果，不进行自动验证
4. 测试隔离：每个测试专注于特定功能或阶段

这种方法使测试更灵活高效，避免每次都从头执行完整流程。