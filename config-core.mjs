// Menghasilkan web/firebase-config.js dari nilai konfigurasi web Firebase (nilai ini PUBLIK, bukan rahasia).
export function renderConfig({ apiKey, projectId, appId, authDomain, region = 'asia-southeast2' }) {
  const bad = [];
  if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(String(apiKey || ''))) bad.push('apiKey (harus diawali "AIza", dari Project settings → Your apps)');
  if (!/^[a-z][a-z0-9-]{3,29}$/.test(String(projectId || ''))) bad.push('projectId (huruf kecil/angka/-, mis. skt-madya-hw)');
  if (!/^1:\d+:web:[0-9a-f]+$/.test(String(appId || ''))) bad.push('appId (format 1:123456789:web:abc123)');
  if (bad.length) throw new Error('Nilai tidak valid: ' + bad.join('; '));
  authDomain = authDomain || `${projectId}.firebaseapp.com`;
  return `// Konfigurasi web Firebase — nilai ini PUBLIK (bukan rahasia). Keamanan ada di Firestore Rules + Cloud Functions.
// Dihasilkan oleh scripts/set-firebase-config.mjs
export const firebaseConfig = {
  apiKey: ${JSON.stringify(apiKey)},
  authDomain: ${JSON.stringify(authDomain)},
  projectId: ${JSON.stringify(projectId)},
  appId: ${JSON.stringify(appId)},
};
export const FUNCTIONS_REGION = ${JSON.stringify(region)}; // harus sama dengan setGlobalOptions({ region }) di functions/src/index.ts
export const USE_EMULATORS = false;                // true hanya saat uji lokal di localhost dengan Firebase Emulator
`;
}
