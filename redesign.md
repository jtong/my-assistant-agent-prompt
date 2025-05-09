
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
- 从样例数据中我们可以看出，我们是需要既生成bot也要生成user，而目前的机制， StateHandler 是生成bot message的，InteractionUnit 应该持有 StateHandler ，和 StateHandler 共享一个状态，将生成bot message的职责委派给 StateHandler， 然后在 StateHandler 生成完后，采取相应的操作（根据bot message要求的），然后生成 user message，目前文档中这个持有关系没有体现出来。