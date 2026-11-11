const db = require('../config/db').promise();
const { id } = require('../helpers/serviceValidation');
async function list(userId) {
  const [rows] = await db.execute(`SELECT c.*, s.name AS service_name, s.cost, s.session_duration, s.is_active, p.name AS pet_name,
    p.owner_id FROM cart c JOIN services s ON s.id=c.service_id JOIN pets p ON p.id=c.pets_id
    WHERE c.user_id=? ORDER BY c.cart_id`, [userId]);
  return rows;
}
async function pets(userId) { const [rows] = await db.execute('SELECT id, name FROM pets WHERE owner_id=? ORDER BY name', [userId]); return rows; }
async function add(userId, petId, serviceId) {
  const [result] = await db.execute(`INSERT INTO cart (user_id, pets_id, service_id)
    SELECT ?, p.id, s.id FROM pets p CROSS JOIN services s WHERE p.id=? AND p.owner_id=? AND s.id=? AND s.is_active=1`, [userId, id(petId), userId, id(serviceId)]);
  if (!result.affectedRows) throw new Error('Select one of your pets and an active service.');
}
async function remove(userId, cartId) { const [result] = await db.execute('DELETE FROM cart WHERE cart_id=? AND user_id=?', [id(cartId), userId]); if (!result.affectedRows) throw new Error('Cart item not found.'); }
module.exports = { list, pets, add, remove };
