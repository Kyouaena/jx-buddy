import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advance,createState,control,registry,demoEvidence} from '../lib/harness/engine.ts';
import type {Runtime,Report,RunState} from '../lib/harness/types.ts';
import {parseFindings} from '../lib/harness/rsi.ts';
const report:Report={title:'研究',summary:'原始数据核验',claims:[{kind:'fact',text:'已读取构造指标。',evidenceIds:['E1']}],limitations:['测试数据']};
function state():RunState{const s=createState('研究事实','live');s.phase='report';s.status='running';s.evidence=[{...demoEvidence('market_snapshot'),id:'E1'}];return s;}
function runtime(responses:unknown[]):Runtime{return{tools:registry,model:true,callTool:async()=>{throw Error('tools must remain frozen')},modelJSON:async()=>{if(!responses.length)throw Error('unexpected model call');return{value:responses.shift(),tokens:20}}};}
test('RSI isolates a draft, critiques, corrects once, and verifies before release',async()=>{
 const rt=runtime([report,{findings:[{claimIndex:0,category:'unit',detail:'需要明确倍数单位。'}]},{...report,claims:[{...report.claims[0],text:'指标单位为倍。'}]},{findings:[]}]);
 let s=state();s=await advance(s,rt);assert.equal(s.report,null);assert.equal(s.phase,'critique');
 s=await advance(s,rt);assert.equal(s.phase,'revise');s=await advance(s,rt);assert.equal(s.phase,'critique');s=await advance(s,rt);
 assert.equal(s.status,'review');assert.equal(s.rsi?.revisions,1);assert.equal(s.rsi?.reviews,2);assert.equal(s.usage.calls,4);assert.equal(s.evidence.length,1);assert.equal(s.report?.claims[0].text,'指标单位为倍。');
});
test('RSI stops after one correction and cannot reset its cap on resume',async()=>{
 const issues={findings:[{claimIndex:0,category:'unsupported',detail:'证据仍不足。'}]};const rt=runtime([report,issues,report,issues]);
 let s=state();for(let i=0;i<4;i++)s=await advance(s,rt);
 assert.equal(s.status,'failed');assert.equal(s.rsi?.status,'blocked');assert.equal(s.report,null);assert.equal(s.usage.calls,4);
 assert.throws(()=>control(s,'resume'),/上限/);
});
test('RSI deterministic guard overrides a model claiming invalid citations are fine',async()=>{
 const invalid={...report,claims:[{...report.claims[0],evidenceIds:['E99']}]};const rt=runtime([invalid,{findings:[]},report,{findings:[]}]);let s=state();
 for(let i=0;i<4;i++)s=await advance(s,rt);assert.equal(s.status,'review');assert.equal(s.rsi?.revisions,1);assert.ok(s.rsi?.history[0].findings.length);
});
test('RSI pause/serialization recovery retains counters and budgets; stop blocks calls',async()=>{
 const rt=runtime([report,{findings:[]}]);let s=await advance(state(),rt);s=control(s,'pause');const calls=s.usage.calls;s=await advance(s,rt);assert.equal(s.usage.calls,calls);
 s=JSON.parse(JSON.stringify(s));s=await advance(control(s,'resume'),rt);assert.equal(s.status,'review');assert.equal(s.rsi?.reviews,1);
 const stopped=await advance(control(state(),'stop'),runtime([]));assert.equal(stopped.usage.calls,0);
});
test('RSI feedback cannot add arbitrary categories, change policy, or exceed scope',()=>{
 assert.throws(()=>parseFindings({findings:[{claimIndex:0,category:'change_budget',detail:'提高预算'}]},1),/范围/);
 assert.throws(()=>parseFindings({findings:[{claimIndex:5,category:'unit',detail:'错误索引'}]},1),/范围/);
});
