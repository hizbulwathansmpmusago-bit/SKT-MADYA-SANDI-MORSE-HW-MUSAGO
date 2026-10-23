// Otorisasi akun (murni, tanpa Firebase) — dipakai Cloud Functions agar peran/izin SELALU ditentukan server.
import { Actor, HttpError, Role } from './attempts';

export const ROLES: readonly Role[] = ['peserta', 'penguji', 'admin'];
/** Bentuk minimal UserRecord dari Admin SDK. */
export interface AuthRecord { uid: string; disabled: boolean; customClaims?: Record<string, unknown>; tokensValidAfterMs?: number }
const isTeam = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 7;
const deny = (code: string, msg: string): never => { throw new HttpError(code, msg); };

/**
 * Tentukan Actor dari data Auth di SERVER (bukan dari klaim di token klien):
 * - akun tak ada/dinonaktifkan -> ditolak
 * - token diterbitkan sebelum refresh-token dicabut (peran diubah / akun dinonaktifkan) -> unauthenticated
 * - peran/regu/izin diambil dari customClaims terbaru di Auth, sehingga perubahan peran berlaku langsung.
 */
export function resolveActor(rec: AuthRecord | null, tokenIssuedAtSec?: number): Actor {
  if (!rec) return deny('unauthenticated', 'Akun tidak ditemukan. Silakan masuk lagi.') as never;
  if (rec.disabled) deny('permission-denied', 'Akun dinonaktifkan. Hubungi panitia.');
  if (rec.tokensValidAfterMs && tokenIssuedAtSec !== undefined && tokenIssuedAtSec * 1000 < rec.tokensValidAfterMs)
    deny('unauthenticated', 'Sesi berakhir karena perubahan akun. Silakan masuk lagi.');
  const c = rec.customClaims ?? {};
  const role = c.role as Role;
  if (!ROLES.includes(role)) deny('permission-denied', 'Akun belum memiliki peran. Hubungi admin.');
  if (role !== 'admin' && !isTeam(c.team)) deny('permission-denied', 'Akun belum ditugaskan ke regu. Hubungi admin.');
  return { uid: rec.uid, role, team: role === 'admin' ? undefined : (c.team as number), canUnlock: role === 'penguji' && c.canUnlock === true };
}

export interface NewAccount { email: string; nama: string; role: Role; team?: number; canUnlock?: boolean; kelas?: string; dewan?: string }
export interface AccountPlan { claims: Record<string, unknown>; profile: Record<string, unknown>; email: string }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Validasi permintaan admin membuat/mengubah akun. Hasilnya satu-satunya sumber claims + profil. */
export function planAccount(a: Partial<NewAccount>): AccountPlan {
  const email = String(a.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 120) deny('invalid-argument', 'Format email tidak valid');
  const nama = String(a.nama ?? '').replace(/\s+/g, ' ').trim();
  if (nama.length < 2 || nama.length > 100) deny('invalid-argument', 'Nama 2-100 karakter');
  if (!ROLES.includes(a.role as Role)) deny('invalid-argument', 'Peran harus admin, penguji, atau peserta');
  const role = a.role as Role;
  if (role !== 'admin' && !isTeam(a.team)) deny('invalid-argument', 'Regu wajib 1-7 untuk penguji dan peserta');
  const claims: Record<string, unknown> = { role };
  const profile: Record<string, unknown> = { nama, email, role, disabled: false };
  if (role !== 'admin') { claims.team = a.team; profile.team = a.team; profile.regu = a.team; }
  if (role === 'penguji') { claims.canUnlock = a.canUnlock === true; profile.canUnlock = a.canUnlock === true; }
  if (role === 'peserta') { profile.kelas = String(a.kelas ?? '').slice(0, 20); if (a.dewan === 'DP8' || a.dewan === 'DP9') profile.dewan = a.dewan; }
  return { claims, profile, email };
}
/** Admin tidak boleh menurunkan/menonaktifkan dirinya sendiri (mencegah terkunci dari sistem). */
export function assertNotSelf(who: Actor, targetUid: string, what: string): void {
  if (who.uid === targetUid) deny('failed-precondition', `Admin tidak dapat ${what} akunnya sendiri`);
}
/** Jangan pernah membiarkan sistem tanpa admin aktif. */
export function assertAdminRemains(activeAdminsAfter: number): void {
  if (activeAdminsAfter < 1) deny('failed-precondition', 'Harus tersisa minimal satu admin aktif');
}
