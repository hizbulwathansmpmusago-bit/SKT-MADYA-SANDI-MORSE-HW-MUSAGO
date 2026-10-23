import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore
import { classify, probe, callableUrl } from '../../scripts/probe-core.mjs';
const H = (o: Record<string, string> = {}) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const res = (status: number, headers = {}, body: unknown = null) => ({ status, headers: H(headers), json: async () => { if (body === null) throw new Error('x'); return body; } });
test('klasifikasi: tidak deploy / IAM / crash / CORS hilang / OK', () => {
  assert.equal(classify({ status: 404 }).kode, 'TIDAK_DEPLOY'); assert.equal(classify({ status: 403 }).kode, 'IAM_DITOLAK');
  assert.equal(classify({ status: 503 }).kode, 'FUNGSI_ERROR'); assert.equal(classify({ status: 401, allowOrigin: null }).kode, 'CORS_HILANG');
  assert.equal(classify({ status: 401, allowOrigin: '*', body: { error: { status: 'UNAUTHENTICATED' } } }).ok, true); assert.equal(classify({ fetchError: new Error('dns') }).kode, 'JARINGAN');
});
test('probe: alur preflight lalu panggilan', async () => {
  const calls: string[] = [];
  const ok = async (_u: string, o: { method: string }) => { calls.push(o.method); return o.method === 'OPTIONS' ? res(204, { 'access-control-allow-origin': 'https://x' }) : res(401, { 'access-control-allow-origin': 'https://x' }, { error: { status: 'UNAUTHENTICATED' } }); };
  const r = await probe(ok, { region: 'asia-southeast2', projectId: 'p', name: 'whoami', origin: 'https://x' });
  assert.equal(r.ok, true); assert.deepEqual(calls, ['OPTIONS', 'POST']);
  const nf = await probe(async () => res(404), { region: 'r', projectId: 'p', name: 'whoami', origin: 'https://x' }); assert.equal(nf.kode, 'TIDAK_DEPLOY'); assert.equal(nf.tahap, 'preflight');
  const net = await probe(async () => { throw new Error('offline'); }, { region: 'r', projectId: 'p', name: 'whoami', origin: 'https://x' }); assert.equal(net.kode, 'JARINGAN');
  assert.equal(callableUrl('asia-southeast2', 'p', 'whoami'), 'https://asia-southeast2-p.cloudfunctions.net/whoami');
});
