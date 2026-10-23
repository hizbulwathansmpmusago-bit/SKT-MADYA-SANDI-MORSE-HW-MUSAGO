// Cloud Functions (v2, callable) — pembungkus tipis di atas logika murni (attempts.ts, authz.ts, roster.ts).
// CATATAN: berkas ini belum dikompilasi/diuji di sesi pembuatan (paket firebase-* belum terpasang, tanpa internet).
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createHash } from 'node:crypto';
import * as A from './attempts';
import { resolveActor, planAccount, assertNotSelf, assertAdminRemains, AccountPlan, ROLES } from './authz';
import { Question, DEFAULT_WEIGHTS, encode, decode } from './morse';
import { importRoster, toCsv } from './roster';

// Region HARUS sama dengan FUNCTIONS_REGION di web/firebase-config.js (sebelumnya tidak diset -> default us-central1 -> panggilan klien gagal).
setGlobalOptions({ region: 'asia-southeast2', maxInstances: 10 });
initializeApp(); const db = getFirestore();

const store: A.Store = {
  nowMs: () => Date.now(),
  async getConfig() {
    const d = await db.doc('config/exam').get(); const c = (d.data() ?? {}) as Partial<A.ExamConfig>;
    return { status: c.status ?? 'draft', durationMin: c.durationMin ?? 30, passMark: c.passMark ?? 70, weights: c.weights ?? DEFAULT_WEIGHTS, resultsReleased: c.resultsReleased ?? false };
  },
  async getQuestions() {
    const [q, k] = await Promise.all([db.collection('questions').orderBy('order').get(), db.collection('answerKeys').get()]);
    const keys = new Map(k.docs.map(d => [d.id, d.data().answer as string]));
    return q.docs.map(d => ({ id: d.id, ...(d.data() as object), answer: keys.get(d.id) ?? '' }) as Question);
  },
  async getAttempt(uid) { const d = await db.doc(`attempts/${uid}`).get(); return d.exists ? (d.data() as A.Attempt) : null; },
  async updateAttempt(uid, fn) {
    const ref = db.doc(`attempts/${uid}`);
    return db.runTransaction(async tx => {
      const s = await tx.get(ref); const next = fn(s.exists ? (s.data() as A.Attempt) : null);
      if (next) tx.set(ref, JSON.parse(JSON.stringify(next))); // buang field undefined
      return next;
    });
  },
  async addAudit(e) { await db.collection('audit').add({ ...e, ts: FieldValue.serverTimestamp() }); },
};

/** Identitas pemanggil ditentukan SERVER dari data Auth terbaru (bukan klaim di token): akun nonaktif, peran berubah, atau sesi dicabut langsung berlaku. */
async function actor(req: CallableRequest): Promise<A.Actor> {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login diperlukan');
  const uid = req.auth.uid;
  const rec = await getAuth().getUser(uid).catch(() => null);
  try {
    return resolveActor(rec && { uid, disabled: rec.disabled, customClaims: rec.customClaims as Record<string, unknown> | undefined,
      tokensValidAfterMs: rec.tokensValidAfterTime ? Date.parse(rec.tokensValidAfterTime) : undefined }, (req.auth.token as { iat?: number }).iat);
  } catch (e) { if (e instanceof A.HttpError) throw new HttpsError(e.code as never, e.message); throw e; }
}
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e) { if (e instanceof A.HttpError) throw new HttpsError(e.code as never, e.message); throw e; }
}
const adminOnly = async (r: CallableRequest) => { const w = await actor(r); if (w.role !== 'admin') throw new HttpsError('permission-denied', 'Hanya admin'); return w; };

