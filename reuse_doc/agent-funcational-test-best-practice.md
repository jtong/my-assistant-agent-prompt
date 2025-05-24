# My Assistant Agent 功能测试规范

## 1. 功能测试目的

功能测试旨在验证 Agent 及其子线程的实际行为，确保各个组件正确协作，完成预期功能。

## 2. 测试文件结构

```
/test/
├── test_[feature]_[scenario].js        // 测试特定功能或场景
├── [feature]_test_data.js              // 测试数据文件
└── output/                             // 测试结果输出目录
```

## 3. 测试数据准备

### 3.1 测试数据模块

```javascript
// article_creation_test_data.js
module.exports = {
    // Agent 元数据
    agentMetadata: {
        default_llm_profile: "chataiapi",
        default_llm_model: "gpt-4o",
        llm_profile: {
            chataiapi: {
                apiKey: "test_key",
                baseURL: "https://test.example.com/v1"
            }
        },
        agent: {
            templatePath: "../prompt/system_prompt.md",
            repoFilePath: "../knowledge_space/repo.json"
        }
    },
    
    // Agent 设置
    agentSettings: {
        briefStatus: { phase: "initial_phase" },
        llm_profile: "chataiapi",
        model: "gpt-4o"
    },
    
    // 任务数据
    taskData: {
        name: "ProcessReportGeneration",
        type: "ACTION",
        message: "生成文章报告",
        meta: {
            subThreadPath: "messages.1.meta._thread",
            originalQuery: "写一篇关于AI的文章",
            userRequirements: "需要一篇介绍人工智能的全面文章"
        }
    },
    
    // 测试线程数据 - 可配置为任意阶段开始
    testThread: {
        id: "test_thread_12345",
        name: "测试线程",
        agent: "ArticleCreationAgent",
        settings: {
            briefStatus: { phase: "content_writing" } // 控制起始状态
        },
        messages: [
            // 可以添加已有的消息，模拟中间状态
            {
                id: "msg_1",
                sender: "user",
                text: "写一篇关于AI的文章"
            },
            {
                id: "msg_2",
                sender: "bot",
                text: "正在生成文章...",
                meta: {
                    _thread: {
                        messages: [
                            // 子线程消息，可控制子线程的起点状态
                        ],
                        settings: {
                            briefStatus: { phase: "write_section" } // 控制子线程起始状态
                        }
                    }
                }
            }
        ]
    }
};
```

### 3.2 宿主环境工具

```javascript
/*
 * 创建简化的宿主工具
 */
function createHostUtils(currentThread) {
    return {
        threadRepository: {
            saveThread(thread) {
                console.log(`Thread saved: ${thread.id}`);
            },
            updateMessage(thread, messageId, updates) {
                const messageIndex = thread.messages.findIndex(m => m.id === messageId);
                if (messageIndex !== -1) {
                    thread.messages[messageIndex] = { 
                        ...thread.messages[messageIndex], 
                        ...updates 
                    };
                }
            },
            getThreadSettings(threadId) {
                return currentThread.settings;
            },
            updateThreadSettings(thread, settings) {
                thread.settings = settings;
            }
        },
        getConfig() {
            return {
                projectRoot: __dirname,
                projectName: "Test Project",
                aiHelperRoot: path.join(__dirname, '..', '..'),
                chatWorkingSpaceRoot: path.join(__dirname, 'output')
            };
        },
        postMessage(message) {
            console.log("Post message:", message.type);
        }
    };
}
```

## 4. 测试执行

### 4.1 基本测试结构

```javascript
async function runTest() {
    try {
        console.log("开始测试 - 文章内容编写");

        // 1. 准备测试数据
        const thread = testData.testThread;
        const host_utils = createHostUtils(thread);
        
        // 2. 构建任务
        const task = new Task({
            ...testData.taskData,
            host_utils
        });

        // 3. 初始化Agent
        const agent = await ReportGenerationAgent.create(
            testData.agentMetadata, 
            testData.agentSettings
        );
        
        // 4. 初始化AIAdapter
        const AIAdapter = require('../../my_assistant_agent_util/AIAdapter');
        AIAdapter.initialize(testData.agentMetadata, testData.agentSettings);

        // 5. 执行测试
        const response = await agent.executeTask(task, thread);

        // 6. 处理响应
        const finalResult = response.getFullMessage();
        thread.messages[1].text = finalResult;

        // 7. 保存测试结果
        saveTestResults(thread);

        console.log("测试完成!");

    } catch (error) {
        console.error("测试出错:", error);
    }
}
```

### 4.2 控制测试起点 (必要特性)

通过配置 `testThread` 的初始状态，可以让测试从任意阶段开始：

```javascript
// 从特定阶段开始测试
testData.testThread.settings.briefStatus.phase = "generate_outline";

// 子线程也可以设置特定起点状态
testData.testThread.messages[1].meta._thread.settings.briefStatus.phase = "write_section";

// 添加必要的历史消息，模拟已完成的步骤
testData.testThread.messages[1].meta._thread.messages = [
    {
        id: "sub_msg_1",
        sender: "user",
        text: "生成大纲的要求"
    },
    {
        id: "sub_msg_2",
        sender: "bot",
        text: "这是已生成的大纲..."
    }
];
```

