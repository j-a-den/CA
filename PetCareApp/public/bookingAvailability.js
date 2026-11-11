(() => {
  const fields = [...document.querySelectorAll('[data-booking-item]')];
  const states = new Map();
  const overlaps = (a, b) => a.start < b.end && a.end > b.start;
  function interval(field, time) {
    const date = field.querySelector('input[type=date]').value;
    const start = Date.parse(date + 'T' + time + ':00+08:00');
    return { start, end: start + Number(field.dataset.duration) * 60000 };
  }
  function render() {
    for (const field of fields) {
      const select = field.querySelector('select');
      const state = states.get(field);
      for (const option of [...select.options].slice(1)) {
        if (!option.dataset.label) option.dataset.label = option.textContent;
        const booked = state?.slots && !state.slots.find(slot => slot.time === option.value)?.available;
        const conflict = fields.some(other => other !== field && other.querySelector('select').value && overlaps(interval(field, option.value), interval(other, other.querySelector('select').value)));
        option.disabled = !state?.slots || booked || conflict;
        option.textContent = option.dataset.label + (option.disabled ? ' — unavailable' : '');
      }
      if (select.selectedOptions[0]?.disabled) select.value = '';
    }
  }
  async function refresh(field) {
    const date = field.querySelector('input[type=date]').value;
    const select = field.querySelector('select');
    const message = field.querySelector('[data-availability-message]');
    const previous = states.get(field);
    previous?.controller.abort();
    const controller = new AbortController();
    const state = { controller, date, slots: previous?.date === date ? previous.slots : undefined };
    states.set(field, state);
    select.disabled = true;
    render();
    if (!date) { message.textContent = 'Select a date to see available hours.'; return; }
    message.textContent = 'Checking availability…';
    try {
      const response = await fetch('/checkout/availability?' + new URLSearchParams({ date, cartId: field.dataset.bookingItem }), { signal: controller.signal, cache: 'no-store' });
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Unable to check availability. Select the date again to retry.');
      const data = await response.json();
      if (states.get(field) !== state) return;
      state.slots = data.slots;
      select.disabled = false;
      render();
      message.textContent = [...select.options].slice(1).some(option => !option.disabled)
        ? 'Unavailable hours are disabled. Availability is checked again when you confirm.'
        : 'No available hours on this date. Please choose another date.';
    } catch (error) {
      if (error.name !== 'AbortError') message.textContent = error.message;
    }
  }
  for (const field of fields) {
    field.querySelector('input[type=date]').addEventListener('change', () => refresh(field));
    field.querySelector('select').addEventListener('change', render);
    refresh(field);
  }
  // Pick up cancellations and bookings made while this checkout is open.
  setInterval(() => fields.forEach(field => {
    if (field.querySelector('input[type=date]').value) refresh(field);
  }), 30000);
})();
