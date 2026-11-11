const db = require('../config/db').promise();
const { id, money } = require('../helpers/serviceValidation');
async function list(all = false) { const [rows] = await db.query('SELECT * FROM services' + (all ? '' : ' WHERE is_active = 1') + ' ORDER BY name, id'); return rows; }
async function find(serviceId) { const [rows] = await db.execute('SELECT * FROM services WHERE id = ?', [id(serviceId)]); return rows[0]; }
function values(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!name || name.length > 100) throw new Error('Service name is required and must be at most 100 characters.');
  if (Buffer.byteLength(description, 'utf8') > 65535) throw new Error('Description is too long.');
  const duration = id(body.session_duration);
  if (!['0', '1'].includes(body.is_active)) throw new Error('Select a valid active state.');
  return [name, description || null, money(body.cost), duration, Number(body.is_active)];
}
async function save(serviceId, body) {
  const data = values(body);
  if (serviceId) {
    if (!await find(serviceId)) throw new Error('Service not found.');
    await db.execute('UPDATE services SET name=?, description=?, cost=?, session_duration=?, is_active=? WHERE id=?', [...data, id(serviceId)]);
  } else await db.execute('INSERT INTO services (name, description, cost, session_duration, is_active) VALUES (?, ?, ?, ?, ?)', data);
}
async function remove(serviceId) {
  const key = id(serviceId);
  try {
    const [result] = await db.execute('DELETE FROM services WHERE id=?', [key]);
    if (!result.affectedRows) throw new Error('Service not found.');
    return 'Service deleted. Any associated cart items were removed.';
  } catch (err) {
    if (err.code !== 'ER_ROW_IS_REFERENCED_2') throw err;
    await db.execute('UPDATE services SET is_active=0 WHERE id=?', [key]);
    return 'Service archived because it has booking history.';
  }
}
module.exports = { list, find, save, remove };
