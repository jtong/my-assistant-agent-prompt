
## 规范

实现Agent时要遵循下列规范，但具体是否要做这个事，取决于任务要求，如果任务要求不是实现Agent，那么这里仅作为背景信息。
`````yaml
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/agent-best-practice-brief.md
render: false
```
{{/partial }}
`````


{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/value_and_prefer.md
render: false
```
{{/partial }}


## 任务

我希望 ContentWritingAgent.js 执行的时候把前三条输入都当做需求扔进来，但是现在似乎值传递上有丢失，帮我看看问题可能出在哪？

