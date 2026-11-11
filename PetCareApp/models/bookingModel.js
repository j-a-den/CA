const pool = require('../config/db').promise();
const { id, appointment, overlaps } = require('../helpers/serviceValidation');
const { dayRange } = require('../helpers/reportingDate');
async function checkout(userId, items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Your checkout is empty.');
  const keys = items.map(item => id(item.cart_id));
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate cart items.');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // All checkouts share one schedule. Lock services in a stable order before
    // checking availability, including when there are no bookings yet.
    await connection.execute('SELECT id FROM services ORDER BY id FOR UPDATE');
    await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [userId]);
    // Serialize checkouts for this customer, then lock each purchased record.
    const [cart] = await connection.execute('SELECT * FROM cart WHERE user_id=? ORDER BY cart_id FOR UPDATE', [userId]);
    const selected = keys.map(key => cart.find(row => row.cart_id === key));
    if (selected.some(row => !row)) throw new Error('Your cart changed or this checkout was already processed. Reload your cart.');
    const planned = [];
    for (let i = 0; i < selected.length; i++) {
      const row = selected[i];
      const [pets] = await connection.execute('SELECT id FROM pets WHERE id=? AND owner_id=? FOR UPDATE', [row.pets_id, userId]);
      const [services] = await connection.execute('SELECT * FROM services WHERE id=? FOR UPDATE', [row.service_id]);
      const service = services[0];
      if (!pets.length || !service || !service.is_active) throw new Error('A pet or service is no longer available. Review your cart.');
      if (String(service.cost) !== String(items[i].cost) || String(service.session_duration) !== String(items[i].duration)) throw new Error('A service price or duration changed. Reload checkout to review it.');
      const slot = appointment(items[i].start_at, service.session_duration);
      if (planned.some(other => overlaps(other, slot))) throw new Error('Selected appointments overlap. Please select another available time slot.');
      const [conflicts] = await connection.execute(`SELECT booking_id FROM service_booking WHERE status <> 'cancelled' AND start_at < ? AND end_at > ? FOR UPDATE`, [slot.end, slot.start]);
      if (conflicts.length) throw new Error('This time slot is no longer available. Please reload checkout and select another available time slot.');
      planned.push({ ...row, ...slot, price: service.cost });
    }
    const bookingIds = [];
    for (const row of planned) {
      const [result] = await connection.execute(`INSERT INTO service_booking (user_id,pets_id,service_id,start_at,end_at,status,price) VALUES (?,?,?,?,?,'confirmed',?)`, [userId, row.pets_id, row.service_id, row.start, row.end, row.price]);
      bookingIds.push(result.insertId);
      await connection.execute('DELETE FROM cart WHERE cart_id=? AND user_id=?', [row.cart_id, userId]);
    }
    await connection.commit();
    return bookingIds;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
const joined = `SELECT b.*, u.name AS customer_name, p.name AS pet_name, s.name AS service_name
  FROM service_booking b JOIN users u ON u.id=b.user_id JOIN pets p ON p.id=b.pets_id JOIN services s ON s.id=b.service_id`;
async function invoices(userId) { const [rows] = await pool.execute(joined + ' WHERE b.user_id=? ORDER BY b.created_at DESC,b.booking_id DESC', [userId]); return rows; }
async function invoice(userId, bookingId) { const [rows] = await pool.execute(joined + ' WHERE b.user_id=? AND b.booking_id=?', [userId, id(bookingId)]); return rows[0]; }
async function all(filters) {
  const where = [], params = [];
  if (filters.status) {
    if (!['pending','confirmed','completed','cancelled'].includes(filters.status)) throw new Error('Invalid status filter.');
    where.push('b.status=?'); params.push(filters.status);
  }
  if (filters.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.date)) throw new Error('Invalid date filter.');
    where.push('DATE(b.start_at)=?'); params.push(filters.date);
  }
  if (filters.customer) { where.push('u.name LIKE ?'); params.push('%' + String(filters.customer).slice(0,100) + '%'); }
  const page = Math.min(1000000, Math.max(1, Number.parseInt(filters.page, 10) || 1));
  const [rows] = await pool.query(joined + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY b.start_at DESC,b.booking_id DESC LIMIT 26 OFFSET ?', [...params, (page - 1) * 25]);
  return { bookings: rows.slice(0,25), page, hasNext: rows.length > 25 };
}
async function changeStatus(bookingId, status, expectedStatus) {
  const statuses = ['pending','confirmed','completed','cancelled'];
  if (!statuses.includes(status)) throw new Error('Choose pending, confirmed, completed, or cancelled.');
  if (expectedStatus !== undefined && !statuses.includes(expectedStatus)) throw new Error('Invalid previous status. Refresh the booking list.');
  const key = id(bookingId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Use the same schedule lock order as checkout when restoring a cancelled booking.
    await connection.execute('SELECT id FROM services ORDER BY id FOR UPDATE');
    const [rows] = await connection.execute('SELECT * FROM service_booking WHERE booking_id=? FOR UPDATE', [key]);
    const booking = rows[0];
    if (!booking) throw new Error('Booking not found.');
    if (expectedStatus !== undefined && booking.status !== expectedStatus) throw new Error('Another administrator changed this booking. Refresh the list and try again.');
    if (booking.status === status) {
      await connection.commit();
      return false;
    }
    // Cancellation releases the shared time slot. Restoring it must not double-book.
    if (booking.status === 'cancelled' && status !== 'cancelled') {
      const [conflicts] = await connection.execute("SELECT booking_id FROM service_booking WHERE booking_id <> ? AND status <> 'cancelled' AND start_at < ? AND end_at > ? FOR UPDATE", [key, booking.end_at, booking.start_at]);
      if (conflicts.length) throw new Error('This time slot is no longer available. Cancel the conflicting booking before restoring this booking.');
    }
    const [result] = await connection.execute('UPDATE service_booking SET status=? WHERE booking_id=? AND status=?', [status, key, booking.status]);
    if (!result.affectedRows) throw new Error('Another administrator changed this booking. Refresh the list and try again.');
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
async function availability(date, duration) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Select a valid date.');
  // Reuse appointment validation to reject impossible dates and durations.
  appointment(date + 'T09:00', duration, 0);
  const [busy] = await pool.execute("SELECT start_at AS start, end_at AS end FROM service_booking WHERE status <> 'cancelled' AND start_at < ? AND end_at > ?", [date + ' 18:00:00', date + ' 09:00:00']);
  const slots = [];
  for (let hour = 9; hour < 18; hour++) {
    const time = String(hour).padStart(2, '0') + ':00';
    let available = false;
    try {
      const slot = appointment(date + 'T' + time, duration);
      available = !busy.some(other => overlaps(other, slot));
    } catch (_) { /* Past times and appointments outside opening hours are unavailable. */ }
    slots.push({ time, available });
  }
  return slots;
}
async function dailyRevenue(date) {
  const { start, end } = dayRange(date);
  const [rows] = await pool.execute(`SELECT COUNT(*) AS completedCount,
    CAST(COALESCE(SUM(price), 0) AS DECIMAL(20,2)) AS totalRevenue
    FROM service_booking WHERE status='completed' AND start_at >= ?${end ? ' AND start_at < ?' : ''}`,
    end ? [start, end] : [start]);
  return rows[0];
}
module.exports = { checkout, invoices, invoice, all, changeStatus, availability, dailyRevenue };