// ===== Identitas & ujian =====
/** Dipanggil klien setelah login: peran/regu/izin otoritatif dari server; akun nonaktif/tanpa peran ditolak di sini. */
export const whoami = onCall(async r => guard(async () => {
  const w = await actor(r); const u = (await db.doc(`users/${w.uid}`).get()).data();
  return { uid: w.uid, role: w.role, team: w.team ?? null, canUnlock: w.canUnlock === true, nama: (u?.nama as string) ?? null };
}));
export const startAttempt = onCall(async r => guard(async () => { const w = await actor(r); return A.startAttempt(store, w, Number(w.team)); }));
export const getQuestions = onCall(async r => guard(async () => A.getQuestions(store, await actor(r))));
export const saveAnswer = onCall(async r => guard(async () => A.saveAnswer(store, await actor(r), String(r.data.qid), String(r.data.value))));
export const reportVisibilityLoss = onCall(async r => guard(async () => A.reportVisibilityLoss(store, await actor(r))));
export const submitAttempt = onCall(async r => guard(async () => A.submitAttempt(store, await actor(r))));
export const getResult = onCall(async r => guard(async () => A.getResult(store, await actor(r))));
export const setManualScore = onCall(async r => guard(async () => A.setManualScore(store, await actor(r), String(r.data.uid), r.data.field, r.data.value)));
export const unlockAttempt = onCall(async r => guard(async () => A.unlockAttempt(store, await actor(r), String(r.data.uid), String(r.data.reason ?? ''), Number(r.data.extraMin ?? 0))));
export const closeExpired = onSchedule('every 1 minutes', async () => {
  const s = await db.collection('attempts').where('status', '==', 'in_progress').get(); await A.closeExpired(store, s.docs.map(d => d.id));
});

