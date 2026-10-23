import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importRoster, toCsv, parseCsv, nameKey } from '../src/roster';
test('impor: nama asli dipertahankan, duplikasi ditandai', () => {
  const r = importRoster('nama,kelas,regu,dewan\nAhmad  Fauzi,8A,1,DP8\n"Fauzi, Ahmad",8B,2,DP9\nahmad fauzi,9A,3,dp9\nSiti Aisyah,8C,4,DP8\n');
  assert.equal(r.errors.length, 0); assert.equal(r.rows[0].nama, 'Ahmad Fauzi');
  assert.deepEqual(r.rows.map(x => x.duplicate), [true, false, true, false]);
  assert.equal(r.rows[2].dewan, 'DP9');
});
test('impor: baris tidak valid dilaporkan, tidak dikarang', () => {
  const r = importRoster('nama;regu;dewan\nBudi;9;DP8\n;1;DP8\nCitra;2;DP7\nDewi;2;DP9\n');
  assert.equal(r.rows.length, 1); assert.equal(r.rows[0].nama, 'Dewi'); assert.equal(r.errors.length, 3);
  assert.equal(importRoster('foo,bar\n1,2').errors[0].line, 1);
});
test('parseCsv: kutip, BOM, CRLF', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x ""y""",z\r\n'), [['a', 'b'], ['x "y"', 'z']]);
});
test('nameKey mengabaikan huruf besar/aksen/tanda baca', () => { assert.equal(nameKey('Álif,  Rahman.'), nameKey('alif rahman')); });
test('toCsv: BOM, kutip, anti-injeksi formula', () => {
  const c = toCsv(['Nama', 'Nilai'], [['=HYPERLINK("x")', 90], ['Budi, S.', 80.5]]);
  assert.ok(c.startsWith('\uFEFFNama,Nilai\r\n')); assert.ok(c.includes(`"'=HYPERLINK(""x"")",90`)); assert.ok(c.includes('"Budi, S.",80.5'));
});
test('impor: kolom email opsional divalidasi', () => {
  const r = importRoster('nama,regu,email\nAni,1,ANI@Contoh.id\nBudi,2,\nCici,3,salah\n');
  assert.equal(r.rows[0].email, 'ani@contoh.id'); assert.equal(r.rows[1].email, undefined);
  assert.equal(r.errors.length, 1); assert.equal(r.errors[0].line, 4);
});
