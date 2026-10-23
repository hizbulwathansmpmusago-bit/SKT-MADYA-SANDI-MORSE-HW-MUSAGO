# SKT Madya — Sandi Morse HW Musago

## Struktur
`web/` frontend (Firebase Hosting; sumber) · `index.html` root = hasil bangun satu berkas untuk GitHub Pages · `functions/` backend (Cloud Functions v2, Node 20, TypeScript, region asia-southeast2) · `firestore.rules` · `scripts/` · `tests/e2e/` · `seed/`.
Panduan: `DEPLOY.md` (migrasi struktur, Pages, deploy, diagnosa CORS) dan `SETUP-AUTH.md` (admin pertama, akun). Perubahan: `CHANGES.md`.

## Status jujur
- **Dijalankan:** 36 tes unit + 77 pemeriksaan UI (Chromium, Firebase tiruan).
- **Belum diverifikasi:** `npm install`/`tsc` penuh `index.ts`, Emulator (Rules/Functions), deploy, login produksi. CI (`.github/workflows/ci.yml`) menjalankan build+tes di GitHub — periksa tab Actions.
- Bank soal belum punya antarmuka (isi via Console / fungsi `adminSaveQuestion`). Roster DP8/DP9 asli tidak ada di repo (tidak dikarang).
- `seed/prototipe-lama.html` = prototipe lama (demo, jangan dipakai ujian resmi).

## Menjalankan tes inti
    cd functions && npm install && npm test
## Setup Firebase (butuh akun pemilik)
1. Buat project Firebase, aktifkan Authentication (Email/Password), Firestore, Functions (paket Blaze).
2. `firebase deploy --only firestore:rules,functions`
3. Buat dokumen `config/exam` (status, durationMin, passMark, weights, resultsReleased), `questions/*` dan `answerKeys/*`.
4. Buat akun admin lewat Admin SDK dengan custom claim `{role:'admin'}`.
