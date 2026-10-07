import { createState, advance, control, registry, trace } from './harness/engine.ts';
import type { RunState, Runtime } from './harness/types.ts';

type Storage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
type Snapshot = { id: string; revision: number; created: number; state: RunState };
type Data = { memory: string; threads: Record<string, { state: RunState; updated: number; checkpoints: Snapshot[] }> };
const KEY = 'jx-buddy-guest-v1';
// This adapter has no network or provider imports. Browser state never authenticates an API request.
export function guestWorkspace(storage: Storage) {
  let busy = false;
  const rt: Runtime = { tools: registry, model: false, callTool: async () => { throw new Error('游客禁止真实工具调用。'); }, modelJSON: async () => { throw new Error('游客禁止付费模型调用。'); } };
  function read(): Data {
    const raw = storage.getItem(KEY); if (!raw) return { memory: '', threads: {} };
    const d = JSON.parse(raw) as Data;
    if (!d || typeof d.memory !== 'string' || !d.threads || Object.keys(d.threads).length > 30) throw new Error('游客本地记录无效。');
    return d;
  }
  function save(d: Data) {
    const value = JSON.stringify(d); if (value.length > 2000000) throw new Error('游客记录已满，请删除部分研究。');
    storage.setItem(KEY, value);
  }
  return async function request(body?: Record<string, unknown>, query = '') {
    if (busy) throw new Error('游客线程正在执行，请稍后再操作。'); busy = true;
    try {
      const d = read(); let state: RunState | undefined;
      const id = typeof body?.id === 'string' ? body.id : new URLSearchParams(query).get('id');
      const row = id ? d.threads[id] : undefined;
      if (id && (!row || row.state.mode !== 'demo')) throw new Error('游客研究不存在。');
      if (!body) state = row?.state;
      else if (body.action === 'create') {
        if (body.mode !== 'demo') throw new Error('游客仅支持构造数据演示，真实研究请登录。');
        if (Object.keys(d.threads).length >= 30) throw new Error('游客最多保存30条研究，请先删除部分记录。');
        if (typeof body.goal !== 'string' || !['none','tool_failure','missing_data','stale_data'].includes(String(body.fault))) throw new Error('演示参数无效。');
        state = createState(body.goal, 'demo', d.memory, body.fault as RunState['fault']);
        d.threads[state.id] = { state, updated: Date.now(), checkpoints: [] };
      } else if (body.action === 'memory') {
        if (body.confirmed !== true || typeof body.text !== 'string' || body.text.length > 1000) throw new Error('记忆需确认且不超过1000字。');
        d.memory = body.text.trim();
      } else {
        if (!row || body.revision !== row.state.revision) throw new Error('线程已更新，请重新加载。');
        state = structuredClone(row.state);
        if (body.action === 'delete') {
          if (body.confirmed !== true || ['planning','running'].includes(state.status)) throw new Error('请先停止研究并确认删除。');
          delete d.threads[state.id]; state = undefined;
        } else if (['archive','unarchive'].includes(String(body.action))) {
          if (['planning','running'].includes(state.status)) throw new Error('请先暂停或停止研究。');
          state.archived = body.action === 'archive';
        } else {
          if (state.archived) throw new Error('请先恢复已归档线程。');
          if (body.action === 'tick') state = await advance(state, rt);
          else if (body.action === 'restore') {
            if (!['paused','failed','stopped','review','complete'].includes(state.status)) throw new Error('请先暂停研究。');
            const cp = row.checkpoints.find(c => c.id === body.checkpoint); if (!cp) throw new Error('检查点不存在。');
            const usage = state.usage; state = structuredClone(cp.state); state.usage = usage;
            if (['planning','running'].includes(state.status)) state.status = 'paused';
            trace(state, 'checkpoint.restored', '游客恢复本地检查点，累计消耗保留。');
          } else state = control(state, String(body.action));
        }
        if (state) state.revision = row.state.revision + 1;
      }
      if (body) {
        if (state) {
          const target = d.threads[state.id]; target.state = state; target.updated = Date.now();
          target.checkpoints.unshift({ id: crypto.randomUUID(), revision: state.revision, created: Date.now(), state: structuredClone(state) });
          target.checkpoints = target.checkpoints.slice(0, 20);
        }
        save(d);
      }
      return { state, memory: d.memory, checkpoints: state ? d.threads[state.id].checkpoints.map(({ id, revision, created }) => ({ id, revision, created })) : [],
        threads: Object.values(d.threads).sort((a,b) => b.updated-a.updated).map(({ state: s, updated }) => ({ id:s.id, goal:s.goal, status:s.status, mode:s.mode, revision:s.revision, archived:!!s.archived, updated })),
        capabilities: { model:false, modelName:'游客构造演示 · 不调用模型', tools:registry, providers:{ fuyao:false, ifind:false } },
        modelBudget: { calls:0, maxCalls:40, committedUsd:0, observedUsd:0, maxUsd:1 } };
    } finally { busy = false; }
  };
}
