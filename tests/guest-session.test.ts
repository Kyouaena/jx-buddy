import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueGuestSession, verifyGuestSession, researchIdentity, GuestSessionError } from '../lib/guest-session.ts';
const secret = 'unit-test-only-guest-signing-value-not-a-runtime-credential';
const origin = 'https://research.example';
test('guest sessions are unforgeable, origin bound, expire, and use secure HttpOnly cookies', async () => {
  const now=Date.now(); const a=await issueGuestSession(secret,origin,now); const b=await issueGuestSession(secret,origin,now);
  assert.notEqual(a.owner,b.owner); assert.ok(a.cookie.includes('HttpOnly'));assert.ok(a.cookie.includes('Secure'));assert.ok(a.cookie.includes('SameSite=Strict'));
  assert.equal(await verifyGuestSession(a.token,secret,origin,now),a.owner);
  assert.equal(await verifyGuestSession(a.token,secret,'https://elsewhere.example',now),null);
  assert.equal(await verifyGuestSession(a.token,secret,origin,now+8*86400000),null);
  assert.equal(await verifyGuestSession(a.token.replace(a.token.slice(0,8),'00000000'),secret,origin,now),null);
  await assert.rejects(issueGuestSession('',origin),e=>e instanceof GuestSessionError && e.status===503);
});
test('guest writes require a signed session and same origin; account and guest workspaces stay separate', async () => {
  const a=await researchIdentity(new Request(origin+'/api/research'),null,secret,true);
  const b=await researchIdentity(new Request(origin+'/api/research'),null,secret,true);
  assert.notEqual(a.owner,b.owner);assert.ok(a.cookie);
  const cookie=a.cookie!.split(';')[0];
  const post=new Request(origin+'/api/research',{method:'POST',headers:{cookie,origin}});
  assert.equal((await researchIdentity(post,null,secret)).owner,a.owner);
  await assert.rejects(researchIdentity(new Request(origin+'/api/research',{method:'POST',headers:{cookie,origin:'https://attacker.example'}}),null,secret),e=>e instanceof GuestSessionError && e.status===403);
  await assert.rejects(researchIdentity(new Request(origin+'/api/research',{method:'POST',headers:{origin}}),null,secret),e=>e instanceof GuestSessionError && e.status===401);
  await assert.rejects(researchIdentity(new Request(origin+'/api/research',{method:'POST',headers:{cookie}}),null,secret),e=>e instanceof GuestSessionError && e.status===403);
  assert.equal((await researchIdentity(new Request(origin+'/api/research',{headers:{cookie}}),'account-user',secret)).owner,'account-user');
  assert.equal((await researchIdentity(new Request(origin+'/api/research',{headers:{cookie,'X-JX-Guest':'1'}}),'account-user',secret)).owner,a.owner);
});
