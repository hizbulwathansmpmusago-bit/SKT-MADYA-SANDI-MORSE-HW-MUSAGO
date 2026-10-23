import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode, decode, isCorrect, scoreAnswers, finalScore, remainingMs, normMorse } from '../src/morse';
test('encode/decode bolak-balik', () => {
  assert.equal(encode('HW MUSAGO'), '.... .-- / -- ..- ... .- --. ---');
  assert.equal(decode('.... .-- / -- ..- ... .- --. ---'), 'HW MUSAGO');
  assert.equal(decode(encode('Regu Tujuh 7')), 'REGU TUJUH 7');
});
test('karakter tak dikenal ditolak', () => { assert.throws(() => encode('A#')); assert.throws(() => decode('.-.-.-.-.-')); });
test('normalisasi simbol dan spasi', () => { assert.equal(normMorse('  .-  •—  /  - '), '.- .- / -'); });
test('isCorrect per jenis', () => {
  assert.ok(isCorrect({ type: 'decode', answer: 'SKT' }, ' skt '));
  assert.ok(!isCorrect({ type: 'decode', answer: 'SKT' }, 'SKTT'));
  assert.ok(isCorrect({ type: 'encode', answer: '... -.- -' }, '...  -.-   -'));
  assert.ok(isCorrect({ type: 'knowledge', answer: 'Hizbul Wathan' }, 'Hizbul Wathan'));
  assert.ok(!isCorrect({ type: 'knowledge', answer: 'a' }, undefined));
});
test('scoreAnswers berbobot poin', () => {
  const qs = [{ id: '1', type: 'decode' as const, prompt: '', answer: 'A', points: 3 }, { id: '2', type: 'decode' as const, prompt: '', answer: 'B', points: 1 }];
  assert.deepEqual(scoreAnswers(qs, { '1': 'a', '2': 'x' }), { correct: 1, count: 2, score: 75 });
  assert.equal(scoreAnswers([], {}).score, 0);
});
test('finalScore dan validasi bobot', () => {
  assert.deepEqual(finalScore(100, { praktik: 100, ketelitian: 100, kedisiplinan: 100, sikap: 100 }), { total: 100, complete: true });
  assert.equal(finalScore(80, { praktik: 50 }).complete, false);
  assert.throws(() => finalScore(1, {}, { teori: 50, praktik: 30, ketelitian: 10, kedisiplinan: 10, sikap: 10 }));
});
test('timer server', () => { assert.equal(remainingMs(0, 1, 30000), 30000); assert.equal(remainingMs(0, 1, 90000), 0); });
