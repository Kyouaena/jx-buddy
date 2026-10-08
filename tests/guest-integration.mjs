import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:5173';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw Error('Local guest test only');
async function session() {
 const r=await fetch(base+'/api/research',{headers:{'X-JX-Guest':'1'}});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie);return {cookie,data:await r.json()};
}
async function req(cookie,body,query='',expected=200,origin=base){
 const r=await fetch(base+'/api/research'+query,{...(body?{method:'POST',body:JSON.stringify(body)}:{}),headers:{cookie,'X-JX-Guest':'1',...(body?{'Content-Type':'application/json',...(origin?{Origin:origin}:{})}:{})}});
 const text=await r.text();let d;try{d=JSON.parse(text);}catch{d={error:text};}assert.equal(r.status,expected,d.error);return d;
}
const a=await session(),b=await session();assert.notEqual(a.cookie,b.cookie);
let {state:s}=await req(a.cookie,{action:'create',mode:'demo',goal:'游客隔离与演示主链路',fault:'none'});
await req(b.cookie,undefined,'?id='+s.id,404);
await req(b.cookie,{action:'tick',id:s.id,revision:s.revision},'',409);
await req(a.cookie,{action:'tick',id:s.id,revision:s.revision},'',403,'https://attacker.example');
await req(a.cookie,{action:'tick',id:s.id,revision:s.revision},'',403,null);
await req('jx_buddy_guest=forged',{action:'tick',id:s.id,revision:s.revision},'',401);
s=(await req(a.cookie,{action:'tick',id:s.id,revision:s.revision})).state;assert.equal(s.status,'approval');
s=(await req(a.cookie,{action:'approve',id:s.id,revision:s.revision})).state;
for(let i=0;i<12&&s.status==='running';i++)s=(await req(a.cookie,{action:'tick',id:s.id,revision:s.revision})).state;
assert.equal(s.status,'review');assert.equal(s.evidence.length,3);
const reopened=await req(a.cookie,undefined,'?id='+s.id);assert.equal(reopened.state.status,'review');
const live=await req(a.cookie,{action:'create',mode:'live',goal:'仅核验指定公司财务',targets:{symbols:['600519.SH'],reportYear:2025}});assert.equal(live.state.mode,'live');assert.equal(live.state.targets.symbols[0],'600519.SH');
assert.equal((await req(a.cookie)).modelBudget.calls,a.data.modelBudget.calls);
console.log('PASS guest signed sessions, owner isolation, origin/forgery rejection, demo workflow and live creation; no paid model calls');
