import Workbench from "./workbench";
import { getChatGPTUser } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Page() { const user = await getChatGPTUser(); return <Workbench userName={user?.fullName || (user ? "研究者" : "游客")} guest={!user}/>; }
