import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readRPC,invokeMCP} from '../lib/harness/mcp.ts';
import {ifindEvidence} from '../lib/harness/ifind.ts';
import {validateReport} from '../lib/harness/engine.ts';
test('MCP SSE resolves a matching result before a persistent stream closes',async()=>{
 let cancelled=false;const stream=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {"method":"notification"}\n\ndata: {"jsonrpc":"2.0","id":3,"result":{"content":[]}}\n\n'));},cancel(){cancelled=true;}});
 const result=await readRPC(new Response(stream,{headers:{'Content-Type':'text/event-stream'}}),3);assert.deepEqual(result,{content:[]});assert.equal(cancelled,true);
});
test('MCP uses raw auth, negotiates session and discovers only the registered readonly tool',async()=>{
 const calls:string[]=[];
 const fake:typeof fetch=async(_url,init)=>{
  const headers=init!.headers as Record<string,string>;assert.equal(headers.Authorization,'test-token');
  if(init!.method==='DELETE'){calls.push('DELETE');return new Response(null,{status:202});}
  const body=JSON.parse(init!.body as string);calls.push(body.method);
  if(body.method==='initialize')return Response.json({id:body.id,result:{protocolVersion:'2025-06-18'}},{headers:{'Mcp-Session-Id':'test-session'}});
  assert.equal(headers['Mcp-Session-Id'],'test-session');
  if(body.method==='notifications/initialized')return new Response(null,{status:202});
  if(body.method==='tools/list')return Response.json({id:body.id,result:{tools:[{name:'get_stock_events',annotations:{readOnlyHint:true}}]}});
  assert.equal(body.params.name,'get_stock_events');return Response.json({id:body.id,result:{content:[{type:'text',text:'{}'}]}});
 };
 const result=await invokeMCP('https://example.com/mcp','test-token','raw','get_stock_events',{query:'报告披露日期'},fake);assert.ok(result.content);assert.deepEqual(calls,['initialize','notifications/initialized','tools/list','tools/call','DELETE']);
});
test('iFinD business success is code 1 and missing timestamps remain uncertain',()=>{
 const response={content:[{type:'text',text:JSON.stringify({code:1,msg:'success',data:{answer:'|证券代码|披露日期|\n|600519.SH|20260815|'}})}]};
 const e=ifindEvidence(response,{symbols:['600519.SH'],reportYear:2025});assert.equal(e.demo,false);assert.equal(e.quality,'missing');assert.ok(e.warnings.some(w=>w.includes('更新时间')));
 assert.throws(()=>ifindEvidence({content:[{type:'text',text:'{"code":0}'}]},{symbols:['600519.SH'],reportYear:2025}),/未成功/);
 assert.throws(()=>validateReport({title:'研究',summary:'对比',limitations:[],claims:[{kind:'inference',text:'因此没有近期事件。',evidenceIds:['E3']}]},[{...e,id:'E3'}]),/不确定/);
});
