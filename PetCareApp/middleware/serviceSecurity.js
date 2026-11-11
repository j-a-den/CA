const crypto = require('crypto');
module.exports = function (req, res, next) {
  if (!req.session.serviceCsrf) req.session.serviceCsrf = crypto.randomBytes(32).toString('hex');
  res.locals.csrf = req.session.serviceCsrf;
  res.locals.session = req.session;
  res.locals.notice = req.flash('serviceNotice');
  next();
};
module.exports.verify = function (req, res, next) {
  const expected = Buffer.from(req.session.serviceCsrf || '');
  const supplied = Buffer.from(req.body && typeof req.body._csrf === 'string' ? req.body._csrf : '');
  if (!expected.length || expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return res.status(403).send('Invalid form token. Reload the page and try again.');
  next();
};
