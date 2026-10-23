// SKT Madya — Sandi Morse. Antarmuka tipis: semua keputusan (timer, kunci, nilai, penguncian) ada di server.
// Backend yang dipakai (functions/src/index.ts): startAttempt, getQuestions, saveAnswer, reportVisibilityLoss,
// submitAttempt, getResult, setManualScore, unlockAttempt, whoami, adminCreateAccount, adminSetRole, adminSetDisabled, adminResetLink,
// adminImportRoster, adminExportCsv, adminSetConfig, adminEndExam.
import { firebaseConfig, FUNCTIONS_REGION, USE_EMULATORS } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { authRetry: false, user: null, role: null, team: null, canUnlock: false, profile: null, ready: false, examActive: false, tatibOk: false, sound: false, next: null, notice: null, adminTeam: 1 };
let fb = null, fbReady = Promise.resolve(false);
const isWeb = () => /^https?:$/.test(location.protocol);
const configured = () => !Object.values(firebaseConfig).some(v => !String(v).trim() || String(v).startsWith('ISI_')) && /^[a-z0-9-]{4,30}$/.test(String(firebaseConfig.projectId));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const codeOf = e => String(e?.code || '').replace(/^(functions|auth|firestore)\//, '');

/* ---------- Firebase ---------- */
async function initFirebase() {
  if (!isWeb() || !configured()) return false; // berkas lokal (content:// / file://) tidak dapat memakai Firebase Auth
  try {
    const [A, Au, F, Fn] = await Promise.all(['app', 'auth', 'firestore', 'functions'].map(n => import(`${SDK}${n}.js`)));
    const app = A.initializeApp(firebaseConfig);
    const auth = Au.getAuth(app), db = F.getFirestore(app), fns = Fn.getFunctions(app, FUNCTIONS_REGION);
    if (USE_EMULATORS && ['localhost', '127.0.0.1'].includes(location.hostname)) {
      Au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      F.connectFirestoreEmulator(db, '127.0.0.1', 8080); Fn.connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    }
    fb = { auth, db, fns, Au, F, Fn }; return true;
  } catch (e) { console.error('Firebase gagal dimuat', e); return false; }
}
async function call(name, data) {
  if (!fb) throw Object.assign(new Error('Layanan belum siap'), { code: 'unavailable' });
  try { return (await fb.Fn.httpsCallable(fb.fns, name)(data)).data; }
  catch (e) {
    if (String(e.code).endsWith('unauthenticated')) sessionExpired();
    // 'internal' tanpa respons server biasanya = error CORS di console: fungsi belum di-deploy di region ini, ditolak IAM, atau crash saat start.
    if (String(e.code).endsWith('internal')) console.error(`[backend] Panggilan fungsi "${name}" gagal tanpa respons server (region ${FUNCTIONS_REGION}). Jalankan: node scripts/check-functions.mjs — lihat DEPLOY.md`, e);
    throw e;
  }
}
const fget = async p => { const s = await fb.F.getDoc(fb.F.doc(fb.db, p)); return s.exists() ? s.data() : null; };
const fq = async (col, ...c) => (await fb.F.getDocs(fb.F.query(fb.F.collection(fb.db, col), ...c))).docs.map(d => ({ id: d.id, ...d.data() }));
function sessionExpired() { toast('Sesi login berakhir. Silakan masuk lagi.', 'err'); if (fb?.auth.currentUser) fb.Au.signOut(fb.auth); }

function errMsg(e) {
  const c = String(e?.code || '').replace(/^(functions|auth|firestore)\//, '');
  const net = 'Koneksi gagal. Periksa internet lalu coba lagi.';
  const M = { unauthenticated: 'Sesi login berakhir. Silakan masuk lagi.', 'permission-denied': 'Akses ditolak: akun ini tidak berhak melakukan tindakan tersebut.', unavailable: net, 'network-request-failed': net,
    'deadline-exceeded': 'Server terlalu lama merespons. Coba lagi.', internal: 'Server backend tidak dapat dihubungi atau mengalami kesalahan. Coba lagi; bila berulang, hubungi admin sistem (fungsi Cloud Functions mungkin belum di-deploy di region asia-southeast2).', 'invalid-credential': 'Email atau password salah.', 'wrong-password': 'Email atau password salah.',
    'user-not-found': 'Email atau password salah.', 'invalid-login-credentials': 'Email atau password salah.', 'too-many-requests': 'Terlalu banyak percobaan. Tunggu beberapa menit.', 'user-disabled': 'Akun dinonaktifkan. Hubungi panitia.',
    'requires-recent-login': 'Demi keamanan, keluar lalu masuk lagi sebelum mengganti password.', 'weak-password': 'Password terlalu lemah (minimal 6 karakter).', 'invalid-email': 'Format email tidak valid.',
    'invalid-api-key': 'Konfigurasi Firebase salah (API key tidak valid). Hubungi admin sistem.', 'api-key-not-valid.-please-pass-a-valid-api-key.': 'Konfigurasi Firebase salah (API key tidak valid). Hubungi admin sistem.',
    'configuration-not-found': 'Firebase Authentication belum diaktifkan pada proyek ini. Hubungi admin sistem.', 'operation-not-allowed': 'Login Email/Password belum diaktifkan di Firebase Console.',
    'unauthorized-domain': 'Domain situs ini belum diizinkan di Firebase Authentication (Authorized domains).', 'user-token-expired': 'Sesi login berakhir. Silakan masuk lagi.',
    'missing-email': 'Email wajib diisi.', 'already-exists': 'Email sudah terdaftar.' };
  if (M[c]) return M[c];
  if (['failed-precondition', 'invalid-argument', 'not-found', 'already-exists'].includes(c) && e.message) return e.message;
  return e?.message || 'Terjadi kesalahan.';
}

/* ---------- UI util ---------- */
function toast(msg, kind = '') { const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').append(t); setTimeout(() => t.remove(), 5000); }
const loading = (el, m = 'Memuat…') => { el.innerHTML = `<div class="center-msg"><div class="spinner" aria-hidden="true"></div><p>${esc(m)}</p></div>`; };
const failBox = (el, e) => { el.innerHTML = `<div class="notice" role="alert"><b>Gagal memuat.</b> ${esc(errMsg(e))}</div><p><button class="btn secondary" data-act="reload" type="button">Coba lagi</button></p>`; };
const fmtMs = ms => { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtDate = ms => ms ? new Date(ms).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' }) : '—';
const ST = { in_progress: ['Mengerjakan', 'blue'], locked: ['Terkunci', 'red'], submitted: ['Terkirim', 'green'], expired: ['Waktu habis', 'gray'] };
const pill = s => { const [t, c] = ST[s] || ['Belum mulai', 'gray']; return `<span class="pill ${c}">${t}</span>`; };
const CFGST = { draft: 'Belum dibuka', running: 'Berlangsung', ended: 'Selesai' };
const setBusy = (b, on) => { b.disabled = on; on ? b.setAttribute('aria-busy', 'true') : b.removeAttribute('aria-busy'); };

function dialog({ title, body = '', ok = 'OK', danger = false, cancel = true, onSubmit }) {
  const d = $('#dlg'), f = $('#dlg-form'), err = $('#dlg-err'), okb = $('#dlg-ok');
  $('#dlg-title').textContent = title; $('#dlg-body').innerHTML = body; err.hidden = true; okb.textContent = ok; okb.className = 'btn' + (danger ? ' danger' : ''); $('#dlg-cancel').hidden = !cancel;
  f.onsubmit = async ev => {
    ev.preventDefault(); setBusy(okb, true);
    try { if (onSubmit) await onSubmit(new FormData(f)); d.close(); } catch (e) { err.textContent = e.userMsg || errMsg(e); err.hidden = false; } finally { setBusy(okb, false); }
  };
  $('#dlg-cancel').onclick = () => d.close();
  d.showModal();
}
const bad = m => Object.assign(new Error(m), { userMsg: m });

/* ---------- Suara ---------- */
let AC = null;
function ensureAC() { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; AC = AC || new C(); if (AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, ms, at = 0) {
  const ac = ensureAC(); if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at;
  o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.25, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + ms / 1000);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + ms / 1000 + .05);
}
function enableSound() {
  if (!ensureAC()) { $$('.js-sound-msg').forEach(m => m.textContent = 'Perangkat ini tidak mendukung audio.'); return; }
  S.sound = true; tone(660, 200);
  $$('.js-sound').forEach(b => b.textContent = 'Suara aktif');
  $$('.js-sound-msg').forEach(m => m.textContent = 'Jika terdengar “bip”, suara berfungsi. Peringatan suara tidak dijamin saat tab tersembunyi.');
}
function playMorse(code) {
  const u = .08; let t = 0;
  for (const ch of code) { if (ch === '.') { tone(700, u * 1000, t); t += 2 * u; } else if (ch === '-') { tone(700, 3 * u * 1000, t); t += 4 * u; } else if (ch === ' ') t += 2 * u; else if (ch === '/') t += 3 * u; }
  return t;
}

/* ---------- Materi ---------- */
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
const REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const enc = t => t.toUpperCase().replace(/\s+/g, ' ').trim().split(' ').map(w => [...w].map(c => MORSE[c] || '?').join(' ')).join(' / ');
const dec = m => m.replace(/[•·]/g, '.').replace(/[–—−]/g, '-').trim().split(/\s*\/\s*/).map(w => w.split(/\s+/).map(c => REV[c] || (c ? '?' : '')).join('')).join(' ');
function initMateri() {
  const tb = $('#morse-table'); if (!tb.children.length) tb.innerHTML = Object.entries(MORSE).map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('');
  const t = $('#pr-text'), m = $('#pr-morse');
  t.oninput = () => { m.value = t.value.trim() ? enc(t.value) : ''; };
  m.oninput = () => { t.value = m.value.trim() ? dec(m.value) : ''; };
  $('#pr-play').onclick = () => { if (!m.value.trim()) { $('#pr-msg').textContent = 'Isi teks atau Morse dulu.'; return; } const d = playMorse(m.value); $('#pr-msg').textContent = ensureAC() ? `Memutar ± ${d.toFixed(1)} detik` : 'Audio tidak didukung.'; };
}

/* ---------- Router ---------- */
const NAV = {
  guest: [['beranda', 'Beranda'], ['materi', 'Materi'], ['login', 'Masuk']],
  peserta: [['dashboard', 'Dashboard'], ['materi', 'Materi'], ['tatib', 'Ujian'], ['hasil', 'Hasil']],
  penguji: [['penguji', 'Dashboard penguji'], ['materi', 'Materi']],
  admin: [['admin', 'Ringkasan'], ['admin/peserta', 'Peserta & regu'], ['admin/penguji', 'Penguji & admin'], ['admin/soal', 'Soal'], ['admin/pengaturan', 'Pengaturan'], ['admin/rekap', 'Rekap & CSV'], ['admin/audit', 'Audit log'], ['penguji', 'Penilaian regu'], ['materi', 'Materi']],
};
const ADM = ['admin', 'peserta', 'penguji', 'soal', 'pengaturan', 'rekap', 'audit'];
const home = () => ({ peserta: 'dashboard', penguji: 'penguji', admin: 'admin' }[S.role] || 'beranda');
const go = n => { const t = '#/' + n; location.hash === t ? route() : (location.hash = t); };
const ALL = ['peserta', 'penguji', 'admin'];
const PAGES = {
  beranda: { init: initHome }, login: { guest: true, init: () => $('#lg-email').focus() }, materi: { init: initMateri },
  dashboard: { roles: ['peserta'], init: renderDash }, tatib: { roles: ['peserta'], init: initTatib }, ujian: { roles: ['peserta'], init: bootExam },
  terkunci: { roles: ['peserta'], init: refreshLock }, hasil: { roles: ['peserta'], init: renderResult },
  penguji: { roles: ['penguji', 'admin'], init: renderExaminer }, penilaian: { roles: ['penguji', 'admin'], init: renderGrade },
  admin: { roles: ['admin'], init: p => adminPage('admin', renderAdminHome) }, 'admin/peserta': { roles: ['admin'], init: () => adminPage('admin/peserta', renderAdminPeserta) },
  'admin/penguji': { roles: ['admin'], init: () => adminPage('admin/penguji', renderAdminPenguji) }, 'admin/soal': { roles: ['admin'], init: () => adminPage('admin/soal', renderAdminSoal) },
  'admin/pengaturan': { roles: ['admin'], init: () => adminPage('admin/pengaturan', renderAdminSettings) }, 'admin/rekap': { roles: ['admin'], init: () => adminPage('admin/rekap', renderAdminRekap) },
  'admin/audit': { roles: ['admin'], init: () => adminPage('admin/audit', renderAdminAudit) },
};
let routeSeq = 0;
async function route() {
  if (!S.ready) return;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean); let name = parts[0] || 'beranda', param = parts[1];
  if (name === 'admin' && parts[1]) { name = 'admin/' + parts[1]; param = parts[2]; }
  const P = PAGES[name]; if (!P) return go('beranda');
  if (S.examActive && name !== 'ujian' && name !== 'terkunci') return go('ujian');
  if (P.roles) {
    if (!S.user) { S.next = name + (param ? '/' + param : ''); return go('login'); }
    if (!P.roles.includes(S.role)) { toast('Anda tidak memiliki akses ke halaman itu.', 'err'); return go(home()); }
  }
  if (P.guest && S.user) { const n = S.next || home(); S.next = null; return go(n); }
  if (name !== 'ujian') stopTimer();
  const seq = ++routeSeq;
  $('#boot').hidden = true; $$('.page').forEach(p => { p.hidden = p.dataset.page !== name; });
  renderChrome(name); window.scrollTo(0, 0); $('#main').focus({ preventScroll: true });
  try { await P.init(param); } catch (e) { if (seq === routeSeq) { const host = $(`[data-page="${name}"] .body`) || $(`[data-page="${name}"] [id$="-root"], [data-page="${name}"] #dash-body`); if (host) failBox(host, e); else toast(errMsg(e), 'err'); } }
}
function renderChrome(active) {
  const key = S.user ? S.role : 'guest';
  const items = S.examActive ? [['ujian', 'Ujian berlangsung']] : NAV[key];
  const cur = active || (location.hash.replace(/^#\/?/, '').split('/').slice(0, location.hash.includes('/admin') ? 2 : 1).join('/') || 'beranda');
  $('#nav').innerHTML = items.map(([n, l]) => `<a href="#/${n}"${n === cur ? ' aria-current="page"' : ''}>${esc(l)}</a>`).join('');
  $('#userchip').hidden = !S.user || S.examActive;
  if (S.user) { $('#chip-name').textContent = S.profile?.nama || S.user.email || ''; $('#chip-role').textContent = { peserta: 'Peserta', penguji: 'Penguji', admin: 'Admin' }[S.role]; }
  const b = $('#banner');
  if (!isWeb()) { b.hidden = false; b.className = 'banner'; b.textContent = 'Dibuka dari berkas lokal: Beranda dan Materi dapat dipakai, tetapi login & ujian hanya berfungsi lewat alamat https (Firebase Hosting).'; }
  else if (!configured()) { b.hidden = false; b.className = 'banner bad'; b.textContent = 'Firebase belum dikonfigurasi: isi web/firebase-config.js. Login dan ujian belum dapat dipakai.'; }
  else if (!fb) { b.hidden = false; b.className = 'banner bad'; b.textContent = 'Gagal memuat Firebase SDK. Periksa koneksi internet lalu muat ulang halaman.'; }
  else if (S.authRetry) { b.hidden = false; b.className = 'banner bad'; b.innerHTML = 'Tidak dapat memverifikasi akun karena koneksi bermasalah. <button class="btn mini" data-act="retry-auth" type="button">Coba lagi</button>'; }
  else b.hidden = true;
  document.documentElement.style.setProperty('--topbar-h', $('.topbar').offsetHeight + 'px');
}
window.addEventListener('hashchange', route);
window.addEventListener('resize', () => document.documentElement.style.setProperty('--topbar-h', $('.topbar').offsetHeight + 'px'));
window.addEventListener('offline', () => toast('Koneksi terputus. Jawaban baru tidak akan tersimpan sampai tersambung kembali.', 'err'));
window.addEventListener('online', () => toast('Koneksi tersambung kembali.', 'ok'));

/* ---------- Auth ---------- */
// Peran/regu/izin SELALU dari server (fungsi whoami memverifikasi akun di Firebase Auth); klaim di token tidak dipercaya untuk UI.
async function onUser(u) {
  if (!u) { Object.assign(S, { user: null, role: null, team: null, canUnlock: false, profile: null, examActive: false, tatibOk: false, authRetry: false }); X && stopTimer(); stopGuard(); $('#login-status').hidden = true; S.ready = true; renderChrome(); return route(); }
  try {
    await u.getIdToken(true);                 // token segar dengan klaim terbaru (dipakai Firestore Rules)
    const me = await call('whoami');          // akun nonaktif / tanpa peran / sesi dicabut ditolak di server
    if (!ALL.includes(me?.role)) throw Object.assign(new Error('Akun belum memiliki peran. Hubungi admin.'), { code: 'permission-denied' });
    S.user = u; S.role = me.role; S.team = me.team ?? null; S.canUnlock = me.canUnlock === true; S.authRetry = false;
    S.profile = await fget('users/' + u.uid).catch(() => null);
    S.examActive = me.role === 'peserta' ? (await fget('attempts/' + u.uid).catch(() => null))?.status === 'in_progress' : false;
  } catch (e) { return authFailed(e); }
  $('#login-status').hidden = true; S.ready = true; renderChrome(); route();
}
async function authFailed(e) {
  const c = codeOf(e); S.ready = true;
  if (c === 'unauthenticated') return;        // call() sudah keluar dan menampilkan pesan
  Object.assign(S, { user: null, role: null, team: null, canUnlock: false, profile: null, examActive: false });
  if (['unavailable', 'network-request-failed', 'deadline-exceeded'].includes(c)) { S.authRetry = true; renderChrome(); return route(); } // sesi dipertahankan; boleh coba lagi
  S.authRetry = false; $('#login-status').hidden = true;
  toast(c === 'not-found' ? 'Layanan login belum tersedia di server (fungsi whoami belum di-deploy atau region tidak cocok).' : c === 'permission-denied' && e.message ? e.message : errMsg(e), 'err'); // pesan dari server: akun nonaktif / belum berperan
  try { await fb.Au.signOut(fb.auth); } catch { renderChrome(); route(); }
}
$('#login-form').addEventListener('submit', async ev => {
  ev.preventDefault(); const err = $('#login-err'), btn = $('#login-btn'), st = $('#login-status'); err.hidden = true; st.hidden = true;
  const emEl = $('#lg-email'), pwEl = $('#lg-pass'), em = emEl.value.trim(), pw = pwEl.value;
  [emEl, pwEl].forEach(i => i.removeAttribute('aria-invalid'));
  const fail = (m, el) => { err.textContent = m; err.hidden = false; if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); } };
  if (!em) return fail('Email wajib diisi.', emEl);
  if (!EMAIL_RE.test(em)) return fail('Format email tidak valid.', emEl);
  if (!pw) return fail('Password wajib diisi.', pwEl);
  await fbReady;
  if (!fb) return fail(!isWeb() ? 'Login hanya berfungsi lewat alamat https (Firebase Hosting), bukan berkas lokal.' : configured() ? 'Layanan belum siap. Muat ulang halaman.' : 'Firebase belum dikonfigurasi (web/firebase-config.js).');
  setBusy(btn, true);
  try { await fb.Au.signInWithEmailAndPassword(fb.auth, em, pw); pwEl.value = ''; st.textContent = 'Memverifikasi akun…'; st.hidden = false; }
  catch (e) { fail(errMsg(e)); } finally { setBusy(btn, false); }
});
function forgotPw() {
  dialog({ title: 'Lupa password', ok: 'Kirim tautan', body: '<p class="muted">Masukkan email akun. Jika terdaftar, tautan untuk membuat password baru akan dikirim. Akun tanpa email asli: minta tautan ke panitia.</p><div class="field"><label for="fp-email">Email akun</label><input id="fp-email" name="email" type="email" autocomplete="username" inputmode="email" value="' + esc($('#lg-email').value.trim()) + '"></div>',
    onSubmit: async fd => { const em = String(fd.get('email')).trim(); if (!EMAIL_RE.test(em)) throw bad('Format email tidak valid.'); await fbReady; if (!fb) throw bad('Layanan belum siap. Muat ulang halaman.');
      try { await fb.Au.sendPasswordResetEmail(fb.auth, em); } catch (e) { if (codeOf(e) !== 'user-not-found') throw e; }  // jawaban netral: tidak membocorkan email terdaftar
      toast('Jika email terdaftar, tautan atur password telah dikirim. Periksa juga folder spam.', 'ok'); } });
}
function logout() {
  const out = async () => { location.hash = '#/beranda'; await fb.Au.signOut(fb.auth); };
  S.examActive ? dialog({ title: 'Keluar dari ujian?', body: '<p>Waktu ujian <b>tetap berjalan di server</b>. Jawaban yang sudah tersimpan tidak hilang.</p>', ok: 'Keluar', danger: true, onSubmit: out }) : out();
}
function changePw() {
  dialog({ title: 'Ganti password', body: '<div class="field"><label for="np1">Password baru (min. 8 karakter)</label><input id="np1" name="p1" type="password" autocomplete="new-password"></div><div class="field"><label for="np2">Ulangi password baru</label><input id="np2" name="p2" type="password" autocomplete="new-password"></div>', ok: 'Simpan',
    onSubmit: async fd => { const a = fd.get('p1'); if (a.length < 8) throw bad('Minimal 8 karakter.'); if (a !== fd.get('p2')) throw bad('Kedua password tidak sama.'); await fb.Au.updatePassword(fb.auth.currentUser, a); toast('Password diperbarui.', 'ok'); } });
}

/* ---------- Beranda & Dashboard peserta ---------- */
function initHome() {
  $('#hero-cta').innerHTML = S.user ? `<a class="btn" href="#/${home()}">Buka dashboard</a><a class="btn ghost" href="#/materi">Pelajari materi</a>` : `<a class="btn" href="#/login">Masuk</a><a class="btn ghost" href="#/materi">Pelajari materi</a>`;
}
const CFG_DEFAULT = { status: 'draft', durationMin: 30, passMark: 70, weights: { teori: 40, praktik: 30, ketelitian: 10, kedisiplinan: 10, sikap: 10 }, resultsReleased: false };
const getCfg = async () => ({ ...CFG_DEFAULT, ...((await fget('config/exam').catch(() => null)) || {}) });
async function renderDash() {
  const el = $('#dash-body'); loading(el);
  const [cfg, a] = await Promise.all([getCfg(), fget('attempts/' + S.user.uid).catch(() => null)]); const p = S.profile || {}, st = a?.status;
  let act;
  if (st === 'locked') act = '<a class="btn" href="#/terkunci">Lihat status ujian</a>';
  else if (st === 'submitted' || st === 'expired') act = '<a class="btn" href="#/hasil">Lihat hasil</a>';
  else if (cfg.status === 'running') act = `<a class="btn" href="#/tatib">${st === 'in_progress' ? 'Lanjutkan ujian' : 'Mulai ujian'}</a>`;
  else act = `<p class="notice">Ujian ${cfg.status === 'ended' ? 'sudah berakhir' : 'belum dibuka panitia'}.</p>`;
  el.innerHTML = `<div class="stats"><div class="stat"><b>${esc(p.regu ?? p.team ?? '—')}</b><span>Regu</span></div><div class="stat"><b>${esc(p.dewan || '—')}</b><span>Dewan</span></div><div class="stat"><b>${esc(cfg.durationMin)} mnt</b><span>Durasi ujian</span></div><div class="stat"><b>${esc(CFGST[cfg.status] || cfg.status)}</b><span>Status ujian</span></div></div>
  <div class="card mt"><h3>${esc(p.nama || S.user.email)}</h3><p class="muted">Kelas ${esc(p.kelas || '—')} · Status percobaan: ${pill(st)}</p><div class="row mt">${act}<a class="btn secondary" href="#/materi">Buka materi</a></div></div>`;
}

/* ---------- Tata tertib ---------- */
function initTatib() {
  const ck = $('#tatib-ok'), bt = $('#tatib-start'); $('#tatib-err').hidden = true; ck.checked = false; bt.disabled = true; ck.onchange = () => { bt.disabled = !ck.checked; };
  bt.onclick = () => dialog({ title: 'Mulai ujian sekarang?', body: '<p>Timer berjalan di server dan <b>tidak dapat dijeda</b>. Berpindah tab/aplikasi akan dilaporkan dan dapat <b>mengunci ujian</b>.</p>', ok: 'Ya, mulai',
    onSubmit: async () => { S.tatibOk = true; go('ujian'); } });
}

/* ---------- Ruang ujian ---------- */
let X = null, G = { pending: false, busy: false, h: null };
function stopTimer() { if (X?.tid) { clearInterval(X.tid); X.tid = null; } }
function stopGuard() { if (G.h) document.removeEventListener('visibilitychange', G.h); G = { pending: false, busy: false, h: null }; }
function leaveExam(to, notice) { S.examActive = false; stopTimer(); stopGuard(); const er = $('#exam-root'); if (er) er.innerHTML = ''; S.notice = notice || null; renderChrome(); go(to); }
function routeByStatus(st, msg) { if (st === 'locked') return leaveExam('terkunci'); leaveExam('hasil', msg); }

async function bootExam() {
  if (!S.tatibOk && !S.examActive) return go('tatib');
  const root = $('#exam-root'); loading(root, 'Menghubungi server ujian…'); stopTimer();
  let r;
  try { r = await call('startAttempt'); } catch (e) { S.examActive = false; renderChrome(); root.innerHTML = `<div class="card"><div class="notice" role="alert"><b>Tidak dapat memulai ujian.</b> ${esc(errMsg(e))}</div><p class="row mt"><button class="btn" data-act="reload" type="button">Coba lagi</button><a class="btn ghost" href="#/dashboard">Ke dashboard</a></p></div>`; return; }
  const st = r.attempt.status; if (st !== 'in_progress') return routeByStatus(st, st === 'expired' ? 'Waktu ujian habis.' : null);
  let qs; try { qs = await call('getQuestions'); } catch (e) { return failBox(root, e); }
  X = { qs, i: 0, answers: { ...(r.attempt.answers || {}) }, saved: { ...(r.attempt.answers || {}) }, dirty: new Set(), chain: Promise.resolve(), deb: null, rem: r.remainingMs, at: performance.now(), tid: null, beep: false };
  S.examActive = true; renderChrome(); startGuard(); renderExam(); startTimer();
}
function startTimer() { stopTimer(); X.tid = setInterval(tick, 500); tick(); }
function syncTimer(ms) { if (X && Number.isFinite(ms)) { X.rem = ms; X.at = performance.now(); } }
function tick() {
  const el = $('#timer'); if (!el || !X) return; const r = Math.max(0, X.rem - (performance.now() - X.at));
  el.textContent = fmtMs(r); el.className = 'timer' + (r <= 60000 ? ' danger' : r <= 300000 ? ' warn' : '');
  if (r <= 60000 && r > 0 && S.sound && !X.beep) { X.beep = true; tone(880, 250); tone(880, 250, .4); }
  if (r <= 0) { stopTimer(); resync(true); }
}
async function resync(timeUp = false) {
  try {
    const r = await call('startAttempt'), st = r.attempt.status;
    if (st === 'in_progress' && r.remainingMs > 0) { syncTimer(r.remainingMs); return st; }
    routeByStatus(st === 'in_progress' ? 'expired' : st, 'Waktu ujian habis. Jawaban yang sudah tersimpan di server akan dinilai.'); return st;
  } catch (e) {
    try { const a = await fget('attempts/' + S.user.uid); if (a && a.status !== 'in_progress') { routeByStatus(a.status); return a.status; } } catch { /* abaikan */ }
    if (timeUp) { $('#timer') && ($('#timer').textContent = '00:00'); setSave('bad', 'Waktu habis, menunggu konfirmasi server: ' + errMsg(e)); }
    return null;
  }
}
function startGuard() {
  stopGuard();
  G.h = () => { if (!S.examActive) return; if (document.visibilityState === 'hidden') { G.pending = true; reportLoss(); } else if (G.pending) reportLoss(); else resync(); };
  document.addEventListener('visibilitychange', G.h);
}
async function reportLoss() {
  if (G.busy) return; G.busy = true;
  try { const r = await call('reportVisibilityLoss'); G.pending = false; if (r.status === 'locked') leaveExam('terkunci'); else if (r.status !== 'in_progress') routeByStatus(r.status); }
  catch { /* tetap pending: dikirim ulang saat peserta kembali; server tetap penentu */ } finally { G.busy = false; }
}

function renderExam() {
  const p = S.profile || {}, root = $('#exam-root');
  root.innerHTML = `<div class="card exam-bar"><div><strong>${esc(p.nama || S.user.email)}</strong><div class="muted small">Kelas ${esc(p.kelas || '—')} · Regu ${esc(p.regu ?? p.team ?? '—')}${p.dewan ? ' · ' + esc(p.dewan) : ''}</div><div class="muted small">Penguji: tidak ditampilkan oleh server — tanyakan kepada panitia.</div></div>
    <div class="row"><button class="btn mini secondary js-sound" type="button">${S.sound ? 'Suara aktif' : 'Aktifkan Suara'}</button><div class="timer" id="timer" role="timer" aria-label="Sisa waktu">--:--</div></div></div>
  <div class="card mt"><details><summary><b>Petunjuk ujian</b></summary><ul class="list"><li>Isi jawaban; tunggu tanda “Tersimpan di server”.</li><li>Morse ke teks: tulis huruf/angka. Teks ke Morse: pakai titik (.), garis (-), spasi antar huruf, dan “/” antar kata.</li><li>Jangan berpindah tab/aplikasi — ujian dapat terkunci.</li></ul></details>
    <p class="small muted js-sound-msg" role="status"></p><div id="prog"></div><div class="dots" id="dots" role="group" aria-label="Navigasi soal"></div></div>
  <div class="card mt" id="qarea"></div>
  <div class="row mt between"><div class="savestat" id="savestat" role="status" aria-live="polite">Belum ada perubahan.</div><button class="btn dark" id="submit-btn" type="button">Kirim jawaban</button></div>`;
  $('#submit-btn').onclick = confirmSubmit; renderQ();
}
const isAnswered = id => (X.answers[id] ?? '') !== '';
function renderQ() {
  const n = X.qs.length, root = $('#qarea');
  if (!n) { root.innerHTML = '<div class="notice">Bank soal masih kosong. Hubungi panitia.</div>'; $('#prog').textContent = ''; return; }
  const q = X.qs[X.i], v = X.answers[q.id] ?? '', done = X.qs.filter(x => isAnswered(x.id)).length;
  $('#prog').innerHTML = `<div class="small"><b>Soal ${X.i + 1} dari ${n}</b> · terjawab ${done}</div><div class="bar" aria-hidden="true"><i style="width:${Math.round(done / n * 100)}%"></i></div>`;
  $('#dots').innerHTML = X.qs.map((x, k) => { const c = !isAnswered(x.id) ? '' : (X.saved[x.id] ?? '') === X.answers[x.id] ? 'sv' : 'dr'; return `<button type="button" class="${c}" data-q="${k}" ${k === X.i ? 'aria-current="step"' : ''} aria-label="Soal ${k + 1}, ${!c ? 'belum dijawab' : c === 'sv' ? 'tersimpan' : 'belum tersimpan'}">${k + 1}</button>`; }).join('');
  let body;
  if (q.type === 'decode') body = `<p class="muted">Morse ke teks — terjemahkan:</p><div class="qprompt mono">${esc(q.prompt)}</div><div class="field"><label for="ans">Jawaban (teks)</label><input id="ans" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="500" value="${esc(v)}"></div>`;
  else if (q.type === 'encode') body = `<p class="muted">Teks ke Morse — ubah menjadi sandi Morse:</p><div class="qprompt">${esc(q.prompt)}</div><div class="field"><label for="ans">Jawaban (Morse)</label><input id="ans" class="mono" autocomplete="off" spellcheck="false" inputmode="none" maxlength="500" value="${esc(v)}"></div>
    <div class="keypad" aria-label="Tombol bantu Morse">${['.', '-', ' ', '/'].map(k => `<button class="btn secondary" type="button" data-k="${k}" aria-label="${{ '.': 'titik', '-': 'garis', ' ': 'spasi', '/': 'pemisah kata' }[k]}">${k === ' ' ? 'Spasi' : k}</button>`).join('')}<button class="btn ghost" type="button" data-k="del" aria-label="hapus satu karakter">Hapus</button></div>`;
  else body = `<p class="muted">Pengetahuan dasar:</p><div class="qprompt">${esc(q.prompt)}</div><div role="radiogroup" aria-label="Pilihan jawaban">${(q.options || []).map((o, k) => `<label class="opt"><input type="radio" name="opt" value="${esc(o)}" ${o === v ? 'checked' : ''}> <span>${esc(o)}</span></label>`).join('')}</div>`;
  root.innerHTML = body + `<div class="qnav"><button class="btn secondary" type="button" data-nav="-1" ${X.i === 0 ? 'disabled' : ''}>Sebelumnya</button><button class="btn secondary" type="button" data-nav="1" ${X.i === n - 1 ? 'disabled' : ''}>Berikutnya</button></div>`;
  const inp = $('#ans'); if (inp) inp.oninput = () => setAns(q.id, inp.value, false);
  $$('input[name=opt]', root).forEach(r => { r.onchange = () => setAns(q.id, r.value, true); });
  $$('[data-k]', root).forEach(b => { b.onclick = () => { const k = b.dataset.k; inp.value = k === 'del' ? inp.value.slice(0, -1) : inp.value + k; setAns(q.id, inp.value, false); inp.focus(); }; });
  $$('[data-nav]', root).forEach(b => { b.onclick = async () => { await flush(); X.i += Number(b.dataset.nav); renderQ(); }; });
  $$('#dots button').forEach(b => { b.onclick = async () => { await flush(); X.i = Number(b.dataset.q); renderQ(); }; });
}
function setAns(id, val, now) {
  X.answers[id] = val; X.dirty.add(id); setSave('', 'Perubahan belum tersimpan…'); clearTimeout(X.deb);
  X.deb = setTimeout(flush, now ? 0 : 700); refreshDots();
}
function refreshDots() { $$('#dots button').forEach((b, k) => { const id = X.qs[k].id; b.className = !isAnswered(id) ? '' : (X.saved[id] ?? '') === X.answers[id] ? 'sv' : 'dr'; }); }
function setSave(kind, msg) { const e = $('#savestat'); if (e) { e.className = 'savestat ' + kind; e.textContent = msg; } }
function flush() {
  clearTimeout(X.deb); const ids = [...X.dirty]; if (!ids.length) return X.chain;
  X.chain = X.chain.then(async () => {
    for (const id of ids) {
      const val = X.answers[id] ?? ''; if (val === (X.saved[id] ?? '')) { X.dirty.delete(id); continue; }
      setSave('', 'Menyimpan ke server…');
      try { const r = await call('saveAnswer', { qid: id, value: val }); X.saved[id] = val; if (X.answers[id] === val) X.dirty.delete(id); syncTimer(r.remainingMs); }
      catch (e) {
        const c = String(e.code || '');
        if (c.endsWith('failed-precondition')) { setSave('bad', errMsg(e)); await resync(); return; }
        setSave('bad', 'Gagal menyimpan: ' + errMsg(e) + ' Jawaban belum tersimpan — kami akan coba lagi.'); X.deb = setTimeout(flush, 4000); refreshDots(); return;
      }
    }
    if (!X.dirty.size && $('#savestat')) setSave('ok', 'Tersimpan di server pukul ' + new Date().toLocaleTimeString('id-ID')); refreshDots();
  });
  return X.chain;
}
async function confirmSubmit() {
  await flush(); const n = X.qs.length, done = X.qs.filter(x => isAnswered(x.id)).length;
  if (X.dirty.size) { setSave('bad', 'Masih ada jawaban yang belum tersimpan di server. Tunggu atau periksa koneksi, lalu coba lagi.'); return; }
  dialog({ title: 'Kirim jawaban?', body: `<p>Terjawab <b>${done} dari ${n}</b> soal.${done < n ? ' <b>Masih ada soal kosong.</b>' : ''}</p><p>Setelah dikirim, jawaban <b>tidak dapat diubah</b>.</p>`, ok: 'Ya, kirim', onSubmit: async () => {
    const r = await call('submitAttempt'); leaveExam('hasil', 'Jawaban terkirim ke server (status: ' + (ST[r.status]?.[0] || r.status) + ').'); } });
}

/* ---------- Terkunci & Hasil ---------- */
async function refreshLock() {
  const info = $('#lock-info'), res = $('#lock-resume'); res.hidden = true; info.textContent = 'Memeriksa status ke server…';
  let a; try { a = await fget('attempts/' + S.user.uid); } catch (e) { info.textContent = 'Gagal memeriksa status: ' + errMsg(e); return; }
  if (!a || a.status !== 'locked') { if (a?.status === 'in_progress') { info.textContent = 'Ujian sudah dibuka kembali oleh panitia.'; res.hidden = false; return; } return go(a ? 'hasil' : 'dashboard'); }
  info.innerHTML = `Status server: <b>UJIAN TERKUNCI</b> sejak ${esc(fmtDate(a.lockedAtMs))}. Alasan: ${esc(a.lockReason || '—')}.`;
}
async function renderResult() {
  const el = $('#result-root'); loading(el); const note = S.notice; S.notice = null;
  const a = await fget('attempts/' + S.user.uid).catch(() => null), n = note ? `<div class="notice ok" role="status">${esc(note)}</div>` : '';
  if (!a) { el.innerHTML = '<div class="notice">Kamu belum mengerjakan ujian.</div>'; return; }
  if (a.status === 'locked') return go('terkunci');
  if (a.status === 'in_progress') { el.innerHTML = n + '<div class="card"><p>Ujian masih berjalan, atau waktu baru saja habis dan server sedang memprosesnya (maks. ± 1 menit).</p><p class="row"><button class="btn secondary" data-act="reload" type="button">Segarkan</button><a class="btn" href="#/tatib">Lanjutkan ujian</a></p></div>'; return; }
  let r; try { r = await call('getResult'); } catch (e) { el.innerHTML = n + `<div class="card"><h3>Jawaban sudah diterima server</h3><p class="notice info">${esc(errMsg(e))}</p><button class="btn secondary" data-act="reload" type="button">Segarkan</button></div>`; return; }
  el.innerHTML = n + `<div class="card"><div class="stats"><div class="stat"><b>${esc(r.theory)}</b><span>Nilai teori</span></div><div class="stat"><b>${r.complete ? esc(r.total) : '—'}</b><span>Nilai akhir</span></div></div>
    <p class="mt">${r.complete ? `Hasil: <span class="pill ${r.passed ? 'green' : 'red'}">${r.passed ? 'LULUS' : 'TIDAK LULUS'}</span>` : '<span class="notice">Penilaian praktik/sikap dari penguji belum lengkap, nilai akhir belum final.</span>'}</p></div>`;
}

/* ---------- Penguji ---------- */
const mv = x => (x ?? x === 0) ? esc(x) : '—';
function rosterTable(us, am) {
  if (!us.length) return '<div class="notice info">Belum ada peserta pada regu ini.</div>';
  return `<div class="tablewrap"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Status</th><th>Terjawab</th><th>Praktik</th><th>Ketelitian</th><th>Disiplin</th><th>Sikap</th><th>Aksi</th></tr></thead><tbody>${us.map(u => { const a = am.get(u.id), m = a?.manual || {};
    return `<tr><td>${esc(u.nama)}${u.duplicate ? ' <span class="pill amber">nama ganda</span>' : ''}</td><td>${esc(u.kelas || '—')}</td><td>${pill(a?.status)}</td><td>${a ? Object.keys(a.answers || {}).length : '—'}</td><td>${mv(m.praktik)}</td><td>${mv(m.ketelitian)}</td><td>${mv(m.kedisiplinan)}</td><td>${mv(m.sikap)}</td>
    <td><div class="row"><a class="btn mini secondary" href="#/penilaian/${esc(u.id)}">Nilai</a>${a?.status === 'locked' && (S.role === 'admin' || S.canUnlock) ? `<button class="btn mini danger" data-act="unlock" data-uid="${esc(u.id)}" data-name="${esc(u.nama)}" type="button">Buka kunci</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div>`;
}
async function loadTeam(team) {
  const W = fb.F.where, [us, as] = await Promise.all([fq('users', W('role', '==', 'peserta'), W('team', '==', team)), fq('attempts', W('team', '==', team))]);
  us.sort((a, b) => String(a.nama).localeCompare(String(b.nama), 'id')); return { us, am: new Map(as.map(a => [a.id, a])) };
}
async function renderExaminer() {
  const el = $('#examiner-root'); const admin = S.role === 'admin', team = admin ? S.adminTeam : S.team;
  const sel = admin ? `<label class="row" for="team-sel"><b>Regu:</b><select id="team-sel" style="width:auto">${[1, 2, 3, 4, 5, 6, 7].map(t => `<option ${t === team ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : '';
  if (!team) { el.innerHTML = '<div class="notice">Akun penguji ini belum ditugaskan ke regu. Hubungi admin.</div>'; return; }
  loading(el); const { us, am } = await loadTeam(Number(team));
  const c = k => us.filter(u => am.get(u.id)?.status === k).length;
  el.innerHTML = `<div class="row between"><p class="muted">Regu yang ditugaskan: <b>${esc(team)}</b></p>${sel}</div>
  <div class="stats"><div class="stat"><b>${us.length}</b><span>Peserta</span></div><div class="stat"><b>${c('in_progress')}</b><span>Mengerjakan</span></div><div class="stat"><b>${c('submitted') + c('expired')}</b><span>Terkirim/selesai</span></div><div class="stat"><b>${c('locked')}</b><span>Terkunci</span></div></div>
  <div class="mt">${rosterTable(us, am)}</div><p class="muted small mt">Riwayat perubahan nilai dapat dilihat di halaman penilaian peserta (admin) / audit log.</p>`;
  const s = $('#team-sel'); if (s) s.onchange = () => { S.adminTeam = Number(s.value); renderExaminer().catch(e => failBox(el, e)); };
}
function openUnlock(uid, name) {
  dialog({ title: 'Buka kunci: ' + name, ok: 'Buka kunci', body: '<p class="muted">Tindakan ini dicatat di audit log. Waktu yang sudah terpakai tidak direset.</p><div class="field"><label for="ul-r">Alasan (wajib, min. 5 karakter)</label><textarea id="ul-r" name="reason" maxlength="300"></textarea></div><div class="field"><label for="ul-m">Tambahan waktu (menit, 0–30)</label><input id="ul-m" name="extra" type="number" min="0" max="30" value="0"></div>',
    onSubmit: async fd => { const reason = String(fd.get('reason')).trim(), extra = Number(fd.get('extra') || 0); if (reason.length < 5) throw bad('Alasan wajib diisi (min. 5 karakter).'); if (!(extra >= 0 && extra <= 30)) throw bad('Tambahan waktu 0–30 menit.');
      await call('unlockAttempt', { uid, reason, extraMin: extra }); toast('Kunci dibuka (dikonfirmasi server).', 'ok'); route(); } });
}
const FIELDS = [['praktik', 'Nilai praktik'], ['ketelitian', 'Ketelitian'], ['kedisiplinan', 'Kedisiplinan'], ['sikap', 'Sikap']];
async function renderGrade(uid) {
  const el = $('#grade-root'); if (!uid) return go('penguji'); loading(el);
  const [u, a, cfg] = await Promise.all([fget('users/' + uid), fget('attempts/' + uid), getCfg()]);
  if (!u) { el.innerHTML = '<div class="notice">Peserta tidak ditemukan.</div><p><a class="btn secondary" href="#/penguji">Kembali</a></p>'; return; }
  const m = a?.manual || {};
  el.innerHTML = `<p><a href="#/penguji">Kembali ke daftar</a></p><div class="card"><h3>${esc(u.nama)}</h3><p class="muted">Kelas ${esc(u.kelas || '—')} · Regu ${esc(u.regu ?? u.team ?? '—')} · Status: ${pill(a?.status)}</p>
  ${a ? '' : '<div class="notice">Peserta belum memulai ujian. Server hanya menerima nilai untuk peserta yang sudah memiliki percobaan.</div>'}
  <form id="grade-form" novalidate><fieldset style="border:0;padding:0;margin:0" ${a ? '' : 'disabled'}>${FIELDS.map(([k, l]) => `<div class="field"><label for="g-${k}">${l} (0–100) <span class="muted small">bobot ${esc(cfg.weights[k])}%</span></label><input id="g-${k}" name="${k}" type="number" min="0" max="100" step="any" inputmode="decimal" value="${m[k] ?? ''}"></div>`).join('')}
  <div class="field"><label for="g-c">Catatan penilaian</label><textarea id="g-c" name="catatan" maxlength="1000">${esc(m.catatan || '')}</textarea></div>
  <p class="err" id="grade-err" role="alert" hidden></p><button class="btn" type="submit">Simpan nilai</button></fieldset></form></div><div class="card mt"><h3>Riwayat perubahan nilai</h3><div id="grade-hist"></div></div>`;
  $('#grade-form').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target), err = $('#grade-err'), btn = ev.submitter; err.hidden = true; const jobs = [];
    for (const [k, l] of FIELDS) { const raw = String(f.get(k)).trim(); if (raw === '') continue; const v = Number(raw); if (!(v >= 0 && v <= 100)) { err.textContent = `${l}: isi angka 0–100.`; err.hidden = false; return; } if (v !== m[k]) jobs.push([k, v]); }
    const c = String(f.get('catatan')); if (c !== (m.catatan || '')) jobs.push(['catatan', c]);
    if (!jobs.length) { toast('Tidak ada perubahan.'); return; }
    setBusy(btn, true);
    try { for (const [field, value] of jobs) await call('setManualScore', { uid, field, value }); toast('Nilai tersimpan di server.', 'ok'); renderGrade(uid).catch(e => failBox(el, e)); }
    catch (e) { err.textContent = errMsg(e); err.hidden = false; } finally { setBusy(btn, false); }
  };
  const h = $('#grade-hist');
  if (S.role !== 'admin') { h.innerHTML = '<p class="muted">Riwayat lengkap hanya dapat dibaca admin (aturan keamanan server). Setiap perubahan Anda tetap tercatat.</p>'; return; }
  try { const rows = (await fq('audit', fb.F.where('target', '==', uid))).sort((x, y) => y.atMs - x.atMs); h.innerHTML = auditTable(rows, new Map()); } catch (e) { h.innerHTML = `<p class="err">${esc(errMsg(e))}</p>`; }
}

/* ---------- Admin ---------- */
async function adminPage(name, fn) {
  const sec = $(`[data-page="${name}"]`); $('.atabs', sec).innerHTML = ADM.map(k => { const n = k === 'admin' ? 'admin' : 'admin/' + k; const l = { admin: 'Ringkasan', peserta: 'Peserta & regu', penguji: 'Penguji & admin', soal: 'Soal', pengaturan: 'Pengaturan', rekap: 'Rekap & CSV', audit: 'Audit log' }[k]; return `<a href="#/${n}"${n === name ? ' aria-current="page"' : ''}>${l}</a>`; }).join('');
  const body = $('.body', sec); loading(body); await fn(body);
}
async function adminData() {
  const [users, atts, cfg] = await Promise.all([fq('users'), fq('attempts'), getCfg()]);
  users.sort((a, b) => (a.team ?? a.regu ?? 99) - (b.team ?? b.regu ?? 99) || String(a.nama).localeCompare(String(b.nama), 'id'));
  return { users, ps: users.filter(u => u.role === 'peserta'), pg: users.filter(u => u.role === 'penguji'), am: new Map(atts.map(a => [a.id, a])), cfg };
}
async function renderAdminHome(el) {
  const { users, ps, pg, am, cfg } = await adminData(); const reg = new Set(ps.map(u => u.team ?? u.regu)); const cnt = k => ps.filter(u => am.get(u.id)?.status === k).length;
  const locked = ps.filter(u => am.get(u.id)?.status === 'locked');
  el.innerHTML = `<div class="stats"><div class="stat"><b>${ps.length}</b><span>Peserta</span></div><div class="stat"><b>${reg.size}</b><span>Regu</span></div><div class="stat"><b>${pg.length}</b><span>Penguji</span></div><div class="stat"><b>${cnt('in_progress')}</b><span>Mengerjakan</span></div><div class="stat"><b>${cnt('submitted') + cnt('expired')}</b><span>Selesai</span></div><div class="stat"><b>${cnt('locked')}</b><span>Terkunci</span></div></div>
  <div class="card mt"><h3>Status ujian: <span class="pill blue">${esc(CFGST[cfg.status] || cfg.status)}</span></h3><p class="muted">Durasi ${esc(cfg.durationMin)} menit · batas lulus ${esc(cfg.passMark)} · hasil ${cfg.resultsReleased ? 'sudah dirilis' : 'belum dirilis'}. <a href="#/admin/pengaturan">Detail pengaturan</a></p></div>
  <div class="card mt"><h3>Percobaan terkunci</h3>${locked.length ? `<div class="tablewrap"><table><thead><tr><th>Nama</th><th>Regu</th><th>Alasan</th><th>Waktu</th><th>Aksi</th></tr></thead><tbody>${locked.map(u => { const a = am.get(u.id); return `<tr><td>${esc(u.nama)}</td><td>${esc(u.team ?? u.regu)}</td><td>${esc(a.lockReason || '—')}</td><td>${esc(fmtDate(a.lockedAtMs))}</td><td><button class="btn mini danger" data-act="unlock" data-uid="${esc(u.id)}" data-name="${esc(u.nama)}" type="button">Buka kunci</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Tidak ada percobaan terkunci.</p>'}</div>`;
}
let lastLinks = [];
async function renderAdminPeserta(el) {
  const { ps, pg } = await adminData();
  const reguCards = [1, 2, 3, 4, 5, 6, 7].map(r => `<div class="stat"><b>Regu ${r}</b><span>${ps.filter(u => (u.team ?? u.regu) === r).length} peserta · Penguji: ${esc(pg.filter(u => (u.team ?? u.regu) === r).map(u => u.nama).join(', ') || '—')}</span></div>`).join('');
  el.innerHTML = `<div class="stats">${reguCards}</div>
  <div class="card mt"><h3>Impor peserta (CSV)</h3><p class="muted">Header wajib <span class="mono">nama,regu</span>; opsional <span class="mono">kelas,dewan</span> (DP8/DP9). Regu 1–7. Satu akun dibuat per baris; impor ulang baris yang sama akan gagal karena akun sudah ada.</p>
    <div class="field"><label for="imp-file">Pilih file CSV</label><input id="imp-file" type="file" accept=".csv,text/csv"></div><div class="field"><label for="imp-csv">…atau tempel isi CSV</label><textarea id="imp-csv" class="mono" spellcheck="false" placeholder="nama,kelas,regu,dewan"></textarea></div>
    <div class="row"><button class="btn secondary" id="imp-dry" type="button">Pratinjau (tanpa membuat akun)</button><button class="btn" id="imp-go" type="button">Impor &amp; buat akun</button></div><div id="imp-res" class="mt"></div></div>
  <div class="card mt"><div class="row between"><h3>Daftar peserta (${ps.length})</h3><div class="row"><label class="small" for="f-regu">Regu</label><select id="f-regu" style="width:auto"><option value="">Semua</option>${[1, 2, 3, 4, 5, 6, 7].map(r => `<option>${r}</option>`).join('')}</select></div></div><div id="p-list" class="mt"></div></div>`;
  const draw = () => { const f = $('#f-regu').value, rows = ps.filter(u => !f || String(u.team ?? u.regu) === f);
    $('#p-list').innerHTML = rows.length ? `<div class="tablewrap"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Regu</th><th>Dewan</th><th>Akun</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(u => `<tr><td>${esc(u.nama)}${u.duplicate ? ' <span class="pill amber">nama ganda</span>' : ''}</td><td>${esc(u.kelas || '—')}</td><td>${esc(u.team ?? u.regu ?? '—')}</td><td>${esc(u.dewan || '—')}</td><td class="mono small">${esc(u.email || '—')}</td><td>${statusPill(u)}</td><td>${acctButtons(u)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Belum ada peserta. Impor dari CSV di atas — data peserta tidak dikarang oleh aplikasi.</p>'; };
  $('#f-regu').onchange = draw; draw();
  $('#imp-file').onchange = async ev => { const f = ev.target.files[0]; if (f) $('#imp-csv').value = await f.text(); };
  const run = async dry => {
    const csv = $('#imp-csv').value, out = $('#imp-res'); if (!csv.trim()) { out.innerHTML = '<p class="err">Isi CSV terlebih dahulu.</p>'; return; }
    const go1 = async () => { const b = $(dry ? '#imp-dry' : '#imp-go'); setBusy(b, true); loading(out, dry ? 'Memeriksa…' : 'Membuat akun…');
      try { const r = await call('adminImportRoster', { csv, dryRun: dry }); out.innerHTML = importResult(r, dry); if (!dry) { lastLinks = r.akun || []; toast('Impor selesai.', 'ok'); } } catch (e) { out.innerHTML = `<p class="err">${esc(errMsg(e))}</p>`; } finally { setBusy(b, false); } };
    dry ? go1() : dialog({ title: 'Buat akun peserta?', body: '<p>Akun Auth + profil dibuat untuk semua baris valid <b>tanpa password</b>. Setiap peserta menetapkan password sendiri lewat <b>tautan atur password</b> yang ditampilkan sekali setelah ini — siapkan untuk mengunduhnya dan bagikan secara pribadi.</p>', ok: 'Ya, impor', onSubmit: go1 });
  };
  $('#imp-dry').onclick = () => run(true); $('#imp-go').onclick = () => run(false);
}
function importResult(r, dry) {
  const er = (r.errors || []).map(e => `<li>Baris ${esc(e.line)}: ${esc(e.message)}</li>`).join(''), dup = (r.rows || []).filter(x => x.duplicate).length;
  let h = `<div class="notice ${r.errors?.length ? '' : 'ok'}"><b>${dry ? 'Pratinjau' : 'Hasil'}:</b> ${(r.rows || []).length} baris valid, ${(r.errors || []).length} error${dup ? `, ${dup} nama ganda (perlu dicek manual)` : ''}.</div>`;
  if (er) h += `<ul class="err">${er}</ul>`;
  const ST2 = { dibuat: ['Dibuat', ''], sudah_ada: ['Sudah ada', 'gray'], gagal: ['Gagal', 'red'] };
  if (!dry && r.akun?.length) h += `<div class="notice mt"><b>Tautan atur password — simpan sekarang, tidak ditampilkan lagi.</b> Tautan memberi akses untuk membuat password akun itu: bagikan hanya kepada pemilik akun. Password tidak pernah dibuat atau disimpan oleh sistem.</div><div class="tablewrap mt"><table><thead><tr><th>Nama</th><th>Email (login)</th><th>Status</th></tr></thead><tbody>${r.akun.map(a => { const [t, c] = ST2[a.status] || ['—', 'gray']; return `<tr><td>${esc(a.nama)}</td><td class="mono">${esc(a.email)}</td><td><span class="pill ${c}">${t}</span>${a.pesan ? ` <span class="small muted">${esc(a.pesan)}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div><p><button class="btn secondary mt" data-act="dl-links" type="button">Unduh tautan atur password (CSV)</button></p>`;
  return h;
}
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
function download(name, text) { const u = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a'); a.href = u; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
const statusPill = u => u.disabled ? '<span class="pill red">Nonaktif</span>' : '<span class="pill">Aktif</span>';
const ROLE_L = { admin: 'Admin', penguji: 'Penguji', peserta: 'Peserta' };
function acctButtons(u) {
  if (u.id === S.user.uid) return '<span class="muted small">Akun Anda</span>';
  const d = `data-uid="${esc(u.id)}" data-name="${esc(u.nama)}" data-email="${esc(u.email || '')}"`;
  return `<div class="row"><button class="btn mini secondary" data-act="acct-role" ${d} data-role="${esc(u.role)}" data-team="${esc(u.team ?? u.regu ?? '')}" data-unlock="${u.canUnlock ? 1 : 0}" type="button">Ubah peran</button>`
    + `<button class="btn mini secondary" data-act="acct-link" ${d} type="button">Tautan password</button><button class="btn mini secondary" data-act="acct-mail" ${d} type="button">Kirim email</button>`
    + `<button class="btn mini ${u.disabled ? '' : 'danger'}" data-act="acct-toggle" ${d} data-disabled="${u.disabled ? 1 : 0}" type="button">${u.disabled ? 'Aktifkan' : 'Nonaktifkan'}</button></div>`;
}
async function renderAdminPenguji(el) {
  const { users } = await adminData(); const staff = users.filter(u => u.role === 'penguji' || u.role === 'admin');
  el.innerHTML = `<div class="card"><h3>Buat akun baru</h3><p class="muted">Akun dibuat <b>tanpa password</b>. Pemilik menetapkan password sendiri lewat tautan atau email atur password. Peran ditetapkan oleh server (Firebase Admin SDK), bukan oleh browser.</p>
  <form id="acc-form" novalidate><div class="grid2"><div class="field"><label for="ac-role">Peran</label><select id="ac-role" name="role"><option value="penguji">Penguji</option><option value="admin">Admin</option><option value="peserta">Peserta</option></select></div>
  <div class="field" id="ac-team-f"><label for="ac-team">Regu (1–7)</label><select id="ac-team" name="team">${[1, 2, 3, 4, 5, 6, 7].map(t => `<option>${t}</option>`).join('')}</select></div>
  <div class="field"><label for="ac-nama">Nama lengkap</label><input id="ac-nama" name="nama" autocomplete="off"></div><div class="field"><label for="ac-email">Email (untuk login)</label><input id="ac-email" name="email" type="email" inputmode="email" autocomplete="off"></div></div>
  <label class="check" id="ac-unlock-f"><input type="checkbox" name="canUnlock"> Boleh membuka kunci ujian peserta di regunya</label>
  <p class="err" id="ac-err" role="alert" hidden></p><button class="btn mt" id="ac-go" type="submit">Buat akun</button></form><div id="ac-out" class="mt"></div></div>
  <div class="card mt"><h3>Penguji &amp; admin (${staff.length})</h3>${staff.length ? `<div class="tablewrap"><table><thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Regu</th><th>Buka kunci</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${staff.map(u => `<tr><td>${esc(u.nama)}</td><td class="mono small">${esc(u.email || '—')}</td><td>${esc(ROLE_L[u.role] || u.role)}</td><td>${esc(u.team ?? u.regu ?? '—')}</td><td>${u.role === 'admin' ? 'Ya' : u.canUnlock ? 'Ya' : 'Tidak'}</td><td>${statusPill(u)}</td><td>${acctButtons(u)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Belum ada profil penguji. Buat dengan formulir di atas.</p>'}</div>`;
  const sync = () => { const r = $('#ac-role').value; $('#ac-team-f').hidden = r === 'admin'; $('#ac-unlock-f').hidden = r !== 'penguji'; };
  $('#ac-role').onchange = sync; sync();
  $('#acc-form').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target), err = $('#ac-err'), b = $('#ac-go'), out = $('#ac-out'); err.hidden = true;
    const role = f.get('role'), nama = String(f.get('nama')).trim(), email = String(f.get('email')).trim();
    const fail = m => { err.textContent = m; err.hidden = false; };
    if (nama.length < 2) return fail('Nama wajib diisi.'); if (!EMAIL_RE.test(email)) return fail('Format email tidak valid.');
    const data = { role, nama, email, ...(role !== 'admin' ? { team: Number(f.get('team')) } : {}), ...(role === 'penguji' ? { canUnlock: f.get('canUnlock') === 'on' } : {}) };
    setBusy(b, true);
    try { const r = await call('adminCreateAccount', data); const html = linkBox(r.email, r.linkAtur, 'Akun dibuat.'); toast('Akun dibuat.', 'ok'); await renderAdminPenguji(el); $('#ac-out').innerHTML = html; return; }
    catch (e) { fail(errMsg(e)); } finally { setBusy(b, false); }
  };
}
const isRealEmail = e => !!e && !/@skt\.hwmusago\.local$/i.test(e);
function linkBox(email, link, title) {
  return `<div class="notice ok"><b>${esc(title)}</b> Tautan di bawah memungkinkan pemilik <span class="mono">${esc(email)}</span> membuat password sendiri. Tampil sekali — salin dan kirim secara pribadi. Tautan ini bukan password dan tidak disimpan di database.</div>
  <div class="field"><label for="lk">Tautan atur password</label><textarea id="lk" class="mono" readonly rows="3">${esc(link)}</textarea></div><button class="btn secondary" data-act="copy-link" type="button">Salin tautan</button>`;
}
function acctRole(b) {
  const d = b.dataset, rs = ['penguji', 'admin', 'peserta'].map(r => `<option value="${r}"${r === d.role ? ' selected' : ''}>${ROLE_L[r]}</option>`).join('');
  dialog({ title: 'Ubah peran: ' + d.name, ok: 'Simpan', body: `<p class="muted">Sesi akun ini dicabut: ia harus masuk lagi agar peran baru berlaku. Tercatat di audit log.</p><div class="field"><label for="ar-r">Peran</label><select id="ar-r" name="role">${rs}</select></div><div class="field"><label for="ar-t">Regu (tidak berlaku untuk admin)</label><select id="ar-t" name="team">${[1, 2, 3, 4, 5, 6, 7].map(t => `<option${String(t) === d.team ? ' selected' : ''}>${t}</option>`).join('')}</select></div><label class="check"><input type="checkbox" name="canUnlock"${d.unlock === '1' ? ' checked' : ''}> Boleh membuka kunci (penguji)</label>`,
    onSubmit: async fd => { const role = fd.get('role'); await call('adminSetRole', { uid: d.uid, role, ...(role !== 'admin' ? { team: Number(fd.get('team')) } : {}), ...(role === 'penguji' ? { canUnlock: fd.get('canUnlock') === 'on' } : {}) }); toast('Peran diperbarui.', 'ok'); route(); } });
}
async function acctLink(b) {
  setBusy(b, true);
  try { const r = await call('adminResetLink', { uid: b.dataset.uid }); dialog({ title: 'Tautan atur password', body: linkBox(r.email, r.linkAtur, 'Tautan dibuat.'), ok: 'Tutup', cancel: false }); }
  catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(b, false); }
}
async function acctMail(b) {
  const em = b.dataset.email; if (!isRealEmail(em)) return toast('Email akun ini bukan email asli. Gunakan "Tautan password".', 'err');
  setBusy(b, true); try { await fb.Au.sendPasswordResetEmail(fb.auth, em); toast('Email atur password dikirim ke ' + em + '.', 'ok'); } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(b, false); }
}
function acctToggle(b) {
  const off = b.dataset.disabled !== '1';
  dialog({ title: (off ? 'Nonaktifkan: ' : 'Aktifkan: ') + b.dataset.name, danger: off, ok: off ? 'Nonaktifkan' : 'Aktifkan', body: off ? '<p>Akun tidak dapat masuk dan sesi yang sedang berjalan dicabut. Data dan nilai tetap tersimpan.</p>' : '<p>Akun dapat masuk kembali.</p>',
    onSubmit: async () => { await call('adminSetDisabled', { uid: b.dataset.uid, disabled: off }); toast(off ? 'Akun dinonaktifkan.' : 'Akun diaktifkan.', 'ok'); route(); } });
}
async function renderAdminSoal(el) {
  el.innerHTML = `<div class="notice"><b>Bank soal tidak dapat dibaca atau diubah dari browser.</b> Aturan Firestore menutup koleksi <span class="mono">questions</span> dan <span class="mono">answerKeys</span> sepenuhnya, dan backend belum menyediakan fungsi admin untuk mengelolanya. Ini disengaja agar kunci jawaban tidak pernah sampai ke klien.</div>
  <div class="card mt"><h3>Cara mengisi soal saat ini (Firebase Console / Admin SDK)</h3><p class="muted">Satu dokumen per soal di <span class="mono">questions/&lt;id&gt;</span> dan kuncinya di <span class="mono">answerKeys/&lt;id&gt;</span> (id sama):</p>
  <pre class="code">questions/&lt;id&gt;   { order: 1, type: "decode" | "encode" | "knowledge", prompt: "…", options: ["…"] (khusus knowledge), points: 1 }
answerKeys/&lt;id&gt; { answer: "…" }   // decode: teks; encode: Morse; knowledge: persis salah satu opsi</pre>
  <p class="muted small">Untuk UI kelola soal, tambahkan fungsi admin (mis. daftar/simpan/hapus soal) di backend terlebih dahulu.</p></div>`;
}
async function renderAdminSettings(el) {
  const cfg = await getCfg(), w = cfg.weights, W = [['teori', 'Teori'], ['praktik', 'Praktik'], ['ketelitian', 'Ketelitian'], ['kedisiplinan', 'Kedisiplinan'], ['sikap', 'Sikap']];
  el.innerHTML = `<div class="card"><h3>Pengaturan ujian</h3><form id="cfg-form" novalidate><div class="grid2">
  <div class="field"><label for="cf-st">Status ujian</label><select id="cf-st" name="status">${Object.entries(CFGST).map(([k, v]) => `<option value="${k}"${k === cfg.status ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
  <div class="field"><label for="cf-du">Durasi (menit, 1–240)</label><input id="cf-du" name="durationMin" type="number" min="1" max="240" value="${esc(cfg.durationMin)}"></div>
  <div class="field"><label for="cf-pm">Batas lulus (0–100)</label><input id="cf-pm" name="passMark" type="number" min="0" max="100" value="${esc(cfg.passMark)}"></div></div>
  <fieldset class="field"><legend>Bobot nilai (total harus 100)</legend><div class="row">${W.map(([k, l]) => `<label class="small" for="cf-${k}">${l}<input id="cf-${k}" name="w_${k}" type="number" min="0" max="100" value="${esc(w[k])}" style="width:90px"></label>`).join('')}</div><p class="small muted" id="cf-sum"></p></fieldset>
  <label class="check"><input type="checkbox" name="resultsReleased"${cfg.resultsReleased ? ' checked' : ''}> Hasil dirilis ke peserta</label>
  <p class="err" id="cf-err" role="alert" hidden></p><div class="row mt"><button class="btn" id="cf-go" type="submit">Simpan pengaturan</button><button class="btn danger" id="cf-end" type="button">Akhiri ujian &amp; kirim paksa</button></div></form>
  <p class="muted small mt">Mengubah status ke “Berlangsung” membuka ujian bagi peserta. Waktu dihitung server sejak peserta mulai. Perubahan dicatat di audit log.</p></div>`;
  const sum = () => { const t = W.reduce((a, [k]) => a + Number($('#cf-' + k).value || 0), 0); $('#cf-sum').textContent = 'Total bobot: ' + t + (t === 100 ? '' : ' (harus 100)'); return t; };
  W.forEach(([k]) => $('#cf-' + k).oninput = sum); sum();
  $('#cfg-form').onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(ev.target), err = $('#cf-err'), b = $('#cf-go'); err.hidden = true;
    if (sum() !== 100) { err.textContent = 'Total bobot harus 100.'; err.hidden = false; return; }
    const data = { status: f.get('status'), durationMin: Number(f.get('durationMin')), passMark: Number(f.get('passMark')), resultsReleased: f.get('resultsReleased') === 'on', weights: Object.fromEntries(W.map(([k]) => [k, Number(f.get('w_' + k))])) };
    setBusy(b, true); try { await call('adminSetConfig', data); toast('Pengaturan disimpan di server.', 'ok'); route(); } catch (e) { err.textContent = errMsg(e); err.hidden = false; } finally { setBusy(b, false); }
  };
  $('#cf-end').onclick = () => dialog({ title: 'Akhiri ujian?', danger: true, ok: 'Akhiri ujian', body: '<p>Status menjadi <b>Selesai</b>. Semua percobaan yang masih berjalan <b>dikirim paksa</b> dan dinilai dari jawaban tersimpan. Percobaan terkunci tetap terkunci. Tindakan ini tidak dapat dibatalkan.</p>',
    onSubmit: async () => { const r = await call('adminEndExam'); toast(`Ujian diakhiri. ${r.dikirimPaksa} percobaan dikirim paksa.`, 'ok'); route(); } });
}
async function renderAdminRekap(el) {
  const { ps, am } = await adminData();
  el.innerHTML = `<div class="row between"><p class="muted">${ps.length} peserta. Nilai akhir dihitung server pada ekspor CSV.</p><button class="btn" data-act="csv" type="button">Ekspor CSV</button></div><div class="mt">${ps.length ? `<div class="tablewrap"><table><thead><tr><th>Nama</th><th>Regu</th><th>Status</th><th>Teori</th><th>Praktik</th><th>Ketelitian</th><th>Disiplin</th><th>Sikap</th><th></th></tr></thead><tbody>${ps.map(u => { const a = am.get(u.id), m = a?.manual || {}; return `<tr><td>${esc(u.nama)}</td><td>${esc(u.team ?? u.regu)}</td><td>${pill(a?.status)}</td><td>${mv(a?.theory?.score)}</td><td>${mv(m.praktik)}</td><td>${mv(m.ketelitian)}</td><td>${mv(m.kedisiplinan)}</td><td>${mv(m.sikap)}</td><td><a href="#/penilaian/${esc(u.id)}">Detail</a></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Belum ada peserta.</p>'}</div>`;
}
async function exportCsv(b) { setBusy(b, true); try { const r = await call('adminExportCsv'); download('rekap-nilai-skt-madya.csv', r.csv); toast('CSV diunduh.', 'ok'); } catch (e) { toast(errMsg(e), 'err'); } finally { setBusy(b, false); } }
const AUD = { auto_lock: 'Kunci otomatis (pindah tab)', unlock: 'Buka kunci', set_manual_score: 'Ubah nilai manual', create_account: 'Buat akun', set_role: 'Ubah peran', disable_account: 'Nonaktifkan akun', enable_account: 'Aktifkan akun', reset_link: 'Buat tautan atur password', import_roster: 'Impor peserta', set_config: 'Ubah pengaturan ujian', end_exam: 'Akhiri ujian', save_question: 'Simpan soal', delete_question: 'Hapus soal' };
function auditTable(rows, names) {
  if (!rows.length) return '<p class="muted">Belum ada catatan.</p>';
  const nm = id => names.get(id) || String(id).slice(0, 8) + '…';
  return `<div class="tablewrap"><table><thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Target</th><th>Alasan / detail</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(fmtDate(r.ts?.toMillis?.() ?? r.atMs))}</td><td>${esc(nm(r.actor))}</td><td>${esc(AUD[r.action] || r.action)}</td><td>${esc(nm(r.target))}</td><td class="small">${esc(r.reason || '')}${r.detail ? ` <span class="mono">${esc(JSON.stringify(r.detail))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`;
}
async function renderAdminAudit(el) {
  const [rows, users] = await Promise.all([fq('audit', fb.F.orderBy('ts', 'desc'), fb.F.limit(200)), fq('users')]);
  el.innerHTML = `<p class="muted">200 catatan terbaru. Catatan tidak dapat diubah dari klien.</p>` + auditTable(rows, new Map(users.map(u => [u.id, u.nama])));
}

/* ---------- Event global ---------- */
const ACT = { logout, pw: changePw, reload: () => route(), unlock: b => openUnlock(b.dataset.uid, b.dataset.name), 'refresh-lock': refreshLock, csv: exportCsv,
  forgot: forgotPw, 'retry-auth': () => { S.authRetry = false; renderChrome(); if (fb?.auth.currentUser) onUser(fb.auth.currentUser); },
  'acct-role': acctRole, 'acct-link': acctLink, 'acct-mail': acctMail, 'acct-toggle': acctToggle,
  'copy-link': async b => { const t = $('#lk'); if (!t) return; t.select(); try { await navigator.clipboard.writeText(t.value); toast('Tautan disalin.', 'ok'); } catch { toast('Salin manual: tekan lama pada kotak tautan.', 'err'); } },
  'dl-links': () => download('tautan-atur-password-peserta.csv', '\uFEFF' + [['Nama', 'Email (login)', 'Status', 'Tautan atur password'], ...lastLinks.map(a => [a.nama, a.email, a.status, a.linkAtur || ''])].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n') };
document.addEventListener('click', e => { if (e.target.closest('.js-sound')) return enableSound(); const b = e.target.closest('[data-act]'); if (b) ACT[b.dataset.act]?.(b, e); });

/* ---------- Mulai ---------- */
const PUBLIC = ['', 'beranda', 'materi', 'login'];
renderChrome();
if (PUBLIC.includes(location.hash.replace(/^#\/?/, '').split('/')[0])) { S.ready = true; route(); } // halaman publik tampil langsung, tanpa menunggu Firebase
fbReady = initFirebase();
fbReady.then(ok => { renderChrome(); if (ok) fb.Au.onAuthStateChanged(fb.auth, onUser); else { S.ready = true; route(); } });
