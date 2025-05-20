
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

我希望 给brief加入6.3.参考下面内容：
````

### 6.3 跳过Bot消息创建机制

在某些情况下，StateHandler 可能需要直接更新已经存在的消息，而不是创建新的消息。例如，当StateHandler 已经创建并更新了一个占位消息时，可以使用 `skipBotMessageCreation` 标志告知 InteractionUnit 跳过创建新的bot消息：

```javascript
// 在StateHandler中
// 直接更新了已有消息后
const response = new Response(finalContent);
response.setMeta({ skipBotMessageCreation: true });
return response;
```

InteractionUnit 在执行过程中会检查 Response 的 meta 中是否包含 `skipBotMessageCreation` 标志：

```javascript
// 在InteractionUnit的execute方法中
if (response.meta && response.meta.skipBotMessageCreation) {
    // 不创建新消息，而是使用子线程中已有的最后一条bot消息
    const botMessages = subThread.messages.filter(msg => msg.sender === "bot");
    botMessage = botMessages[botMessages.length - 1];
} else {
    // 创建新的bot消息
    // ...
}
```

这种机制特别适用于需要显示进度的场景，如初始显示"正在生成..."，然后更新为最终结果的情况。
````
