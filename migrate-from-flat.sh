#!/usr/bin/env bash
# Memigrasi repo yang terunggah "rata" (semua berkas di root) ke struktur folder yang benar.
# Jalankan dari ROOT repo hasil clone, SEBELUM menyalin isi zip. Hanya menghapus berkas yang memang duplikat dari struktur baru (git rm = bisa dibatalkan lewat git).
#   bash migrate-from-flat.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
FLAT=(api.ts attempts.ts attempts.test.ts authz.ts authz.test.ts bootstrap-admin.mjs bootstrap-core.mjs bootstrap.test.ts config-core.mjs config.test.ts
  fake-firebase.js firebase-config.js hp-admin-akun.png index.ts login.e2e.mjs logo.png morse.ts morse.test.ts package.json prototipe-lama.html
  roster.ts roster.test.ts script.js set-firebase-config.mjs style.css tsconfig.json useExamGuard.ts)
n=0; for f in "${FLAT[@]}"; do if git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then git rm -q -- "$f"; n=$((n+1)); fi; done
echo "Dihapus dari root: $n berkas. Sekarang salin isi zip ke root repo (folder functions/, web/, scripts/, tests/, seed/ akan terbentuk), lalu: git add -A && git commit."
