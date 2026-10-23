// Uji alur login & hak akses di UI nyata (Chromium) dengan SDK Firebase TIRUAN (fake-firebase.js).
// Yang diuji: logika frontend (validasi, pesan galat, pemulihan sesi, routing per peran, manajemen akun).
// Yang TIDAK diuji di sini: Firebase Auth/Firestore/Functions sungguhan, Firestore Rules.
import { createRequire } from 'node:module'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url); const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, '../../web');
const FAKE = fs.readFileSync(path.join(here, 'fake-firebase.js'), 'utf8');
const TEST_CFG = `export const firebaseConfig={apiKey:'AIzaTESTTESTTESTTESTTESTTESTTESTTEST12',authDomain:'uji.firebaseapp.com',projectId:'uji-proyek',appId:'1:1:web:abc'};export const FUNCTIONS_REGION='asia-southeast2';export const USE_EMULATORS=false;`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
let cfgMode = 'test';
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/firebase-config.js' && cfgMode === 'test') { r.writeHead(200, { 'content-type': 'text/javascript' }); return r.end(TEST_CFG); }
  const f = path.join(web, p); if (!f.startsWith(web) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const base = `http://127.0.0.1:${srv.address().port}`;

const PW = 'Uji-Saja-123'; // sandi KHUSUS uji, hanya ada di berkas uji ini
const mkSeed = (over = {}) => {
  const u = (email, claims, nama, extra = {}) => ({ email, password: PW, disabled: false, claims, profile: { nama }, ...extra });
  const seed = { net: 'up', users: {
    p1: u('budi@contoh.id', { role: 'peserta', team: 2 }, 'Budi Santoso'), p2: u('mati@contoh.id', { role: 'peserta', team: 2 }, 'Akun Mati', { disabled: true }),
    pg3: u('guru@contoh.id', { role: 'penguji', team: 3, canUnlock: true }, 'Penguji Tiga'), adm: u('admin@contoh.id', { role: 'admin' }, 'Admin Utama'),
    norole: u('tanpa@contoh.id', {}, 'Tanpa Peran') },
  docs: { 'config/exam': { status: 'running', durationMin: 30, passMark: 70, weights: { teori: 40, praktik: 30, ketelitian: 10, kedisiplinan: 10, sikap: 10 }, resultsReleased: false },
    'users/p1': { nama: 'Budi Santoso', role: 'peserta', team: 2, regu: 2, dewan: 'DP8', email: 'budi@contoh.id' },
    'users/pg3': { nama: 'Penguji Tiga', role: 'penguji', team: 3, email: 'guru@contoh.id', canUnlock: true },
    'users/adm': { nama: 'Admin Utama', role: 'admin', email: 'admin@contoh.id' } } };
  return Object.assign(seed, over);
};
const browser = await chromium.launch();
const results = []; let current = '';
const check = (name, ok, detail = '') => { results.push({ test: current, name, ok: !!ok, detail }); if (!ok) console.log(`  GAGAL: ${name} ${detail}`); };
async function open(seedOver, { viewport } = {}) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1100, height: 800 } });
  await ctx.route('**/*', rt => { const u = rt.request().url(); u.startsWith(base) ? rt.continue() : rt.abort(); });
  await ctx.route('https://www.gstatic.com/firebasejs/10.12.2/firebase-*.js', rt => {
    const m = rt.request().url().match(/firebase-(\w+)\.js/)[1];
    const names = { app: ['initializeApp'], auth: ['getAuth', 'onAuthStateChanged', 'signInWithEmailAndPassword', 'signOut', 'sendPasswordResetEmail', 'updatePassword', 'connectAuthEmulator'],
      firestore: ['getFirestore', 'doc', 'getDoc', 'collection', 'query', 'getDocs', 'where', 'orderBy', 'limit', 'connectFirestoreEmulator'], functions: ['getFunctions', 'httpsCallable', 'connectFunctionsEmulator'] }[m];
    rt.fulfill({ contentType: 'text/javascript', body: names.map(n => `export const ${n}=window.__fb.${n};`).join('\n') });
  });
  await ctx.addInitScript(seed => { window.__SEED__ = seed; }, mkSeed(seedOver)); await ctx.addInitScript(FAKE);
  const page = await ctx.newPage(); page.on('pageerror', e => check('tanpa galat JS di halaman', false, e.message));
  return { ctx, page };
}
const wait = (page, hash) => page.waitForFunction(h => location.hash === h, hash, { timeout: 8000 });
const text = (page, sel) => page.locator(sel).first().innerText();
const toasts = page => page.locator('#toasts').innerText();
async function login(page, email, pw) { await page.goto(base + '/#/login'); await page.fill('#lg-email', email); await page.fill('#lg-pass', pw); await page.click('#login-btn'); }
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
async function T(name, fn) { current = name; console.log('• ' + name); try { await fn(); } catch (e) { check('tes selesai tanpa pengecualian', false, e.message.split('\n')[0]); } }

