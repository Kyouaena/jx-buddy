import { test } from "node:test";
import assert from "node:assert/strict";
import { createState, advance, control, registry, validateReport, demoEvidence } from "../lib/harness/engine.ts";
import type { Runtime, RunState } from "../lib/harness/types.ts";
const rt: Runtime = { tools: registry, model: false, callTool: async () => { throw new Error("no live access"); }, modelJSON: async () => { throw new Error("no model"); } };
async function finish(s: RunState) { for(let i=0; i<12 && s.status === "running"; i++) s = await advance(s, rt); return s; }
test("approval blocks tool calls; full demo generates verifiable report", async () => {
  let s = await advance(createState("比较盈利能力", "demo"), rt);
  assert.equal(s.status, "approval"); assert.equal(s.usage.calls, 0);
  s = await advance(s, rt); assert.equal(s.evidence.length, 0);
  s = await finish(control(s, "approve")); assert.equal(s.status, "review");
  assert.equal(s.evidence.length, 3); assert.equal(s.usage.calls, 3); assert.equal(s.context.length, 1);
  for(const claim of s.report!.claims) assert.ok(claim.evidenceIds.every(id => s.evidence.some(e => e.id === id)));
  assert.equal(control(s, "accept").status, "complete");
});
test("pause and serialized recovery never repeat completed calls", async () => {
  let s = control(await advance(createState("风险研究", "demo"), rt), "approve");
  s = await advance(s, rt); const calls = s.usage.calls;
  s = control(s, "pause"); s = await advance(s, rt); assert.equal(s.usage.calls, calls);
  s = JSON.parse(JSON.stringify(s)); s = await finish(control(s, "resume"));
  assert.equal(s.usage.calls, 3); assert.equal(s.evidence.filter(e => e.tool === "market_snapshot").length, 1);
});
test("failed tools retry once, then require a user recovery decision", async () => {
  let s = control(await advance(createState("风险研究", "demo", "", "tool_failure"), rt), "approve");
  s = await finish(s); assert.equal(s.status, "failed");
  assert.equal(s.tasks[1].attempts, 2); assert.equal(s.evidence.length, 1);
  s = await finish(control(s, "skip")); assert.equal(s.status, "review"); assert.equal(s.evidence.length, 2);
  assert.ok(s.report!.limitations.some(l => l.includes("缺口")));
});
for(const fault of ["missing_data", "stale_data"] as const) test(`${fault} is explicitly uncertain in report`, async () => {
  let s = control(await advance(createState("风险研究", "demo", "", fault), rt), "approve");
  s = await finish(s); assert.equal(s.status, "review"); assert.ok(s.report!.claims.some(c => c.kind === "uncertain"));
});
test("stop and budget limits block further calls", async () => {
  let s = control(await advance(createState("风险研究", "demo"), rt), "approve");
  const stopped = await advance(control(s, "stop"), rt); assert.equal(stopped.usage.calls, 0);
  s.budget.calls = 0; s = await advance(s, rt); assert.equal(s.status, "failed"); assert.equal(s.usage.calls, 0);
  assert.throws(() => control(s, "resume"), /预算/);
});
test("compliance boundary rejects automated trading goal", async () => {
  const s = await advance(createState("帮我自动下单买入股票", "demo"), rt); assert.equal(s.status, "failed"); assert.equal(s.usage.calls, 0);
});
test("report gate rejects fabricated citations and bad data as facts", () => {
  const evidence = [{ ...demoEvidence("market_snapshot", "stale_data"), id: "E1" }];
  const base = { title: "研究", summary: "风险分析", limitations: [] };
  assert.throws(() => validateReport({ ...base, claims: [{ kind: "fact", text: "估值正常", evidenceIds: ["E99"] }] }, evidence), /不存在/);
  assert.throws(() => validateReport({ ...base, claims: [{ kind: "fact", text: "估值正常", evidenceIds: ["E1"] }] }, evidence), /过期/);
  assert.throws(() => validateReport({ ...base, claims: [{ kind: "uncertain", text: "建议立即买入", evidenceIds: [] }] }, evidence), /买卖建议/);
});
test("live model failure preserves state without silently substituting demo", async () => {
  const s = await advance(createState("经营情况研究", "live"), rt); assert.equal(s.status, "failed"); assert.equal(s.mode, "live"); assert.equal(s.evidence.length, 0);
});
test("live planner can only choose enabled registered tools", async () => {
  const live: Runtime = { ...rt, model: true, modelJSON: async () => ({ value: { tasks: [{ title: "交易", tool: "place_order" }] }, tokens: 30 }) };
  const s = await advance(createState("经营情况研究", "live"), live); assert.equal(s.status, "failed"); assert.equal(s.tasks.length, 0); assert.equal(s.usage.tokens, 30);
});
test('PCF wording is normalized to price-to-cash-flow without changing raw values', () => {
 const evidence=[{...demoEvidence('market_snapshot'),id:'E1'}];
 const r=validateReport({title:'研究',summary:'估值快照',limitations:[],claims:[{kind:'fact',text:'现金流市值比TTM（PCF）为13.2倍。',evidenceIds:['E1']}]},evidence);
 assert.equal(r.claims[0].text,'市现率TTM（PCF）为13.2倍。');assert.ok(r.limitations.some(l=>l.includes('PCF')));
});
test('compliance guard permits explicit disclaimers but still rejects real promises and advice', () => {
 const base={title:'研究',limitations:[],claims:[{kind:'uncertain',text:'新闻证据缺失。',evidenceIds:[]}]};
 for(const summary of ['不保证收益，也不提供买入建议。','本报告不构成买入评级。','无法保证股价上涨。','不提供任何买入或卖出建议。','不提供任何买入、卖出、加仓、减仓建议。'])assert.doesNotThrow(()=>validateReport({...base,summary},[]));
 for(const summary of ['保证收益。','承诺收益。','建议立即买入。','不建议买入。','不保证收益，但推荐买入。','不提供投资建议，但推荐买入。'])assert.throws(()=>validateReport({...base,summary},[]),/买卖建议|收益/);
});