### 4.3 控制测试终点 (可选特性)

通过覆盖 Agent 的 `_isTerminalState` 方法，可以提前结束测试：

```javascript
// 原始方法保存
const originalIsTerminalState = agent._isTerminalState;

// 覆盖方法，让特定阶段成为终止状态
agent._isTerminalState = function(phase) {
    // 当达到特定阶段时提前结束
    if (phase === "data_analysis") {
        return true;
    }
    // 否则使用原始逻辑
    return originalIsTerminalState.call(this, phase);
};

// 测试完成后恢复
// agent._isTerminalState = originalIsTerminalState;
```

## 5. 结果保存 (必要特性)

### 5.1 JSON和YAML双格式保存

```javascript
function saveTestResults(thread) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join(__dirname, 'output');
    
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const fileName = `thread_${timestamp}`;
    
    // 保存JSON
    fs.writeFileSync(
        path.join(outputDir, `${fileName}.json`),
        JSON.stringify(thread, null, 2)
    );
    
    // 保存YAML
    const yaml = require('js-yaml');
    const yamlStr = yaml.dump(thread, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
    });
    
    fs.writeFileSync(
        path.join(outputDir, `${fileName}.yaml`),
        yamlStr
    );
    
    console.log(`测试结果已保存到 output/${fileName}.json 和 .yaml`);
}
```

### 5.2 线程结构查看

```javascript
/*
 * 打印线程结构
 */
function printThreadStructure(thread, depth = 0) {
    const indent = '  '.repeat(depth);
    console.log(`${indent}Thread Phase: ${thread.settings?.briefStatus?.phase}`);
    console.log(`${indent}Messages: ${thread.messages?.length || 0}`);
    
    // 打印子线程
    (thread.messages || []).forEach((msg, i) => {
        if (msg.meta && msg.meta._thread) {
            console.log(`${indent}SubThread in message[${i}]:`);
            printThreadStructure(msg.meta._thread, depth + 1);
        }
    });
}
```

## 6. 测试用例示例

### 6.1 从特定阶段开始的文章编写测试

```javascript
// test/test_article_creation_content_write.js
const fs = require('fs');
const path = require('path');
const { Task } = require('ai-agent-response');
const ContentWritingAgent = require('../article_creation/content_writing/ContentWritingAgent');
const testData = require('./article_creation_test_data');

async function testContentWriting() {
    try {
        // 1. 准备测试线程 - 从内容编写阶段开始
        const thread = JSON.parse(JSON.stringify(testData.testThread)); // 深拷贝
        
        // 设置初始状态为内容编写
        const subThreadPath = "messages.1.meta._thread";
        const subThread = getSubThreadByPath(thread, subThreadPath);
        subThread.settings.briefStatus.phase = "write_section";
        
        // 添加必要的历史消息，模拟大纲已生成
        subThread.messages = [
            {
                id: "sub_msg_1",
                sender: "user",
                text: "根据大纲生成内容"
            },
            {
                id: "sub_msg_2",
                sender: "bot",
                text: "# AI文章大纲\n## 引言\n## 历史\n## 应用\n## 未来展望"
            }
        ];
        
        // 2. 准备宿主工具
        const host_utils = createHostUtils(thread);
        
        // 3. 构建任务
        const task = new Task({
            name: "WriteContent",
            type: Task.TYPE_ACTION,
            message: "编写文章内容",
            meta: {
                subThreadPath,
                outline: "# AI文章大纲\n## 引言\n## 历史\n## 应用\n## 未来展望",
                userRequirements: "需要一篇介绍人工智能的全面文章"
            },
            host_utils
        });

        // 4. 初始化Agent
        const agent = await ContentWritingAgent.create(
            testData.agentMetadata, 
            testData.agentSettings
        );
        
        // 可选：限制执行到特定阶段
        const originalIsTerminalState = agent._isTerminalState;
        agent._isTerminalState = function(phase) {
            return phase === "final_summary" || originalIsTerminalState.call(this, phase);
        };
        
        // 5. 执行测试
        const response = await agent.executeTask(task, thread);
        
        // 6. 保存测试结果
        saveTestResults(thread);
        
        console.log("测试完成!");
        
    } catch (error) {
        console.error("测试出错:", error);
    }
}

testContentWriting();
```

## 7. 总结

通过此简化规范，能够灵活测试 Agent 的各个阶段，无需从头执行完整流程。关键功能包括：

1. 控制测试起点 - 通过配置 thread 初始状态，可从任意阶段开始测试(必要)
2. 控制测试终点 - 通过覆盖 `_isTerminalState` 方法，可在特定阶段结束测试(可选)
3. 结果双格式保存 - 将测试结果保存为 JSON 和 YAML 格式，便于查看分析(必要)
4. 无验证要求 - 测试专注于生成结果，不要求自动验证(必要)
5. 结构可视化 - 提供线程结构打印函数，帮助分析复杂的线程结构

这种测试方法灵活高效，允许开发者针对特定功能点进行测试，而不必每次都从头执行完整流程。