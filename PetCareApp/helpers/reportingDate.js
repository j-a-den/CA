function singaporeDate(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dayRange(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1000) {
    throw new Error('Select a valid appointment date.');
  }
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Select a valid appointment date.');
  }
  return {
    start: value + ' 00:00:00',
    // No later DATETIME exists beyond MySQL's final supported day.
    end: value === '9999-12-31' ? null : new Date(date.getTime() + 86400000).toISOString().slice(0, 10) + ' 00:00:00'
  };
}

module.exports = { singaporeDate, dayRange };
