// Impor daftar peserta (CSV) + deteksi duplikasi nama, dan ekspor CSV rekap (aman untuk Excel).
export interface RosterRow { nama: string; kelas: string; regu: number; dewan: 'DP8' | 'DP9' | ''; email?: string; duplicate: boolean; dupGroup?: string }
export interface ImportResult { rows: RosterRow[]; errors: Array<{ line: number; message: string }> }

export function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cur = '', q = false;
  const src = text.replace(/^\uFEFF/, '');
  const delim = (src.split('\n', 1)[0].match(/;/g) || []).length > (src.split('\n', 1)[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cur); if (row.some(x => x.trim())) out.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) out.push(row);
  return out.map(r => r.map(x => x.trim()));
}
export const nameKey = (n: string): string => n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Kolom wajib: nama, regu. Opsional: kelas, dewan (DP8/DP9). Nama asli dipertahankan apa adanya (hanya trim spasi). */
export function importRoster(csv: string): ImportResult {
  const t = parseCsv(csv); const errors: ImportResult['errors'] = [];
  if (!t.length) return { rows: [], errors: [{ line: 1, message: 'File kosong' }] };
  const head = t[0].map(h => h.toLowerCase());
  const col = (...names: string[]) => head.findIndex(h => names.includes(h));
  const iN = col('nama', 'nama lengkap', 'name'), iR = col('regu', 'team'), iK = col('kelas', 'class'), iD = col('dewan', 'dp', 'dewan pasukan'), iE = col('email', 'e-mail');
  if (iN < 0 || iR < 0) return { rows: [], errors: [{ line: 1, message: 'Header wajib: nama, regu (opsional: kelas, dewan)' }] };
  const rows: RosterRow[] = [];
  t.slice(1).forEach((r, k) => {
    const line = k + 2, nama = (r[iN] || '').replace(/\s+/g, ' ').trim(), regu = Number(r[iR]);
    const dewanRaw = iD >= 0 ? (r[iD] || '').toUpperCase().replace(/\s+/g, '') : '';
    if (!nama) return void errors.push({ line, message: 'Nama kosong' });
    if (!Number.isInteger(regu) || regu < 1 || regu > 7) return void errors.push({ line, message: `Regu harus 1-7 (ditemukan "${r[iR]}")` });
    if (dewanRaw && dewanRaw !== 'DP8' && dewanRaw !== 'DP9') return void errors.push({ line, message: `Dewan harus DP8/DP9 (ditemukan "${r[iD]}")` });
    const email = iE >= 0 ? (r[iE] || '').trim().toLowerCase() : '';
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return void errors.push({ line, message: `Email tidak valid ("${r[iE]}")` });
    rows.push({ nama, kelas: iK >= 0 ? r[iK] || '' : '', regu, dewan: dewanRaw as RosterRow['dewan'], ...(email ? { email } : {}), duplicate: false });
  });
  const groups = new Map<string, RosterRow[]>();
  for (const r of rows) { const k = nameKey(r.nama); groups.set(k, [...(groups.get(k) || []), r]); }
  for (const [k, g] of groups) if (g.length > 1) g.forEach(r => { r.duplicate = true; r.dupGroup = k; });
  return { rows, errors };
}
const csvCell = (v: unknown): string => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // cegah injeksi formula di Excel
  return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
/** CSV dengan BOM UTF-8 dan pemisah koma; CRLF agar terbuka rapi di Excel. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return '\uFEFF' + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
