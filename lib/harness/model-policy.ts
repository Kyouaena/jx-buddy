// Standard, short-context prices checked against official model pages on 2026-10-06.
// Conservative input rate also covers the documented 1.25x cache-write rate.
export const modelPrices = { "gpt-6-luna": { input: 0.1, output: 0.5 }, "gpt-6.1-sol": { input: 2, output: 10 }, "gpt-5.6-luna": { input: 0.2, output: 1.2 } };
export const MAX_MODEL_CALLS = 15;
export const MAX_MICRO_USD = 1000000;
export const MAX_OUTPUT_TOKENS = 2200;
export function estimateReservation(prompt: string, model: string) {
  if (!(model in modelPrices)) throw new Error("该模型未登记已验证价格，拒绝付费调用。");
  const price = modelPrices[model as keyof typeof modelPrices];
  const bytes = new TextEncoder().encode(prompt).length;
  if (bytes > 28000) throw new Error("模型输入超过 28 KB 评测上限，请缩小研究或压缩证据。");
  const inputUpperBound = bytes + 2048;
  // No tools, images, history, or API-side caching directives are sent. BPE text tokens
  // are bounded conservatively by UTF-8 bytes plus message/framing allowance.
  const reservationMicroUsd = Math.ceil(inputUpperBound * price.input * 1.25 + MAX_OUTPUT_TOKENS * price.output);
  return { inputUpperBound, reservationMicroUsd, price };
}
export function estimatedUsageMicroUsd(inputTokens: number, outputTokens: number, model: string) {
  if (![inputTokens, outputTokens].every(x => Number.isInteger(x) && x >= 0) || !(model in modelPrices)) throw new Error("模型用量字段无效。");
  const price = modelPrices[model as keyof typeof modelPrices];
  return Math.ceil(inputTokens * price.input * 1.25 + outputTokens * price.output);
}
export const BUDGET_RESERVE_SQL = "UPDATE model_budget SET calls = calls + 1, committed_micro_usd = committed_micro_usd + ?, updated = ? WHERE id = ? AND calls < ? AND committed_micro_usd + ? <= ?";
