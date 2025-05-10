
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
path: data/1.js
render: false
```
{{/partial }}
`````

## 任务

我希望 改进这个规范，我们需要把规范中子thread的处理进一步完善。需要完善的点是：

- InteractionUnit 和 StateHandler 里不该初始化父级Agent，避免循环依赖。（注意：只是不能初始化父级别thread的Agent，而不是任何Agent，因为可能会初始化子级）
- InteractionUnit 和 StateHandler 里如果需要访问AI进行生成，可以自己生成，可以通过参数里的agent实例拿到对应的AI实例。
- InteractionUnit 和 StateHandler的初始化应该仿照Agent，也提供一个async初始化函数和create静态函数