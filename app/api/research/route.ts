import { getChatGPTUser } from "../../chatgpt-auth";
import { createState, advance, control, registry, trace } from "../../../lib/harness/engine";
import { availability, runtime } from "../../../lib/harness/runtime";
import { database, insert, load, withLease } from "../../../lib/research-store";
import type { RunState } from "../../../lib/harness/types";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status });
function problem(e: unknown) { const message = e instanceof Error ? e.message : "研究服务暂不可用。"; return json({ error: message }, /不存在/.test(message) ? 404 : /线程正在/.test(message) ? 409 : 400); }
export async function GET(request: Request) {
  const user = await getChatGPTUser(); if (!user) return json({ error: "请先登录。" }, 401);
  try {
    const query = new URL(request.url).searchParams; const id = query.get("id");
    if (id) { const state = await load(user.userId, id); const cps = await database().prepare("SELECT id, revision, created FROM research_checkpoints WHERE thread_id = ? AND owner = ? ORDER BY revision DESC LIMIT 20").bind(id, user.userId).all(); return json({ state, checkpoints: cps.results }); }
    const rows = await database().prepare("SELECT id, goal, state, updated FROM research_threads WHERE owner = ? ORDER BY updated DESC LIMIT 50").bind(user.userId).all<{ id: string; goal: string; state: string; updated: number }>();
    const memory = await database().prepare("SELECT text FROM research_memories WHERE owner = ?").bind(user.userId).first<{ text: string }>();
    return json({ threads: rows.results.map(r => ({ id: r.id, goal: r.goal, status: JSON.parse(r.state).status, mode: JSON.parse(r.state).mode, updated: r.updated })), memory: memory?.text || "", capabilities: availability(), registry });
  } catch (e) { return problem(e); }
}
export async function POST(request: Request) {
  const user = await getChatGPTUser(); if (!user) return json({ error: "请先登录。" }, 401);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "请求来源不匹配。" }, 403);
  try {
    if (Number(request.headers.get("content-length") || 0) > 12000) throw new Error("请求过大。");
    const text = await request.text(); if (text.length > 12000) throw new Error("请求过大。"); const body = JSON.parse(text);
    if (body.action === "create") {
      if (!["demo", "live"].includes(body.mode) || typeof body.goal !== "string") throw new Error("研究参数无效。");
      const fault = body.mode === "demo" ? body.fault || "none" : "none";
      if (!["none", "tool_failure", "missing_data", "stale_data"].includes(fault)) throw new Error("演示场景无效。");
      const memory = await database().prepare("SELECT text FROM research_memories WHERE owner = ?").bind(user.userId).first<{ text: string }>();
      const s = createState(body.goal, body.mode, memory?.text || "", fault); await insert(user.userId, s); return json({ state: s });
    }
    if (body.action === "memory") {
      if (typeof body.text !== "string" || body.text.length > 1000 || body.confirmed !== true) throw new Error("记忆需用户确认且不超过 1000 字。");
      await database().prepare("INSERT INTO research_memories (owner, text, updated) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET text = excluded.text, updated = excluded.updated").bind(user.userId, body.text.trim(), Date.now()).run(); return json({ memory: body.text.trim() });
    }
    if (typeof body.id !== "string" || !Number.isInteger(body.revision)) throw new Error("缺少线程或版本信息。");
    const next = await withLease(user.userId, body.id, body.revision, async s => {
      if (body.action === "tick") { const rt = runtime(); if (s.mode === "demo") rt.tools = registry; return advance(s, rt); }
      if (body.action === "restore") {
        if (!["paused", "failed", "stopped", "review", "complete"].includes(s.status)) throw new Error("请先暂停研究，再恢复历史检查点。");
        const cp = await database().prepare("SELECT state FROM research_checkpoints WHERE id = ? AND thread_id = ? AND owner = ?").bind(body.checkpoint, s.id, user.userId).first<{ state: string }>();
        if (!cp) throw new Error("检查点不存在。"); const restored = JSON.parse(cp.state) as RunState;
        restored.usage = s.usage;
        if (["planning", "running"].includes(restored.status)) restored.status = "paused";
        trace(restored, "checkpoint.restored", "已恢复历史状态；累计消耗保留，等待用户继续。"); return restored;
      }
      return control(s, body.action);
    }); return json({ state: next });
  } catch (e) { return problem(e); }
}
