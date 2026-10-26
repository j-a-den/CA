function index(req, res) {
  res.render('index', { session: req.session });
}

module.exports = { index };
