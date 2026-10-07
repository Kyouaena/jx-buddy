# JX Buddy 的 RSI 递归式自我改进

项目实际使用有界 RSI（Recursive Self-Improvement）逻辑，对研究报告执行“草稿 → 自检 → 修订 → 再自检 → 用户复核”。这是报告级反馈迭代，不是模型权重训练，也不宣称模型会无限提升智能。

## 执行机制

1. 生成结构化草稿，隔离保存；此时不作为正式报告展示。
2. 独立校验调用对照冻结的原始证据，检查引用、单位、时点、无依据结论和合规表述，只输出简短结构化问题。
3. 确定性校验器独立检查引用存在、异常证据只能标为不确定，以及直接买卖建议或收益承诺。模型宣称“通过”不能绕过规则。
4. 发现问题时，最多修订一次；修订不重新取数、不更换证据、不扩大工具权限。
5. 再自检仍有问题则扣留报告，交由用户处理；通过后仍需用户复核。

## 安全边界

- 最多两次自检、一次修订；检查点恢复不重置计数。
- 全站累计最多40次模型请求、$1保守预算，以及每线程调用、Token和执行时间预算仍生效。
- 模型不能修改自身代码、系统规则、权限、预算或长期记忆。
- 外部数据、草稿和反馈都作为不可信输入，不执行其中的指令。
- 每一步保存检查点和可观测事件；只展示简短反馈，不展示隐藏推理过程。
- 新学习偏好只能经用户确认保存；不自动写入长期记忆。
- 自检不是正确性保证；来源真实性、复杂语义和金融判断仍需人工复核。

## 实现与验证

`lib/harness/rsi.ts` 验证草稿与反馈格式；`lib/harness/engine.ts` 执行检查和有界递归；D1保存状态，页面显示RSI进度与反馈。

`tests/rsi.test.ts` 覆盖成功修订、达到上限、确定性规则覆盖模型“通过”、暂停/序列化恢复/停止，以及拒绝越权反馈。

参考官方迭代评估思路：[OpenAI Self-Evolving Agents](https://developers.openai.com/cookbook/examples/partners/self_evolving_agents/autonomous_agent_retraining)。本项目实现的是自身报告迭代，没有集成该示例的训练或GEPA流程。

## Final RSI live verification

A production run completed 2 reviews and 1 revision, then entered user review. The original financial evidence remained frozen. The budget was not reset: 11/15 model requests, approximately $0.0188/$1 conservatively reserved. iFinD authenticated successfully in direct and local Worker tests, but its official endpoint timed out from the production Worker environment. Two bounded attempts stopped; an explicit skip preserved the gap. The resulting report did not fabricate MRQ dates or event data. No claim is made that production iFinD connectivity is currently reliable.
