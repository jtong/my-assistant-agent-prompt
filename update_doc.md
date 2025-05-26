
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
path: .ai_helper/dev/context/working_prompt/reuse_doc/agent-best-practice.md
render: false
```
{{/partial }}
`````

## 测试数据

`````js
{{#partial }}
```yaml
path: spike/1.js
render: false
```
{{/partial }}
`````


## 任务

我希望 按照现在的代码更新规范文档：把Responsor改为Feedbacker，把InteractionUnit持有的StateHandler改为 MessageGenerator，而且这种MessageGenerator不再是StateHandler的子类也不再拥有phase和nextPhase，也不负责suggest改变状态，于是StateHandler变成主Thread的Agent专属的概念