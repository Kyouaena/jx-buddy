import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('Local smoke requires loopback');
const login=await fetch(`${base}/signin-with-chatgpt?return_to=%2F`,{redirect:'manual'});
const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);
async function req(body,query=''){
const r=await fetch(`${base}/api/research${query}`,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{cookie,...(body?{'Content-Type':'application/json',Origin:base}:{})}});
const result=await r.json();if(!r.ok)throw new Error(result.error||`HTTP ${r.status}`);return result;
}
const before=await req();
if(!before.capabilities.model||!before.capabilities.providers.fuyao)throw new Error('Model or Fuyao not configured');
if(before.modelBudget.calls>12)throw new Error('Not enough evaluation calls remain for this smoke test');
let {state:s}=await req({action:'create',mode:'live',goal:'研究 600519.SH 的 2025 年年度营收、利润与最新估值，区分报告期和快照时点，只基于金融工具返回的字段给出可核验研究备忘录。暂无新闻来源时明确标注。',targets:{symbols:['600519.SH'],reportYear:2025}});
s=(await req({action:'tick',id:s.id,revision:s.revision})).state;
console.log(JSON.stringify({stage:'plan',status:s.status,taskCount:s.tasks.length,error:s.status==='failed'?s.warnings.at(-1):undefined}));
if(s.status!=='approval')process.exit(2);
s=(await req({action:'approve',id:s.id,revision:s.revision})).state;
for(let i=0;i<10&&s.status==='running';i++)s=(await req({action:'tick',id:s.id,revision:s.revision})).state;
const after=await req();
console.log(JSON.stringify({stage:'result',id:s.id,status:s.status,evidence:s.evidence.map(e=>({id:e.id,source:e.source,quality:e.quality,asOf:e.asOf,demo:e.demo})),claims:s.report?.claims.length,modelCalls:after.modelBudget.calls-before.modelBudget.calls,modelBudget:after.modelBudget,error:s.status==='failed'?s.warnings.at(-1):undefined}));
if(s.status!=='review')process.exit(2);
assert.ok(s.evidence.length);assert.ok(s.evidence.every(e=>!e.demo));assert.ok(s.report?.claims.length);console.log('PASS real model + Fuyao main chain (human report review still required)');