// ===== Akun: dibuat & diberi peran HANYA lewat Admin SDK. Tidak ada password yang dibuat, disimpan, atau ditampilkan. =====
/** Buat akun TANPA password + claims + profil; pengguna menetapkan passwordnya sendiri lewat tautan/email atur password. */
async function provision(plan: AccountPlan, extra: Record<string, unknown> = {}) {
  const auth = getAuth();
  const u = await auth.createUser({ email: plan.email, displayName: String(plan.profile.nama) });
  try {
    await auth.setCustomUserClaims(u.uid, plan.claims);
    await db.doc(`users/${u.uid}`).set({ ...plan.profile, ...extra, createdAtMs: Date.now() });
    const linkAtur = await auth.generatePasswordResetLink(plan.email);
    return { uid: u.uid, linkAtur };
  } catch (e) { await auth.deleteUser(u.uid).catch(() => undefined); throw e; } // jangan tinggalkan akun setengah jadi
}
const authError = (e: unknown): never => {
  const c = String((e as { code?: string })?.code ?? '');
  if (c.includes('email-already-exists')) throw new HttpsError('already-exists', 'Email sudah terdaftar');
  if (c.includes('invalid-email')) throw new HttpsError('invalid-argument', 'Format email tidak valid');
  throw e;
};
export const adminCreateAccount = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const plan = planAccount(r.data ?? {});
  try { const res = await provision(plan); await store.addAudit({ atMs: Date.now(), actor: w.uid, action: 'create_account', target: res.uid, detail: { role: plan.claims.role, team: plan.claims.team ?? null } }); return { ...res, email: plan.email }; }
  catch (e) { return authError(e); }
}));
export const adminSetRole = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const uid = String(r.data?.uid ?? ''); assertNotSelf(w, uid, 'mengubah peran');
  const auth = getAuth(); const rec = await auth.getUser(uid).catch(() => null); if (!rec) throw new HttpsError('not-found', 'Akun tidak ditemukan');
  const prof = (await db.doc(`users/${uid}`).get()).data() ?? {};
  const plan = planAccount({ email: rec.email ?? '', nama: String(prof.nama ?? rec.displayName ?? 'Pengguna'), role: r.data.role, team: r.data.team, canUnlock: r.data.canUnlock, kelas: prof.kelas, dewan: prof.dewan });
  const before = rec.customClaims ?? {};
  if (before.role === 'admin' && plan.claims.role !== 'admin') assertAdminRemains(await activeAdminsExcluding(uid));
  await auth.setCustomUserClaims(uid, plan.claims); await auth.revokeRefreshTokens(uid); // token lama ditolak -> klaim baru berlaku
  const patch: Record<string, unknown> = { role: plan.claims.role, team: plan.claims.team ?? FieldValue.delete(), regu: plan.claims.team ?? FieldValue.delete(), canUnlock: plan.claims.canUnlock ?? FieldValue.delete() };
  await db.doc(`users/${uid}`).set(patch, { merge: true });
  await store.addAudit({ atMs: Date.now(), actor: w.uid, action: 'set_role', target: uid, detail: { before, after: plan.claims } }); return { ok: true };
}));
async function activeAdminsExcluding(uid: string): Promise<number> {
  const s = await db.collection('users').where('role', '==', 'admin').get(); return s.docs.filter(d => d.id !== uid && d.data().disabled !== true).length;
}
export const adminSetDisabled = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const uid = String(r.data?.uid ?? ''); const disabled = r.data?.disabled === true; assertNotSelf(w, uid, 'menonaktifkan');
  const auth = getAuth(); const rec = await auth.getUser(uid).catch(() => null); if (!rec) throw new HttpsError('not-found', 'Akun tidak ditemukan');
  if (disabled && rec.customClaims?.role === 'admin') assertAdminRemains(await activeAdminsExcluding(uid));
  await auth.updateUser(uid, { disabled }); if (disabled) await auth.revokeRefreshTokens(uid);
  await db.doc(`users/${uid}`).set({ disabled }, { merge: true });
  await store.addAudit({ atMs: Date.now(), actor: w.uid, action: disabled ? 'disable_account' : 'enable_account', target: uid }); return { ok: true };
}));
/** Tautan atur-ulang password (bukan password). Kirim ke pemilik akun lewat saluran pribadi; berlaku sekali pakai & kedaluwarsa. */
export const adminResetLink = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const rec = await getAuth().getUser(String(r.data?.uid ?? '')).catch(() => null);
  if (!rec?.email) throw new HttpsError('not-found', 'Akun tidak ditemukan');
  const linkAtur = await getAuth().generatePasswordResetLink(rec.email);
  await store.addAudit({ atMs: Date.now(), actor: w.uid, action: 'reset_link', target: rec.uid }); return { email: rec.email, linkAtur };
}));
/** Impor roster CSV -> akun peserta TANPA password + tautan atur password. Nama asli dipertahankan; duplikasi ditandai; baris yang sudah ada dilewati. */
export const adminImportRoster = onCall({ timeoutSeconds: 300 }, async r => guard(async () => {
  const w = await adminOnly(r); const res = importRoster(String(r.data?.csv ?? '')); if (r.data?.dryRun) return res;
  const akun: Array<{ nama: string; email: string; status: 'dibuat' | 'sudah_ada' | 'gagal'; linkAtur?: string; pesan?: string }> = [];
  for (const row of res.rows) {
    // Email deterministik & bebas tabrakan (hash nama+regu+dewan), kecuali CSV menyediakan email asli.
    const key = createHash('sha256').update([row.nama.toLowerCase(), row.regu, row.dewan].join('|')).digest('hex').slice(0, 12);
    const email = row.email ?? `p${key}@skt.hwmusago.local`;
    try {
      const plan = planAccount({ email, nama: row.nama, role: 'peserta', team: row.regu, kelas: row.kelas, dewan: row.dewan || undefined });
      const out = await provision(plan, { duplicate: row.duplicate }); akun.push({ nama: row.nama, email, status: 'dibuat', linkAtur: out.linkAtur });
    } catch (e) {
      const c = String((e as { code?: string })?.code ?? '');
      akun.push({ nama: row.nama, email, status: c.includes('email-already-exists') ? 'sudah_ada' : 'gagal', pesan: c.includes('email-already-exists') ? 'Akun sudah ada, dilewati' : 'Gagal dibuat' });
    }
  }
  await store.addAudit({ atMs: Date.now(), actor: w.uid, action: 'import_roster', target: '*', detail: { dibuat: akun.filter(a => a.status === 'dibuat').length, total: res.rows.length } });
  return { ...res, akun };
}));
export const adminExportCsv = onCall(async r => guard(async () => {
  await adminOnly(r);
  const cfg = await store.getConfig(); const [us, as] = await Promise.all([db.collection('users').where('role', '==', 'peserta').get(), db.collection('attempts').get()]);
  const at = new Map(as.docs.map(d => [d.id, d.data() as A.Attempt]));
  const rows = us.docs.map(d => { const u = d.data(); const a = at.get(d.id); const x = a ? A.resultFor(a, cfg) : null;
    return [u.nama, u.dewan, u.kelas, u.regu, a?.status ?? 'belum_mulai', x?.theory ?? '', a?.manual?.praktik ?? '', a?.manual?.ketelitian ?? '', a?.manual?.kedisiplinan ?? '', a?.manual?.sikap ?? '', x?.total ?? '', x ? (x.complete ? (x.passed ? 'LULUS' : 'TIDAK LULUS') : 'BELUM LENGKAP') : '', u.duplicate ? 'DUPLIKASI NAMA' : '']; });
  return { csv: toCsv(['Nama', 'Dewan', 'Kelas', 'Regu', 'Status', 'Teori', 'Praktik', 'Ketelitian', 'Kedisiplinan', 'Sikap', 'Total', 'Hasil', 'Catatan'], rows) };
}));

