// Diagnosa endpoint Cloud Functions callable: membedakan "tidak ter-deploy", "ditolak IAM", "crash", dan "CORS hilang".
export const callableUrl = (region, projectId, name) => `https://${region}-${projectId}.cloudfunctions.net/${name}`;
export function classify({ fetchError, status, allowOrigin, body } = {}) {
  if (fetchError) return { ok: false, kode: 'JARINGAN', pesan: 'Endpoint tidak dapat dijangkau (jaringan/DNS/pemblokiran).' };
  if (status === 404) return { ok: false, kode: 'TIDAK_DEPLOY', pesan: '404: fungsi tidak ada di region ini. Belum di-deploy, nama salah, atau region berbeda dari FUNCTIONS_REGION. (Browser menampilkannya sebagai error CORS.)' };
  if (status === 403) return { ok: false, kode: 'IAM_DITOLAK', pesan: '403: Cloud Run menolak pemanggil tanpa IAM. Beri peran Cloud Run Invoker ke allUsers (atau cek kebijakan organisasi "domain restricted sharing").' };
  if (status >= 500) return { ok: false, kode: 'FUNGSI_ERROR', pesan: `${status}: fungsi ada tetapi gagal/crash. Lihat log: firebase functions:log atau Cloud Logging.` };
  if (status === 401 || status === 200 || status === 204 || status === 400) {
    if (!allowOrigin) return { ok: false, kode: 'CORS_HILANG', pesan: 'Fungsi hidup tetapi tidak mengirim header Access-Control-Allow-Origin untuk origin ini.' };
    return { ok: true, kode: 'OK', pesan: 'Fungsi hidup dan CORS benar.' + (status === 401 && body?.error?.status === 'UNAUTHENTICATED' ? ' (401 UNAUTHENTICATED tanpa login = perilaku yang benar)' : '') };
  }
  return { ok: false, kode: 'TAK_DIKENAL', pesan: `Status HTTP tak terduga: ${status}` };
}
export async function probe(fetchFn, { region, projectId, name, origin }) {
  const url = callableUrl(region, projectId, name);
  try {
    const pre = await fetchFn(url, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type,authorization' } });
    const preRes = classify({ status: pre.status, allowOrigin: pre.headers.get('access-control-allow-origin') });
    if (!preRes.ok) return { name, tahap: 'preflight', ...preRes };
    const res = await fetchFn(url, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ data: {} }) });
    let body = null; try { body = await res.json(); } catch { /* bukan JSON */ }
    return { name, tahap: 'panggilan', ...classify({ status: res.status, allowOrigin: res.headers.get('access-control-allow-origin'), body }) };
  } catch (e) { return { name, tahap: 'jaringan', ...classify({ fetchError: e }) }; }
}
