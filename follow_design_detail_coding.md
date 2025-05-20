
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

我希望 InteractionUnit 的 generateUserMessage 只专注于生成 user 消息。现在是连bot 消息都放在这里了。前面那些生成bot消息的其实应该放在它的 StateHandler 里。而不是现在这样在StateHandler里写死bot消息，搞得出了两个bot 消息。