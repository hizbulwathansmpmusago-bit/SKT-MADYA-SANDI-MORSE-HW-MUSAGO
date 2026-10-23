// Logika percobaan ujian (server-side), terpisah dari Firebase lewat antarmuka Store.
// Cloud Functions hanyalah pembungkus tipis di atas modul ini.
import { Question, Weights, DEFAULT_WEIGHTS, scoreAnswers, finalScore, remainingMs } from './morse';

export type Role = 'peserta' | 'penguji' | 'admin';
export interface Actor { uid: string; role: Role; team?: number; canUnlock?: boolean }
export type Status = 'in_progress' | 'locked' | 'submitted' | 'expired';
export interface ExamConfig {
  status: 'draft' | 'running' | 'ended'; durationMin: number; passMark: number; weights: Weights; resultsReleased: boolean;
}
export interface Attempt {
  uid: string; team: number; status: Status; startedAtMs: number; durationMin: number;
  answers: Record<string, string>; lockedAtMs?: number; lockReason?: string; submittedAtMs?: number;
  theory?: { correct: number; count: number; score: number };
  manual?: { praktik?: number | null; ketelitian?: number | null; kedisiplinan?: number | null; sikap?: number | null; catatan?: string };
}
export interface AuditEntry { atMs: number; actor: string; action: string; target: string; reason?: string; detail?: unknown }
export interface Store {
  getConfig(): Promise<ExamConfig>;
  getQuestions(): Promise<Question[]>; // termasuk kunci jawaban; HANYA dipakai di server
  getAttempt(uid: string): Promise<Attempt | null>;
  /** Transaksi baca-ubah-tulis atomik untuk satu percobaan. */
  updateAttempt(uid: string, fn: (cur: Attempt | null) => Attempt | null): Promise<Attempt | null>;
  addAudit(e: AuditEntry): Promise<void>;
  nowMs(): number;
}
export class HttpError extends Error { constructor(public code: string, msg: string) { super(msg); } }
const need = (c: boolean, code: string, msg: string): void => { if (!c) throw new HttpError(code, msg); };

