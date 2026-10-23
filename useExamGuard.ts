// Page Visibility API: melaporkan SEKALI ke server saat halaman tersembunyi selama ujian aktif.
// Keterbatasan: browser tidak dapat mendeteksi semua pergantian aplikasi (mis. jendela mengambang/split-screen),
// dan bunyi peringatan tidak dijamin terdengar saat halaman tersembunyi. Server tetap sumber kebenaran.
import { useEffect, useRef } from 'react';
import { api } from './api';
export function useExamGuard(active: boolean, onLocked: () => void) {
  const sent = useRef(false);
  useEffect(() => {
    if (!active) { sent.current = false; return; }
    const h = () => {
      if (document.visibilityState !== 'hidden' || sent.current) return;
      sent.current = true;
      api.reportVisibilityLoss().then(r => { if (r.status === 'locked') onLocked(); }).catch(() => { sent.current = false; });
    };
    document.addEventListener('visibilitychange', h);
    return () => document.removeEventListener('visibilitychange', h);
  }, [active, onLocked]);
}
