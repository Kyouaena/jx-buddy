import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchFuyao, parseEnvelope, validateTargets } from "../lib/harness/fuyao.ts";
import { estimateReservation, MAX_MODEL_CALLS, MAX_MICRO_USD, estimatedUsageMicroUsd } from "../lib/harness/model-policy.ts";
const targets = { symbols: ['600519.SH','000858.SZ'], reportYear:2025 };
const now = Date.parse('2026-10-06T03:00:00Z');
function envelope(rows: unknown[], timestamp:number = now){return {code:0,request_id:'test',data:{timestamp,item:rows}};}
const valuation=(code:string)=>({thscode:code,pe_ttm:20,pe_mrq:20,pb_mrq:3,ps_ttm:2,pcf_ttm:15});
test('Fuyao uses official allowlisted endpoint and X-api-key, preserves original response',async()=>{
 const fake: typeof fetch=async(input,init)=>{
  const url=new URL(String(input));assert.equal(url.origin,'https://fuyao.aicubes.cn');assert.equal(url.pathname,'/api/a-share/valuations/snapshot');
  assert.equal(url.searchParams.get('thscodes'),targets.symbols.join(','));assert.equal((init!.headers as Record<string,string>)['X-api-key'],'test-placeholder');
  return Response.json(envelope(targets.symbols.map(valuation)));
 };
 const result=await fetchFuyao('market_snapshot',targets,'test-placeholder',fake,now);
 assert.equal(result.demo,false);assert.equal(result.quality,'ok');assert.equal(result.asOf,new Date(now).toISOString());assert.ok(JSON.stringify(result.raw).includes('request_id'));
 assert.ok(!JSON.stringify(result).includes('test-placeholder'));
});
test('HTTP 200 with authentication business error is never treated as data',()=>{
 assert.throws(()=>parseEnvelope({code:2001,message:'invalid key'}),/密钥/);assert.throws(()=>parseEnvelope({code:2003}),/权限/);
});
test('empty, missing and stale valuations never become normal evidence',async()=>{
 const empty=await fetchFuyao('market_snapshot',targets,'test-placeholder',async()=>Response.json(envelope([])),now);assert.equal(empty.quality,'missing');
 const missing=await fetchFuyao('market_snapshot',targets,'test-placeholder',async()=>Response.json(envelope([{...valuation('600519.SH'),pe_ttm:null},valuation('000858.SZ')])),now);assert.equal(missing.quality,'missing');
 const stale=await fetchFuyao('market_snapshot',targets,'test-placeholder',async()=>Response.json(envelope(targets.symbols.map(valuation),now-15*86400000)),now);assert.equal(stale.quality,'stale');
});
test('annual comparison keeps same explicit year and original yuan/EPS units',async()=>{
 const fake: typeof fetch=async(input)=>{const url=new URL(String(input));assert.equal(url.pathname,'/api/a-share/financials/income-statements');assert.equal(url.searchParams.get('period'),'annual');return Response.json(envelope([{thscode:url.searchParams.get('thscode'),period:'annual',fiscal_year:2025,period_end_ms:Date.parse('2025-12-31T00:00:00+08:00'),currency:'CNY',operating_income:100000,operating_profit:20000,net_profit:15000,parent_holder_net_profit:14000,basic_eps:1.4}]));};
 const result=await fetchFuyao('financial_comparison',targets,'test-placeholder',fake,now);assert.equal(result.quality,'ok');assert.ok(result.unit.includes('元／股'));
 const rows=(result.raw as {selectedRows:{basic_eps:number}[]}).selectedRows;assert.equal(rows.length,2);assert.equal(rows[0].basic_eps,1.4);
});
test('unsupported news, response ticker mismatch and invalid research targets fail closed',async()=>{
 await assert.rejects(fetchFuyao('news_context',targets,'test-placeholder'),/未开放/);
 await assert.rejects(fetchFuyao('market_snapshot',targets,'test-placeholder',async()=>Response.json(envelope([valuation('000001.SZ')])),now),/不一致/);
 assert.throws(()=>validateTargets({symbols:['600519'],reportYear:2025}),/代码/);assert.throws(()=>validateTargets({symbols:['600519.SH'],reportYear:9999}),/年份/);
});
test('budget reservation uses current model prices and protects total 25 requests/$1',()=>{
 assert.equal(MAX_MODEL_CALLS,25);assert.equal(MAX_MICRO_USD,1000000);
 const cheap=estimateReservation('输出 JSON 财务研究','gpt-6-luna');const sol=estimateReservation('输出 JSON 财务研究','gpt-6.1-sol');
 assert.ok(sol.reservationMicroUsd>cheap.reservationMicroUsd);assert.ok(cheap.reservationMicroUsd>estimatedUsageMicroUsd(20,20,'gpt-6-luna'));
 assert.throws(()=>estimateReservation('x'.repeat(28001),'gpt-6-luna'),/28 KB/);assert.throws(()=>estimateReservation('JSON','unknown-model'),/未登记/);
});
