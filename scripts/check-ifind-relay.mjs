import {readFileSync} from 'node:fs';
const base=process.argv[2]||'http://127.0.0.1:8789';
const secret=readFileSync('.sites-runtime/ifind-relay-token','utf8').trim();
const unauth=await fetch(`${base}/ifind`,{method:'POST',body:'{}'});if(unauth.status!==401)throw Error('Authentication guard failed');
const invalid=await fetch(`${base}/ifind`,{method:'POST',headers:{Authorization:`Bearer ${secret}`},body:JSON.stringify({symbols:['invalid']})});if(invalid.status!==400)throw Error('Target validation failed');
const r=await fetch(`${base}/ifind`,{method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:JSON.stringify({symbols:['600519.SH']}),signal:AbortSignal.timeout(65000)});
const body=await r.json();const parsed=body.content?.find(x=>x.type==='text')?.text;const decoded=parsed?JSON.parse(parsed):null;
console.log(JSON.stringify({status:r.status,authGuard:unauth.status,invalidGuard:invalid.status,providerCode:decoded?.code,connected:r.ok&&decoded?.code===1}));if(!r.ok||decoded?.code!==1)process.exitCode=1;
