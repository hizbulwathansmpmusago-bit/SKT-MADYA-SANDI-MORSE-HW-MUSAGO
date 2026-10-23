#!/usr/bin/env node
// Diagnosa: apakah fungsi backend sudah ter-deploy, boleh dipanggil, dan CORS benar. Aman: hanya memanggil TANPA login.
//   node scripts/check-functions.mjs [--origin https://hizbulwathansmpmusago-bit.github.io]
import { readFileSync } from 'node:fs'; import { probe } from './probe-core.mjs';
const cfg = readFileSync(new URL('../web/firebase-config.js', import.meta.url), 'utf8');
const pick = n => cfg.match(new RegExp(`${n}\\s*[:=]\\s*["']([^"']+)["']`))?.[1];
const projectId = pick('projectId'), region = pick('FUNCTIONS_REGION');
const i = process.argv.indexOf('--origin'), origin = i > 0 ? process.argv[i + 1] : `https://${projectId}.web.app`;
if (!projectId || !region || projectId.startsWith('ISI_')) { console.error('web/firebase-config.js belum terisi (projectId/FUNCTIONS_REGION).'); process.exit(2); }
console.log(`Project: ${projectId} · Region: ${region} · Origin uji: ${origin}\n`);
let bad = 0;
for (const name of ['whoami', 'startAttempt', 'getQuestions', 'adminCreateAccount']) {
  const r = await probe(fetch, { region, projectId, name, origin }); if (!r.ok) bad++;
  console.log(`${r.ok ? 'OK   ' : 'GAGAL'} ${name} [${r.tahap}] ${r.kode} — ${r.pesan}`);
}
console.log(bad ? `\n${bad} fungsi bermasalah. Lihat DEPLOY.md bagian "Error CORS".` : '\nSemua fungsi yang diperiksa hidup.'); process.exit(bad ? 1 : 0);