await T('1. Firebase belum dikonfigurasi (placeholder) -> pesan jelas, tidak ada login palsu', async () => {
  cfgMode = 'asli'; const { ctx, page } = await open(); await page.goto(base + '/#/login'); await page.waitForTimeout(400);
  check('banner konfigurasi tampil', /belum dikonfigurasi/i.test(await text(page, '#banner')));
  await page.fill('#lg-email', 'budi@contoh.id'); await page.fill('#lg-pass', PW); await page.click('#login-btn');
  check('login ditolak dengan pesan konfigurasi', /belum dikonfigurasi/i.test(await text(page, '#login-err')));
  check('tidak masuk ke dashboard', !(await page.evaluate(() => location.hash)).includes('dashboard')); await ctx.close(); cfgMode = 'test';
});
await T('2. Validasi formulir', async () => {
  const { ctx, page } = await open(); await page.goto(base + '/#/login'); await page.waitForSelector('#lg-email');
  await page.click('#login-btn'); check('email kosong', /Email wajib/.test(await text(page, '#login-err')));
  await page.fill('#lg-email', 'bukan-email'); await page.click('#login-btn'); check('format email', /Format email/.test(await text(page, '#login-err')));
  check('field ditandai aria-invalid', (await page.getAttribute('#lg-email', 'aria-invalid')) === 'true');
  await page.fill('#lg-email', 'budi@contoh.id'); await page.click('#login-btn'); check('password kosong', /Password wajib/.test(await text(page, '#login-err'))); await ctx.close();
});
await T('3. Login gagal: password salah, email tidak terdaftar, akun nonaktif, jaringan, konfigurasi', async () => {
  const { ctx, page } = await open();
  await login(page, 'budi@contoh.id', 'salah-banget'); await page.waitForSelector('#login-err:not([hidden])');
  const m1 = await text(page, '#login-err'); check('password salah -> pesan generik', /Email atau password salah/.test(m1), m1);
  await page.fill('#lg-email', 'tidakada@contoh.id'); await page.fill('#lg-pass', PW); await page.click('#login-btn'); await page.waitForTimeout(150);
  const m2 = await text(page, '#login-err'); check('email tidak terdaftar -> pesan SAMA (tidak membocorkan akun)', m2 === m1, m2);
  await page.fill('#lg-email', 'mati@contoh.id'); await page.click('#login-btn'); await page.waitForTimeout(150);
  check('akun nonaktif', /dinonaktifkan/i.test(await text(page, '#login-err')));
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.net = 'down'; localStorage.__fakeState = JSON.stringify(s); });
  await page.fill('#lg-email', 'budi@contoh.id'); await page.click('#login-btn'); await page.waitForTimeout(150);
  check('jaringan gagal', /Koneksi gagal/.test(await text(page, '#login-err')));
  for (const [code, re] of [['auth/invalid-api-key', /API key tidak valid/], ['auth/operation-not-allowed', /belum diaktifkan/], ['auth/too-many-requests', /Terlalu banyak/], ['auth/unauthorized-domain', /Authorized domains/]]) {
    await page.evaluate(c => { const s = JSON.parse(localStorage.__fakeState); s.net = 'up'; s.authError = c; localStorage.__fakeState = JSON.stringify(s); }, code);
    await page.click('#login-btn'); await page.waitForTimeout(150); check('galat konfigurasi ' + code, re.test(await text(page, '#login-err')), await text(page, '#login-err'));
  }
  check('tidak pernah masuk', !(await page.evaluate(() => location.hash)).match(/dashboard|admin|penguji/)); await ctx.close();
});
await T('4. Login benar -> dashboard sesuai peran; logout; pemulihan sesi', async () => {
  const { ctx, page } = await open(); await login(page, 'budi@contoh.id', PW); await wait(page, '#/dashboard');
  check('chip nama & peran peserta', /Budi Santoso/.test(await text(page, '#chip-name')) && /Peserta/.test(await text(page, '#chip-role')));
  check('field password dikosongkan', (await page.inputValue('#lg-pass')) === '');
  await page.reload(); await wait(page, '#/dashboard'); await page.waitForSelector('#userchip:not([hidden])'); check('sesi pulih setelah muat ulang', /Budi Santoso/.test(await text(page, '#chip-name')));
  await page.click('[data-act=logout]'); await wait(page, '#/beranda'); await page.waitForSelector('#userchip', { state: 'hidden', timeout: 5000 }); check('logout -> chip tersembunyi', await page.locator('#userchip').isHidden());
  await page.reload(); await page.waitForTimeout(400); check('setelah logout & reload tetap keluar', await page.locator('#userchip').isHidden());
  await login(page, 'admin@contoh.id', PW); await wait(page, '#/admin'); check('admin -> dashboard admin', /Admin/.test(await text(page, '#chip-role')));
  await page.click('[data-act=logout]'); await login(page, 'guru@contoh.id', PW); await wait(page, '#/penguji'); check('penguji -> dashboard penguji', /Penguji/.test(await text(page, '#chip-role'))); await ctx.close();
});
await T('5. Akses tanpa login dan lintas peran', async () => {
  const { ctx, page } = await open();
  for (const h of ['#/admin', '#/admin/soal', '#/penguji', '#/dashboard', '#/ujian', '#/hasil']) { await page.goto(base + '/' + h); await page.reload(); await wait(page, '#/login'); check('tanpa login ' + h + ' -> #/login', true); }
  await page.goto(base + '/#/admin'); await page.reload(); await wait(page, '#/login'); await page.fill('#lg-email', 'admin@contoh.id'); await page.fill('#lg-pass', PW); await page.click('#login-btn'); await wait(page, '#/admin');
  check('setelah login kembali ke halaman tujuan', true); await page.click('[data-act=logout]'); await wait(page, '#/beranda');
  await login(page, 'budi@contoh.id', PW); await wait(page, '#/dashboard');
  for (const h of ['admin', 'admin/peserta', 'admin/penguji', 'penguji', 'penilaian/p1']) { await page.evaluate(x => { location.hash = '#/' + x; }, h); await page.waitForTimeout(250);
    check('peserta dilarang #/' + h, (await page.evaluate(() => location.hash)) === '#/dashboard' && /tidak memiliki akses/i.test(await toasts(page))); }
  await page.click('[data-act=logout]'); await login(page, 'guru@contoh.id', PW); await wait(page, '#/penguji');
  for (const h of ['admin', 'admin/penguji', 'dashboard', 'ujian']) { await page.evaluate(x => { location.hash = '#/' + x; }, h); await page.waitForTimeout(250); check('penguji dilarang #/' + h, (await page.evaluate(() => location.hash)) === '#/penguji'); }
  check('penguji hanya melihat regunya (3)', /Regu yang ditugaskan:\s*3/.test(await page.locator('#examiner-root').innerText())); await ctx.close();
});
await T('6. Akun tanpa peran ditolak dan keluar', async () => {
  const { ctx, page } = await open(); await login(page, 'tanpa@contoh.id', PW); await page.waitForTimeout(500);
  check('pesan tanpa peran', /belum memiliki peran/i.test(await toasts(page)));
  check('tidak ada sesi aktif', await page.locator('#userchip').isHidden() && (await page.evaluate(() => localStorage.__fakeSession ?? null)) === null); await ctx.close();
});
await T('7. Akun dinonaktifkan / peran diubah / sesi dicabut saat sesi tersimpan', async () => {
  let { ctx, page } = await open(); await login(page, 'budi@contoh.id', PW); await wait(page, '#/dashboard');
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.users.p1.disabled = true; s.users.p1.tokensValidAfter = Date.now(); localStorage.__fakeState = JSON.stringify(s); });
  await page.reload(); await page.waitForTimeout(600); check('akun dinonaktifkan: sesi lama ditolak & keluar', await page.locator('#userchip').isHidden() && /dinonaktifkan/i.test(await toasts(page)), await toasts(page));
  await ctx.close();
  ({ ctx, page } = await open()); await login(page, 'admin@contoh.id', PW); await wait(page, '#/admin');
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.users.adm.claims = { role: 'penguji', team: 4 }; localStorage.__fakeState = JSON.stringify(s); });
  await page.reload(); await wait(page, '#/penguji'); check('peran turun dari server -> UI mengikuti server, bukan sesi lama', /Penguji/.test(await text(page, '#chip-role')));
  await page.evaluate(() => { location.hash = '#/admin'; }); await page.waitForTimeout(250); check('mantan admin tidak bisa buka #/admin', (await page.evaluate(() => location.hash)) === '#/penguji'); await ctx.close();
  ({ ctx, page } = await open()); await login(page, 'budi@contoh.id', PW); await wait(page, '#/dashboard');
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.users.p1.tokensValidAfter = Date.now() + 5; localStorage.__fakeState = JSON.stringify(s); });
  await page.reload(); await page.waitForTimeout(600); check('sesi dicabut -> keluar dengan pesan sesi berakhir', await page.locator('#userchip').isHidden() && /Sesi login berakhir/i.test(await toasts(page)), await toasts(page)); await ctx.close();
});
await T('8. Jaringan putus saat pemulihan sesi -> banner Coba lagi, bukan keluar paksa', async () => {
  const { ctx, page } = await open(); await login(page, 'budi@contoh.id', PW); await wait(page, '#/dashboard');
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.net = 'down'; localStorage.__fakeState = JSON.stringify(s); });
  await page.reload(); await page.waitForSelector('[data-act=retry-auth]', { timeout: 8000 }); check('banner coba lagi muncul', true);
  check('sesi Firebase tidak dihapus', (await page.evaluate(() => localStorage.__fakeSession ?? null)) !== null);
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.net = 'up'; localStorage.__fakeState = JSON.stringify(s); });
  await page.click('[data-act=retry-auth]'); await page.waitForFunction(() => !document.querySelector('#userchip').hidden); check('setelah jaringan pulih, masuk kembali', true);
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.fnMissing = 'whoami'; localStorage.__fakeState = JSON.stringify(s); }); await page.reload(); await page.waitForTimeout(600);
  check('fungsi whoami tidak ter-deploy -> pesan jelas & keluar', /belum tersedia di server/i.test(await toasts(page)), await toasts(page)); await ctx.close();
});
await T('9. Lupa password', async () => {
  const { ctx, page } = await open(); await page.goto(base + '/#/login'); await page.waitForSelector('[data-act=forgot]'); await page.click('[data-act=forgot]');
  await page.fill('#fp-email', 'salah'); await page.click('#dlg-ok'); await page.waitForSelector('#dlg-err:not([hidden])'); check('email tidak valid ditolak', /Format email/.test(await text(page, '#dlg-err')));
  await page.fill('#fp-email', 'tidakada@contoh.id'); await page.click('#dlg-ok'); await page.waitForTimeout(300);
  check('email tak terdaftar -> jawaban netral', /Jika email terdaftar/.test(await toasts(page)) && await page.locator('#dlg').evaluate(d => !d.open));
  await page.click('[data-act=forgot]'); await page.fill('#fp-email', 'budi@contoh.id'); await page.click('#dlg-ok'); await page.waitForTimeout(300);
  check('email terdaftar -> permintaan terkirim', (await page.evaluate(() => JSON.parse(localStorage.__fakeState).resets)).includes('budi@contoh.id'));
  await page.evaluate(() => { const s = JSON.parse(localStorage.__fakeState); s.net = 'down'; localStorage.__fakeState = JSON.stringify(s); });
  await page.click('[data-act=forgot]'); await page.fill('#fp-email', 'budi@contoh.id'); await page.click('#dlg-ok'); await page.waitForSelector('#dlg-err:not([hidden])'); check('jaringan gagal ditangani', /Koneksi gagal/.test(await text(page, '#dlg-err'))); await ctx.close();
});
await T('10. Manajemen akun admin: tanpa password, tautan atur password, nonaktifkan, ubah peran, impor', async () => {
  const { ctx, page } = await open(); await login(page, 'admin@contoh.id', PW); await wait(page, '#/admin'); await page.goto(base + '/#/admin/penguji'); await page.reload(); await page.waitForSelector('#acc-form');
  await page.fill('#ac-nama', 'Penguji Baru'); await page.fill('#ac-email', 'baru@contoh.id'); await page.selectOption('#ac-team', '5'); await page.click('#ac-go'); await page.waitForSelector('#lk');
  const link = await page.inputValue('#lk'); check('tautan atur password ditampilkan (bukan password)', /^https:\/\//.test(link));
  const body = (await page.locator('main').innerText()).toLowerCase(); check('tidak ada "password awal" di UI', !/password awal|kata sandi awal/.test(body));
  check('akun baru muncul di daftar', /baru@contoh\.id/.test(await page.locator('main').innerText()));
  check('formulir tak punya kolom password', (await page.locator('#acc-form input[type=password]').count()) === 0);
  await page.click('[data-act=acct-toggle][data-email="baru@contoh.id"]'); await page.click('#dlg-ok'); await page.waitForTimeout(400);
  check('nonaktifkan akun', /Nonaktif/.test(await page.locator('main').innerText()));
  check('admin tidak punya tombol untuk dirinya sendiri', (await page.locator('[data-act=acct-toggle][data-email="admin@contoh.id"]').count()) === 0);
  await page.click('[data-act=acct-link][data-email="guru@contoh.id"]'); await page.waitForSelector('#dlg #lk'); check('tautan atur ulang per akun', /^https:\/\//.test(await page.inputValue('#dlg #lk'))); await page.click('#dlg-ok');
  await page.click('[data-act=acct-mail][data-email="guru@contoh.id"]'); await page.waitForTimeout(250); check('kirim email atur password', /dikirim/i.test(await toasts(page)));
  await page.goto(base + '/#/admin/peserta'); await page.reload(); await page.waitForSelector('#imp-csv'); await page.fill('#imp-csv', 'nama,regu\nSiti,1'); await page.click('#imp-go'); await page.click('#dlg-ok'); await page.waitForSelector('[data-act=dl-links]');
  check('hasil impor tanpa kolom password', !/password awal/i.test(await page.locator('#imp-res').innerText()) && /Tautan atur password/.test(await page.locator('#imp-res').innerText()));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=dl-links]')]); const csv = fs.readFileSync(await dl.path(), 'utf8');
  check('CSV unduhan berisi tautan, bukan password', /Tautan atur password/.test(csv) && !/password awal/i.test(csv) && csv.startsWith('\uFEFF'));
  await page.goto(base + '/#/admin/pengaturan'); await page.reload(); await page.waitForSelector('#cfg-form'); await page.fill('#cf-teori', '50'); await page.click('#cf-go');
  check('bobot tidak 100 ditolak di klien', /harus 100/.test(await text(page, '#cf-err'))); await ctx.close();
});
await T('11. Responsif HP (375px): tanpa gulir horizontal', async () => {
  const { ctx, page } = await open({}, { viewport: { width: 375, height: 740 } }); await page.goto(base + '/#/login'); await page.waitForSelector('#lg-email'); check('login', !(await overflow(page)));
  await page.fill('#lg-email', 'budi@contoh.id'); await page.fill('#lg-pass', PW); await page.click('#login-btn'); await wait(page, '#/dashboard'); await page.waitForTimeout(300); check('dashboard peserta', !(await overflow(page)));
  await page.click('[data-act=logout]'); await login(page, 'admin@contoh.id', PW); await wait(page, '#/admin'); await page.goto(base + '/#/admin/penguji'); await page.reload(); await page.waitForSelector('#acc-form'); await page.waitForTimeout(300);
  check('admin: akun', !(await overflow(page))); await page.screenshot({ path: path.join(here, 'hp-admin-akun.png') }); await ctx.close();
});
await browser.close(); srv.close();
const fail = results.filter(r => !r.ok), by = {}; results.forEach(r => (by[r.test] ??= []).push(r));
console.log('\n=== RINGKASAN ==='); for (const [t, rs] of Object.entries(by)) console.log(`${rs.every(r => r.ok) ? 'LULUS ' : 'GAGAL '} ${t} (${rs.filter(r => r.ok).length}/${rs.length})`);
console.log(`\nTotal pemeriksaan: ${results.length}, lulus: ${results.length - fail.length}, gagal: ${fail.length}`); process.exit(fail.length ? 1 : 0);
