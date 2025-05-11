
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
path: data/1.js
render: false
```
{{/partial }}
`````

## 任务

我希望 改进这个规范，我们需要把规范中子thread的处理进一步完善。需要完善的点是对message和thread的持久化：

- 主Thread的Agent和子thread的Agent的切换。
  - 主要是出于UI的考虑，主Thread的Agent先用addNextTask来生成一个message显示是合理的操作，这样才会更新一个占位符，并切换回Agent继续用子thread进行实质的message生成。但是后续执行的任务需要是主Agent接住，实际上可能不需要区分任务名，只需要加一个状态phase即可，也就是准备生成是一个状态，实际生成是另一个状态，两个状态就可以完成主Thread的Agent对子Thread的Agent的切换。
- 子thread agent再创建子thread的agent的时候，因为没有UI的考虑就不需要两个状态了。这里通过host_utils的threadRepository来更新即可。