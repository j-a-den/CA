const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { cents, id, appointment, overlaps } = require('../helpers/serviceValidation');
test('money is converted exactly and rejects unsupported precision and negative amounts', () => {
  assert.equal(cents('123.45'),12345);
  assert.equal(cents('0.10') + cents('0.20'),30);
  for (const amount of ['-1','1.001','Infinity','1e3','100000000.00']) assert.throws(() => cents(amount));
});
test('appointment validation uses Singapore time, rejects impossible dates, and allows adjacent slots', () => {
  const slot = appointment('2035-01-01T10:00',60,0);
  assert.deepEqual(slot,{ start:'2035-01-01 10:00:00',end:'2035-01-01 11:00:00' });
  assert.throws(() => appointment('2035-02-30T10:00',60,0));
  assert.throws(() => appointment('2020-01-01T10:00',60));
  assert.equal(overlaps(slot,appointment('2035-01-01T11:00',30,0)),false);
  assert.equal(overlaps(slot,{start:'2035-01-01 10:30:00',end:'2035-01-01 11:00:00'}),true);
  assert.throws(() => id('1 OR 1=1'));
});
const booking = { booking_id:1, customer_name:'Amy <script>', pet_name:'Mochi', service_name:'Grooming', price:'25.00', status:'confirmed', start_at:'2035-01-01 10:00:00', end_at:'2035-01-01 11:00:00', created_at:'2034-12-01 10:00:00' };
const service = {id:1,name:'Grooming', description:'Care',cost:'25.00',session_duration:60,is_active:1};
const item = {...service,cart_id:1,service_name:'Grooming',pet_name:'Mochi',owner_id:2};
test('new EJS pages render populated and empty states, escaping customer content', () => {
  for (const empty of [false,true]) {
    const data = {session:{user:{id:2,role:'user',name:'Amy'}},csrf:'token',notice:[],services:empty?[]:[service],pets:empty?[]:[{id:1,name:'Mochi'}],items:empty?[]:[item],invoices:empty?[]:[booking],invoice:booking,bookings:empty?[]:[booking],filters:{},page:2,hasNext:true,total:'25.00',token:'checkout',service:empty?null:service,message:'Please reload'};
    for(const view of ['services','cart','checkout','checkoutResult','invoices','invoice','adminServices','serviceForm','adminBookings','serviceError']) {
      const filename=path.join(__dirname,'../views',view+'.ejs');
      const html=ejs.render(fs.readFileSync(filename,'utf8'),data,{filename});
      assert.ok(html.includes('</html>'),view);
      assert.ok(!html.includes('Amy <script>'),view);
    }
  }
});
test('admin booking forms offer all four statuses with the current value selected', async () => {
  for (const current of ['pending','confirmed','completed','cancelled']) {
    const html = await ejs.renderFile(path.join(__dirname,'../views/adminBookings.ejs'), {
      session:{user:{id:1,role:'admin',name:'Admin'}},csrf:'token',notice:[],
      bookings:[{...booking,status:current}],filters:{},page:1,hasNext:false
    });
    const form=html.match(/<form method="post" action="\/admin\/bookings\/1\/status"[\s\S]*?<\/form>/)[0];
    for (const status of ['pending','confirmed','completed','cancelled']) assert.ok(form.includes('value="'+status+'"'));
    assert.match(form,new RegExp('<option value="'+current+'" selected>'));
    assert.ok(form.includes('name="current_status" value="'+current+'"'));
  }
});

test('HTTP routes enforce customer/admin boundaries and CSRF without database access', async () => {
  const app = require('../app');
  // Test-only login route: never registered by the production app.
  app.get('/test-session/:role',(req,res)=>{req.session.user={id:2,role:req.params.role,name:'Tester'};res.send('ok');});
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try {
    let response=await fetch(base+'/cart',{redirect:'manual'});
    assert.equal(response.status,302); assert.equal(response.headers.get('location'),'/login');
    response=await fetch(base+'/test-session/user');
    const userCookie=response.headers.get('set-cookie').split(';')[0];
    response=await fetch(base+'/admin/bookings',{headers:{cookie:userCookie}}); assert.equal(response.status,403);
    response=await fetch(base+'/admin/dashboard',{headers:{cookie:userCookie}}); assert.equal(response.status,403);
    response=await fetch(base+'/cart',{method:'POST',headers:{cookie:userCookie,'content-type':'application/x-www-form-urlencoded'},body:'pets_id=1&service_id=1'}); assert.equal(response.status,403);
    response=await fetch(base+'/test-session/admin');
    const adminCookie=response.headers.get('set-cookie').split(';')[0];
    response=await fetch(base+'/invoices',{headers:{cookie:adminCookie}}); assert.equal(response.status,403);
    response=await fetch(base+'/admin/services',{method:'POST',headers:{cookie:adminCookie}}); assert.equal(response.status,403);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
after(async () => { await require('../config/db').promise().end(); });

test('appointments use whole hours and must fit inside 9am to 6pm', () => {
  for (let minute = 1; minute <= 59; minute++) {
    assert.throws(() => appointment('2035-01-01T10:' + String(minute).padStart(2,'0'),60,0), /whole hours/);
  }
  for (const hour of ['00','08','18','23']) assert.throws(() => appointment('2035-01-01T'+hour+':00',60,0), /9am to 6pm/);
  assert.equal(appointment('2035-01-01T09:00',60,0).start,'2035-01-01 09:00:00');
  assert.equal(appointment('2035-01-01T17:00',60,0).end,'2035-01-01 18:00:00');
  assert.equal(appointment('2035-01-01T16:00',120,0).end,'2035-01-01 18:00:00');
  assert.throws(() => appointment('2035-01-01T17:00',90,0), /finish by 6pm/);
});
