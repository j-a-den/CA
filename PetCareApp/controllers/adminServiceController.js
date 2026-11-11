const services = require('../models/serviceModel');
exports.index = async (req, res) => res.render('adminServices', { services: await services.list(true) });
exports.form = async (req, res) => {
  const service = req.params.id ? await services.find(req.params.id) : null;
  if (req.params.id && !service) return res.status(404).send('Service not found.');
  res.render('serviceForm', { service });
};
exports.save = async (req, res) => { await services.save(req.params.id, req.body); req.flash('serviceNotice','Service saved.'); res.redirect('/admin/services'); };
exports.remove = async (req, res) => { req.flash('serviceNotice', await services.remove(req.params.id)); res.redirect('/admin/services'); };
