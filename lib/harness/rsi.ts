import type { Report, Finding } from "./types.ts";
export const RSI_MAX_REVIEWS = 2;
export const RSI_MAX_REVISIONS = 1;
export function parseDraft(value: unknown): Report {
  if (!value || typeof value !== "object") throw new Error("RSI 草稿格式错误。");
  const r = value as Report;
  if (typeof r.title !== "string" || r.title.length > 300 || typeof r.summary !== "string" || r.summary.length > 4000 || !Array.isArray(r.claims) || !r.claims.length || r.claims.length > 20 || !Array.isArray(r.limitations) || r.limitations.length > 20 || !r.limitations.every(x => typeof x === "string" && x.length < 2000)) throw new Error("RSI 草稿结构或大小无效。");
  for (const c of r.claims) if (!c || !["fact","inference","uncertain"].includes(c.kind) || typeof c.text !== "string" || c.text.length > 2000 || !Array.isArray(c.evidenceIds) || !c.evidenceIds.every(x => typeof x === "string")) throw new Error("RSI 草稿结论结构无效。");
  return structuredClone(r);
}
export function parseFindings(value: unknown, claims: number): Finding[] {
  if (!value || typeof value !== "object" || !Array.isArray((value as { findings: unknown }).findings)) throw new Error("RSI 自检反馈格式无效。");
  const f = (value as { findings: Finding[] }).findings;
  if (f.length > 5) throw new Error("RSI 反馈超过限定范围。");
  for (const item of f) if (!item || !Number.isInteger(item.claimIndex) || item.claimIndex < -1 || item.claimIndex >= claims || !["citation","unit","time","unsupported","compliance"].includes(item.category) || typeof item.detail !== "string" || !item.detail.trim() || item.detail.length > 600) throw new Error("RSI 反馈字段不在允许范围。");
  return structuredClone(f);
}