/** Kunci dikenakan jika sudah lewat waktu: ubah ke expired (tanpa mengubah jawaban). */
function applyExpiry(a: Attempt, now: number): Attempt {
  if (a.status === 'in_progress' && remainingMs(a.startedAtMs, a.durationMin, now) === 0) return { ...a, status: 'expired' };
  return a;
}
export async function startAttempt(s: Store, who: Actor, team: number): Promise<{ attempt: Attempt; remainingMs: number }> {
  need(who.role === 'peserta', 'permission-denied', 'Hanya peserta');
  const cfg = await s.getConfig();
  need(cfg.status === 'running', 'failed-precondition', 'Ujian belum dimulai atau sudah berakhir');
  const now = s.nowMs();
  const res = await s.updateAttempt(who.uid, cur => cur ?? { uid: who.uid, team, status: 'in_progress', startedAtMs: now, durationMin: cfg.durationMin, answers: {} });
  const a = applyExpiry(res!, now);
  return { attempt: a, remainingMs: remainingMs(a.startedAtMs, a.durationMin, now) };
}
/** Soal untuk peserta: TANPA kunci jawaban. Terkunci/selesai -> ditolak. */
export async function getQuestions(s: Store, who: Actor): Promise<Array<Omit<Question, 'answer'>>> {
  need(who.role === 'peserta', 'permission-denied', 'Hanya peserta');
  const a = await s.getAttempt(who.uid);
  need(!!a, 'failed-precondition', 'Mulai ujian terlebih dahulu');
  need(applyExpiry(a!, s.nowMs()).status === 'in_progress', 'failed-precondition', 'Percobaan tidak aktif');
  return (await s.getQuestions()).map(({ answer: _k, ...rest }) => rest);
}
export async function saveAnswer(s: Store, who: Actor, qid: string, value: string): Promise<{ remainingMs: number }> {
  need(who.role === 'peserta', 'permission-denied', 'Hanya peserta');
  need(typeof value === 'string' && value.length <= 500, 'invalid-argument', 'Jawaban tidak valid');
  const qs = await s.getQuestions(); need(qs.some(q => q.id === qid), 'invalid-argument', 'Soal tidak dikenal');
  const now = s.nowMs(); let rem = 0;
  await s.updateAttempt(who.uid, cur => {
    need(!!cur, 'failed-precondition', 'Belum memulai');
    const a = applyExpiry(cur!, now); need(a.status === 'in_progress', 'failed-precondition', 'Percobaan tidak aktif');
    rem = remainingMs(a.startedAtMs, a.durationMin, now);
    return { ...a, answers: { ...a.answers, [qid]: value } };
  });
  return { remainingMs: rem };
}
/** Page Visibility: satu kali kehilangan visibilitas saat ujian aktif -> kunci, disimpan server. Idempoten. */
export async function reportVisibilityLoss(s: Store, who: Actor): Promise<{ status: Status }> {
  need(who.role === 'peserta', 'permission-denied', 'Hanya peserta');
  const now = s.nowMs(); let locked = false; let status: Status = 'in_progress';
  await s.updateAttempt(who.uid, cur => {
    if (!cur) return cur;                           // sebelum ujian dimulai: tidak ada efek
    const a = applyExpiry(cur, now); status = a.status;
    if (a.status !== 'in_progress') return a;       // sudah terkirim/terkunci/habis: tidak ada efek
    locked = true; status = 'locked';
    return { ...a, status: 'locked', lockedAtMs: now, lockReason: 'Berpindah tab/aplikasi saat ujian' };
  });
  if (locked) await s.addAudit({ atMs: now, actor: who.uid, action: 'auto_lock', target: who.uid, reason: 'visibility_loss' });
  return { status };
}
export async function submitAttempt(s: Store, who: Actor): Promise<{ status: Status; theory?: Attempt['theory'] }> {
  need(who.role === 'peserta', 'permission-denied', 'Hanya peserta');
  const qs = await s.getQuestions(); const now = s.nowMs(); let out: Attempt | null = null;
  await s.updateAttempt(who.uid, cur => {
    need(!!cur, 'failed-precondition', 'Belum memulai');
    if (cur!.status === 'submitted') { out = cur; return cur; }  // idempoten
    need(cur!.status === 'in_progress', 'failed-precondition', 'Percobaan terkunci atau waktu habis');
    need(remainingMs(cur!.startedAtMs, cur!.durationMin, now) > 0, 'failed-precondition', 'Waktu habis');
    out = { ...cur!, status: 'submitted', submittedAtMs: now, theory: scoreAnswers(qs, cur!.answers) };
    return out;
  });
  return { status: out!.status, theory: out!.theory };
}
/** Tutup semua percobaan yang waktunya habis: nilai jawaban yang sudah tersimpan. Dipanggil terjadwal/admin. */
export async function closeExpired(s: Store, uids: string[]): Promise<number> {
  const qs = await s.getQuestions(); const now = s.nowMs(); let n = 0;
  for (const uid of uids) {
    await s.updateAttempt(uid, cur => {
      if (!cur || cur.status !== 'in_progress' || remainingMs(cur.startedAtMs, cur.durationMin, now) > 0) return cur;
      n++; return { ...cur, status: 'expired', submittedAtMs: now, theory: scoreAnswers(qs, cur.answers) };
    });
  }
  return n;
}
export async function unlockAttempt(s: Store, who: Actor, uid: string, reason: string, extraMin = 0): Promise<void> {
  need(who.role === 'admin' || (who.role === 'penguji' && who.canUnlock === true), 'permission-denied', 'Tidak punya izin membuka kunci');
  need(typeof reason === 'string' && reason.trim().length >= 5, 'invalid-argument', 'Alasan wajib (min. 5 karakter)');
  need(Number.isFinite(extraMin) && extraMin >= 0 && extraMin <= 30, 'invalid-argument', 'Tambahan waktu 0-30 menit');
  const now = s.nowMs();
  await s.updateAttempt(uid, cur => {
    need(!!cur, 'not-found', 'Percobaan tidak ada');
    if (who.role === 'penguji') need(cur!.team === who.team, 'permission-denied', 'Bukan regu yang ditugaskan');
    need(cur!.status === 'locked', 'failed-precondition', 'Percobaan tidak sedang terkunci');
    // Mulai ulang jam hanya sebanyak waktu tersisa saat kunci + tambahan; waktu tidak dapat "dicuri" untuk mengulang.
    const used = (cur!.lockedAtMs ?? now) - cur!.startedAtMs;
    const startedAtMs = now - used; // waktu terpakai tetap; tambahan menit masuk ke durationMin
    return { ...cur!, status: 'in_progress', startedAtMs, durationMin: cur!.durationMin + extraMin, lockedAtMs: undefined, lockReason: undefined };
  });
  await s.addAudit({ atMs: now, actor: who.uid, action: 'unlock', target: uid, reason: reason.trim(), detail: { extraMin } });
}
export async function setManualScore(s: Store, who: Actor, uid: string, field: 'praktik' | 'ketelitian' | 'kedisiplinan' | 'sikap' | 'catatan', value: number | string): Promise<void> {
  need(who.role === 'admin' || who.role === 'penguji', 'permission-denied', 'Hanya penguji/admin');
  if (field === 'catatan') need(typeof value === 'string' && value.length <= 1000, 'invalid-argument', 'Catatan maks. 1000 karakter');
  else need(typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100, 'invalid-argument', 'Nilai 0-100');
  const now = s.nowMs(); let before: unknown;
  await s.updateAttempt(uid, cur => {
    need(!!cur, 'not-found', 'Peserta belum memiliki percobaan');
    if (who.role === 'penguji') need(cur!.team === who.team, 'permission-denied', 'Bukan regu yang ditugaskan');
    before = cur!.manual?.[field];
    return { ...cur!, manual: { ...cur!.manual, [field]: value } };
  });
  await s.addAudit({ atMs: now, actor: who.uid, action: 'set_manual_score', target: uid, detail: { field, before: before ?? null, after: value } });
}
export function resultFor(a: Attempt, cfg: ExamConfig) {
  const theory = a.theory?.score ?? 0;
  const f = finalScore(theory, a.manual ?? {}, cfg.weights ?? DEFAULT_WEIGHTS);
  return { theory, total: f.total, complete: f.complete, passed: f.complete && f.total >= cfg.passMark };
}
/** Peserta hanya melihat hasil jika dirilis admin dan penilaian lengkap. */
export async function getResult(s: Store, who: Actor) {
  need(who.role === 'peserta', 'permission-denied', 'Hanya peserta');
  const cfg = await s.getConfig(); const a = await s.getAttempt(who.uid);
  need(!!a && (a.status === 'submitted' || a.status === 'expired'), 'failed-precondition', 'Belum ada hasil');
  need(cfg.resultsReleased, 'failed-precondition', 'Hasil belum dirilis');
  return resultFor(a!, cfg);
}

