type Tool = { name: string; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean } };
type MCPResult = { isError?: boolean; structuredContent?: unknown; content?: { type: string; text?: string }[] };
export async function readRPC(response: Response, id: number, limit = 180000): Promise<any> {
  const reader = response.body?.getReader(); if (!reader) throw new Error("MCP 响应为空。");
  const sse = response.headers.get("content-type")?.includes("text/event-stream");
  const decoder = new TextDecoder(); let buffer = ""; let size = 0;
  const match = (value: any) => {
    if (value?.id !== id) return undefined;
    if (value.error) throw new Error(`MCP 协议错误 ${value.error.code || "未知"}。`);
    return { result: value.result };
  };
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; if (size > limit) throw new Error("MCP 输出超过大小上限。");
      buffer += decoder.decode(value, { stream: true });
      if (sse) {
        const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() || "";
        for (const block of blocks) {
          const data = block.split(/\r?\n/).filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).join("\n");
          if (!data) continue; let parsed; try { parsed = JSON.parse(data); } catch { continue; }
          const found = match(parsed); if (found) return found.result;
        }
      }
    }
    if (!sse) { let parsed; try { parsed = JSON.parse(buffer); } catch { throw new Error("MCP JSON 响应格式错误。"); } const found = match(parsed); if (found) return found.result; }
    throw new Error("MCP 响应缺少匹配的请求 ID。");
  } finally { await reader.cancel().catch(() => {}); }
}
export async function invokeMCP(url: string, token: string | undefined, authStyle: "raw" | "bearer", name: string, args: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<MCPResult> {
  let endpoint: URL; try { endpoint = new URL(url); } catch { throw new Error("MCP 服务地址配置无效。"); }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("MCP 服务地址必须为 HTTPS。");
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  if (token) headers.Authorization = authStyle === "raw" ? token : `Bearer ${token}`;
  async function rpc(method: string, params: unknown, id?: number) {
    const response = await fetcher(endpoint, { method: "POST", headers: { ...headers }, body: JSON.stringify({ jsonrpc: "2.0", ...(id === undefined ? {} : { id }), method, params }), signal: AbortSignal.timeout(method === "tools/call" ? 45000 : 10000), redirect: "manual" });
    if (!response.ok) throw new Error(`金融 MCP HTTP ${response.status}，未生成替代数据。`);
    const session = response.headers.get("Mcp-Session-Id"); if (session) headers["Mcp-Session-Id"] = session;
    if (id === undefined || response.status === 202) { await response.body?.cancel(); return {}; }
    return readRPC(response, id);
  }
  try {
    const initialized = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "investment-x-buddy", version: "0.2.0" } }, 1);
    headers["MCP-Protocol-Version"] = initialized.protocolVersion || "2025-06-18";
    await rpc("notifications/initialized", {});
    const list = await rpc("tools/list", {}, 2);
    const tool = list.tools?.find((t: Tool) => t.name === name);
    if (!tool) throw new Error("配置的工具未在 MCP 服务实际清单中出现。");
    if (tool.annotations?.readOnlyHint === false || tool.annotations?.destructiveHint === true) throw new Error("拒绝调用会修改数据的工具。");
    const result = await rpc("tools/call", { name, arguments: args }, 3);
    if (result.isError) throw new Error("金融 MCP 工具报告执行失败。"); return result;
  } finally {
    if (headers["Mcp-Session-Id"]) await fetcher(endpoint, { method: "DELETE", headers, signal: AbortSignal.timeout(2000), redirect: "manual" }).catch(() => {});
  }
}
