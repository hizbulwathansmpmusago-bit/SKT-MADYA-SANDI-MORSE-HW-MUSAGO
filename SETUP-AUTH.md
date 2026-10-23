# Panduan Login & Akun — SKT Madya Sandi Morse

## Cara kerja (ringkas)
- Login = **Firebase Authentication Email/Password**. Tidak ada akun/password bawaan di kode.
- Peran (`admin` / `penguji` / `peserta`), regu, dan izin buka kunci disimpan sebagai **custom claims** dan ditetapkan **hanya oleh server** (Cloud Functions / Admin SDK).
- Setiap panggilan fungsi diverifikasi server: akun dicek ulang di Firebase Auth (nonaktif → ditolak, peran dibaca dari Auth, sesi yang dicabut → ditolak). Setelah login, frontend memanggil `whoami`; peran di layar berasal dari server, bukan dari token di browser.
- Akun dibuat **tanpa password**. Pemilik menetapkan password sendiri lewat email/tautan atur password. Sistem tidak pernah membuat, menyimpan, atau menampilkan password.

## 1. Siapkan proyek Firebase (tindakan pemilik akun)
1. Firebase Console → buat proyek → upgrade ke paket **Blaze** (Cloud Functions mewajibkan).
2. **Authentication → Sign-in method → Email/Password → Enable.**
3. **Authentication → Settings → Authorized domains**: pastikan domain hosting Anda ada (`<project-id>.web.app` otomatis).
4. **Firestore Database** → buat database (mode produksi; rules akan ditimpa file `firestore.rules`). Lokasi disarankan `asia-southeast2`.
5. **Project settings → Your apps → Web app** → salin `apiKey`, `projectId`, `appId` (nilai ini publik).

## 2. Isi konfigurasi frontend
```
node scripts/set-firebase-config.mjs --apiKey AIza... --projectId ID_PROYEK --appId 1:123:web:abc
```
Skrip menolak placeholder `ISI_...`. (Atau edit `web/firebase-config.js` manual.) Region fungsi = `asia-southeast2` di `firebase-config.js` **dan** di `functions/src/index.ts` — keduanya harus sama.
Jika memakai berkas tunggal: `python3 build-satu-berkas.py` (berkas tunggal hanya menampilkan Beranda & Materi bila dibuka lokal; login wajib lewat https).

## 3. Deploy
```
npm install -g firebase-tools && firebase login && firebase use ID_PROYEK
cd functions && npm install && npm test && cd ..
firebase deploy --only firestore:rules,functions,hosting
```
URL: `https://ID_PROYEK.web.app`.

## 4. Buat admin pertama (aman, tanpa password bawaan)
Dijalankan di komputer Anda. **Jangan** mengirim kunci service-account ke chat/repo.
```
gcloud auth application-default login          # atau: export GOOGLE_APPLICATION_CREDENTIALS=/jalur/lokal/kunci.json (jangan di-commit)
cd functions && npm install
node ../scripts/bootstrap-admin.mjs --project ID_PROYEK --email admin@contoh.id --nama "Nama Admin"
```
- Akun dibuat tanpa password; skrip mencetak **tautan atur password sekali pakai** → buka dan buat password Anda sendiri.
- Jika akun sudah dibuat lewat Console, skrip hanya memberinya peran admin.
- Skrip menolak jika sudah ada admin (kecuali `--allow-additional`). Admin berikutnya dibuat dari dashboard.

## 5. Buat akun lain (dari dashboard admin)
- **Penguji & admin:** menu *Penguji & admin* → Buat akun (peran, regu, izin buka kunci).
- **Peserta:** menu *Peserta & regu* → impor CSV (`nama,regu` + opsional `kelas,dewan,email`). Tanpa kolom email, login memakai email internal `p<hash>@skt.hwmusago.local` (tidak bisa menerima email) → bagikan **tautan atur password** (unduh CSV hasil impor) secara pribadi. Dengan email asli, gunakan tombol *Kirim email*.
- Tautan atur password memberi akses membuat password akun itu: kirim hanya ke pemiliknya. Tautan tidak disimpan di database.
- *Ubah peran*, *Nonaktifkan/Aktifkan*, *Tautan password*, *Kirim email* ada di tiap baris. Mengubah peran/menonaktifkan **mencabut sesi** akun itu. Admin tidak bisa mengubah/menonaktifkan dirinya sendiri, dan harus selalu tersisa satu admin aktif.

## 6. Data ujian
`config/exam` dapat diatur dari menu *Pengaturan*. Bank soal belum punya antarmuka: isi `questions/<id>` dan `answerKeys/<id>` lewat Console/Admin SDK (fungsi `adminSaveQuestion` sudah tersedia di backend untuk UI berikutnya).

## 7. Batasan yang perlu diketahui
- Firestore Rules membaca klaim di token; setelah peran diubah, klaim lama bisa tetap ada hingga ±1 jam di token yang sudah terbit untuk **pembacaan Firestore**. Mitigasi: sesi dicabut (klien keluar saat memanggil fungsi berikutnya) dan **semua operasi sensitif divalidasi ulang oleh server**.
- Pesan galat login untuk "email tidak terdaftar" sengaja sama dengan "password salah" agar tidak membocorkan daftar akun.
- Gunakan Firebase **Emulator Suite** untuk menguji Rules/Functions sebelum produksi (`firebase emulators:start`, `USE_EMULATORS = true`).
