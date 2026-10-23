#!/usr/bin/env node
// Membuat/menunjuk admin PERTAMA. Dijalankan di komputer pemilik proyek; kredensial tidak pernah masuk repo/chat/frontend.
//   gcloud auth application-default login        (atau set GOOGLE_APPLICATION_CREDENTIALS ke berkas kunci LOKAL, jangan di-commit)
//   cd functions && npm install
//   node ../scripts/bootstrap-admin.mjs --project ID_PROYEK --email admin@contoh.id --nama "Nama Admin"
import { createRequire } from 'node:module'; import { bootstrapAdmin } from './bootstrap-core.mjs';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const arg = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
const project = arg('project'), email = arg('email'), nama = arg('nama'), allowAdditional = process.argv.includes('--allow-additional');
if (!project || !email || !nama) { console.error('Pemakaian: node scripts/bootstrap-admin.mjs --project ID --email EMAIL --nama "NAMA" [--allow-additional]'); process.exit(2); }
const { initializeApp, applicationDefault } = require('firebase-admin/app'); const { getAuth } = require('firebase-admin/auth'); const { getFirestore } = require('firebase-admin/firestore');
initializeApp({ projectId: project, credential: applicationDefault() }); const auth = getAuth(), db = getFirestore();
try {
  const r = await bootstrapAdmin({
    listAdminUids: async () => (await db.collection('users').where('role', '==', 'admin').get()).docs.map(d => d.id),
    getUserByEmail: e => auth.getUserByEmail(e).catch(x => x.code === 'auth/user-not-found' ? null : Promise.reject(x)),
    createUser: p => auth.createUser(p), setClaims: (u, c) => auth.setCustomUserClaims(u, c), revokeTokens: u => auth.revokeRefreshTokens(u),
    writeProfile: (u, p) => db.doc(`users/${u}`).set(p, { merge: true }), resetLink: e => auth.generatePasswordResetLink(e),
  }, { email, nama, allowAdditional });
  console.log(`Admin siap: ${email} (uid ${r.uid}).`);
  console.log(r.linkAtur ? `Buka tautan ini SEKALI untuk menetapkan password Anda sendiri:\n${r.linkAtur}` : 'Akun sudah ada: gunakan password yang sudah dimiliki (atau "Lupa password" di halaman login).');
} catch (e) { console.error('Gagal:', e.message); process.exit(1); }
