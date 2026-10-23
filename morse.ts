// Inti logika Morse & penilaian. Murni (tanpa dependensi) agar bisa diuji tanpa Firebase.
export const MORSE: Readonly<Record<string, string>> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---',
  K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-',
  U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
};
const REVERSE: Record<string, string> = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

export function normText(s: unknown): string {
  return String(s ?? '').toUpperCase().replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();
}
export function normMorse(s: unknown): string {
  return String(s ?? '')
    .replace(/[•·]/g, '.').replace(/[–—−]/g, '-')
    .replace(/\s*\/\s*/g, ' / ').replace(/\s+/g, ' ').trim();
}
/** Teks -> Morse. Karakter tidak dikenal menghasilkan error agar kunci jawaban tidak diam-diam salah. */
export function encode(text: string): string {
  return normText(text).split(' ').map(w => w.split('').map(c => {
    const m = MORSE[c]; if (!m) throw new Error(`Karakter tidak didukung: ${c}`); return m;
  }).join(' ')).join(' / ');
}
export function decode(morse: string): string {
  return normMorse(morse).split(' / ').map(w => w.split(' ').filter(Boolean).map(c => {
    const l = REVERSE[c]; if (!l) throw new Error(`Kode tidak dikenal: ${c}`); return l;
  }).join('')).join(' ');
}
export type QType = 'decode' | 'encode' | 'knowledge';
export interface Question { id: string; type: QType; prompt: string; options?: string[]; answer: string; points?: number }
/** Cek satu jawaban. knowledge = pilihan ganda (cocok persis dengan opsi kunci). */
export function isCorrect(q: Pick<Question, 'type' | 'answer'>, given: unknown): boolean {
  if (q.type === 'decode') return normText(given) === normText(q.answer);
  if (q.type === 'encode') return normMorse(given) === normMorse(q.answer);
  return String(given ?? '').trim() === String(q.answer).trim();
}
export interface Weights { teori: number; praktik: number; ketelitian: number; kedisiplinan: number; sikap: number }
export const DEFAULT_WEIGHTS: Weights = { teori: 40, praktik: 30, ketelitian: 10, kedisiplinan: 10, sikap: 10 };
export function scoreAnswers(questions: Question[], answers: Record<string, unknown>) {
  let got = 0, total = 0, correct = 0;
  for (const q of questions) {
    const p = q.points ?? 1; total += p;
    if (isCorrect(q, answers[q.id])) { got += p; correct++; }
  }
  return { correct, count: questions.length, score: total ? Math.round((got / total) * 100) : 0 };
}
/** Nilai akhir berbobot; manual null = belum dinilai (dihitung 0 tapi ditandai tidak lengkap). */
export function finalScore(theory: number, manual: Partial<Record<Exclude<keyof Weights, 'teori'>, number | null>>, w: Weights = DEFAULT_WEIGHTS) {
  const sum = w.teori + w.praktik + w.ketelitian + w.kedisiplinan + w.sikap;
  if (sum !== 100) throw new Error('Total bobot harus 100');
  const keys = ['praktik', 'ketelitian', 'kedisiplinan', 'sikap'] as const;
  const complete = keys.every(k => typeof manual[k] === 'number');
  const total = theory * w.teori / 100 + keys.reduce((a, k) => a + (manual[k] ?? 0) * w[k] / 100, 0);
  return { total: Math.round(total * 100) / 100, complete };
}
export function remainingMs(startedAtMs: number, durationMin: number, nowMs: number): number {
  return Math.max(0, startedAtMs + durationMin * 60000 - nowMs);
}
