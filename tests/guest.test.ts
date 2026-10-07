import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestWorkspace } from '../lib/guest-workspace.ts';

function setup() {
  const values = new Map<string,string>();
  const storage = { getItem: (k: string) => values.get(k) || null, setItem: (k: string,v: string) => { values.set(k,v); } };
  return { storage, request: guestWorkspace(storage) };
}
test('anonymous local harness completes approval, evidence, RSI and review without providers', async () => {
  const { request, storage } = setup();
  let { state: s } = await request({ action:'create',mode:'demo',goal:'比较虚构样本公司的财务与估值',fault:'none' });
  assert.ok(s);
  s = (await request({action:'tick',id:s.id,revision:s.revision})).state!;
  assert.equal(s.status,'approval'); assert.equal(s.evidence.length,0);
  s = (await request({action:'approve',id:s.id,revision:s.revision})).state!;
  for(let i=0;i<12 && s.status==='running';i++) s = (await request({action:'tick',id:s.id,revision:s.revision})).state!;
  assert.equal(s.status,'review');assert.equal(s.evidence.length,3);assert.ok(s.evidence.every(e=>e.demo));assert.equal(s.rsi?.status,'passed');
  s = (await request({action:'accept',id:s.id,revision:s.revision})).state!;
  assert.equal(s.status,'complete');
  const reload = guestWorkspace(storage);const reopened = await reload(undefined,`?id=${s.id}`);
  assert.equal(reopened.state?.status,'complete');assert.ok(reopened.checkpoints.length>0);
  assert.equal(reopened.capabilities.model,false);assert.equal(reopened.modelBudget.calls,0);
  await request({action:'archive',id:s.id,revision:s.revision});
  const archived = (await reload(undefined,`?id=${s.id}`)).state!;assert.equal(archived.archived,true);
  await assert.rejects(request({action:'tick',id:s.id,revision:archived.revision}),/归档/);
});
test('guest rejects live research and foreign threads; storage remains isolated', async () => {
  const a=setup();const b=setup();
  await assert.rejects(a.request({action:'create',mode:'live',goal:'真实财务查询',fault:'none'}),/游客仅支持/);
  const s=(await a.request({action:'create',mode:'demo',goal:'虚构研究',fault:'none'})).state!;
  assert.equal((await b.request()).threads.length,0);
  await assert.rejects(b.request(undefined,`?id=${s.id}`),/不存在/);
  await assert.rejects(a.request({action:'ifind_probe'}),/线程已更新/);
  await assert.rejects(a.request({action:'delete',id:s.id,revision:s.revision,confirmed:true}),/停止/);
});
