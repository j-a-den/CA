const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const path = require('node:path');
const { singaporeDate, dayRange } = require('../helpers/reportingDate');

test('reporting dates use Singapore midnight and validate real calendar dates', () => {
  assert.equal(singaporeDate(Date.parse('2035-12-31T15:59:59Z')), '2035-12-31');
  assert.equal(singaporeDate(Date.parse('2035-12-31T16:00:00Z')), '2036-01-01');
  assert.deepEqual(dayRange('2036-02-29'), { start:'2036-02-29 00:00:00', end:'2036-03-01 00:00:00' });
  assert.equal(dayRange('2035-12-31').end, '2036-01-01 00:00:00');
  assert.equal(dayRange('9999-12-31').end, null);
  for (const value of ['2035-02-29','2036-02-30','2035-13-01','2035-00-01','2035-01-00','2035-01-01 OR 1=1','',undefined,['2035-01-01'],{}]) {
    assert.throws(() => dayRange(value), /valid appointment date/);
  }
});

test('dashboard renders totals, an empty day, and failures without a misleading zero', async () => {
  const filename = path.join(__dirname, '../views/adminDashboard.ejs');
  const data = { session:{user:{id:1,role:'admin',name:'Admin'}}, selectedDate:'2036-03-01', revenueError:null };
  let html = await ejs.renderFile(filename, {...data, revenue:{totalRevenue:'100.30',completedCount:2}});
  assert.match(html, /id="daily-revenue">\$100\.30/);
  assert.match(html, /id="completed-count">2</);
  assert.ok(html.includes('/admin/bookings?status=completed&amp;date=2036-03-01'));
  html = await ejs.renderFile(filename, {...data, revenue:{totalRevenue:'0.00',completedCount:0}});
  assert.match(html, /No completed bookings/);
  assert.match(html, /id="daily-revenue">\$0\.00/);
  html = await ejs.renderFile(filename, {...data, revenue:null, revenueError:'Unable to load daily revenue. Please try again.'});
  assert.match(html, /Unable to load daily revenue/);
  assert.ok(!html.includes('id="daily-revenue"'));
  assert.ok(!html.includes('$0.00'));
});

test('dashboard defaults to Singapore today and handles invalid dates and query failures', async t => {
  const bookings = require('../models/bookingModel');
  const { dashboard } = require('../controllers/adminController');
  t.mock.method(Date, 'now', () => Date.parse('2035-12-31T16:00:00Z'));
  const summary = {totalRevenue:'25.10',completedCount:1};
  const query = t.mock.method(bookings, 'dailyRevenue', async () => summary);
  const response = () => ({ statusCode:200, set(){ return this; }, status(value){ this.statusCode=value; return this; }, render(view,data){ this.view=view; this.data=data; return this; } });
  let res = response();
  await dashboard({query:{}, session:{}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.data.selectedDate,'2036-01-01');
  assert.equal(res.data.revenue,summary);
  res=response();
  await dashboard({query:{date:'2035-02-30'},session:{}},res);
  assert.equal(res.statusCode,400);
  assert.equal(res.data.revenue,null);
  assert.equal(query.mock.calls.length,1);
  query.mock.mockImplementation(async () => { throw Object.assign(new Error('Private database failure'),{code:'ER_TEST'}); });
  t.mock.method(console,'error',()=>{});
  res=response();
  await dashboard({query:{date:'2036-03-01'},session:{}},res);
  assert.equal(res.statusCode,503);
  assert.equal(res.data.revenue,null);
  assert.ok(!res.data.revenueError.includes('Private'));
});

after(async () => { await require('../config/db').promise().end(); });
