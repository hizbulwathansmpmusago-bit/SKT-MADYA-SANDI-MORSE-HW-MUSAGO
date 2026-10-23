# Frontend (web/) — SKT Madya Sandi Morse
File: `index.html`, `style.css`, `script.js`, `firebase-config.js`. Tanpa build step; SDK Firebase (v10.12.2) dimuat dari CDN gstatic.
Hosting: `firebase.json` → `public: "web"` (folder `web/src` hanya referensi dan tidak ikut dipublikasikan).

## Menerbitkan
1. Isi `web/firebase-config.js` (Project settings → Your apps → Web app). Nilai ini publik.
2. Auth → aktifkan Email/Password. Firestore + Functions (Blaze), region `asia-southeast2`.
3. `cd functions && npm install && npm test`
4. `firebase deploy --only firestore:rules,functions,hosting` → URL `https://<project-id>.web.app`
5. Buat `config/exam`, `questions/*`, `answerKeys/*`, akun admin (custom claim `role:'admin'`) — lihat README.md.
6. Admin: Peserta & regu → impor CSV → bagikan kredensial awal. Penguji dibuat lewat Admin SDK (claims `role:'penguji', team, canUnlock`).
Berkas lokal (content://, file://): jalankan `python3 build-satu-berkas.py` → `index-satu-berkas.html` (hanya Beranda & Materi; login/ujian wajib lewat https).
Uji lokal: `USE_EMULATORS = true` di firebase-config.js, `firebase emulators:start`, buka `localhost`.
