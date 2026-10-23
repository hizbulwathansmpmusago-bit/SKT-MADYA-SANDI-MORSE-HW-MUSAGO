# Perbaikan struktur repo & backend (login gagal / CORS)
**Akar masalah:** repo terunggah rata (tanpa folder `functions/`, `web/`, dll.) sehingga `firebase.json` menunjuk folder yang tidak ada dan backend tidak pernah ter-deploy dari repo; permintaan ke fungsi yang tidak ada/ditolak muncul sebagai error CORS + galat `internal`. Detail: `DEPLOY.md`.

Diubah/ditambah:
- Struktur dipulihkan: `functions/` (src, test, package.json, tsconfig.json), `web/`, `scripts/`, `tests/e2e/`, `seed/`.
- `web/firebase-config.js` — memakai konfigurasi publik proyek yang ada di repo (region `asia-southeast2`).
- `functions/tsconfig.json` (`rootDir src`, `outDir lib`, `types ["node"]`), `functions/package.json` (`engines node 20`, skrip build/serve/test).
- `functions/src/index.ts` — `cors:true` + `invoker:'public'` eksplisit pada semua callable (preflight tidak diblokir IAM).
- `firebase.json` — `runtime nodejs20`, predeploy `$RESOURCE_DIR`; `.firebaserc`; `.gitignore` (blokir kredensial); `.nojekyll`; `package.json` root.
- `web/script.js` — pesan jelas + petunjuk console saat fungsi tak terjangkau; `web/src/lib/api.ts` memakai region dari config. Frontend sudah memakai `httpsCallable` (tidak ada `fetch` langsung).
- `build-satu-berkas.py` — menulis `index.html` root (GitHub Pages, URL tetap) dan `index-satu-berkas.html`.
- Baru: `scripts/check-functions.mjs` + `probe-core.mjs` (diagnosa 404/403/5xx/CORS), `scripts/migrate-from-flat.sh`, `.github/workflows/ci.yml` (build+tes, tanpa deploy), `DEPLOY.md`, `functions/test/probe.test.ts`.
- Tidak diubah: desain, fitur ujian/bank soal/penilaian/penguncian, otorisasi per peran, `firestore.rules` (ditinjau: tidak terbuka, penutup `deny` di akhir).

---
# Perubahan — perbaikan sistem login (dari zip "diperbarui")

## Temuan penyebab login/fitur tidak jalan
1. **Region tidak cocok:** frontend memanggil `asia-southeast2`, fungsi tidak mengatur region (default `us-central1`) → semua panggilan fungsi gagal. Diperbaiki: `setGlobalOptions({ region })` di `functions/src/index.ts`.
2. **Konfigurasi masih placeholder** (`ISI_...`): nilai asli hanya bisa diisi pemilik proyek. Ditambah `scripts/set-firebase-config.mjs` (validasi) dan pemeriksaan `configured()` yang lebih ketat.
3. **Peran dipercaya dari token di browser**; akun nonaktif/peran berubah baru berlaku setelah token kedaluwarsa. Diperbaiki: fungsi `whoami` + `actor()` memverifikasi ke Firebase Auth di server.
4. **Impor peserta membuat password acak (`Math.random`) dan menampilkannya ke admin**, serta email dari 5 byte pertama nama (bisa bentrok untuk nama berawalan sama, dan impor berhenti di tengah jalan). Diganti: akun tanpa password + tautan atur password, email dari hash SHA-256, status per baris (dibuat/sudah ada/gagal).
5. Penguji/admin tidak bisa dibuat dari antarmuka; Pengaturan hanya-baca. Ditambah fungsi + UI.
6. `onUser` lama: bila verifikasi gagal, tampilan keluar tetapi sesi Firebase tetap hidup. Diperbaiki (keluar bersih, atau banner "Coba lagi" bila hanya jaringan).
7. Tampilan dashboard peserta meluap horizontal di layar 375px (angka "Berlangsung"). Diperbaiki di CSS.

## Berkas baru
`functions/src/authz.ts` (+`test/authz.test.ts`), `scripts/bootstrap-core.mjs`, `scripts/bootstrap-admin.mjs`, `scripts/config-core.mjs`, `scripts/set-firebase-config.mjs`, `functions/test/bootstrap.test.ts`, `functions/test/config.test.ts`, `tests/e2e/*`, `SETUP-AUTH.md`, `CHANGES.md`.
## Berkas diubah
- `functions/src/index.ts` — region, `actor()` terverifikasi server, `whoami`, `adminCreateAccount`, `adminSetRole`, `adminSetDisabled`, `adminResetLink`, impor tanpa password, `adminSetConfig`, `adminEndExam`, `adminListQuestions/SaveQuestion/DeleteQuestion`.
- `functions/src/attempts.ts` — `endExam`, `validateConfig` (+tes). `functions/src/roster.ts` — kolom `email` opsional (+tes). `functions/package.json` — daftar tes.
- `web/script.js` — alur login (validasi, galat, `whoami`, pemulihan sesi, lupa password, banner coba lagi), halaman akun & pengaturan, hasil impor tanpa password.
- `web/index.html`, `web/style.css` — status login, tautan lupa password, perbaikan luapan.
- `index-satu-berkas.html` dibangun ulang dari `web/`.
- Tidak diubah: desain, fitur Morse, materi, ujian/timer/autosave/penguncian, `firestore.rules`, `firebase.json`.
