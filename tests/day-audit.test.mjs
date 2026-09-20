import assert from 'node:assert/strict';
import test from 'node:test';
import { auditDayNotes, validateExpectedNotes } from '../scripts/day-audit.mjs';
test('notes audit catches missing time anchors and duplicates even when assignments exist', () => {
  const expected = { '2026-10-01': [{ text: 'Bring tickets', time: '18:00' }] };
  const day = { id: 1, date: '2026-10-01', assignments: [{ name: 'Venue' }], notes: [] };
  assert.equal(auditDayNotes([day], expected)[0].ok, false);
  day.notes = [...expected['2026-10-01']];
  assert.equal(auditDayNotes([day], expected)[0].ok, true);
  day.notes.push({ text: 'Bring tickets', time: '18:00' });
  assert.equal(auditDayNotes([day], expected)[0].unexpected.length, 1);
  assert.throws(() => validateExpectedNotes({ '2026-10-01': ['invalid'] }), /invalid_arguments/);
});
