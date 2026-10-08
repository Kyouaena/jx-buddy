export const GUEST_COOKIE = 'jx_buddy_guest';
const lifetime = 7 * 24 * 60 * 60 * 1000;
type Identity = { owner: string; guest: boolean; cookie?: string };
export class GuestSessionError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function key(secret: string) {
  if (secret.length < 32) throw new GuestSessionError('游客会话尚未配置，请稍后再试。', 503);
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign','verify']);
}
export async function issueGuestSession(secret: string, origin: string, now = Date.now()) {
  const id = crypto.randomUUID(); const payload = `${id}.${now + lifetime}`;
  const signature = await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(`${origin}:${payload}`));
  const encoded = btoa(String.fromCharCode(...new Uint8Array(signature))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  const token = `${payload}.${encoded}`;
  return { owner:`guest:${id}`, token, cookie:`${GUEST_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${lifetime/1000}${origin.startsWith('https:') ? '; Secure' : ''}` };
}
export async function verifyGuestSession(token: string, secret: string, origin: string, now = Date.now()) {
  if (!/^[a-f0-9-]{36}\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [id, expiry, encoded] = token.split('.');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id) || Number(expiry) <= now || Number(expiry) > now + lifetime) return null;
  const signature = Uint8Array.from(atob(encoded.replaceAll('-','+').replaceAll('_','/')+'='), c=>c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', await key(secret), signature, new TextEncoder().encode(`${origin}:${id}.${expiry}`));
  return ok ? `guest:${id}` : null;
}
export async function researchIdentity(request: Request, signedInId: string | null, secret: string, allowCreate = false): Promise<Identity> {
  if (signedInId && request.headers.get('x-jx-guest') !== '1') return { owner:signedInId, guest:false };
  const origin = new URL(request.url).origin;
  if (request.method !== 'GET' && request.headers.get('origin') !== origin) throw new GuestSessionError('游客操作必须从本站发起。', 403);
  const token = request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${GUEST_COOKIE}=`))?.slice(GUEST_COOKIE.length+1);
  if (token) {
    const owner = await verifyGuestSession(token, secret, origin); if (owner) return { owner, guest:true };
    // Never silently replace a tampered or expired session on a paid write.
  }
  if (!allowCreate || request.method !== 'GET') throw new GuestSessionError('游客会话已失效，请刷新页面重新建立会话。', 401);
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && request.headers.get('origin') !== origin)) throw new GuestSessionError('请求来源不匹配。', 403);
  const issued = await issueGuestSession(secret, origin); return { owner:issued.owner, guest:true, cookie:issued.cookie };
}
