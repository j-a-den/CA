const services = require('../models/serviceModel');
const cart = require('../models/cartModel');
exports.index = async (req, res) => res.render('services', { services: await services.list(), pets: await cart.pets(req.session.user.id) });
