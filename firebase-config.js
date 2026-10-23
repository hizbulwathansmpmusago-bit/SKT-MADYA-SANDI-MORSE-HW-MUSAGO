// Konfigurasi web Firebase — nilai ini PUBLIK (bukan rahasia). Keamanan ada di Firestore Rules + Cloud Functions.
// Isi dari: Firebase Console → Project settings → Your apps → Web app → SDK config.
export const firebaseConfig = {
  apiKey: 'ISI_API_KEY',
  authDomain: 'ISI_PROJECT_ID.firebaseapp.com',
  projectId: 'ISI_PROJECT_ID',
  appId: 'ISI_APP_ID',
};
export const FUNCTIONS_REGION = 'asia-southeast2'; // harus sama dengan web/src/lib/api.ts
export const USE_EMULATORS = false;                // true hanya saat uji lokal di localhost dengan Firebase Emulator
