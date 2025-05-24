
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/value_and_prefer.md
render: false
```
{{/partial }}



## 规范


`````js
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/reuse_doc/agent-best-practice.md
render: false
```
{{/partial }}
`````


## 任务约束

- 不要编写实现代码，要专注在对规范的改进。
- 如果你脱离了对规范的改进，是对你的否定。

## 样例数据

`````js
{{#partial }}
```yaml
path: .ai_helper/dev/context/working_prompt/data/1.js
render: false
```
{{/partial }}
`````

## 任务

我希望 把InteractionUnit分成两类，一类叫Starter、一类叫Responsor（现在的InteractionUnit就是Responsor），前者可以持有Responsor也可以持有StateHandler，但是二选一，只能持有其中之一。Starter会先生成一个user的message，再让自己持有的Responsor或StateHandler来执行后续。
这样当我需要在SubThreadAgent里想用user message启动一个流程的时候，我就可以用它。而当我只是想告知AI上一个bot message的执行结果的时候，我就用Responsor。