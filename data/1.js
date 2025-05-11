// 主线程数据
const thread = {
    id: "thread_article_creation_12345",
    name: "如何提高工作效率的文章",
    agent: "ArticleCreationAgent",
    settings: {
        briefStatus: {
            phase: "report_generation"  // 初始状态：需求澄清，现在处于第二个状态report generation
        },
        llm_profile: "chataiapi",
        model: "gpt-4o"
    },
    messages: [
        // 初始用户请求
        {
            id: "msg_1",
            sender: "user",
            text: "<写作需求>",
        },

        // 需求澄清阶段回复
        {
            id: "msg_2",
            sender: "bot",
            text: "<需求澄清问题>",
        },

        // 用户回答澄清问题
        {
            id: "msg_3",
            sender: "user",
            text: "<需求澄清回答>",
            timestamp: 1683789120000
        },

        // 开始报告生成阶段
        {
            id: "msg_4",
            sender: "bot",
            text: "<最终的介绍>",
            meta: {
                file: "/path/to/report",
                _thread: {  // 报告生成子线程
                    settings: {
                        briefStatus: {
                            phase: "report_generation"
                        }
                    },
                    messages: [
                        // 第一阶段 - 开始执行大纲生成
                        {
                            id: "sub_msg_1",
                            sender: "user",
                            text: "<生成大纲的要求>"
                        },
                        // 大纲结果
                        {
                            id: "sub_msg_2",
                            sender: "user",
                            text: "<最终大纲>", // 内容来自于子thread的最终输出，初期是空字符串，直到子thread结束。
                            meta: {
                                _thread: { // 生成大纲的thread
                                    id: "subthread_outline_12345",
                                    settings: {
                                        briefStatus: {
                                            phase: "generate_outline"
                                        }
                                    },
                                    messages: [
                                        // 子线程内的交互 - 开始执行大纲生成
                                        {
                                            id: "sub_msg_1",
                                            sender: "user",
                                            text: "<生成大纲的要求>",
                                        },
                                        // 执行结果 - 初步大纲
                                        {
                                            id: "sub_msg_2",
                                            sender: "bot",
                                            text: "<初步大纲生成>"
                                        },
                                        // 子线程内的交互 - 反思与改进
                                        {
                                            id: "sub_msg_3",
                                            sender: "user",
                                            text: "<要求反思>"
                                        },
                                        {
                                            id: "sub_msg_4",
                                            sender: "bot",
                                            text: "<对初步大纲进行的反思>"
                                        },
                                        // 子线程内的交互 - 生成最终的大纲
                                        {
                                            id: "sub_msg_5",
                                            sender: "user",
                                            text: "<要求根据反思给出最终结果>"
                                        },
                                        {
                                            id: "sub_msg_6",
                                            sender: "bot",
                                            text: "<最终大纲>"
                                        }
                                    ]
                                }

                            }
                        },
                        // 第二阶段：生成写作任务
                        {
                            id: "sub_msg_3",
                            sender: "user",
                            text: "<要求根据大纲生成写作任务>"
                        },
                        {
                            id: "sub_msg_4",
                            sender: "bot",
                            text: "<生成任务列表>",
                            meta: {
                                sub_phase: "task_generation"
                            }
                        },
                        // 第三阶段：内容编写
                        {
                            id: "sub_msg_6",
                            sender: "user",
                            text: "<要求执行任务>"
                        },

                        {
                            id: "sub_msg_7",
                            sender: "bot",
                            text: "<最终输出结果>",
                            timestamp: 1683789900000,
                            meta: {
                                _thread: {  // 内容编写子线程
                                    id: "sub_content_12345",
                                    settings: {
                                        briefStatus: {
                                            phase: "content_writing"
                                        }
                                    },
                                    messages: [
                                        // 引言部分
                                        {
                                            id: "content_msg_1",
                                            sender: "user",
                                            text: "<要求执行任务>"
                                        },
                                        {
                                            id: "content_msg_2",
                                            sender: "bot",
                                            text: "<第一个任务执行结果>"
                                        },
                                        {
                                            id: "content_msg_3",
                                            sender: "user",
                                            text: "<执行结果反馈>"
                                        },
                                        {
                                            id: "content_msg_4",
                                            sender: "bot",
                                            text: "<后续任务执行结果>"
                                        },
                                        
                                        // 这里省略了中间部分的详细生成过程，实际上每个部分都会有类似的内容生成步骤

                                        // 最终汇总
                                        {
                                            id: "content_msg_48",
                                            sender: "user",
                                            text: "<要求汇总>"
                                        },
                                        {
                                            id: "content_msg_49",
                                            sender: "bot",
                                            text: "<最终汇总>"
                                        }
                                    ]
                                }
                            }
                        },
                    ]
                }
            }
        },

    ]
};
