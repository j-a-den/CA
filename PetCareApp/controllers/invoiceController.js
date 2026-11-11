const bookings = require('../models/bookingModel');
exports.index = async (req, res) => res.render('invoices', { invoices: await bookings.invoices(req.session.user.id) });
exports.show = async (req, res) => {
  const invoice = await bookings.invoice(req.session.user.id, req.params.bookingId);
  if (!invoice) return res.status(404).send('Invoice not found.');
  res.render('invoice', { invoice });
};
