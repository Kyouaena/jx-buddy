"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { Plus, ArrowUp, Search, Layers, BookOpen, PanelRight, Check, Pause, Play, Square, Download, RotateCcw, ChevronRight, CircleAlert, Clock, Database, Zap, FileText, Settings2, ShieldCheck, Activity, X } from "lucide-react";
import type { RunState, Evidence, ToolRegistration } from "../lib/harness/types";
type Thread = { id: string; goal: string; status: string; mode: string; updated: number };
type CP = { id: string; revision: number; created: number };
type ModelBudget = { calls: number; maxCalls: number; committedUsd: number; observedUsd: number; maxUsd: number };
const labels: Record<string, string> = { planning: "规划中", approval: "等待确认", running: "研究中", paused: "已暂停", failed: "需要处理", review: "待复核", complete: "已完成", stopped: "已停止" };
const samples = ["比较三家公司的盈利能力与估值，梳理需要核验的风险", "研究一个行业的需求变化、政策背景与数据缺口", "检查财务数据缺失时，研究报告如何保留不确定性"];
async function request(body?: unknown, query = "") {
  const response = await fetch(`/api/research${query}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
  const result = await response.json() as { error?: string; state: RunState; threads: Thread[]; checkpoints: CP[]; memory: string; modelBudget: ModelBudget; capabilities: { model: boolean; modelName: string; tools: ToolRegistration[]; providers: { fuyao: boolean; ifind: boolean } } }; if (!response.ok) throw new Error(result.error || "服务暂不可用。"); return result;
}
export default function Workbench({ userName }: { userName: string }) {
  const [threads, setThreads] = useState<Thread[]>([]); const [state, setState] = useState<RunState | null>(null);
  const [goal, setGoal] = useState(""); const [mode, setMode] = useState("demo"); const [fault, setFault] = useState("none");
  const [symbols, setSymbols] = useState(""); const [reportYear, setReportYear] = useState(new Date().getUTCFullYear() - 1); const [modelBudget, setModelBudget] = useState<ModelBudget | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [tab, setTab] = useState("evidence");
  const [evidence, setEvidence] = useState<Evidence | null>(null); const [cps, setCps] = useState<CP[]>([]);
  const [memory, setMemory] = useState(""); const [memoryOpen, setMemoryOpen] = useState(false); const [confirmed, setConfirmed] = useState(false);
  const [caps, setCaps] = useState<{ model: boolean; modelName: string; tools: ToolRegistration[]; providers: { fuyao: boolean; ifind: boolean } } | null>(null);
  const [search, setSearch] = useState(""); const [panel, setPanel] = useState(true);
  const busyRef = useRef(false); const current = useRef<RunState | null>(null); current.current = state;
  const refresh = useCallback(async () => { const r = await request(); setThreads(r.threads); setMemory(r.memory); setCaps(r.capabilities); setModelBudget(r.modelBudget); }, []);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  async function open(id: string) { if (busyRef.current) return; try { setError(""); const r = await request(undefined, `?id=${id}`); setState(r.state); setCps(r.checkpoints); setEvidence(null); } catch (e) { setError((e as Error).message); } }
  const act = useCallback(async (action: string, extras: Record<string, unknown> = {}) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const s = current.current; const r = await request({ action, ...(s ? { id: s.id, revision: s.revision } : {}), ...extras });
      if (r.state) { current.current = r.state; setState(r.state); const snap = await request(undefined, `?id=${r.state.id}`); setCps(snap.checkpoints); }
      await refresh(); return r;
    } catch (e) { setError((e as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }, [refresh]);
  useEffect(() => {
    if (!state || !["planning", "running"].includes(state.status) || error) return;
    const timer = setTimeout(() => { act("tick"); }, 900); return () => clearTimeout(timer);
  }, [state, error, act]);
  async function create(value = goal) { if (!value.trim()) return; const result = await act("create", { goal: value, mode, fault, ...(mode === "live" ? { targets: { symbols: symbols.toUpperCase().split(/[,，\s]+/).filter(Boolean), reportYear } } : {}) }); if (result) { setGoal(""); setTab("evidence"); } }
  useEffect(() => {
    type Context = { registerTool: (tool: unknown, options: { signal: AbortSignal }) => Promise<void> | void };
    const context = (document as unknown as { modelContext?: Context }).modelContext; if (!context?.registerTool) return;
    const life = new AbortController();
    Promise.resolve(context.registerTool({ name: "read_research_state", title: "查看研究状态", description: "读取当前研究的状态、任务和证据编号，不修改数据。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute: (input: unknown) => { if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("不接受参数。"); const s = current.current; return s ? { id: s.id, status: s.status, tasks: s.tasks, evidenceIds: s.evidence.map(e => e.id) } : { status: "empty" }; } }, { signal: life.signal })).catch(() => {});
    return () => life.abort();
  }, []);
  function download() {
    if (!state?.report) return; const r = state.report;
    const md = `# ${r.title}\n\n${r.summary}\n\n${r.claims.map(c => `- **${{ fact: "事实", inference: "推断", uncertain: "不确定" }[c.kind]}** ${c.text} [${c.evidenceIds.join(", ")}]`).join("\n")}\n\n## 局限\n${r.limitations.map(l => `- ${l}`).join("\n")}\n\n## 原始证据\n${state.evidence.map(e => `### ${e.id} ${e.title}\n来源：${e.source}\n时点：${e.asOf}\n单位：${e.unit}\n口径：${e.scope}\n\n\`\`\`json\n${JSON.stringify(e.raw, null, 2)}\n\`\`\``).join("\n\n")}`;
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "x-buddy-research.md"; a.click(); URL.revokeObjectURL(url);
  }
  const done = state?.tasks.filter(t => t.status === "done").length || 0;
  return <div className={`workbench ${panel ? "" : "panel-hidden"}`}>
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark">X</span><span>X Buddy<small>INVESTMENT RESEARCH</small></span></a>
      <button className="new-thread" disabled={busy} onClick={() => { setState(null); setEvidence(null); setError(""); }}><Plus size={17}/>新建研究</button>
      <label className="thread-search"><Search size={15}/><input aria-label="搜索研究线程" placeholder="搜索研究" value={search} onChange={e => setSearch(e.target.value)}/></label>
      <div className="nav-heading">研究线程 <span>{threads.length}</span></div>
      <nav className="thread-list">{threads.filter(t => t.goal.includes(search)).map(t => <button disabled={busy} key={t.id} className={`thread ${state?.id === t.id ? "selected" : ""}`} onClick={() => open(t.id)}><FileText size={16}/><span><strong>{t.goal}</strong><small>{labels[t.status]} · {t.mode === "demo" ? "构造数据" : "真实接入"}</small></span></button>)}{!threads.length && <p className="sidebar-empty">你的研究会保存在这里。</p>}</nav>
      <div className="sidebar-bottom"><button onClick={() => { setMemoryOpen(true); setConfirmed(false); }}><BookOpen size={17}/>研究记忆<small>{memory ? "已保存" : "未设置"}</small></button><div className="account"><span className="avatar">{userName.slice(0, 1)}</span><span>个人工作台<small>{userName}</small></span><Settings2 size={16}/></div></div>
    </aside>
    <main className="main">
      <header className="topbar"><div><span className="breadcrumb">研究工作台</span><ChevronRight size={14}/><strong>{state ? "研究线程" : "新建研究"}</strong></div><div><span className={`mode-tag ${mode === "demo" ? "demo" : ""}`}><ShieldCheck size={13}/>{state ? state.mode === "demo" ? "构造数据演示" : "真实接入" : mode === "demo" ? "演示模式" : "真实接入"}</span><button className="icon-btn" aria-label="切换证据面板" onClick={() => setPanel(!panel)}><PanelRight size={18}/></button></div></header>
      {error && <div className="error-banner" role="alert"><CircleAlert size={17}/>{error}<button onClick={() => { setError(""); if (state) open(state.id); else refresh().catch(e => setError(e.message)); }}>重新加载</button></div>}
      <div className="main-scroll">
      {!state ? <div className="start-screen"><div className="eyebrow"><span className="line"/> YOUR RESEARCH, CONNECTED</div><h1>从一个问题，<br/>开始一份有据可查的研究。</h1><p className="intro">明确目标，检查计划，沿着证据推进。<br/>每一次调用、每一个结论，都留有来路。</p>
        <div className="composer"><textarea aria-label="研究目标" value={goal} maxLength={2000} onChange={e => setGoal(e.target.value)} placeholder="想研究什么？例如：比较三家公司的盈利能力、估值与风险"/><div className="composer-bottom"><span><Layers size={16}/>投资研究 Agent</span><button className="send" aria-label="开始研究" disabled={busy || !goal.trim()} onClick={() => create()}><ArrowUp size={20}/></button></div></div>
        <div className="configuration"><select aria-label="数据模式" value={mode} onChange={e => setMode(e.target.value)}><option value="demo">构造数据演示</option><option value="live">真实数据接入</option></select>{mode === "demo" && <select aria-label="演示场景" value={fault} onChange={e => setFault(e.target.value)}><option value="none">正常流程</option><option value="tool_failure">接口失败与恢复</option><option value="missing_data">数据缺失</option><option value="stale_data">数据过期</option></select>}<span>{mode === "demo" ? "虚构公司 · 不调用模型 · 无真实行情" : caps?.model ? "按已配置的模型与只读工具执行" : "模型尚未配置，真实研究不可用"}</span></div>
        {mode === "live" && <div className="live-targets"><label>研究标的（1–3 个 A 股代码）<input aria-label="真实研究股票代码" placeholder="600519.SH, 000858.SZ" value={symbols} onChange={e => setSymbols(e.target.value)} maxLength={40}/></label><label>年度报告<input aria-label="年度报告年份" type="number" min={2000} max={new Date().getUTCFullYear()-1} value={reportYear} onChange={e => setReportYear(Number(e.target.value))}/></label><p>明确股票代码避免误认同名公司。扶摇直连覆盖估值与合并利润表，新闻以可调用工具为准。</p></div>}
        <div className="sample-heading">从这些研究方向开始</div><div className="sample-list">{samples.map((sample, i) => <button key={sample} onClick={() => { setGoal(sample); if (i === 2) setFault("missing_data"); }}><span className="sample-number">0{i + 1}</span><span>{sample}</span><Plus size={16}/></button>)}</div>
        <div className="start-foot"><ShieldCheck size={15}/>只读研究工具 · 原始证据可追溯 · 不提供交易指令</div>
      </div> : <div className="research-content">
        <div className="research-heading"><span className="eyebrow">RESEARCH THREAD</span><h1>{state.goal}</h1><div className="research-meta"><span className={`status ${state.status}`}>{labels[state.status]}</span><span>{state.mode === "demo" ? "构造数据 / 虚构公司" : "模型与金融工具"}</span><span>检查点 v{state.revision}</span></div></div>
        <div className="user-request"><span className="request-icon"><Search size={19}/></span><div><small>研究目标</small><p>{state.goal}</p></div></div>
        <section className="plan-card"><div className="section-heading"><h2><Layers size={18}/>研究计划</h2><span>{done} / {state.tasks.length} 已完成</span></div>{state.tasks.length ? <ol className="tasks">{state.tasks.map((task, i) => <li key={task.id}><span className={`task-circle ${task.status}`}>{task.status === "done" ? <Check size={14}/> : task.status === "failed" ? <X size={14}/> : i + 1}</span><div><strong>{task.title}</strong><small>{task.tool} · 只读{task.attempts > 0 ? ` · 已调用 ${task.attempts} 次` : ""}</small>{task.error && <small className="danger">{task.error}</small>}</div><span className="task-label">{{ pending: "待执行", done: "已完成", failed: "失败" }[task.status]}</span></li>)}</ol> : <p className="muted">正在规划研究任务…</p>}
          {state.status === "approval" && <div className="approval"><ShieldCheck size={19}/><div><strong>确认研究范围</strong><p>将执行上述只读工具。最多 12 次模型／工具调用，12,000 Token，120 秒累计执行时间。</p></div><button className="primary" disabled={busy} onClick={() => act("approve")}>确认并执行</button></div>}
          <div className="run-controls">{["planning", "running"].includes(state.status) && <button disabled={busy} onClick={() => act("pause")}><Pause size={14}/>暂停</button>}{["paused", "failed"].includes(state.status) && <button disabled={busy} onClick={() => act("resume")}><Play size={14}/>{state.status === "failed" ? "重试未完成步骤" : "继续研究"}</button>}{state.status === "failed" && state.phase === "tools" && <button disabled={busy} onClick={() => act("skip")}>跳过失败工具，保留缺口</button>}{!["complete", "stopped"].includes(state.status) && <button disabled={busy} onClick={() => act("stop")}><Square size={13}/>停止</button>}{busy && <span className="muted"><span className="spinner"/>正在保存执行状态</span>}</div>
        </section>
        {state.warnings.length > 0 && <div className="warnings"><CircleAlert size={17}/><div>{Array.from(new Set(state.warnings)).map(w => <p key={w}>{w}</p>)}</div></div>}
        {state.report && <section className="report-card"><div className="section-heading"><h2><FileText size={18}/>研究备忘录</h2><button onClick={download}><Download size={15}/>导出 Markdown</button></div><h3>{state.report.title}</h3><p>{state.report.summary}</p><div className="claims">{state.report.claims.map((claim, i) => <div className="claim" key={i}><span className={`claim-kind ${claim.kind}`}>{{ fact: "事实", inference: "推断", uncertain: "不确定" }[claim.kind]}</span><p>{claim.text}<span className="citations">{claim.evidenceIds.map(id => <button key={id} onClick={() => { setEvidence(state.evidence.find(e => e.id === id) || null); setPanel(true); setTab("evidence"); }}>{id}</button>)}</span></p></div>)}</div><details><summary>研究边界与局限</summary>{state.report.limitations.map((l, i) => <p key={i}>{l}</p>)}</details>{state.status === "review" && <div className="review-footer"><span>请核验引用和原始字段，自动检查不等于语义正确。</span><button className="primary" disabled={busy} onClick={() => act("accept")}>完成复核</button></div>}</section>}
        {state.compressed && <details className="compact-card"><summary><Database size={16}/>上下文已压缩 · 原始证据保留</summary><pre>{JSON.stringify(JSON.parse(state.compressed), null, 2)}</pre></details>}
      </div>}</div>
      <footer className="main-footer"><span>X BUDDY / RESEARCH WORKSPACE</span><span>研究辅助，不构成投资建议</span></footer>
    </main>
    <aside className="inspector"><div className="inspector-heading"><Activity size={16}/><strong>研究上下文</strong></div><div className="inspector-tabs">{[["evidence", "证据"], ["trace", "运行"], ["checkpoints", "恢复"]].map(([id, title]) => <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}>{title}</button>)}</div>
      <div className="inspector-scroll">{tab === "evidence" ? <><div className="mini-heading">证据库 <span>{state?.evidence.length || 0}</span></div>{state?.evidence.length ? state.evidence.map(e => <button className={`evidence-card ${evidence?.id === e.id ? "chosen" : ""}`} key={e.id} onClick={() => setEvidence(e)}><div><span className="evidence-id">{e.id}</span><span className={`quality ${e.quality}`}>{{ ok: "可核验", missing: "有缺失", stale: "已过期", conflict: "有冲突" }[e.quality]}</span></div><strong>{e.title}</strong><small>{e.source}</small><span className="evidence-time"><Clock size={12}/>{e.asOf}</span></button>) : <div className="empty-evidence"><Database size={28}/><strong>每个结论，都有来路。</strong><p>执行研究后，来源、时点与原始字段会出现在这里。</p></div>}{evidence && <div className="evidence-detail"><h3>{evidence.id} · 原始证据</h3><dl><dt>来源</dt><dd>{evidence.source}</dd><dt>时点</dt><dd>{evidence.asOf}</dd><dt>单位</dt><dd>{evidence.unit}</dd><dt>口径</dt><dd>{evidence.scope}</dd><dt>获取时间</dt><dd>{evidence.retrievedAt}</dd></dl><pre>{JSON.stringify(evidence.raw, null, 2)}</pre></div>}<div className="model-budget"><div className="mini-heading">工作台模型预算</div><strong>{modelBudget?.calls || 0} / 15 次请求</strong><p>保守预占 ${modelBudget?.committedUsd.toFixed(4) || "0.0000"} / $1.00</p><small>跨线程累计；失败也占次数；达到任一上限即停止。</small><span>{caps?.modelName || "待配置模型"}</span></div><div className="provider-section"><div className="mini-heading">数据连接</div>{[["扶摇", caps?.providers.fuyao], ["iFinD MCP", caps?.providers.ifind], ["研究模型", caps?.model]].map(([name, enabled]) => <div className="provider" key={String(name)}><span><Database size={14}/>{name}</span><small>{enabled ? "已配置 · 待实测" : "未配置"}</small></div>)}<p>真实能力以成功调用为准。演示模式使用独立构造数据。</p></div></> : tab === "trace" ? <><div className="usage-grid"><div><Zap size={15}/><strong>{state?.usage.calls || 0}<small> / 12</small></strong><span>{state?.mode === "demo" ? "演示工具调用" : "逻辑调用"}</span></div><div><Clock size={15}/><strong>{((state?.usage.elapsedMs || 0) / 1000).toFixed(1)}<small> s</small></strong><span>累计执行</span></div></div><div className="token-usage">Token {state?.usage.tokens || 0} / 12,000 <span>演示不消耗模型 Token</span></div><div className="mini-heading">执行轨迹</div><div className="trace-list">{state?.traces.slice().reverse().map(t => <div key={t.id} className="trace-entry"><span className="trace-point"/><strong>{t.event}</strong><p>{t.detail}</p><small>{new Date(t.time).toLocaleTimeString("zh-CN")}{t.latencyMs !== undefined ? ` · ${t.latencyMs} ms` : ""}</small></div>)}</div></> : <><div className="mini-heading">持久化检查点</div><p className="inspector-note">每一步保存到数据库。暂停后可恢复历史状态，累计消耗不会清零。</p>{cps.map(cp => <div className="checkpoint" key={cp.id}><div><strong>检查点 v{cp.revision}</strong><small>{new Date(cp.created).toLocaleTimeString("zh-CN")}</small></div><button aria-label={`恢复检查点 ${cp.revision}`} disabled={busy || !state || ["planning", "running", "approval"].includes(state.status)} onClick={() => act("restore", { checkpoint: cp.id })}><RotateCcw size={15}/></button></div>)}</>}</div>
      <div className="inspector-foot"><ShieldCheck size={15}/>只读权限 · 执行前确认</div>
    </aside>
    {memoryOpen && <div className="modal-backdrop"><section className="memory-modal" role="dialog" aria-modal="true" aria-labelledby="memory-title"><div className="section-heading"><h2 id="memory-title">研究记忆</h2><button aria-label="关闭" onClick={() => setMemoryOpen(false)}><X size={18}/></button></div><p>保存长期研究偏好，新建研究时会载入。不要填写账号、密钥或真实持仓隐私。</p><textarea aria-label="长期研究偏好" maxLength={1000} value={memory} onChange={e => setMemory(e.target.value)} placeholder="例如：优先看经营现金流；引用数据时注明报告期和单位。"/><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>我确认将这些偏好保存到个人研究记忆</label><button className="primary" disabled={!confirmed || busy} onClick={async () => { const result = await act("memory", { text: memory, confirmed }); if (result) setMemoryOpen(false); }}>确认保存{!memory.trim() ? "（清空记忆）" : ""}</button></section></div>}
  </div>;
}
