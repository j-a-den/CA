// Pet Care Journal System
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
require('./config/db');

const authRoutes = require('./routes/authRoutes');
const pageRoutes = require('./routes/pageRoutes');
const adminRoutes = require('./routes/adminRoutes');
const petRoutes = require('./routes/petRoutes');
const journalRoutes = require('./routes/journalRoutes');

const app = express();
const PORT = 3000;


// View Engine and Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
  secret: 'secret123',
  resave: false,
  saveUninitialized: true
}));
app.use(flash());
app.use(require('./middleware/serviceSecurity'));
app.use(require('./routes/serviceRoutes'));

app.use(authRoutes);
app.use(pageRoutes);
app.use(adminRoutes);
app.use(petRoutes);
app.use(journalRoutes);

if (require.main === module) app.listen(PORT, () => console.log(`App running on http://localhost:${PORT}`));
module.exports = app;
