# 测试说明

## 自动测试

`npm test` 使用真实 LangGraph 图执行而非模拟状态机。

- 计划审批前不会调用工具；演示主链路生成 3 个证据与报告。
- JSON 序列化后恢复执行，不重复正常完成的工具。
- 工具失败最多自动重试一次，随后需要用户决策；skip 后报告保留缺口。
- 数据缺失／过期生成 uncertain，禁止当成事实。
- stop 与预算耗尽阻止后续调用。
- 自动交易目标被拒绝。
- 不存在的证据、过期数据当事实、直接买卖建议被报告 gate 拒绝。
- live 缺模型失败不切换到 demo；计划未注册工具被拒绝。

## 本地集成与人工操作

启动数据库与开发服务后检查：创建 → 计划 → 确认 → 步进 → 报告 → 完成；切换线程与重开状态；历史恢复；记忆确认保存并注入新线程；不同 owner 不能读取或修改线程；revision 冲突不覆盖；检查点保存；导出 Markdown 含原始证据。

## 尚未验证

iFinD 生产环境稳定连接、跨来源完整冲突检测、公开评委访问策略、平台实际账单核对、长任务后台执行、完备合规审查。

本版本通过演示运行不意味着这些项目已通过。

## 2026-10-06 首版验证记录

- 10 项自动测试通过，0 失败；类型检查通过；Worker 生产构建通过。
- `node tests/integration.mjs` 本地 HTTP + D1 主链路通过，覆盖创建、审批、暂停、继续、报告、复核、历史恢复、记忆确认、未登录拒绝、revision 冲突、CSRF 和不存在的线程。
- 本地迁移执行成功，网页返回 HTTP 200。测试使用本地 mock 登录和构造金融数据，不调用真实模型和供应商。
- WebMCP 为渐进增强的只读当前状态工具。首版发布时尚未验证；后续已在支持环境核验注册、有效输入和无效输入拒绝，不作为核心验收能力。

## 真实接入验证（2026-10-06）

- `node tests/live-smoke.mjs` 使用真实 OpenAI GPT-6 Luna 与扶摇 API，单只 A 股、2025 年合并利润表和最新估值快照：计划审批后完成 2 个工具任务、2 份非演示证据、7 条报告结论，进入待人工复核。
- 真实主链路使用 2 次模型请求；此前 1 次环境兼容失败也计入额度，总计 3 次。保守预算预占 $0.004722，使用返回 Token 的保守估算 $0.000512（非平台账单）。
- 初次联调发现边缘运行环境不支持 redirect:error；改为 manual，并拒绝非成功响应，防止携带密钥自动跳转。
- 17 项自动测试通过，类型检查通过；其中真实 SQLite 并发测试证明最多 15 次和金额预占限额，重新打开数据库不重置。
- 测试不将真实金融原始数据提交到 GitHub。真实报告语义、引用是否充分支持结论仍需人工复核。
- iFinD 已阅读官方前置准备：需要独立登录、MCP 密钥和个人中心生成的服务配置；目前等待用户提供配置，尚未发生 iFinD 工具调用。

新增 PCF 中文术语回归测试：对明确标为 PCF 的误译进行规范，不改变数值与证据；报告显示修正提示。

线上验收增加慢网络场景：检查 action 完成并解除 busy 后自动执行下一步，确保不会停在第一个已完成任务。修复通过重新部署后从既有检查点继续验证。

合规否定句回归：先验证“不保证收益／不提供买入建议”被错误拦截（测试失败），再区分明确免责声明与真正承诺／建议；“不建议买入”仍属于直接建议，继续拦截。修复后重试报告步骤，财务与估值证据不重复请求。

## 最终线上验收

19项自动测试、类型检查与Worker构建通过。三家公司的2025年度财务与估值查询完成；从既有检查点恢复后，只重试报告，工具各保持1次调用，报告进入待复核，7条结论关联2份真实证据。预算显示6/15次模型请求、约$0.0101/$1保守预占。

WebMCP只读工具注册的schema和readOnly/untrusted标注正确；有效空参数返回当前线程、任务与证据ID；无效参数被拒绝且不改变研究状态。

访问范围仍为拥有者私有，等待公开评测授权；iFinD仍待用户生成的服务配置，不能声称已使用。

## iFinD integration verification

The official A-share Streamable HTTP MCP endpoint was verified. Raw Authorization authentication succeeded; 10 tools were discovered. A real get_stock_events call returned code=1 and latest-MRQ disclosure dates, not a complete event list for the requested date window. The adapter preserves the original response, marks missing update-time/source-link metadata as uncertain, and prevents normal facts or inferences based on this incomplete evidence. Both the direct protocol probe and the local Worker route passed. No OpenAI model requests were used for these checks, and the existing 15-request/$1 budget was preserved.

RSI新增测试覆盖隔离草稿、自检修订后发布、最多一次修订/两次自检、失败后不能重置上限、暂停与检查点恢复、停止规则、拒绝越权反馈，以及确定性校验覆盖模型“无问题”反馈。

## Final RSI live verification

A production run completed 2 reviews and 1 revision, then entered user review. The original financial evidence remained frozen. The budget was not reset: 11/15 model requests, approximately $0.0188/$1 conservatively reserved. iFinD authenticated successfully in direct and local Worker tests, but its official endpoint timed out from the production Worker environment. Two bounded attempts stopped; an explicit skip preserved the gap. The resulting report did not fabricate MRQ dates or event data. No claim is made that production iFinD connectivity is currently reliable.

## 本次交付核对与预算更新

用户授权将整站模型请求上限从15改为25；累计调用与金额不清零，$1限额保持。历史11/15记录保留当时状态。并发预算测试现在验证第26次拒绝。

| 交付要求 | 已有证据 | 限制 |
|---|---|---|
| 主链路 | 本地HTTP+D1集成；真实OpenAI与扶摇；线上RSI两轮自检一次修订进入用户复核 | 测试通过不代表所有研究目标均已覆盖 |
| 数据缺失/接口失败 | 缺失、过期、重试、显式跳过；线上iFinD两次超时后保留缺口 | iFinD线上连接尚未修复 |
| 极端/合规边界 | 预算耗尽、并发原子扣费、停止恢复、拒绝交易目标、无引用/越权反馈拒绝 | 非完整法律合规审查 |
| 评委访问 | 产品URL可操作，当前仅用户本人有访问权 | 提交前需设置评委访问权限 |

演示方案见[120秒产品录屏脚本](DEMO_VIDEO.md)。
