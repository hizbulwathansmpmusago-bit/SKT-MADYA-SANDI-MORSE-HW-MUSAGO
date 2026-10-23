import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-ignore
import { renderConfig } from '../../scripts/config-core.mjs';
const ok = { apiKey: 'AIza' + 'x'.repeat(35), projectId: 'skt-madya-hw', appId: '1:123456789:web:abc123def' };
test('config valid dihasilkan tanpa placeholder', () => {
  const t = renderConfig(ok); assert.ok(!t.includes('ISI_')); assert.ok(t.includes('"skt-madya-hw.firebaseapp.com"')); assert.ok(t.includes("'asia-southeast2'") || t.includes('"asia-southeast2"'));
});
test('placeholder / format salah ditolak', () => {
  assert.throws(() => renderConfig({ ...ok, apiKey: 'ISI_API_KEY' }), /apiKey/); assert.throws(() => renderConfig({ ...ok, projectId: 'ISI_PROJECT_ID' }), /projectId/);
  assert.throws(() => renderConfig({ ...ok, appId: 'ISI_APP_ID' }), /appId/);
});
