import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore  modul .mjs tanpa tipe
import { bootstrapAdmin } from '../../scripts/bootstrap-core.mjs';
const mk = (admins: string[] = [], existing: { uid: string } | null = null) => {
  const log: unknown[][] = [];
  return { log, deps: {
    listAdminUids: async () => admins, getUserByEmail: async () => existing,
    createUser: async (p: unknown) => { log.push(['createUser', p]); return { uid: 'u-baru' }; },
    setClaims: async (u: string, c: unknown) => { log.push(['claims', u, c]); }, revokeTokens: async (u: string) => { log.push(['revoke', u]); },
    writeProfile: async (u: string, p: unknown) => { log.push(['profile', u, p]); }, resetLink: async (e: string) => `https://link/${e}`,
  } };
};
test('admin pertama: akun dibuat TANPA password, claims admin, sesi dicabut, tautan atur password', async () => {
  const m = mk(); const r = await bootstrapAdmin(m.deps, { email: ' Ketua@Contoh.ID ', nama: 'Ketua  Panitia' });
  assert.deepEqual(r, { uid: 'u-baru', dibuat: true, linkAtur: 'https://link/ketua@contoh.id' });
  assert.ok(!JSON.stringify(m.log).toLowerCase().includes('password'));
  assert.deepEqual(m.log.find(x => x[0] === 'claims'), ['claims', 'u-baru', { role: 'admin' }]);
  assert.ok(m.log.some(x => x[0] === 'revoke'));
});
test('akun yang sudah ada dipakai ulang (tanpa tautan, tanpa createUser)', async () => {
  const m = mk([], { uid: 'u-ada' }); const r = await bootstrapAdmin(m.deps, { email: 'a@b.co', nama: 'Aa' });
  assert.deepEqual(r, { uid: 'u-ada', dibuat: false, linkAtur: null }); assert.ok(!m.log.some(x => x[0] === 'createUser'));
});
test('menolak jika admin sudah ada kecuali --allow-additional; validasi input', async () => {
  await assert.rejects(bootstrapAdmin(mk(['x']).deps, { email: 'a@b.co', nama: 'Aa' }), /Sudah ada 1 admin/);
  assert.equal((await bootstrapAdmin(mk(['x']).deps, { email: 'a@b.co', nama: 'Aa', allowAdditional: true })).dibuat, true);
  await assert.rejects(bootstrapAdmin(mk().deps, { email: 'salah', nama: 'Aa' }), /Email tidak valid/);
  await assert.rejects(bootstrapAdmin(mk().deps, { email: 'a@b.co', nama: 'A' }), /Nama wajib/);
});
