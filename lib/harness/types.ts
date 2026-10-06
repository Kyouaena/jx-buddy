export type Mode = "demo" | "live";
export type Status = "planning" | "approval" | "running" | "paused" | "failed" | "review" | "complete" | "stopped";
export type ToolName = "market_snapshot" | "financial_comparison" | "news_context";
export type Task = { id: string; title: string; tool: ToolName; status: "pending" | "done" | "failed"; attempts: number; error?: string };
export type Evidence = { id: string; tool: ToolName; title: string; source: string; asOf: string; retrievedAt: string; unit: string; scope: string; raw: unknown; demo: boolean; quality: "ok" | "missing" | "stale" | "conflict"; warnings: string[] };
export type Claim = { kind: "fact" | "inference" | "uncertain"; text: string; evidenceIds: string[] };
export type Report = { title: string; summary: string; claims: Claim[]; limitations: string[] };
export type Trace = { id: string; time: string; event: string; detail: string; latencyMs?: number };
export type RunState = {
  id: string; goal: string; mode: Mode; status: Status; phase: "plan" | "tools" | "compact" | "report";
  tasks: Task[]; evidence: Evidence[]; context: string[]; compressed: string; memory: string;
  traces: Trace[]; report: Report | null; warnings: string[]; revision: number;
  usage: { calls: number; tokens: number; elapsedMs: number }; budget: { calls: number; tokens: number; elapsedMs: number };
  fault: "none" | "tool_failure" | "missing_data" | "stale_data";
};
export type ToolRegistration = { name: ToolName; description: string; permission: "read"; enabled: boolean };
export type Runtime = { tools: ToolRegistration[]; model: boolean; callTool: (name: ToolName, goal: string) => Promise<Omit<Evidence, "id">>; modelJSON: (prompt: string) => Promise<{ value: unknown; tokens: number }> };
