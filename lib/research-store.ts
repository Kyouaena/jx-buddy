import { env } from "cloudflare:workers";
import type { RunState } from "./harness/types";
export function database() { if (!env.DB) throw new Error("研究数据库暂不可用，请稍后重试；你的输入不会被清空。"); return env.DB; }
export async function load(owner: string, id: string) {
  const row = await database().prepare("SELECT state FROM research_threads WHERE owner = ? AND id = ?").bind(owner, id).first<{ state: string }>();
  if (!row) throw new Error("研究线程不存在。"); return JSON.parse(row.state) as RunState;
}
export async function insert(owner: string, s: RunState) {
  const db = database(); const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO research_threads (id, owner, goal, state, revision, updated, lease_until) VALUES (?, ?, ?, ?, 0, ?, 0)").bind(s.id, owner, s.goal, JSON.stringify(s), now),
    db.prepare("INSERT INTO research_checkpoints (id, thread_id, owner, revision, state, created) VALUES (?, ?, ?, 0, ?, ?)").bind(crypto.randomUUID(), s.id, owner, JSON.stringify(s), now),
  ]);
}
export async function withLease(owner: string, id: string, expected: number, fn: (s: RunState) => Promise<RunState>) {
  const db = database(); const lease = crypto.randomUUID(); const now = Date.now();
  const acquired = await db.prepare("UPDATE research_threads SET lease = ?, lease_until = ? WHERE id = ? AND owner = ? AND revision = ? AND lease_until < ?").bind(lease, now + 90000, id, owner, expected, now).run();
  if (!acquired.meta.changes) throw new Error("线程正在执行或已更新，请刷新后再操作。");
  try {
    const s = await load(owner, id); const next = await fn(s); next.revision = s.revision + 1;
    await db.batch([
      db.prepare("INSERT INTO research_checkpoints (id, thread_id, owner, revision, state, created) SELECT ?, id, owner, ?, ?, ? FROM research_threads WHERE id = ? AND owner = ? AND lease = ?").bind(crypto.randomUUID(), next.revision, JSON.stringify(next), Date.now(), id, owner, lease),
      db.prepare("UPDATE research_threads SET state = ?, revision = ?, updated = ?, lease = NULL, lease_until = 0 WHERE id = ? AND owner = ? AND lease = ?").bind(JSON.stringify(next), next.revision, Date.now(), id, owner, lease),
    ]);
    return next;
  } finally { await db.prepare("UPDATE research_threads SET lease = NULL, lease_until = 0 WHERE id = ? AND owner = ? AND lease = ?").bind(id, owner, lease).run(); }
}
