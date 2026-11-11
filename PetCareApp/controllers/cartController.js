const cart = require('../models/cartModel');
const { cents } = require('../helpers/serviceValidation');
exports.index = async (req, res) => {
  const items = await cart.list(req.session.user.id);
  res.render('cart', { items, total: (items.reduce((sum, item) => sum + cents(item.cost), 0) / 100).toFixed(2) });
};
exports.add = async (req, res) => { await cart.add(req.session.user.id, req.body.pets_id, req.body.service_id); req.flash('serviceNotice', 'Service added to your cart.'); res.redirect('/cart'); };
exports.remove = async (req, res) => { await cart.remove(req.session.user.id, req.params.cartId); res.redirect('/cart'); };
