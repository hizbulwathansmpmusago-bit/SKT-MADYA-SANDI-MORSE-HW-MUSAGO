// Klien referensi bertipe untuk Cloud Functions. Aplikasi produksi memakai web/script.js (fungsi call()).
// SEMUA panggilan memakai httpsCallable dengan region dari firebase-config.js (asia-southeast2) — bukan fetch langsung ke endpoint.
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseConfig, FUNCTIONS_REGION } from '../../firebase-config.js';
const fns = getFunctions(initializeApp(firebaseConfig), FUNCTIONS_REGION);
const call = <I, O>(name: string) => (data?: I) => httpsCallable<I, O>(fns, name)(data).then(r => r.data);
export const api = {
  whoami: call<void, { uid: string; role: string; team: number | null; canUnlock: boolean; nama: string | null }>('whoami'),
  startAttempt: call<void, { attempt: unknown; remainingMs: number }>('startAttempt'),
  getQuestions: call<void, Array<{ id: string; type: string; prompt: string; options?: string[] }>>('getQuestions'),
  saveAnswer: call<{ qid: string; value: string }, { remainingMs: number }>('saveAnswer'),
  reportVisibilityLoss: call<void, { status: string }>('reportVisibilityLoss'),
  submitAttempt: call<void, { status: string }>('submitAttempt'),
  getResult: call<void, { theory: number; total: number; complete: boolean; passed: boolean }>('getResult'),
  setManualScore: call<{ uid: string; field: string; value: number | string }, void>('setManualScore'),
  unlockAttempt: call<{ uid: string; reason: string; extraMin?: number }, void>('unlockAttempt'),
};
