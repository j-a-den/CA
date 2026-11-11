const router = require('express').Router();
const { isCustomer, isAdmin } = require('../middleware/auth');
const { verify } = require('../middleware/serviceSecurity');
const services = require('../controllers/serviceController');
const cart = require('../controllers/cartController');
const checkout = require('../controllers/checkoutController');
const invoices = require('../controllers/invoiceController');
const adminServices = require('../controllers/adminServiceController');
const adminBookings = require('../controllers/adminBookingController');
const action = handler => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    console.error('Service request failed:', error.code || error.message);
    // Database internals are never exposed to the browser.
    res.status(error.code ? 500 : 400).render('serviceError', { message: error.code ? 'Unable to complete this request. Please try again.' : error.message });
  }
};
router.get('/services', isCustomer, action(services.index));
router.get('/cart', isCustomer, action(cart.index));
router.post('/cart', isCustomer, verify, action(cart.add));
router.post('/cart/:cartId/remove', isCustomer, verify, action(cart.remove));
router.get('/checkout/result', isCustomer, action(checkout.result));
router.get('/checkout/availability', isCustomer, action(checkout.availability));
router.get('/checkout', isCustomer, action(checkout.show));
router.post('/checkout', isCustomer, verify, action(checkout.submit));
router.get('/invoices', isCustomer, action(invoices.index));
router.get('/invoices/:bookingId', isCustomer, action(invoices.show));
router.get('/admin/services', isAdmin, action(adminServices.index));
router.get('/admin/services/new', isAdmin, action(adminServices.form));
router.post('/admin/services', isAdmin, verify, action(adminServices.save));
router.get('/admin/services/:id/edit', isAdmin, action(adminServices.form));
router.post('/admin/services/:id/edit', isAdmin, verify, action(adminServices.save));
router.post('/admin/services/:id/delete', isAdmin, verify, action(adminServices.remove));
router.get('/admin/bookings', isAdmin, action(adminBookings.index));
router.post('/admin/bookings/:bookingId/status', isAdmin, verify, action(adminBookings.status));
module.exports = router;
