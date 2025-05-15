
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/value_and_prefer.md
render: false
```
{{/partial }}


## 规范

实现Agent时要遵循下列规范，但具体是否要做这个事，取决于任务要求，如果任务要求不是实现Agent，那么这里仅作为背景信息。
`````
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/agent-best-practice-brief.md
render: false
```
{{/partial }}
`````


## 测试数据

`````js
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/data/2.json
render: false
```
{{/partial }}
`````


## 任务

我希望 生成“刘慈欣的报告“，但实际上中间不知道为什么报告的逻辑错了。变成了一个无标题报告生成的需求，帮我看看哪里有问题，要怎么改相关代码。
