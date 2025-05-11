
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/value_and_prefer.md
render: false
```
{{/partial }}



## 规范


`````js
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/agent-best-practice.md
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
path: .ai_helper/dev/context/working_prompt/data/1.js
render: false
```
{{/partial }}
`````

## 任务

我希望 改进这个规范，我们需要把规范中子thread的处理进一步完善。需要完善的点是对message和thread的持久化：

- 是否在Agent和 InteractionUnit 和 StateHandler 之间始终传递的都是主thread，而不是任何以及子thread，避免上下文脱离
- 看一下现在的持久化是否会存在脏数据的可能性。
- InteractionUnit 和 StateHandler 返回的都应该是Response，那么什么时候更新主thread需要考虑一下，也要避免脏数据问题。