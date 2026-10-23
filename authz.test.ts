import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveActor, planAccount, assertNotSelf, assertAdminRemains } from '../src/authz';
import { HttpError } from '../src/attempts';
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return e instanceof HttpError ? e.code : 'bukan-HttpError'; } return 'tidak-ada-error'; };

test('akun tidak ada / dinonaktifkan / tanpa peran / tanpa regu ditolak', () => {
  assert.equal(code(() => resolveActor(null)), 'unauthenticated');
  assert.equal(code(() => resolveActor({ uid: 'u', disabled: true, customClaims: { role: 'admin' } })), 'permission-denied');
  assert.equal(code(() => resolveActor({ uid: 'u', disabled: false })), 'permission-denied');
  assert.equal(code(() => resolveActor({ uid: 'u', disabled: false, customClaims: { role: 'superuser' } })), 'permission-denied');
  assert.equal(code(() => resolveActor({ uid: 'u', disabled: false, customClaims: { role: 'penguji' } })), 'permission-denied');
  assert.equal(code(() => resolveActor({ uid: 'u', disabled: false, customClaims: { role: 'peserta', team: 9 } })), 'permission-denied');
});
test('peran diambil dari Auth server, bukan dari data klien', () => {
  const a = resolveActor({ uid: 'u', disabled: false, customClaims: { role: 'penguji', team: 3, canUnlock: true } }, 1000);
  assert.deepEqual(a, { uid: 'u', role: 'penguji', team: 3, canUnlock: true });
  const p = resolveActor({ uid: 'p', disabled: false, customClaims: { role: 'peserta', team: 2, canUnlock: true } });
  assert.equal(p.canUnlock, false);              // izin buka kunci hanya untuk penguji
  assert.equal(resolveActor({ uid: 'a', disabled: false, customClaims: { role: 'admin', team: 5 } }).team, undefined);
});
test('token lama setelah pencabutan sesi ditolak (perubahan peran / nonaktif)', () => {
  const rec = { uid: 'u', disabled: false, customClaims: { role: 'admin' }, tokensValidAfterMs: 2_000_000 };
  assert.equal(code(() => resolveActor(rec, 1_999)), 'unauthenticated');   // iat 1_999_000 ms < 2_000_000
  assert.equal(resolveActor(rec, 2_001).role, 'admin');
});
test('planAccount: validasi dan claims/profil tanpa password', () => {
  const p = planAccount({ email: ' Budi@Contoh.ID ', nama: ' Budi   S ', role: 'peserta', team: 4, kelas: '8A', dewan: 'DP9' });
  assert.deepEqual(p.claims, { role: 'peserta', team: 4 });
  assert.equal(p.email, 'budi@contoh.id'); assert.equal(p.profile.nama, 'Budi S'); assert.equal(p.profile.dewan, 'DP9');
  assert.ok(!JSON.stringify(p).toLowerCase().includes('password'));
  assert.deepEqual(planAccount({ email: 'a@b.co', nama: 'Aa', role: 'penguji', team: 1, canUnlock: true }).claims, { role: 'penguji', team: 1, canUnlock: true });
  assert.deepEqual(planAccount({ email: 'a@b.co', nama: 'Aa', role: 'admin', team: 3 }).claims, { role: 'admin' });
  for (const bad of [{ email: 'x', nama: 'Aa', role: 'admin' }, { email: 'a@b.co', nama: 'A', role: 'admin' }, { email: 'a@b.co', nama: 'Aa', role: 'root' },
    { email: 'a@b.co', nama: 'Aa', role: 'peserta' }, { email: 'a@b.co', nama: 'Aa', role: 'penguji', team: 8 }] as any[])
    assert.equal(code(() => planAccount(bad)), 'invalid-argument');
});
test('perlindungan admin: tidak mengubah diri sendiri, selalu ada admin', () => {
  assert.equal(code(() => assertNotSelf({ uid: 'a', role: 'admin' }, 'a', 'menonaktifkan')), 'failed-precondition');
  assert.equal(code(() => assertNotSelf({ uid: 'a', role: 'admin' }, 'b', 'menonaktifkan')), 'tidak-ada-error');
  assert.equal(code(() => assertAdminRemains(0)), 'failed-precondition'); assert.equal(code(() => assertAdminRemains(1)), 'tidak-ada-error');
});
