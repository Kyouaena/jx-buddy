import type { Evidence, RunState, ToolName } from "./types.ts";
type Row = Record<string, unknown>;
type Envelope = { code: number; request_id?: string; data: { timestamp?: number | null; item: Row[]; total?: number } };
export function validateTargets(value: unknown): NonNullable<RunState["targets"]> {
  if (!value || typeof value !== "object") throw new Error("真实研究需要明确股票代码与报告年份。");
  const { symbols, reportYear } = value as { symbols: unknown; reportYear: unknown };
  if (!Array.isArray(symbols) || symbols.length < 1 || symbols.length > 3 || !symbols.every(s => typeof s === "string" && /^\d{6}\.(SH|SZ|BJ)$/.test(s))) throw new Error("请输入 1–3 个完整 A 股代码，例如 600519.SH。");
  if (!Number.isInteger(reportYear) || Number(reportYear) < 2000 || Number(reportYear) >= new Date().getUTCFullYear()) throw new Error("年度报告年份需在 2000 年至上一年之间。");
  return { symbols: [...new Set(symbols as string[])], reportYear: Number(reportYear) };
}
export function parseEnvelope(value: unknown): Envelope {
  if (!value || typeof value !== "object") throw new Error("扶摇返回格式错误。");
  const body = value as Envelope;
  if (body.code !== 0) {
    const reason: Record<number, string> = { 2001: "密钥缺失或无效", 2003: "该接口权限未开通", 4001: "调用频率超限", 5002: "上游超时", 5003: "上游不可用" };
    throw new Error(`扶摇业务错误 ${Number.isInteger(body.code) ? body.code : "未知"}：${reason[body.code] || "请求未成功"}。`);
  }
  if (!body.data || !Array.isArray(body.data.item) || !body.data.item.every(item => item && typeof item === "object" && !Array.isArray(item))) throw new Error("扶摇成功响应缺少 data.item 数据列表。");
  return body;
}
async function readJSON(response: Response) {
  const reader = response.body?.getReader(); if (!reader) throw new Error("扶摇响应为空。");
  let bytes = 0; let text = ""; const decoder = new TextDecoder();
  try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 100000) throw new Error("扶摇返回超过 100 KB，请缩小查询。"); text += decoder.decode(value, { stream: true }); } return JSON.parse(text + decoder.decode()); }
  finally { await reader.cancel().catch(() => {}); }
}
export async function fetchFuyao(name: ToolName, targetValue: RunState["targets"], apiKey: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Omit<Evidence, "id">> {
  if (!apiKey) throw new Error("扶摇 API Key 尚未配置。");
  const targets = validateTargets(targetValue);
  if (name !== "market_snapshot" && name !== "financial_comparison") throw new Error("扶摇资讯事件库尚未开放外部接入，请配置其他可用资讯工具。");
  const endpoint = name === "market_snapshot" ? "/api/a-share/valuations/snapshot" : "/api/a-share/financials/income-statements";
  const requests = name === "market_snapshot" ? [{ thscodes: targets.symbols.join(",") }] : targets.symbols.map(thscode => ({ thscode, period: "annual", limit: "5" }));
  const outputs: { requested: Row; response: Envelope }[] = [];
  for (const parameters of requests) {
    const url = new URL(endpoint, "https://fuyao.aicubes.cn");
    Object.entries(parameters).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, v); });
    let response;
    try { response = await fetcher(url, { headers: { "X-api-key": apiKey, Accept: "application/json" }, signal: AbortSignal.timeout(10000), redirect: "manual" }); }
    catch { throw new Error("扶摇请求失败或超时，检查点已保留；未生成替代数据。"); }
    if (!response.ok) throw new Error(`扶摇 HTTP ${response.status}；未生成替代数据。`);
    const parsed = parseEnvelope(await readJSON(response));
    if (parsed.data.item.some(row => typeof row.thscode !== "string" || !targets.symbols.includes(row.thscode) || ("thscode" in parameters && row.thscode !== parameters.thscode))) throw new Error("扶摇响应标的与请求不一致，已拒绝引用。");
    outputs.push({ requested: parameters, response: parsed });
  }
  const rows = outputs.flatMap(o => o.response.data.item).filter(row => name === "market_snapshot" || (row.fiscal_year === targets.reportYear && row.period === "annual"));
  const warnings: string[] = [];
  const absent = targets.symbols.filter(code => !rows.some(row => row.thscode === code));
  if (absent.length) warnings.push(`缺少 ${absent.join("、")} 的${name === "financial_comparison" ? `${targets.reportYear} 年度` : "估值"}数据。`);
  const fields = name === "market_snapshot" ? ["pe_ttm", "pe_mrq", "pb_mrq", "ps_ttm", "pcf_ttm"] : ["operating_income", "operating_profit", "net_profit", "parent_holder_net_profit", "basic_eps"];
  if (rows.some(row => fields.some(f => typeof row[f] !== "number" || !Number.isFinite(row[f])))) warnings.push("所需数值字段缺失或无效；缺失值不补零。");
  if (name === "financial_comparison" && rows.some(row => row.currency !== "CNY")) warnings.push("币种缺失或不是人民币，不能直接比较。");
  if (targets.symbols.some(code => rows.filter(row => row.thscode === code).length > 1)) warnings.push("同一标的返回多份所选报告期记录，需核验冲突。");
  const timestamps = name === "market_snapshot" ? outputs.map(o => o.response.data.timestamp) : rows.map(row => row.period_end_ms);
  const dates = timestamps.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0);
  if (!dates.length || dates.length !== timestamps.length) warnings.push("时点元数据缺失或无效。");
  const date = dates.length ? Math.min(...dates) : NaN;
  const stale = name === "market_snapshot" && Number.isFinite(date) && (now - date > 14 * 86400000 || date > now + 86400000);
  const quality: Evidence["quality"] = warnings.length ? "missing" : stale ? "stale" : "ok";
  if (stale) warnings.push("估值元数据超过 14 个日历日或晚于当前时点，不能作为当前正常事实。");
  return { tool: name, title: name === "market_snapshot" ? "A 股最新估值快照" : `${targets.reportYear} 年合并利润表比较`, source: `扶摇 REST · GET ${endpoint}`, asOf: Number.isFinite(date) ? new Date(date).toISOString() : "未知", retrievedAt: new Date(now).toISOString(), unit: name === "market_snapshot" ? "PE／PB／PS／PCF：倍；保留 TTM／MRQ 口径" : "金额：人民币元；basic_eps：元／股，不做亿元换算", scope: name === "market_snapshot" ? `${targets.symbols.join(",")}；最新快照；data.timestamp 是上游元数据时间，非每只股票更新时间` : `${targets.symbols.join(",")}；${targets.reportYear} 年度合并利润表；报告期末按 Asia/Shanghai；report_date_ms 为披露日期；历史年度数据不代表最新经营状态`, raw: { documentation: name === "market_snapshot" ? "https://fuyao.aicubes.cn/docs/api-reference/valuations/" : "https://fuyao.aicubes.cn/docs/api-reference/financials/", targets, selectedRows: rows, responses: outputs }, demo: false, quality, warnings };
}