// ===== Konfigurasi ujian & bank soal (admin) =====
export const adminSetConfig = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const cfg = A.validateConfig(r.data ?? {}); const before = await store.getConfig();
  await db.doc('config/exam').set(cfg); await store.addAudit({ atMs: Date.now(), actor: w.uid, action: 'set_config', target: 'config/exam', detail: { before, after: cfg } }); return cfg;
}));
export const adminEndExam = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const cfg = await store.getConfig(); await db.doc('config/exam').set({ ...cfg, status: 'ended' });
  const s = await db.collection('attempts').where('status', '==', 'in_progress').get(); return { dikirimPaksa: await A.endExam(store, w, s.docs.map(d => d.id)) };
}));
export const adminListQuestions = onCall(async r => guard(async () => { await adminOnly(r); return { questions: await store.getQuestions() }; }));
export const adminSaveQuestion = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const q = (r.data ?? {}) as Question & { order?: number };
  if (!['decode', 'encode', 'knowledge'].includes(q.type) || !q.prompt || !q.answer) throw new HttpsError('invalid-argument', 'Soal tidak lengkap');
  if (q.type === 'knowledge' && !(q.options ?? []).includes(q.answer)) throw new HttpsError('invalid-argument', 'Kunci harus salah satu opsi');
  try { if (q.type === 'decode') encode(q.answer); if (q.type === 'encode') decode(q.answer); } catch (e) { throw new HttpsError('invalid-argument', 'Kunci jawaban bukan Morse/teks yang valid: ' + (e as Error).message); }
  const id = q.id || db.collection('questions').doc().id;
  await db.doc(`questions/${id}`).set({ type: q.type, prompt: q.prompt, options: q.options ?? [], points: q.points ?? 1, order: q.order ?? Date.now() });
  await db.doc(`answerKeys/${id}`).set({ answer: q.answer });
  await store.addAudit({ atMs: Date.now(), actor: w.uid, action: 'save_question', target: id }); return { id };
}));
export const adminDeleteQuestion = onCall(async r => guard(async () => {
  const w = await adminOnly(r); const id = String(r.data?.id); await db.doc(`questions/${id}`).delete(); await db.doc(`answerKeys/${id}`).delete();
  await store.addAudit({ atMs: Date.now(), actor: w.uid, action: 'delete_question', target: id }); return { ok: true };
}));
void ROLES;
