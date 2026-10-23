// Inti bootstrap admin pertama. Murni terhadap `deps` (disuntikkan) agar bisa diuji tanpa Firebase.
// Tidak pernah membuat/menampilkan password: akun dibuat TANPA password, admin menetapkannya lewat tautan atur password.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export async function bootstrapAdmin(deps, { email, nama, allowAdditional = false }) {
  email = String(email || '').trim().toLowerCase(); nama = String(nama || '').replace(/\s+/g, ' ').trim();
  if (!EMAIL.test(email)) throw new Error('Email tidak valid');
  if (nama.length < 2) throw new Error('Nama wajib diisi (min. 2 karakter)');
  const admins = await deps.listAdminUids();
  if (admins.length > 0 && !allowAdditional) throw new Error(`Sudah ada ${admins.length} admin. Tambah admin lewat dashboard, atau jalankan ulang dengan --allow-additional.`);
  let uid, dibuat = false;
  const found = await deps.getUserByEmail(email);
  if (found) uid = found.uid; else { uid = (await deps.createUser({ email, displayName: nama })).uid; dibuat = true; }
  await deps.setClaims(uid, { role: 'admin' });
  await deps.revokeTokens(uid);
  await deps.writeProfile(uid, { nama, email, role: 'admin', disabled: false });
  const linkAtur = dibuat ? await deps.resetLink(email) : null; // akun yang sudah ada tetap memakai password miliknya
  return { uid, dibuat, linkAtur };
}
