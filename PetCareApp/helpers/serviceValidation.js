function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 4294967295) throw new Error('Invalid identifier.');
  return Number(value);
}
function cents(value) {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(String(value))) throw new Error('Enter a valid cost with at most two decimal places.');
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
function money(value) { return (cents(value) / 100).toFixed(2); }
function appointment(value, duration, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value))) throw new Error('Select a valid appointment time.');
  const start = new Date(value + ':00+08:00');
  if (!Number.isFinite(start.getTime()) || sqlTime(start).slice(0, 16).replace(' ', 'T') !== value || start.getTime() <= now) throw new Error('Appointment must be a valid future date.');
  const hour = Number(value.slice(11, 13));
  if (value.slice(14, 16) !== '00') throw new Error('Appointments must start on whole hours (minutes must be 00).');
  if (hour < 9 || hour >= 18) throw new Error('Appointments must be within 9am to 6pm Singapore time.');
  if (!Number.isInteger(Number(duration)) || Number(duration) <= 0 || hour * 60 + Number(duration) > 1080) throw new Error('The session must finish by 6pm Singapore time. Choose an earlier hour.');
  const end = new Date(start.getTime() + Number(duration) * 60000);
  if (end.getUTCFullYear() > 9999) throw new Error('Appointment date is out of range.');
  return { start: sqlTime(start), end: sqlTime(end) };
}
function sqlTime(date) { return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' '); }
function overlaps(a, b) { return a.start < b.end && a.end > b.start; }
module.exports = { id, cents, money, appointment, overlaps };
