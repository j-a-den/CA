const bookings = require('../models/bookingModel');
exports.index = async (req, res) => res.render('adminBookings', { ...await bookings.all(req.query), filters: req.query });
exports.status = async (req, res) => {
  if (typeof req.body.current_status !== 'string') throw new Error('Refresh the booking list before updating the status.');
  const changed = await bookings.changeStatus(req.params.bookingId, req.body.status, req.body.current_status);
  req.flash('serviceNotice', changed ? 'Booking status updated.' : 'Booking already has this status. No changes made.');
  res.redirect('/admin/bookings');
};
