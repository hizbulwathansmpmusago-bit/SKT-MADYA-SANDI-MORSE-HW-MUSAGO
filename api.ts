// Klien tipis untuk Cloud Functions. Semua keputusan (timer, kunci, nilai) ada di server.
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
const app = initializeApp({
  apiKey: import.meta.env.VITE_FB_API_KEY, authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN, projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
}); // nilai publik konfigurasi web Firebase, BUKAN rahasia; keamanan ada di Rules + Functions
const fn = getFunctions(app, 'asia-southeast2');
const call = <I, O>(name: string) => (data?: I) => httpsCallable<I, O>(fn, name)(data).then(r => r.data);
export const api = {
  startAttempt: call<void, { attempt: unknown; remainingMs: number }>('startAttempt'),
  getQuestions: call<void, Array<{ id: string; type: string; prompt: string; options?: string[] }>>('getQuestions'),
  saveAnswer: call<{ qid: string; value: string }, { remainingMs: number }>('saveAnswer'),
  reportVisibilityLoss: call<void, { status: string }>('reportVisibilityLoss'),
  submitAttempt: call<void, { status: string }>('submitAttempt'),
  getResult: call<void, { theory: number; total: number; complete: boolean; passed: boolean }>('getResult'),
  setManualScore: call<{ uid: string; field: string; value: number | string }, void>('setManualScore'),
  unlockAttempt: call<{ uid: string; reason: string; extraMin?: number }, void>('unlockAttempt'),
};
