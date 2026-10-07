import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const vars={};for(const line of readFileSync('.dev.vars','utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)vars[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^(["'])(.*)\1$/,'$2');}
const url='https://api-mcp.51ifind.com:8643/ds-mcp-servers/hexin-ifind-ds-stock-mcp';
const token=vars.IFIND_MCP_TOKEN;if(!token)throw new Error('iFinD token not configured');
let authStyle='raw';let session;let protocol='2025-06-18';
async function rpc(method,params,id){
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:authStyle==='raw'?token:`Bearer ${token}`};
 if(session)headers['Mcp-Session-Id']=session;if(method!=='initialize')headers['MCP-Protocol-Version']=protocol;
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,params}),redirect:'manual',signal:AbortSignal.timeout(method==='tools/call'?45000:15000)});
 if(!r.ok){const e=new Error(`HTTP ${r.status}`);e.status=r.status;throw e;}
 session=r.headers.get('Mcp-Session-Id')||session;
 if(id===undefined||r.status===202)return{};
 if(!r.headers.get('content-type')?.includes('text/event-stream')){const body=await r.json();if(body.error)throw new Error(`RPC error ${body.error.code}`);if(body.id!==id||!body.result)throw new Error('Unrecognized RPC envelope');return body.result;}
 const reader=r.body.getReader();const decoder=new TextDecoder();let buf='';let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1000000)throw new Error('Response size limit');buf+=decoder.decode(value,{stream:true});const blocks=buf.split(/\r?\n\r?\n/);buf=blocks.pop()||'';for(const block of blocks){const text=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim()).join('\n');if(!text)continue;let msg;try{msg=JSON.parse(text);}catch{continue;}if(msg.id===id){if(msg.error)throw new Error(`RPC error ${msg.error.code}`);return msg.result;}}}throw new Error('Matching RPC response missing');}finally{await reader.cancel().catch(()=>{});}
}
try{
 let init;
 try{init=await rpc('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'x-buddy-probe',version:'0.1'}},1);}catch(e){if(e.status!==401&&e.status!==403)throw e;authStyle='bearer';init=await rpc('initialize',{protocolVersion:protocol,capabilities:{},clientInfo:{name:'x-buddy-probe',version:'0.1'}},1);}
 protocol=init.protocolVersion||protocol;
 await rpc('notifications/initialized',{});
 const tools=[];let cursor;for(let p=0;p<3;p++){const page=await rpc('tools/list',cursor?{cursor}:{},2+p);if(!Array.isArray(page.tools))throw new Error('Missing tools');tools.push(...page.tools);cursor=page.nextCursor;if(!cursor)break;}
 mkdirSync('.sites-runtime',{recursive:true});writeFileSync('.sites-runtime/ifind-tools.json',JSON.stringify({url,authStyle,protocol,tools},null,2),{mode:0o600});
 if(process.argv.includes('--call-events')){const result=await rpc('tools/call',{name:'get_stock_events',arguments:{query:'查询贵州茅台600519.SH在2026年9月1日至2026年10月7日的公开披露事件，返回事件日期、类型及原始数据；没有匹配事件时明确返回空结果。'}},9);writeFileSync('.sites-runtime/ifind-events.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({tool:'get_stock_events',isError:result.isError||false,keys:Object.keys(result),contentTypes:result.content?.map(c=>c.type),sample:JSON.stringify(result).replaceAll(token,'[REDACTED]').slice(0,1000)}));}
 console.log(JSON.stringify({connected:true,server:init.serverInfo,protocol,authStyle,toolCount:tools.length,tools:tools.map(t=>({name:t.name,description:t.description?.slice(0,160),readOnly:t.annotations?.readOnlyHint}))}));
}catch(e){console.log(JSON.stringify({connected:false,error:e.cause?.code||e.code||e.message}));process.exitCode=1;}
