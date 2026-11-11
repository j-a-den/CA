function isLoggedIn(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Access Denied!');
}

function isCustomer(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'user') return res.status(403).send('Customer access required.');
  next();
}

module.exports = { isLoggedIn, isAdmin, isCustomer };
