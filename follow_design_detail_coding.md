
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

我希望 ContentWritingAgent.js执行的时候，
第一个Starter里就选出第一个任务来执行，然后更新任务的状态，避免第一个任务执行两遍