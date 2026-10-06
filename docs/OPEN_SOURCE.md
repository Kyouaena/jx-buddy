# 开源选型

2026-10-06 查询 GitHub 页面；星数是当次页面的近似值，随时间变化。

| 项目 | 约 Stars | 适用性 | 本项目选择 |
| --- | --- | --- | --- |
| [ByteDance DeerFlow](https://github.com/bytedance/deer-flow) | 83.4k | 完整研究／通用 Agent 工作台，含记忆、工具和沙箱 | 参考工作台与 Harness 组织；限时首版不整套 Fork，避免 Python／沙箱部署负担 |
| [LangChain Deep Agents](https://github.com/langchain-ai/deepagents) | 30k | 成熟 Agent Harness，规划、文件系统和子 Agent | 参考能力边界；使用其底层 LangGraph JS 作为真正执行依赖 |
| [Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) | 3.2k | LangGraph 聊天 UI | 金融证据面板和检查点操作需要定制，本项目自建 UI |
| [LangAlpha](https://github.com/ginlix-ai/langalpha) | 1.8k | 金融研究 Agent，方向最接近 | 参考产品方向，首版不引入完整后台依赖 |

没有复制上述项目的源文件或品牌。基于 LangGraph 库开发原始金融 Harness，README 不宣称 DeerFlow Fork。LangGraph 的许可由 npm 依赖保留。其他保留的构建模板组件保留其许可证。
