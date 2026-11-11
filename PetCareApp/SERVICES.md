# Pet care services

Run commands from `PetCareApp`:

```powershell
node app.js
npm.cmd test
npm.cmd run test:integration
```

The app now uses `Petcare_CA1` by default. The current local database already contains the required six tables. For a fresh database, import `Petcare_CA1.sql` first. That script drops and recreates its tables; do not import it over data you want to retain. The original SQL files and existing table structures have not been modified.

Database connection settings support `DB_HOST`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`, with the existing local credentials retained as defaults. Appointment inputs and database sessions use Singapore time (UTC+08:00).

Customers use Services → My Cart → Checkout. Select a future date and a whole start hour for each cart item at checkout. Opening hours are 9am to 6pm Singapore time; starts must have minutes 00 and the complete session must finish by 6pm (a 60-minute service can start no later than 5pm). End times and prices are calculated from current service data. Checkout is atomic, rejects overlapping appointments for the same pet, and prevents replaying purchased cart rows. If prices or durations change, reload checkout to review them. New bookings are `confirmed` and displayed as Paid; no payment is collected.

My Invoices lists one invoice per booking, including completed and cancelled bookings. Invoice amounts and appointment times are saved at checkout. Customer, pet, and service names use current data. The schema has no checkout grouping or invoice snapshots. Deleting a user or pet cascades to its booking/invoice history under the existing foreign keys.

Admins use Manage Services and All Bookings. Services without bookings can be deleted; services with bookings are archived instead. Archived services cannot be checked out. Admins can change any booking to pending, confirmed, completed, or cancelled. The current status is selected in each dropdown; submitting it leaves the booking unchanged. Stale forms are rejected if another admin has changed the booking. Restoring a cancelled booking rechecks the existing shared schedule to prevent overlapping bookings. Cancelling preserves the invoice and its Paid designation; refunds are outside this implementation.

Public signup creates customer accounts only. Existing administrator accounts remain administrators. All new mutations have CSRF checks, and customer queries are scoped to the logged-in user.

Models own SQL and transactional checkout, controllers handle requests, routes apply authorization, and EJS views render pages. New feature routes are registered in `routes/serviceRoutes.js`.

The integration test creates a uniquely named `petcare_test_*` database, loads the schema there, exercises models and HTTP checkout, and drops only that temporary database. It requires a MySQL account permitted to create/drop that test database. It never resets the application database.

## Daily completed-booking revenue

The Admin Dashboard shows daily revenue and completed-booking count, defaulting to today in Singapore time. Select an appointment date to view another day, or use Today to reset. Only bookings currently marked completed are counted, using their saved booking prices. Pending, confirmed, and cancelled bookings are excluded. Payment is assumed to have been made; no payment method or gateway is involved.

The summary uses the scheduled appointment date, not the date an admin changed its status. Status changes can change historical totals. The contributing-bookings link opens the existing booking list filtered to the same date and completed status. Empty days show $0.00; database failures show an error instead of a zero total. No schema migration is needed.
