import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as A from '../src/attempts';
import { DEFAULT_WEIGHTS, Question } from '../src/morse';

const QS: Question[] = [
  { id: 'q1', type: 'decode', prompt: '... -.- -', answer: 'SKT' },
  { id: 'q2', type: 'encode', prompt: 'HW', answer: '.... .--' },
  { id: 'q3', type: 'knowledge', prompt: 'Singkatan HW?', options: ['Hizbul Wathan', 'Hari Wisata'], answer: 'Hizbul Wathan' },
];
function mk(cfg: Partial<A.ExamConfig> = {}) {
  let now = 1_000_000; const att = new Map<string, A.Attempt>(); const audit: A.AuditEntry[] = [];
  const config: A.ExamConfig = { status: 'running', durationMin: 10, passMark: 70, weights: DEFAULT_WEIGHTS, resultsReleased: false, ...cfg };
  const s: A.Store = {
    getConfig: async () => config, getQuestions: async () => QS, getAttempt: async u => att.get(u) ?? null,
    updateAttempt: async (u, fn) => { const r = fn(att.get(u) ?? null); if (r) att.set(u, r); return r; },
    addAudit: async e => { audit.push(e); }, nowMs: () => now,
  };
  return { s, att, audit, config, tick: (ms: number) => { now += ms; } };
}
const P: A.Actor = { uid: 'p1', role: 'peserta' };
const ADM: A.Actor = { uid: 'adm', role: 'admin' };
const rejects = (p: Promise<unknown>, code: string) => assert.rejects(p, (e: any) => e instanceof A.HttpError && e.code === code);

