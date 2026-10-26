const userModel = require('../models/userModel');
const petModel = require('../models/petModel');
const journalModel = require('../models/journalModel');

function dashboard(req, res) {
  res.render('adminDashboard', { session: req.session });
}

function listUsers(req, res) {
  userModel.findAll((err, results) => {
    if (err) return res.send('Error loading users');

    res.render('adminUsers', {
      users: results,
      session: req.session
    });
  });
}

function userDetails(req, res) {
  const userId = req.params.id;

  userModel.findById(userId, (err, userResults) => {
    if (err || userResults.length === 0) return res.send('User not found');

    petModel.findByOwner(userId, (err2, petResults) => {
      if (err2) return res.send('Error retrieving pet info');

      journalModel.findByOwnerForAdmin(userId, (err3, journalResults) => {
        if (err3) return res.send('Error retrieving journal entries');

        res.render('adminUserDetails', {
          user: userResults[0],
          pets: petResults,
          journals: journalResults,
          session: req.session
        });
      });
    });
  });
}

function deleteUser(req, res) {
  const userId = req.params.id;
  console.log(userId);
  userModel.deleteById(userId, (err) => {
    if (err) {
      console.error('Error deleting user:', err);
      return res.send('Error deleting user');
    }
    res.redirect('/admin/users');
  });
}

module.exports = { dashboard, listUsers, userDetails, deleteUser };
