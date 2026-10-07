import { getChatGPTUser } from '../../chatgpt-auth';
import { runtime, availability } from '../../../lib/harness/runtime';
export const dynamic = 'force-dynamic';
export async function GET() {
 const user=await getChatGPTUser();if(!user)return Response.json({error:'请先登录。'},{status:401});
 const caps=availability(true);if(!caps.tools.find(t=>t.name==='news_context')?.enabled)return Response.json({error:'iFinD 工具未配置。'},{status:400});
 try {
  const evidence=await runtime(true).callTool('news_context','核验600519.SH的最新一期MRQ报告披露日期',{symbols:['600519.SH'],reportYear:2025});
  return Response.json({connected:true,source:evidence.source,quality:evidence.quality,warnings:evidence.warnings,asOf:evidence.asOf});
 }catch{return Response.json({connected:false,error:'iFinD 实际调用失败，未生成替代数据。'},{status:502});}
}
