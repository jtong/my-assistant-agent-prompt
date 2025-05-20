
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

我希望 生成“刘慈欣的报告“，明明前面规划了任务，后面却没有按照AI生成的规划任务去做，而是靠提示词写死的。这个我希望要按照前面生成的提示词来推演。
