const mysql = require('mysql2');

const connection = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? 'RP738964$',
  database: process.env.DB_NAME || 'Petcare_CA1',
  connectionLimit: 10,
  timezone: '+08:00',
  dateStrings: true
});

connection.on('connection', client => {
  client.query("SET time_zone = '+08:00'");
});

module.exports = connection;