test('mulai hanya saat ujian berjalan; soal tanpa kunci jawaban', async () => {
  const d = mk({ status: 'draft' }); await rejects(A.startAttempt(d.s, P, 1), 'failed-precondition');
  const r = mk(); await A.startAttempt(r.s, P, 1);
  const qs = await A.getQuestions(r.s, P);
  assert.equal(qs.length, 3); assert.ok(qs.every(q => !('answer' in q)));
});
test('timer berbasis server + autosave', async () => {
  const r = mk(); const st = await A.startAttempt(r.s, P, 1); assert.equal(st.remainingMs, 600000);
  r.tick(120000); const sv = await A.saveAnswer(r.s, P, 'q1', 'SKT'); assert.equal(sv.remainingMs, 480000);
  assert.equal(r.att.get('p1')!.answers.q1, 'SKT');
  r.tick(481000); await rejects(A.saveAnswer(r.s, P, 'q2', 'x'), 'failed-precondition');
  await rejects(A.submitAttempt(r.s, P), 'failed-precondition');
});
test('mulai ulang tidak mereset jam (refresh/login ulang)', async () => {
  const r = mk(); await A.startAttempt(r.s, P, 1); r.tick(300000);
  const again = await A.startAttempt(r.s, P, 1); assert.equal(again.remainingMs, 300000);
});
test('submit menilai otomatis dan idempoten', async () => {
  const r = mk(); await A.startAttempt(r.s, P, 1);
  await A.saveAnswer(r.s, P, 'q1', 'skt'); await A.saveAnswer(r.s, P, 'q2', '.... .--'); await A.saveAnswer(r.s, P, 'q3', 'Hari Wisata');
  const s1 = await A.submitAttempt(r.s, P); assert.deepEqual(s1.theory, { correct: 2, count: 3, score: 67 });
  r.tick(1000); const s2 = await A.submitAttempt(r.s, P); assert.equal(s2.status, 'submitted');
  await rejects(A.saveAnswer(r.s, P, 'q1', 'zzz'), 'failed-precondition');
});
test('kunci: sekali, bertahan, tidak berlaku sebelum mulai/setelah kirim', async () => {
  const r = mk(); assert.equal((await A.reportVisibilityLoss(r.s, P)).status, 'in_progress'); assert.equal(r.audit.length, 0);
  await A.startAttempt(r.s, P, 1); r.tick(1000);
  assert.equal((await A.reportVisibilityLoss(r.s, P)).status, 'locked');
  assert.equal((await A.reportVisibilityLoss(r.s, P)).status, 'locked'); assert.equal(r.audit.length, 1);
  // "refresh / perangkat lain": state ada di server
  await rejects(A.getQuestions(r.s, P), 'failed-precondition');
  await rejects(A.saveAnswer(r.s, P, 'q1', 'x'), 'failed-precondition');
  await rejects(A.submitAttempt(r.s, P), 'failed-precondition');
  assert.equal((await A.startAttempt(r.s, P, 1)).attempt.status, 'locked');
  const r2 = mk(); await A.startAttempt(r2.s, P, 1); await A.submitAttempt(r2.s, P);
  assert.equal((await A.reportVisibilityLoss(r2.s, P)).status, 'submitted');
});
test('buka kunci: izin, alasan wajib, audit, waktu terpakai dipertahankan', async () => {
  const r = mk(); await A.startAttempt(r.s, P, 3); r.tick(240000); await A.reportVisibilityLoss(r.s, P);
  r.tick(3_600_000); // lama terkunci tidak memberi waktu tambahan
  await rejects(A.unlockAttempt(r.s, P, 'p1', 'minta buka'), 'permission-denied');
  await rejects(A.unlockAttempt(r.s, { uid: 'u1', role: 'penguji', team: 3, canUnlock: false }, 'p1', 'tanpa izin'), 'permission-denied');
  await rejects(A.unlockAttempt(r.s, { uid: 'u1', role: 'penguji', team: 4, canUnlock: true }, 'p1', 'regu salah'), 'permission-denied');
  await rejects(A.unlockAttempt(r.s, ADM, 'p1', ''), 'invalid-argument');
  await A.unlockAttempt(r.s, { uid: 'u1', role: 'penguji', team: 3, canUnlock: true }, 'p1', 'HP peserta bermasalah');
  const a = r.att.get('p1')!; assert.equal(a.status, 'in_progress');
  assert.equal((await A.startAttempt(r.s, P, 3)).remainingMs, 360000); // 10 mnt - 4 mnt terpakai
  assert.equal(r.audit.at(-1)!.action, 'unlock'); assert.equal(r.audit.at(-1)!.reason, 'HP peserta bermasalah');
  await rejects(A.unlockAttempt(r.s, ADM, 'p1', 'tidak terkunci lagi'), 'failed-precondition');
});
test('nilai manual: hak per regu, validasi, audit before/after', async () => {
  const r = mk(); await A.startAttempt(r.s, P, 2);
  const ex2: A.Actor = { uid: 'e2', role: 'penguji', team: 2 }, ex5: A.Actor = { uid: 'e5', role: 'penguji', team: 5 };
  await rejects(A.setManualScore(r.s, P, 'p1', 'praktik', 100), 'permission-denied');
  await rejects(A.setManualScore(r.s, ex5, 'p1', 'praktik', 90), 'permission-denied');
  await rejects(A.setManualScore(r.s, ex2, 'p1', 'praktik', 101), 'invalid-argument');
  await A.setManualScore(r.s, ex2, 'p1', 'praktik', 80); await A.setManualScore(r.s, ex2, 'p1', 'praktik', 90);
  assert.deepEqual(r.audit.at(-1)!.detail, { field: 'praktik', before: 80, after: 90 });
  await A.setManualScore(r.s, ADM, 'p1', 'catatan', 'rapi');
});
test('hasil: dirilis admin + penilaian lengkap + ambang lulus', async () => {
  const r = mk(); await A.startAttempt(r.s, P, 2);
  for (const [q, v] of [['q1', 'SKT'], ['q2', '.... .--'], ['q3', 'Hizbul Wathan']]) await A.saveAnswer(r.s, P, q, v);
  await A.submitAttempt(r.s, P); await rejects(A.getResult(r.s, P), 'failed-precondition');
  r.config.resultsReleased = true; assert.equal((await A.getResult(r.s, P)).complete, false);
  for (const f of ['praktik', 'ketelitian', 'kedisiplinan', 'sikap'] as const) await A.setManualScore(r.s, ADM, 'p1', f, 100);
  assert.deepEqual(await A.getResult(r.s, P), { theory: 100, total: 100, complete: true, passed: true });
});
test('closeExpired menilai jawaban tersimpan', async () => {
  const r = mk(); await A.startAttempt(r.s, P, 1); await A.saveAnswer(r.s, P, 'q1', 'SKT');
  assert.equal(await A.closeExpired(r.s, ['p1']), 0); r.tick(601000);
  assert.equal(await A.closeExpired(r.s, ['p1']), 1); assert.equal(r.att.get('p1')!.theory!.correct, 1);
});

test('akhiri ujian: kirim paksa yang aktif, kunci tetap, hanya admin', async () => {
  const r = mk(); const P2: A.Actor = { uid: 'p2', role: 'peserta' };
  await A.startAttempt(r.s, P, 1); await A.saveAnswer(r.s, P, 'q1', 'SKT');
  await A.startAttempt(r.s, P2, 1); await A.reportVisibilityLoss(r.s, P2);
  await rejects(A.endExam(r.s, { uid: 'e', role: 'penguji', team: 1, canUnlock: true }, ['p1']), 'permission-denied');
  assert.equal(await A.endExam(r.s, ADM, ['p1', 'p2', 'tidakada']), 1);
  assert.equal(r.att.get('p1')!.status, 'submitted'); assert.equal(r.att.get('p1')!.theory!.correct, 1);
  assert.equal(r.att.get('p2')!.status, 'locked');
});
test('validateConfig', () => {
  const ok = { status: 'running' as const, durationMin: 30, passMark: 70, weights: DEFAULT_WEIGHTS, resultsReleased: false };
  assert.equal(A.validateConfig(ok).durationMin, 30);
  assert.throws(() => A.validateConfig({ ...ok, weights: { ...DEFAULT_WEIGHTS, teori: 50 } }));
  assert.throws(() => A.validateConfig({ ...ok, durationMin: 0 })); assert.throws(() => A.validateConfig({ ...ok, passMark: 101 }));
});
