
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


## 任务约束

- 分清webview的代码和插件的代码和agent app的代码

## 任务

我希望 编写一个Agent，可以先澄清需求，然后在第二个消息里开一个thread进行生成文章的功能。
它处理的thread的数据结构下，请从数据结构中理解业务逻辑：

`````js
{{#partial }}
```yaml
path: spike/1.js
render: false
```
{{/partial }}
`````

不需要管提示词文件，专注于代码
