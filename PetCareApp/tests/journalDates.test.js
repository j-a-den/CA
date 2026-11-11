const { test } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const path = require('node:path');

test('journal pages render MySQL DATE strings for customers and admins without shifting the date', async () => {
  const pet = { id: 1, name: 'Chester', species: 'Dog', breed: 'Pomeranian', age: 3, image: 'chester.jpg' };
  const journal = { id: 1, pet_id: 1, entry_date: '2026-08-10', activity: 'Walk', notes: 'Park' };
  for (const role of ['user', 'admin']) {
    const data = { session: { user: { id: 1, name: 'Test', role } }, user: { name: 'Test', username: 'test' },
      pets: [pet], pet, journals: [journal], journal, selectedPetId: '1' };
    for (const view of ['journals', 'editJournal', 'adminUserDetails']) {
      const html = await ejs.renderFile(path.join(__dirname, '../views', view + '.ejs'), data);
      assert.ok(html.includes('2026-08-10'), view + ' should preserve the database date');
      if (view === 'editJournal') assert.match(html, /value="2026-08-10"/);
    }
  }
});
