
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

`````yaml
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/data/2.json
render: false
```
{{/partial }}
`````


## 任务

我希望 给所有的AI访问套一个adapter，而且传的是新构造的thread，这个adapter的chat函数里就只取第一层的message，然后转成对应的AI需要的数据结构（主要是openai）
这个adapter对象是个是单例，可以在主thread里初始化，也可以被setting更改profile，然后后面取到直接用就可以了,不需要设置AI模型。
