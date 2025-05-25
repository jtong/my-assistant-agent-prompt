
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/value_and_prefer.md
render: false
```
{{/partial }}


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

## 测试数据

`````js
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/data/thread_content_write_test.json
render: false
```
{{/partial }}
`````

## 任务

我希望 ContentWritingAgent.js执行的时候会逐个执行writing_task 任务，但是现在执行了一个就结束了，这个不是我想要的。看看怎么能做到逐个执行完全部。