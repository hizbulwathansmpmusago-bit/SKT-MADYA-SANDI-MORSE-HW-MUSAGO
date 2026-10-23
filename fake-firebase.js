// BERKAS UJI SAJA. Meniru perilaku SDK Firebase + server (whoami, fungsi admin) di dalam browser agar alur UI login dapat diuji
// tanpa internet/kredensial. Ini BUKAN pengujian Firebase sungguhan dan tidak menguji Firestore Rules atau Cloud Functions asli.
(() => {
  const KEY = '__fakeState', SES = '__fakeSession';
  if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, JSON.stringify(window.__SEED__));
  const st = () => JSON.parse(localStorage.getItem(KEY)), save = s => localStorage.setItem(KEY, JSON.stringify(s));
  const E = (code, message) => Object.assign(new Error(message || code), { code });
  const session = () => JSON.parse(localStorage.getItem(SES) || 'null');
  const down = () => st().net === 'down';
  const listeners = [];
  const userObj = s => s && { uid: s.uid, email: st().users[s.uid]?.email,
    async getIdToken() { if (down()) throw E('auth/network-request-failed'); const u = st().users[s.uid]; if (!u || u.disabled) throw E('auth/user-disabled'); return 'tok'; } };
  const notify = () => setTimeout(() => { const u = userObj(session()); listeners.forEach(cb => cb(u)); }, 0);
  const auth = { get currentUser() { return userObj(session()); } };
  const lookupFn = (name, data) => {
    const S = st(), ses = session(); if (down()) throw E('functions/unavailable', 'offline');
    if (S.fnMissing === name) throw E('functions/not-found', 'not found');
    if (S.fnInternal === name) throw E('functions/internal', 'internal');
    if (!ses) throw E('functions/unauthenticated', 'Login diperlukan');
    const u = S.users[ses.uid]; if (!u) throw E('functions/unauthenticated', 'Akun tidak ditemukan');
    if (u.disabled) throw E('functions/permission-denied', 'Akun dinonaktifkan. Hubungi panitia.');
    if ((u.tokensValidAfter || 0) > ses.iat) throw E('functions/unauthenticated', 'Sesi berakhir');
    const c = u.claims || {}; if (!['admin', 'penguji', 'peserta'].includes(c.role)) throw E('functions/permission-denied', 'Akun belum memiliki peran. Hubungi admin.');
    const me = { uid: ses.uid, role: c.role, team: c.team ?? null, canUnlock: c.canUnlock === true, nama: u.profile?.nama ?? null };
    if (name === 'whoami') return me;
    if (name.startsWith('admin') && c.role !== 'admin') throw E('functions/permission-denied', 'Hanya admin');
    const prof = (uid, p) => { S.docs['users/' + uid] = { ...(S.docs['users/' + uid] || {}), ...p }; };
    if (name === 'adminCreateAccount') {
      const email = String(data.email).toLowerCase(); if (Object.values(S.users).some(x => x.email === email)) throw E('functions/already-exists', 'Email sudah terdaftar');
      const uid = 'n' + Object.keys(S.users).length; S.users[uid] = { email, disabled: false, claims: { role: data.role, ...(data.team ? { team: data.team } : {}), ...(data.role === 'penguji' ? { canUnlock: !!data.canUnlock } : {}) } };
      prof(uid, { nama: data.nama, email, role: data.role, team: data.team, canUnlock: !!data.canUnlock, disabled: false }); save(S); return { uid, email, linkAtur: 'https://fake.example/reset?oobCode=' + uid };
    }
    if (name === 'adminSetDisabled') { S.users[data.uid].disabled = !!data.disabled; if (data.disabled) S.users[data.uid].tokensValidAfter = Date.now(); prof(data.uid, { disabled: !!data.disabled }); save(S); return { ok: true }; }
    if (name === 'adminSetRole') { const t = S.users[data.uid]; t.claims = { role: data.role, ...(data.team ? { team: data.team } : {}) }; t.tokensValidAfter = Date.now(); prof(data.uid, { role: data.role, team: data.team }); save(S); return { ok: true }; }
    if (name === 'adminResetLink') return { email: S.users[data.uid].email, linkAtur: 'https://fake.example/reset?oobCode=' + data.uid };
    if (name === 'adminImportRoster') return { rows: [{ nama: 'Siti', regu: 1, duplicate: false }], errors: [], ...(data.dryRun ? {} : { akun: [{ nama: 'Siti', email: 'pabc@skt.hwmusago.local', status: 'dibuat', linkAtur: 'https://fake.example/reset?oobCode=x' }] }) };
    if (name === 'adminSetConfig') { S.docs['config/exam'] = data; save(S); return data; }
    if (name === 'adminExportCsv') return { csv: 'Nama\r\n' };
    throw E('functions/not-found', 'fungsi tidak dikenal: ' + name);
  };
  const where = (f, op, v) => ({ f, op, v });
  const fb = {
    initializeApp: () => ({}), getAuth: () => auth, connectAuthEmulator() {}, connectFirestoreEmulator() {}, connectFunctionsEmulator() {},
    onAuthStateChanged(_a, cb) { listeners.push(cb); notify(); return () => {}; },
    async signInWithEmailAndPassword(_a, email, pw) {
      const S = st(); if (S.net === 'down') throw E('auth/network-request-failed'); if (S.authError) throw E(S.authError);
      const hit = Object.entries(S.users).find(([, u]) => u.email === email.toLowerCase());
      if (!hit || hit[1].password !== pw) throw E('auth/invalid-credential');
      if (hit[1].disabled) throw E('auth/user-disabled');
      localStorage.setItem(SES, JSON.stringify({ uid: hit[0], iat: Date.now() })); notify();
    },
    async signOut() { localStorage.removeItem(SES); notify(); },
    async sendPasswordResetEmail(_a, email) { const S = st(); if (S.net === 'down') throw E('auth/network-request-failed'); S.resets = [...(S.resets || []), email]; save(S); if (!Object.values(S.users).some(u => u.email === email.toLowerCase())) throw E('auth/user-not-found'); },
    async updatePassword() {}, getFirestore: () => ({}), getFunctions: () => ({}),
    doc: (_d, path) => ({ path }), collection: (_d, name) => ({ name }), where, orderBy: () => ({}), limit: () => ({}),
    query: (col, ...cs) => ({ col, cs }),
    async getDoc(ref) { if (down()) throw E('unavailable'); const d = st().docs[ref.path]; return { exists: () => !!d, data: () => d }; },
    async getDocs(q) { if (down()) throw E('unavailable'); const S = st(); const rows = Object.entries(S.docs).filter(([p]) => p.startsWith(q.col.name + '/') && p.split('/').length === 2)
      .map(([p, d]) => ({ id: p.split('/')[1], data: () => d })).filter(r => (q.cs || []).every(c => !c.op || r.data()[c.f] === c.v)); return { docs: rows }; },
    httpsCallable: (_f, name) => async data => { await new Promise(r => setTimeout(r, 5)); return { data: lookupFn(name, data) }; },
  };
  window.__fb = fb;
})();
