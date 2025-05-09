
## 规范


`````js
{{#partial }}
```yaml
path: .ai_helper/dev/dev_doc/agent-best-practice.md
render: false
```
{{/partial }}
`````


## 任务约束

- 不要编写实现代码，要专注在对规范的改进。
- 如果你脱离了对规范的改进，是对你的否定。

## 样例数据

`````js
{{#partial }}
```yaml
path: spike/1.js
render: false
```
{{/partial }}
`````

## 任务

我希望 改进这个规范，我们需要把规范中子thread的处理进一步完善。需要完善的点是：
- 从样例数据中我们可以看出，我们是需要既生成bot也要生成user，而目前的机制，到子Agent这里，只关注了生成bot没有关注生成user
- 我希望在父Agent眼中，我们依然执行的是子 Agent 的 executeTask，得到的Response就是整个子thread的执行的最终结果返回值.
- 这个生成user然后再生成bot的反复对话的过程是发生在executeTask内的，整个对话过程不应该有StateHandler控制，而应该由Agent控制，StateHandler只关注一条消息的生成，而Agent则需要关注整个thread。