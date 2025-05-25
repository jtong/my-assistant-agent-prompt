过程：
- 先拿着基本需求生成了测试数据
- 再拿着测试数据生成了架构
- 经过N轮架构的迭代，得到了最终的文档和对应的初始化代码。
  - 目前静态结构和基于静态结构的方法论都是混在一起的，考虑到这是为某一种场景专门定制的工序描述，所以暂时没有动力分离
- 开始拿着初始代码执行的结果跟预期去对比，发现问题（比如发现了前面的要求没有顺利传递下去，直接拿着生成的数据跟AI说这个问题要修正）
  - 第一版报告生成完了，开始理解ppt架构师……
- InteractionUnit和StateHandler的职责有些错位。
  - 原因是：
    - StateHandler返回的消息必须添加进去，而我们需要搞一个有_thread的message，这个导致前面创造的内容会被覆盖。
    - 所以这里 AI 就僵化遵守规范并改变了职责。
  - 解决方案是：直接告诉他修改掉，然后更新了文档和文档的brief
- Task 生成需要构造 chat history，这里处理了一下，发现整体处理chat history的逻辑还没建立，放到parking lot里
- 给所有的AI对话建立一个基于Thread的adapter，方便查看日志
- 加入了测试，而且可以基于任务部分状态测试，就是测试数据准备还是比较麻烦
- 改了设计，把InteractionUnit分成Starter和Responser，一个先发消息，一个后发消息，而且Starter可能直接就包着一个Responser
- 把把InteractionUnit分成Starter和Responser后，改文档的时间超出了我的预期，这说明我们需要一个修改文档的文档

TODO：
- 然后拿着生成的数据，说哪一条要加入RAG
- [x] 基于thread的adapter，方便查看日志加入规范
- chat history构造逻辑加入规范
- [x] 测试加入规范
- [x] 考虑把InteractionUnit分成Starter和Responser，一个先发消息，一个后发消息，而且Starter可能直接就包着一个Responser

experience:

- 测试可以先执行，跳出InteractionUnit后，用手复制一下thread的json。task的json可以在进去的时候复制。