/** Admin mengakhiri ujian: percobaan aktif dikirim paksa (dinilai dari jawaban tersimpan); yang terkunci tetap terkunci. */
export async function endExam(s: Store, who: Actor, uids: string[]): Promise<number> {
  need(who.role === 'admin', 'permission-denied', 'Hanya admin');
  const qs = await s.getQuestions(); const now = s.nowMs(); let n = 0;
  for (const uid of uids) {
    await s.updateAttempt(uid, cur => {
      if (!cur || cur.status !== 'in_progress') return cur;
      n++; return { ...cur, status: 'submitted', submittedAtMs: now, theory: scoreAnswers(qs, cur.answers) };
    });
  }
  await s.addAudit({ atMs: now, actor: who.uid, action: 'end_exam', target: '*', detail: { dikirimPaksa: n } });
  return n;
}
/** Validasi konfigurasi dari admin (bobot total 100, durasi wajar). */
export function validateConfig(c: Partial<ExamConfig>): ExamConfig {
  const w = c.weights ?? DEFAULT_WEIGHTS; const sum = w.teori + w.praktik + w.ketelitian + w.kedisiplinan + w.sikap;
  need(sum === 100, 'invalid-argument', 'Total bobot harus 100');
  need(Object.values(w).every(v => Number.isInteger(v) && v >= 0), 'invalid-argument', 'Bobot harus bilangan bulat >= 0');
  need(Number.isInteger(c.durationMin) && c.durationMin! >= 1 && c.durationMin! <= 240, 'invalid-argument', 'Durasi 1-240 menit');
  need(typeof c.passMark === 'number' && c.passMark >= 0 && c.passMark <= 100, 'invalid-argument', 'Ambang lulus 0-100');
  need(['draft', 'running', 'ended'].includes(c.status as string), 'invalid-argument', 'Status tidak valid');
  return { status: c.status!, durationMin: c.durationMin!, passMark: c.passMark!, weights: w, resultsReleased: !!c.resultsReleased };
}
