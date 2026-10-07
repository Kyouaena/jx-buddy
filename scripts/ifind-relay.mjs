// Temporary, authenticated loopback bridge for hosts that cannot reach iFinD.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {invokeMCP} from '../lib/harness/mcp.ts';
const vars={};for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)vars[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^(["'])(.*)\1$/,'$2');}
if(!vars.IFIND_MCP_TOKEN)throw Error('Missing local iFinD secret');
mkdirSync('.sites-runtime',{recursive:true});const secretPath='.sites-runtime/ifind-relay-token';
if(!existsSync(secretPath))writeFileSync(secretPath,randomBytes(32).toString('hex'),{mode:0o600});
const secret=readFileSync(secretPath,'utf8').trim();const expected=Buffer.from(`Bearer ${secret}`);
let active=false;let attempts=0;let windowStart=Date.now();
const server=createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
 const auth=Buffer.from(req.headers.authorization||'');if(auth.length!==expected.length||!timingSafeEqual(auth,expected))return send(401,{error:'Unauthorized'});
 if(req.method!=='POST'||req.url!=='/ifind')return send(404,{error:'Not found'});
 if(active)return send(429,{error:'Read-only provider request already active'});
 if(Date.now()-windowStart>3600000){windowStart=Date.now();attempts=0;}if(attempts>=30)return send(429,{error:'Provider diagnostic budget exhausted'});
 try{
  let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>2048)return send(413,{error:'Request too large'});chunks.push(c);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));const symbols=body.symbols;
  if(!Array.isArray(symbols)||symbols.length<1||symbols.length>3||symbols.some(s=>typeof s!=='string'||!/^\d{6}\.(SH|SZ|BJ)$/.test(s))||Object.keys(body).some(k=>k!=='symbols'))return send(400,{error:'Invalid targets'});
  active=true;attempts++;
  // The client cannot choose URLs, provider credentials, tools, or arbitrary prompts.
  const query=`查询${symbols.join(',')}最新一期MRQ报告披露日期，仅返回实际公开数据；没有数据明确说明。`;
  const result=await invokeMCP('https://api-mcp.51ifind.com:8643/ds-mcp-servers/hexin-ifind-ds-stock-mcp',vars.IFIND_MCP_TOKEN,'raw','get_stock_events',{query});
  send(200,result);console.log(JSON.stringify({event:'ifind.readonly.completed',at:new Date().toISOString()}));
 }catch{send(502,{error:'iFinD read-only request failed'});}finally{active=false;}
});
server.requestTimeout=65000;server.headersTimeout=10000;
server.listen(8789,'127.0.0.1',()=>console.log('Authenticated iFinD bridge listening on loopback:8789'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
