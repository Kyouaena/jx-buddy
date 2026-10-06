# 投资 X Buddy

个人投资研究 Agent 网页工作台。用研究目标创建线程，检查并批准执行计划，查看原始证据，复核报告；每一步保存到数据库，可暂停、重试和恢复。

**当前版本：可运行的 Harness 与构造数据演示；真实模型／扶摇／iFinD 未配置，尚未通过真实研究验收。** 演示使用三个虚构公司，目标只用于工作流展示，不代表对用户指定标的的研究。界面和导出均标注构造数据。

## 技术选择与复用

- LangGraph JS (`@langchain/langgraph`)：实际执行的状态图框架，MIT。
- React 19 + Vinext：工作台、动态状态和服务端 API。
- Cloudflare Worker + D1：受保护的模型／MCP 调用、线程和检查点、确认后的长期记忆。
- 界面和金融 Harness 为本项目原创，没有把上游完整 App 改名。参考 [DeerFlow](https://github.com/bytedance/deer-flow) 的研究工作台结构、[Deep Agents](https://github.com/langchain-ai/deepagents) 的 Harness 思路。详见 [开源选型](docs/OPEN_SOURCE.md)。

## 启动

需要 Node 22.13+（建议 22 LTS）、npm。

```sh
npm ci
npm run db:generate # 已有迁移且未更改 schema 时无需再生成
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_odd_enchantress.sql
npm run dev
```

新增迁移时按顺序应用，每份迁移只执行一次。开发服务显示本地 URL。便携开发模式由 Sites 插件提供 mock identity；正式部署使用 ChatGPT 登录头，所有 API 都校验身份和数据归属。不能直接双击 HTML，不能只放到 GitHub Pages；它需要后端。

```sh
npm test
npm run typecheck
npm run build
```

## 环境变量与真实接入

变量模板为 `.env.example`，本机 Worker 可用 `.dev.vars`，线上通过托管平台的 Secret 管理。密钥只在服务端读取，不显示、不存入线程和浏览器。

- `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL`：兼容 `chat/completions` 的 HTTPS 服务，须支持 JSON 输出与 `usage.total_tokens`。
- `FUYAO_MCP_URL` / `FUYAO_MCP_TOKEN`、`IFIND_MCP_URL` / `IFIND_MCP_TOKEN`：实际 Streamable HTTP MCP 端点与可选 Bearer Token。
- `FINANCIAL_TOOL_MAP`：已验证的只读金融工具映射。逻辑工具为 `market_snapshot`、`financial_comparison`、`news_context`。每个映射填写 `provider`（fuyao/ifind）、服务器 `name`、`arguments`、`readOnly:true`、`asOfField`（structuredContent 的点分字段路径）、`unit`、`scope`、`maxAgeDays`。参数中的 `{{goal}}` 替换成研究目标。真实参数必须匹配服务公布的 inputSchema。

未假设供应商工具名和路径。适配器先初始化 MCP、执行 tools/list，验证被配置的工具确实存在，再 tools/call；禁止声明有写入／破坏行为的工具。当前仅支持 Streamable HTTP，OAuth、旧 SSE、stdio 和 REST 专用适配器尚未实现。需要账号及工具 schema 后才能完成真实接入验证。

## 产品流程

1. 输入研究目标，选择构造演示或真实接入，创建研究线程。
2. 计划生成后需确认，才执行只读工具。
3. 每个工具结果保存来源、数据时点、获取时间、单位、统计口径、原始返回及质量状态。
4. 压缩工作上下文为目标／记忆／证据索引／未完成事项；原始字段始终在证据库。
5. 生成报告，验证证据 ID 与基础表述规则，区分事实、推断、不确定性，待用户复核。
6. 导出含原始证据的 Markdown。

## Harness 与边界

详见 [架构](docs/ARCHITECTURE.md)、[测试说明](docs/TESTING.md)、[AI 使用与验证记录](docs/AI_USAGE.md)。

- 检查点是应用层的节点边界状态快照，不是 LangGraph 内置 checkpointer。每次图调用执行一个受控研究步骤，API 将结果和检查点原子保存到 D1。
- 租约与 revision 比较防止并行浏览器重复执行。正常恢复不会重跑已完成任务。若服务在外部请求成功但数据库提交前崩溃，可能出现只读调用的至少一次重试；不宣称 exactly-once。
- 12 次逻辑模型／工具调用、12,000 Token、120 秒累计执行预算；HTTP 超时与输出大小限制。当前没有货币成本估算或全账户配额，预算只覆盖线程。
- 暂停／停止在步骤边界生效，正在执行的 HTTP 请求有独立超时。关闭网页会暂停客户端驱动的步进，重新打开该线程可继续；尚无后台队列。
- 模型或工具失败不会切换成虚构的真实结论。工具重试一次后暂停，用户可重试或明确跳过，缺口保留在报告。
- 自动校验不证明引用在语义上支持结论；合规正则也不是完备审查。实盘发布前必须人工核验、补充字段级论证及对抗测试。
- 缺失、过期数据被显式标记。跨来源冲突检测、多用户共享、实时新闻订阅、持仓、交易和原生桌面 App 未实现。
- 长期记忆只保存用户明确确认的文本偏好。默认不采集真实持仓。

## 部署

本项目包含 `.openai/hosting.json`，通过 Sites 的 Worker 部署流程发布；D1 迁移由平台执行。GitHub 保存源代码，不承担动态 API 托管。公开评测前需将访问策略设置为评委可以访问，并完成真实服务联调。当前初始部署默认仅拥有者可访问。

## 许可

原创代码采用 MIT（见 LICENSE）；依赖和保留的 Sites 构建组件遵守各自许可。`build/sites-vite-plugin.LICENSE` 与 `vendor/*.LICENSE.md` 保留原始声明。
