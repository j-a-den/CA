const crypto = require('crypto');
const cart = require('../models/cartModel');
const bookings = require('../models/bookingModel');
const { cents } = require('../helpers/serviceValidation');
exports.availability = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const items = await cart.list(req.session.user.id);
    const item = items.find(row => String(row.cart_id) === req.query.cartId);
    if (!item || !item.is_active) throw new Error('This cart item is no longer available.');
    res.json({ slots: await bookings.availability(req.query.date, item.session_duration) });
  } catch (error) {
    res.status(error.code ? 500 : 400).json({ message: error.code ? 'Unable to check availability. Please try again.' : error.message });
  }
};
exports.show = async (req, res) => {
  const items = await cart.list(req.session.user.id);
  if (!items.length) { req.flash('serviceNotice','Your cart is empty.'); return res.redirect('/cart'); }
  if (items.some(item => !item.is_active || item.owner_id !== req.session.user.id)) { req.flash('serviceNotice','Remove unavailable items before checkout.'); return res.redirect('/cart'); }
  req.session.checkoutDraft = { token: crypto.randomBytes(32).toString('hex'), items: items.map(item => ({ cart_id: item.cart_id, cost: item.cost, duration: item.session_duration })) };
  res.render('checkout', { items, token: req.session.checkoutDraft.token, total: (items.reduce((sum,item) => sum + cents(item.cost),0) / 100).toFixed(2) });
};
exports.submit = async (req, res) => {
  const draft = req.session.checkoutDraft;
  if (!draft || typeof req.body.token !== 'string' || draft.token !== req.body.token) throw new Error('Checkout expired. Reload checkout and try again.');
  const { dates, hours } = req.body;
  if (!dates || typeof dates !== 'object' || !hours || typeof hours !== 'object') throw new Error('Select a date and hour for every item.');
  const ids = await bookings.checkout(req.session.user.id, draft.items.map(item => {
    const key = 'item_' + item.cart_id;
    if (typeof dates[key] !== 'string' || typeof hours[key] !== 'string') throw new Error('Select a date and hour for every item.');
    return { ...item, start_at: dates[key] + 'T' + hours[key] };
  }));
  delete req.session.checkoutDraft;
  req.session.checkoutResult = ids;
  res.redirect('/checkout/result');
};
exports.result = async (req, res) => {
  const invoices = [];
  for (const key of req.session.checkoutResult || []) { const invoice = await bookings.invoice(req.session.user.id, key); if (invoice) invoices.push(invoice); }
  res.render('checkoutResult', { invoices });
};
