import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBatchError, normalizeBatchResult } from '../scripts/batch-result.mjs';

test('normalizes create wrappers without removing the original payload', () => {
  for (const [resourceType, resource] of [
    ['bag', { id: 9, name: 'Carry-on' }],
    ['item', { id: 43, name: 'Flight' }],
    ['file', { id: 19, url: '/api/trips/11/files/19/download' }],
    ['note', { id: 223, text: 'Check in' }],
  ]) {
    const payload = { [resourceType]: resource };
    assert.deepEqual(normalizeBatchResult(payload), {
      ok: true,
      resourceType,
      resource,
      warnings: [],
      result: payload,
    });
  }
});

test('normalizes success-only and failed results', () => {
  assert.deepEqual(normalizeBatchResult({ success: true }), {
    ok: true,
    resourceType: null,
    resource: null,
    warnings: [],
    result: { success: true },
  });
  const failed = normalizeBatchError(new Error('create_packing_bag: denied'));
  assert.equal(failed.ok, false);
  assert.equal(failed.resource, null);
  assert.match(failed.error.message, /denied/);
});
