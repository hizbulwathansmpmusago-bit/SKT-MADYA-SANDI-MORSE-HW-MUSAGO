# Deployment & perbaikan — SKT Madya Sandi Morse HW Musago

## 0. Akar masalah login (ringkas)
1. **Repo terunggah "rata"**: semua berkas ada di root; folder `functions/`, `web/`, `scripts/`, `tests/` hilang. `firebase.json` menunjuk `functions` dan `web` yang tidak ada → backend tidak pernah bisa di-build/di-deploy dari repo ini.
2. Tanpa backend ter-deploy di `asia-southeast2`, permintaan ke fungsi mendapat **404/403 tanpa header CORS** → browser melaporkannya sebagai **error CORS** dan SDK menampilkan galat `internal` ("kesalahan server"). CORS-nya sendiri bukan masalah kode: itu gejala fungsi tidak ada / ditolak / crash.
3. Hal lain yang diperbaiki: region eksplisit + `cors`/`invoker` eksplisit pada semua callable; `tsconfig` memakai `types: ["node"]`; `package.json` fungsi lengkap; `.gitignore` memblokir kredensial; CI build+tes; skrip diagnosa `scripts/check-functions.mjs`.
> Saya tidak punya akses ke proyek Firebase Anda, jadi **status deploy sebenarnya belum terverifikasi**. Gunakan langkah 5 untuk memastikan.

## 1. Pulihkan struktur repo (migrasi dari repo rata)
```bash
git clone https://github.com/hizbulwathansmpmusago-bit/SKT-MADYA-SANDI-MORSE-HW-MUSAGO.git
cd SKT-MADYA-SANDI-MORSE-HW-MUSAGO
# 1) hapus duplikat berkas rata di root (git rm — bisa dibatalkan lewat git)
#    skrip ini ada di zip: salin scripts/migrate-from-flat.sh ke luar repo atau jalankan dari folder zip:
bash /jalur/ke/zip-diekstrak/scripts/migrate-from-flat.sh
# 2) salin SELURUH isi zip (termasuk folder tersembunyi .github) ke root repo
cp -a /jalur/ke/zip-diekstrak/. .
# 3) cek lalu commit
git status
git add -A && git commit -m "Pulihkan struktur folder (functions/, web/, scripts/, tests/) dan perbaiki backend" && git push
```
Tanpa terminal: di GitHub, hapus berkas rata lewat antarmuka web, lalu unggah **folder** (bukan zip) dengan seret-dan-lepas di Chrome/Edge desktop agar struktur folder terbawa.

## 2. GitHub Pages (URL tetap)
Settings → Pages → **Deploy from a branch → main / (root)**. Root `index.html` kini berkas hasil bangun (satu berkas, berisi CSS/JS/logo) sehingga URL Pages yang ada tetap berfungsi. Sumber kebenaran adalah `web/`; setelah mengubah `web/*` jalankan `python3 build-satu-berkas.py` dan commit (CI memeriksa ini).
**Wajib:** Firebase Console → Authentication → Settings → **Authorized domains** → tambahkan `hizbulwathansmpmusago-bit.github.io` (tanpa ini login dari Pages gagal `auth/unauthorized-domain`).

## 3. Siapkan Firebase (pemilik akun)
- Proyek: `sktmadya-sandi-morse-hw-musago` (sudah ada di `.firebaserc` dan `web/firebase-config.js`). Paket **Blaze** wajib untuk Cloud Functions.
- Authentication → Sign-in method → **Email/Password: Enable**.
- Firestore Database dibuat (region disarankan `asia-southeast2`).

## 4. Deploy (hanya setelah Anda setuju)
```bash
npm install -g firebase-tools && firebase login
cd functions && npm install && npm run build && npm test && cd ..
firebase deploy --only firestore:rules,functions      # tambahkan ,hosting bila memakai Firebase Hosting
```
Catatan: fungsi terjadwal `closeExpired` memakai Cloud Scheduler; bila deploy gagal karena Scheduler tidak tersedia di region, hapus/ubah fungsi itu (kadaluarsa tetap ditangani saat akses dan oleh "Akhiri ujian").

## 5. Verifikasi backend (jalankan setelah deploy)
```bash
node scripts/check-functions.mjs --origin https://hizbulwathansmpmusago-bit.github.io
```
| Hasil | Arti | Tindakan |
|---|---|---|
| `TIDAK_DEPLOY` (404) | fungsi tidak ada di region ini | deploy ulang; pastikan region `asia-southeast2` sama di `firebase-config.js` dan `index.ts` |
| `IAM_DITOLAK` (403) | Cloud Run menolak pemanggil publik | beri `allUsers` peran *Cloud Run Invoker* pada fungsi; cek kebijakan organisasi |
| `FUNGSI_ERROR` (5xx) | fungsi crash saat start | `firebase functions:log`; biasanya build gagal/dependensi hilang |
| `CORS_HILANG` | fungsi hidup tapi tanpa header CORS | pastikan memakai versi `index.ts` ini (`cors: true`) |
| `OK` | siap | lanjut ke langkah 6 |

## 6. Admin pertama & akun
Lihat `SETUP-AUTH.md` (bootstrap admin tanpa password bawaan, impor peserta, penguji).

## 7. Yang sudah dan belum diverifikasi
- **Dijalankan di sini:** 36 tes unit (`tsx`), 77 pemeriksaan UI di Chromium (SDK Firebase tiruan), uji skrip migrasi dengan git.
- **Tidak bisa dijalankan di sini (tanpa internet):** `npm install`, `tsc` penuh untuk `index.ts`, Emulator (Rules/Functions), deploy. CI GitHub Actions menjalankan build + tes pada push berikutnya — **periksa tab Actions**.
- **Tidak diklaim:** deployment, login produksi, `firestore.rules` teruji.
