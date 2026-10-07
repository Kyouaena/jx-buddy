import { mappedProviderEnabled } from "./provider-policy";
import { env } from "cloudflare:workers";
import { registry } from "./engine";
import type { Runtime, ToolName, Evidence } from "./types";
import { fetchFuyao } from "./fuyao";
import { invokeMCP } from "./mcp";
import { ifindEvidence } from "./ifind";
import { reserveModelCall, recordModelCost } from "../model-budget";
import { estimatedUsageMicroUsd, MAX_OUTPUT_TOKENS, modelPrices } from "./model-policy";
type Mapping = { provider: "fuyao" | "ifind"; name: string; arguments: Record<string, unknown>; readOnly: true; asOfField: string; unit: string; scope: string; maxAgeDays: number; description?: string };
const config = (): Record<string, string> => { const c = env as unknown as Record<string, string>; return { ...c, LLM_API_KEY: c.OPENAI_API_KEY || c.LLM_API_KEY, LLM_MODEL: c.OPENAI_MODEL || c.LLM_MODEL || "gpt-6-luna" }; };
export function availability(ifindDiagnostic = false) {
  const c = config(); let map: Partial<Record<ToolName, Mapping>> = {};
  try { const parsed = JSON.parse(c.FINANCIAL_TOOL_MAP || "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) map = parsed; } catch { /* Invalid configuration disables tools. */ }
  const mapped = (name: ToolName) => { const m = map[name]; return !!m && mappedProviderEnabled(m.provider, true, c.IFIND_MCP_ENABLED, ifindDiagnostic) && ["fuyao", "ifind"].includes(m.provider) && m.readOnly === true && typeof m.name === "string" && !!m.name && !!c[`${m.provider.toUpperCase()}_MCP_URL`]; };
  return { model: !!(c.LLM_API_KEY && c.LLM_MODEL && c.LLM_MODEL in modelPrices), modelName: c.LLM_MODEL || "gpt-6-luna", tools: registry.map(t => ({ ...t, description: c.FUYAO_API_KEY && t.name === "market_snapshot" ? "A 股最新估值快照：PE TTM/MRQ、PB MRQ、PS TTM、PCF TTM，不含股价" : c.FUYAO_API_KEY && t.name === "financial_comparison" ? "指定年度合并利润表：营收、利润、EPS；金额元，EPS元/股" : map[t.name]?.description || t.description, enabled: (!!c.FUYAO_API_KEY && t.name !== "news_context") || mapped(t.name) })), ifindStatus: !c.IFIND_MCP_URL ? "unconfigured" : c.IFIND_MCP_ENABLED === "true" ? "enabled" : "unavailable", providers: { fuyao: !!(c.FUYAO_API_KEY || c.FUYAO_MCP_URL), ifind: !!c.IFIND_MCP_URL } };
}
function endpoint(url: string) {
  const u = new URL(url); if (u.protocol !== "https:" || u.username || u.password) throw new Error("服务地址需为不含账号密码的 HTTPS URL。"); return u;
}
export async function readLimited(response: Response, limit = 180000): Promise<string> {
  const reader = response.body?.getReader(); if (!reader) return "";
  let total = 0; let text = ""; const decoder = new TextDecoder();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > limit) throw new Error("工具输出超过大小上限，需缩小查询范围。"); text += decoder.decode(value, { stream: true }); } return text + decoder.decode(); }
  finally { await reader.cancel().catch(() => {}); }
}
export function runtime(ifindDiagnostic = false): Runtime {
  const c = config(); const available = availability(ifindDiagnostic);
  return { tools: available.tools, model: available.model,
    async modelJSON(prompt) {
      if (!available.model) throw new Error("模型未配置。");
      const instructions = "只输出合法 JSON。区分事实、推断、不确定性，证据不足时明确说明。";
      // Reserve globally before touching the paid endpoint; never automatically retry.
      await reserveModelCall(`${instructions}\n${prompt}`, c.LLM_MODEL);
      const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${c.LLM_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: c.LLM_MODEL, instructions, input: prompt, max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort: c.LLM_MODEL === "gpt-6.1-sol" ? "low" : "none" }, text: { format: { type: "json_object" } }, store: false, service_tier: "default" }), signal: AbortSignal.timeout(25000), redirect: "manual" });
      if (!response.ok) {
        let errorCode = "unknown";
        try { const failure = JSON.parse(await readLimited(response, 16000)); const code = failure.error?.code; if (typeof code === "string" && /^[a-z_]{1,60}$/.test(code)) errorCode = code; } catch { /* Never echo provider text that could contain keys. */ }
        throw new Error(`模型服务 HTTP ${response.status} (${errorCode})，已保留检查点。`);
      }
      const body = JSON.parse(await readLimited(response, 100000));
      const inputTokens = body.usage?.input_tokens; const outputTokens = body.usage?.output_tokens;
      const cost = estimatedUsageMicroUsd(inputTokens, outputTokens, c.LLM_MODEL);
      await recordModelCost(cost);
      if (body.status !== "completed") throw new Error("模型输出未完整完成，已计入预算并保留检查点。");
      const content = body.output?.filter((item: { type: string }) => item.type === "message").flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || []).filter((item: { type: string }) => item.type === "output_text").map((item: { text: string }) => item.text).join("");
      if (!content) throw new Error("模型未返回 JSON 文本内容。");
      if (typeof body.usage?.total_tokens !== "number") throw new Error("模型服务没有用量字段，无法执行 Token 预算控制。");
      return { value: JSON.parse(content), tokens: body.usage.total_tokens };
    },
    async callTool(name, goal, targets) {
      if (!available.tools.find(t => t.name === name)?.enabled) throw new Error("工具未配置或未批准为只读。");
      if (c.FUYAO_API_KEY && name !== "news_context") return fetchFuyao(name, targets, c.FUYAO_API_KEY);
      const mapping = JSON.parse(c.FINANCIAL_TOOL_MAP)[name] as Mapping; const prefix = mapping.provider.toUpperCase();
      const args = JSON.parse(JSON.stringify(mapping.arguments).replaceAll("{{goal}}", JSON.stringify(goal).slice(1,-1)).replaceAll("{{symbols}}", targets?.symbols.join(",") || ""));
      const result = await invokeMCP(c[`${prefix}_MCP_URL`], c[`${prefix}_MCP_TOKEN`], prefix === "IFIND" && c.IFIND_MCP_AUTH_STYLE === "raw" ? "raw" : "bearer", mapping.name, args);
      if (mapping.provider === "ifind" && mapping.name === "get_stock_events") return ifindEvidence(result, targets);
      const raw = result.structuredContent || result.content;
      const asOfValue = mapping.asOfField.split(".").reduce((v: any, key) => v?.[key], raw);
      const asOf = typeof asOfValue === "string" ? asOfValue : "未知"; const stamp = Date.parse(asOf); const age = (Date.now() - stamp) / 86400000;
      const warnings: string[] = [];
      if (!Number.isFinite(stamp)) warnings.push("原始数据缺少可解析的时点字段。");
      if (!mapping.unit || !mapping.scope) warnings.push("单位或统计口径未配置。");
      if (raw === undefined || raw === null || (Array.isArray(raw) && !raw.length)) warnings.push("金融服务未返回数据。");
      if (JSON.stringify(raw).includes(":null")) warnings.push("原始输出包含缺失字段，需人工核验。");
      const quality: Evidence["quality"] = warnings.length ? "missing" : !Number.isFinite(mapping.maxAgeDays) || age > mapping.maxAgeDays || age < -1 ? "stale" : "ok";
      if (quality === "stale") warnings.push("数据超过配置的有效期或时点异常。");
      return { tool: name, title: registry.find(t => t.name === name)!.description, source: `${mapping.provider} MCP · ${mapping.name}`, asOf, retrievedAt: new Date().toISOString(), unit: mapping.unit || "未知", scope: mapping.scope || "未知", raw, demo: false, quality, warnings };
    },
  };
}
