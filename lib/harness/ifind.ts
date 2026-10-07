import type { Evidence, RunState } from "./types.ts";
export function ifindEvidence(result: { structuredContent?: unknown; content?: { type: string; text?: string }[] }, targets: RunState["targets"], now = Date.now()): Omit<Evidence, "id"> {
  let decoded: any = result.structuredContent;
  if (!decoded) {
    const text = result.content?.filter(c => c.type === "text").map(c => c.text || "").join("\n");
    try { decoded = text ? JSON.parse(text) : {}; } catch { decoded = { text }; }
  }
  // iFinD stock MCP uses code=1 for success; Fuyao's code=0 contract does not apply.
  if (typeof decoded?.code === "number" && decoded.code !== 1) throw new Error(`iFinD 业务请求未成功（code=${decoded.code}）。`);
  const answer = decoded?.data?.answer;
  const warnings = ["iFinD 返回最新一期指标检索结果，未提供数据更新时间与公告原文链接；只能作为待核验上下文，不能据此断言近期事件完整性。", "MRQ 披露日期不等于用户选择的年度报告期。"];
  if (typeof answer !== "string" || !answer.trim()) warnings.push("未返回可核验披露数据，不能推断不存在事件。");
  const present = new Set((typeof answer === "string" ? answer : "").match(/\b\d{6}\.(?:SH|SZ|BJ)\b/g) || []);
  const missing = targets?.symbols.filter(s => !present.has(s)) || [];
  if (missing.length) warnings.push(`检索结果未覆盖 ${missing.join("、")}。`);
  return { tool: "news_context", title: "iFinD 披露日期核验", source: "iFinD MCP · get_stock_events", asOf: "未知（返回中未提供数据更新时间）", retrievedAt: new Date(now).toISOString(), unit: "披露日期：原始 YYYYMMDD 字符串；其他字段按原始返回保留", scope: `${targets?.symbols.join(",") || "查询标的"}；最新一期 MRQ 的报告披露日期核验；非完整新闻库，非指定年度利润表`, raw: { decoded, response: result }, demo: false, quality: "missing", warnings };
}
