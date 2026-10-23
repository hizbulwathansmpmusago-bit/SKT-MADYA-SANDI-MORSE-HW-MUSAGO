# SKT Madya — Sandi Morse HW Musago

## Status jujur (per perbaikan login)
Lihat `SETUP-AUTH.md` (panduan) dan `CHANGES.md` (perubahan).
- **Teruji:** 34 tes unit (Morse, penilaian, percobaan/penguncian/audit, otorisasi akun, roster/CSV, bootstrap admin, pembuat konfigurasi) dan 68 pemeriksaan UI di Chromium (login, galat, sesi, hak akses, akun, responsif 375px) memakai **SDK Firebase tiruan**.
- **Belum diuji:** Firebase Auth/Firestore/Functions sungguhan, `functions/src/index.ts` (belum dikompilasi), `firestore.rules` (butuh Emulator), email atur password sungguhan, deployment.
- **Perlu tindakan pemilik akun:** proyek Firebase + Blaze, aktifkan Email/Password, isi `web/firebase-config.js`, deploy, bootstrap admin pertama.
- **Belum ada:** antarmuka kelola bank soal; roster DP8/DP9 asli (tidak ada di sesi ini, tidak dikarang).
- `seed/prototipe-lama.html` = prototipe lama (demo, jangan dipakai ujian resmi).

## Menjalankan tes inti
    cd functions && npm install && npm test
## Setup Firebase (butuh akun pemilik)
1. Buat project Firebase, aktifkan Authentication (Email/Password), Firestore, Functions (paket Blaze).
2. `firebase deploy --only firestore:rules,functions`
3. Buat dokumen `config/exam` (status, durationMin, passMark, weights, resultsReleased), `questions/*` dan `answerKeys/*`.
4. Buat akun admin lewat Admin SDK dengan custom claim `{role:'admin'}`.
