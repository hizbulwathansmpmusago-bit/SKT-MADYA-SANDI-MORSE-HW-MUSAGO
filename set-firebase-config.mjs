#!/usr/bin/env node
// node scripts/set-firebase-config.mjs --apiKey AIza... --projectId ID --appId 1:123:web:abc [--authDomain ...]
import { writeFileSync } from 'node:fs'; import { renderConfig } from './config-core.mjs';
const a = n => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : undefined; };
try { writeFileSync(new URL('../web/firebase-config.js', import.meta.url), renderConfig({ apiKey: a('apiKey'), projectId: a('projectId'), appId: a('appId'), authDomain: a('authDomain') })); console.log('web/firebase-config.js diperbarui. Jalankan: python3 build-satu-berkas.py (jika memakai berkas tunggal).'); }
catch (e) { console.error(e.message); process.exit(1); }
