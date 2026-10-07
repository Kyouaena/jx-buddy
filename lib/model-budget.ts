import { database } from "./research-store";
import { env } from "cloudflare:workers";
import { BUDGET_RESERVE_SQL, MAX_MODEL_CALLS, MAX_MICRO_USD, estimateReservation } from "./harness/model-policy";
const budgetId = "openai-evaluation-v1";
function initialUsage() {
  const c = env as unknown as Record<string, string>;
  const calls = Number(c.MODEL_PREUSED_CALLS || 0), committed = Number(c.MODEL_PRECOMMITTED_MICRO_USD || 0), observed = Number(c.MODEL_PREOBSERVED_MICRO_USD || 0);
  if (![calls, committed, observed].every(x => Number.isInteger(x) && x >= 0) || calls > MAX_MODEL_CALLS || committed > MAX_MICRO_USD) throw new Error("模型预算迁移配置无效，拒绝付费调用。");
  return { calls, committed, observed };
}
export async function budgetStatus() {
  const row = await database().prepare("SELECT calls, committed_micro_usd, observed_micro_usd FROM model_budget WHERE id = ?").bind(budgetId).first<{ calls: number; committed_micro_usd: number; observed_micro_usd: number }>();
  const initial = initialUsage();
  return { calls: row?.calls ?? initial.calls, maxCalls: MAX_MODEL_CALLS, committedUsd: (row?.committed_micro_usd ?? initial.committed) / 1000000, observedUsd: (row?.observed_micro_usd ?? initial.observed) / 1000000, maxUsd: MAX_MICRO_USD / 1000000 };
}
export async function reserveModelCall(prompt: string, model: string) {
  const reservation = estimateReservation(prompt, model); const db = database();
  const initial = initialUsage();
  await db.prepare("INSERT OR IGNORE INTO model_budget (id, calls, committed_micro_usd, observed_micro_usd, updated) VALUES (?, ?, ?, ?, ?)").bind(budgetId, initial.calls, initial.committed, initial.observed, Date.now()).run();
  const result = await db.prepare(BUDGET_RESERVE_SQL).bind(reservation.reservationMicroUsd, Date.now(), budgetId, MAX_MODEL_CALLS, reservation.reservationMicroUsd, MAX_MICRO_USD).run();
  if (!result.meta.changes) throw new Error(`工作台累计模型请求已达 ${MAX_MODEL_CALLS} 次，或下一次请求可能超过 $1 保守预算，已阻止调用。`);
  return reservation;
}
export async function recordModelCost(microUsd: number) {
  await database().prepare("UPDATE model_budget SET observed_micro_usd = observed_micro_usd + ?, updated = ? WHERE id = ?").bind(microUsd, Date.now(), budgetId).run();
}
