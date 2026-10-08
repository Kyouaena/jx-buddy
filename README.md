# 投资 JX Buddy

- 在线产品：[投资 JX Buddy](https://investment-x-buddy.kyoula.chatgpt.site)（已于2026年10月7日设置为公开访问，游客与登录用户均可使用真实研究；会话与账号记录隔离）
- 源码仓库：[Kyouaena/jx-buddy](https://github.com/Kyouaena/jx-buddy)（已公开，排除密钥、本地数据库和受限金融数据）

个人投资研究 Agent 网页工作台。用研究目标创建线程，检查并批准执行计划，查看原始证据，复核报告；每一步保存到数据库，可暂停、重试和恢复。

**当前版本：真实 OpenAI＋扶摇主链路已通过本地与线上联调，iFinD A股MCP已完成鉴权、工具发现与披露日期真实查询；报告仍需人工复核。** 演示使用三个虚构公司，目标只用于工作流展示，不代表对用户指定标的的研究。界面和导出均标注构造数据。

## 技术选择与复用

- LangGraph JS (`@langchain/langgraph`)：实际执行的状态图框架，MIT。
- React 19 + Vinext：工作台、动态状态和服务端 API。
- Cloudflare Worker + D1：受保护的模型／MCP 调用、线程和检查点、确认后的长期记忆。
- 界面和金融 Harness 为本项目原创，没有把上游完整 App 改名。参考 [DeerFlow](https://github.com/bytedance/deer-flow) 的研究工作台结构、[Deep Agents](https://github.com/langchain-ai/deepagents) 的 Harness 思路。详见 [开源选型](docs/OPEN_SOURCE.md)。

## 启动

需要 Node 22.13+（建议 22 LTS）、npm；SQLite 预算并发测试需要 Python 3。

```sh
npm ci
npm run db:generate # 已有迁移且未更改 schema 时无需再生成
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_odd_enchantress.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_tough_proteus.sql
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

- `OPENAI_API_KEY` / `OPENAI_MODEL`：OpenAI Responses API，默认 `gpt-6-luna`，仅允许登记官方价格的模型。旧 `LLM_API_KEY`／`LLM_MODEL` 可兼容。
- `FUYAO_API_KEY`：扶摇 REST 直连，使用官方 `X-api-key` 请求头，覆盖估值快照和指定年度合并利润表，无需手工 MCP 映射。
- `FUYAO_MCP_URL` / `FUYAO_MCP_TOKEN`、`IFIND_MCP_URL` / `IFIND_MCP_TOKEN`：实际 Streamable HTTP MCP 端点与可选 Bearer Token。
- `FINANCIAL_TOOL_MAP`：已验证的只读金融工具映射。逻辑工具为 `market_snapshot`、`financial_comparison`、`news_context`。每个映射填写 `provider`（fuyao/ifind）、服务器 `name`、`arguments`、`readOnly:true`、`asOfField`（structuredContent 的点分字段路径）、`unit`、`scope`、`maxAgeDays`。参数中的 `{{goal}}` 替换成研究目标。真实参数必须匹配服务公布的 inputSchema。

未假设供应商工具名和路径。适配器先初始化 MCP、执行 tools/list，验证被配置的工具确实存在，再 tools/call；禁止声明有写入／破坏行为的工具。MCP 当前仅支持 Streamable HTTP，OAuth、旧 SSE 和 stdio 尚未实现。扶摇 REST 专用适配器已按官方文档编写，并完成真实年度财务与估值查询。iFinD 需要账号及实际工具 schema 后才能完成接入验证。

## 产品流程

1. 输入研究目标，选择构造演示或真实接入，创建研究线程。
2. 真实研究需明确 1–3 个完整股票代码和年度报告年份。模型只能从已启用工具规划，计划需确认后执行。
3. 每个工具结果保存来源、数据时点、获取时间、单位、统计口径、原始返回及质量状态。
4. 压缩工作上下文为目标／记忆／证据索引／未完成事项；原始字段始终在证据库。
5. 生成报告，验证证据 ID 与基础表述规则，区分事实、推断、不确定性，待用户复核。
6. 导出含原始证据的 Markdown。

## Harness 与边界

详见 [架构](docs/ARCHITECTURE.md)、[测试说明](docs/TESTING.md)、[AI 使用与验证记录](docs/AI_USAGE.md)。

- 检查点是应用层的节点边界状态快照，不是 LangGraph 内置 checkpointer。每次图调用执行一个受控研究步骤，API 将结果和检查点原子保存到 D1。
- 租约与 revision 比较防止并行浏览器重复执行。正常恢复不会重跑已完成任务。若服务在外部请求成功但数据库提交前崩溃，可能出现只读调用的至少一次重试；不宣称 exactly-once。
- 每线程 12 次逻辑调用、12,000 Token、120 秒累计执行预算；另外整站模型请求累计最多 40 次且保守预占最多 $1，数据库原子扣除，跨线程／恢复／密钥轮换不重置。失败不返还预占，不自动重试付费请求。每次最多 2,200 输出 Token、28 KB UTF-8 输入。只请求标准档纯文本，无 OpenAI 内置付费工具。金额根据登记价格保守估算，不是整张 Key 的平台账单限制，其他应用的费用不受此限制。
- 暂停／停止在步骤边界生效，正在执行的 HTTP 请求有独立超时。关闭网页会暂停客户端驱动的步进，重新打开该线程可继续；尚无后台队列。
- 模型或工具失败不会切换成虚构的真实结论。工具重试一次后暂停，用户可重试或明确跳过，缺口保留在报告。
- 自动校验不证明引用在语义上支持结论；合规正则也不是完备审查。实盘发布前必须人工核验、补充字段级论证及对抗测试。
- 缺失、过期数据被显式标记。跨来源完整冲突检测、多用户共享、实时新闻订阅、持仓、交易和原生桌面 App 未实现。
- 长期记忆只保存用户明确确认的文本偏好。默认不采集真实持仓。

## 部署

本项目包含 `.openai/hosting.json`，通过 Sites 的 Worker 部署流程发布；D1 迁移由平台执行。GitHub 保存源代码，不承担动态 API 托管。当前站点访问策略为public，任何持有URL的人可直接体验游客工作台，或使用ChatGPT登录。数据库仍按登录账号隔离；公开访问不代表共享已有研究记录。真实调用受全站40次模型请求和$1保守预算约束，评测建议先使用构造数据演示。

## 许可

原创代码采用 MIT（见 LICENSE）；依赖和保留的 Sites 构建组件遵守各自许可。`build/sites-vite-plugin.LICENSE` 与 `vendor/*.LICENSE.md` 保留原始声明。

## 开通真实接入

1. 在 [扶摇快速开始](https://fuyao.aicubes.cn/docs/quickstart/) 使用同花顺账号创建 API Key。权限是否可用以实际调用为准；资讯事件库目前不开放外部接入，不注册为可用扶摇工具。
2. 配置 `OPENAI_API_KEY`（服务端 Secret）、`OPENAI_MODEL` 和 `FUYAO_API_KEY`（Secret）。
3. 线上重新部署以应用新环境版本；先跑一次小范围真实研究，并核验响应字段、报告期、单位和引用。
4. `model_budget` 表的累计上限是整站共用的 40 次／$1；开发自动测试使用构造响应，不消耗真实额度。一次正常研究通常需要规划、报告两次模型请求。

官方模型价（2026-10-06，标准档，百万 Token）：GPT-6 Luna 输入 $0.10／输出 $0.50；GPT-6.1 Sol 输入 $2／输出 $10。应用预算保守计入输入缓存写入的 1.25 倍费率。定价变化需重新核验后更新代码；未登记模型拒绝付费调用。

本地验证消耗会在首次部署时通过 MODEL_PREUSED_CALLS／MODEL_PRECOMMITTED_MICRO_USD／MODEL_PREOBSERVED_MICRO_USD 初始化线上账本。已存在的线上账本不会被环境变量覆盖；此后只在生产环境执行付费测试。

## iFinD integration verification

The official A-share Streamable HTTP MCP endpoint was verified. Raw Authorization authentication succeeded; 10 tools were discovered. A real get_stock_events call returned code=1 and latest-MRQ disclosure dates, not a complete event list for the requested date window. The adapter preserves the original response, marks missing update-time/source-link metadata as uncertain, and prevents normal facts or inferences based on this incomplete evidence. Both the direct protocol probe and the local Worker route passed. No OpenAI model requests were used for these checks, and the existing 15-request/$1 budget was preserved.

## RSI 递归式自我改进

JX Buddy 已加入实际运行的报告级 RSI：生成草稿、自检、最多一次修订、再验证，然后等待用户复核。模型不能修改代码、权限、预算或原始证据，不能绕过40次/$1限制；失败和恢复也不会重置上限。详见 [RSI机制与安全边界](docs/RSI.md)。

### Current deployment boundary

The iFinD adapter and credentials were verified locally, but production calls currently time out. The workbench reports the failure and requires explicit retry or skip; it does not fabricate results. RSI is live and bounded, but its self-review remains fallible and requires human verification.

## iFinD生产可用性修正

iFinD配置与生产可用性分开判断。默认`IFIND_MCP_ENABLED=false`：已知生产超时的工具不向计划器暴露，扶摇财务/估值仍正常执行。创建真实研究时记录缺少MRQ/新闻/宏观证据，不能将未查询内容作为结论。既有失败线程保留结果，用户显式跳过后继续，不重复成功的扶摇步骤。诊断入口仍为owner鉴权，只读、不消耗模型请求；只有部署环境实际诊断通过才设置`IFIND_MCP_ENABLED=true`。MCP错误现在包含协议阶段，不暴露供应商异常原文或密钥。这是对不可用数据源的诚实隔离，尚未解决iFinD生产网络连通性。

临时iFinD连接桥接及其本机依赖详见[桥接说明](docs/IFIND_BRIDGE.md)。线上直连已定位到initialize超时，根因未确认；桥接本机实际查询与鉴权/参数拒绝已验证。线上桥接结果以网页诊断为准。

线上工作台诊断已实际返回“连接与查询成功 · iFinD MCP · get_stock_events · 本机鉴权桥接”；证据缺失仍标为需核验。随后开启IFIND_MCP_ENABLED。诊断没有消耗OpenAI请求；模型累计仍15/25。临时HTTPS桥接401鉴权拒绝、400参数拒绝和HTTP200/code=1真实响应均通过。依赖本机服务和隧道保持运行，不承诺常驻稳定性。

## 游客免登录体验

用户已授权游客使用真实模型与金融工具，游客与账号用户共用整站累计40次模型请求／$1预算，不重置此前消耗。公开首页未登录时进入游客工作台，已登录者也可打开 `/guest` 单独体验。游客使用服务端HMAC签名的随机会话Cookie，HttpOnly、HTTPS Secure、SameSite Strict，有效7天；跨站或缺Origin的游客写请求被拒绝。数据库按游客owner隔离，不借用站点拥有者身份。清除Cookie、会话到期或更换浏览器会失去旧游客记录的访问；登录不自动合并访客记录。原构造演示的localStorage数据未删除，但新工作台使用独立服务端会话。

`GUEST_SESSION_SECRET` 为32字符以上的随机服务端Secret；缺少配置时拒绝签发游客会话。可在 `.dev.vars` 配置用于本地开发，线上通过Sites Secret设置，不能提交真实值。游客和账号均使用同一Harness、只读工具、计划审批、检查点、RSI、报告校验和原子模型预算。构造演示仍不调用模型；真实模式才产生付费调用。游客最多保留30条研究。iFinD是否可用取决于实际供应商和桥接连通性，游客授权不会修复数据源超时。
