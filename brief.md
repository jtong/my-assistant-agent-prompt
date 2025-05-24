
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

我希望 简化规范，给一个简化版，只要说明白机制，可以被 AI 看懂就可以了。目的是辅助AI理解现有的代码并了解没有在代码里写出来的机制和设计，避免：
- 在实现细节逻辑或进行修改的时候改掉不该改的接口参数、生命周期的关键代码和继承或持有关系。
- 没有复用应该复用的函数，不管是工具类的函数还是父类的函数。
- 没有把正确的代码放在正确的类里，破坏了类的职责定义。
