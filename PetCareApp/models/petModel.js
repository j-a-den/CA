const connection = require('../config/db');

function create(ownerId, petName, species, breed, age, image, callback) {
  const sql = 'INSERT INTO pets (owner_id, name, species, breed, age, image) VALUES (?, ?, ?, ?, ?, ?)';
  connection.query(sql, [ownerId, petName, species, breed, age, image], callback);
}

function findByOwner(ownerId, callback) {
  const sql = 'SELECT * FROM pets WHERE owner_id = ?';
  connection.query(sql, [ownerId], callback);
}

module.exports = { create, findByOwner };
