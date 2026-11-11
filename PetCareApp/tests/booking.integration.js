const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const mysql=require('mysql2/promise');
const database='petcare_test_'+process.pid+'_'+Date.now();
process.env.DB_NAME=database;
const pool=require('../config/db');
const db=pool.promise();
const cart=require('../models/cartModel');
const services=require('../models/serviceModel');
const bookings=require('../models/bookingModel');
test('isolated MySQL checkout, invoice ownership, service archival and booking lifecycle',async()=>{
  const config=pool.config.connectionConfig;
  const admin=await mysql.createConnection({host:config.host,user:config.user,password:config.password,multipleStatements:true});
  try {
    // Only the uniquely named test database is created/reset by this script.
    const sql=fs.readFileSync(path.join(__dirname,'../Petcare_CA1.sql'),'utf8').replaceAll('Petcare_CA1',database);
    await admin.query(sql);
    const [[zone]]=await db.query('SELECT @@session.time_zone AS tz');
    assert.equal(zone.tz,'+08:00');
    await services.save(null,{name:'Test grooming',description:'Care',cost:'25.10',session_duration:'60',is_active:'1'});
    const service=(await services.list())[0];
    await assert.rejects(cart.add(2,3,service.id)); // Ben's pet is not Amy's.
    await cart.add(2,2,service.id);
    await cart.add(2,2,service.id);
    let items=await cart.list(2);
    const draft=(rows,start='2035-01-01T10:00')=>rows.map((row,i)=>({cart_id:row.cart_id,cost:row.cost,duration:row.session_duration,start_at:i===0?start:'2035-01-01T11:00'}));
    const invalid=draft(items); invalid[1].start_at='2035-01-01T10:30';
    await assert.rejects(bookings.checkout(2,invalid),/whole hours/);
    assert.equal((await cart.list(2)).length,2);
    assert.equal((await bookings.invoices(2)).length,0);
    // Force a failure after the first insert to prove transaction rollback.
    await admin.query(`USE \`${database}\`; CREATE TRIGGER fail_second_booking BEFORE INSERT ON service_booking FOR EACH ROW BEGIN IF NEW.start_at = '2035-01-01 11:00:00' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Test insert failure'; END IF; END`);
    await assert.rejects(bookings.checkout(2,draft(items)));
    assert.equal((await bookings.invoices(2)).length,0);
    assert.equal((await cart.list(2)).length,2);
    await admin.query('DROP TRIGGER fail_second_booking');
    const submissions=await Promise.allSettled([bookings.checkout(2,draft(items)),bookings.checkout(2,draft(items))]);
    assert.equal(submissions.filter(result=>result.status==='fulfilled').length,1);
    const ids=submissions.find(result=>result.status==='fulfilled').value;
    assert.equal(ids.length,2);
    assert.equal((await cart.list(2)).length,0);
    assert.equal((await bookings.invoices(2)).length,2);
    assert.equal(await bookings.invoice(3,ids[0]),undefined);
    let invoice=await bookings.invoice(2,ids[0]);
    assert.equal(invoice.status,'confirmed'); assert.equal(invoice.price,'25.10');
    let slots = await bookings.availability('2035-01-01', 60);
    assert.equal(slots.find(slot => slot.time === '10:00').available, false);
    assert.equal(slots.find(slot => slot.time === '12:00').available, true);
    assert.equal((await bookings.availability('2035-01-02',60)).find(slot => slot.time === '10:00').available,true);
    // Another customer's pet cannot take an occupied slot; failed checkout keeps their cart.
    await cart.add(3,3,service.id);
    const otherItems = await cart.list(3);
    await assert.rejects(bookings.checkout(3,draft(otherItems)),/no longer available/);
    assert.equal((await cart.list(3)).length,1);
    // A longer appointment cannot start before and run into the booked interval.
    assert.equal((await bookings.availability('2035-01-01',90)).find(slot => slot.time === '09:00').available,false);
    await assert.rejects(bookings.changeStatus(ids[0],'paid'));
    const statuses = ['pending','confirmed','completed','cancelled'];
    const originalInvoice = await bookings.invoice(2,ids[0]);
    for (const from of statuses) {
      await bookings.changeStatus(ids[0],from);
      assert.equal(await bookings.changeStatus(ids[0],from,from),false);
      for (const to of statuses.filter(status=>status!==from)) {
        assert.equal(await bookings.changeStatus(ids[0],to,from),true);
        const updated = await bookings.invoice(2,ids[0]);
        assert.equal(updated.status,to);
        assert.deepEqual({...updated,status:originalInvoice.status},originalInvoice);
        await bookings.changeStatus(ids[0],from,to);
      }
    }
    await assert.rejects(bookings.changeStatus(4294967295,'pending'),/not found/);
    await bookings.changeStatus(ids[0],'confirmed');
    const statusRace = await Promise.allSettled([
      bookings.changeStatus(ids[0],'pending','confirmed'),
      bookings.changeStatus(ids[0],'completed','confirmed')
    ]);
    assert.equal(statusRace.filter(result=>result.status==='fulfilled').length,1);
    assert.match(statusRace.find(result=>result.status==='rejected').reason.message,/Another administrator/);
    await bookings.changeStatus(ids[0],'completed');
    await bookings.changeStatus(ids[1],'cancelled');
    slots = await bookings.availability('2035-01-01',60);
    assert.equal(slots.find(slot => slot.time === '11:00').available,true);
    assert.equal(slots.find(slot => slot.time === '10:00').available,false);
    assert.equal((await bookings.invoice(2,ids[1])).status,'cancelled');
    // Concurrent customers racing for a free hour: exactly one may confirm.
    await cart.add(2,2,service.id);
    const raceItems = await cart.list(2);
    const race = await Promise.allSettled([
      bookings.checkout(2,draft(raceItems,'2035-01-03T12:00')),
      bookings.checkout(3,draft(otherItems,'2035-01-03T12:00'))
    ]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length,1);
    for (const result of race) if (result.status === 'fulfilled') {
      await bookings.changeStatus(result.value[0],'cancelled');
      // Keep the original lifecycle assertions scoped to their original bookings.
      await db.execute('DELETE FROM service_booking WHERE booking_id=?',[result.value[0]]);
    }
    for (const row of await cart.list(2)) await cart.remove(2,row.cart_id);
    for (const row of await cart.list(3)) await cart.remove(3,row.cart_id);
    await services.save(service.id,{name:'Updated grooming',cost:'30.00',session_duration:'90',is_active:'1'});
    invoice=await bookings.invoice(2,ids[0]);
    assert.equal(invoice.price,'25.10'); assert.equal(invoice.end_at,'2035-01-01 11:00:00');
    assert.equal((await bookings.all({status:'cancelled'})).bookings.length,1);
    await cart.add(2,2,service.id);
    items=await cart.list(2);
    const stale=draft(items); stale[0].cost='25.10';
    await assert.rejects(bookings.checkout(2,stale),/changed/);
    assert.equal((await cart.list(2)).length,1);
    assert.match(await services.remove(service.id),/archived/);
    assert.equal((await services.find(service.id)).is_active,0);
    await assert.rejects(bookings.checkout(2,draft(items)),/available/);
    assert.equal((await bookings.invoices(2)).length,2);
    await services.save(null,{name:'Unused service',cost:'0',session_duration:'15',is_active:'1'});
    const unused=(await services.list())[0];
    await cart.add(2,2,unused.id);
    assert.match(await services.remove(unused.id),/deleted/);
    assert.equal((await cart.list(2)).length,1);
    await services.save(null,{name:'HTTP service',cost:'10.20',session_duration:'30',is_active:'1'});
    const httpService=(await services.list()).find(service=>service.name==='HTTP service');
    // Remove the archived item before checking out through actual HTTP routes.
    for(const row of await cart.list(2)) await cart.remove(2,row.cart_id);
    const app=require('../app');
    const server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    try {
      let response=await fetch(base+'/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'username=amy&password=user123',redirect:'manual'});
      assert.equal(response.status,302);
      const cookie=response.headers.get('set-cookie').split(';')[0];
      const get=url=>fetch(base+url,{headers:{cookie},redirect:'manual'});
      const post=(url,body)=>fetch(base+url,{method:'POST',headers:{cookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'manual'});
      response=await get('/services'); assert.equal(response.status,200);
      let html=await response.text();
      const csrf=html.match(/name="_csrf" value="([^"]+)"/)[1];
      response=await post('/cart',{_csrf:csrf,pets_id:'2',service_id:String(httpService.id)}); assert.equal(response.status,302);
      response=await get('/checkout'); assert.equal(response.status,200); html=await response.text();
      const token=html.match(/name="token" value="([^"]+)"/)[1];
      const row=(await cart.list(2))[0];
      response=await get('/checkout/availability?date=2035-02-01&cartId='+row.cart_id);
      assert.equal(response.status,200);
      assert.equal((await response.json()).slots.find(slot=>slot.time==='10:00').available,true);
      response=await get('/checkout/availability?date=2035-02-30&cartId='+row.cart_id);
      assert.equal(response.status,400);
      response=await post('/checkout',{_csrf:csrf,token,['dates[item_'+row.cart_id+']']:'2035-02-01',['hours[item_'+row.cart_id+']']:'10:00'});
      assert.equal(response.status,302); assert.equal(response.headers.get('location'),'/checkout/result');
      response=await get('/checkout/result'); html=await response.text(); assert.match(html,/considered paid/);
      const invoicePath=html.match(/href="(\/invoices\/\d+)"/)[1];
      response=await get(invoicePath); assert.equal(response.status,200); assert.match(await response.text(),/10.20/);
      response=await post('/checkout',{_csrf:csrf,token,['dates[item_'+row.cart_id+']']:'2035-02-01',['hours[item_'+row.cart_id+']']:'10:00'}); assert.equal(response.status,400);
      assert.equal((await bookings.invoices(2)).length,3);
      await cart.add(2,2,httpService.id);
      const nextRow=(await cart.list(2))[0];
      const availabilityPath='/checkout/availability?date=2035-02-01&cartId='+nextRow.cart_id;
      response=await get(availabilityPath);
      assert.equal((await response.json()).slots.find(slot=>slot.time==='10:00').available,false);
      const bookedId=Number(invoicePath.split('/').pop());
      await bookings.changeStatus(bookedId,'cancelled');
      response=await get(availabilityPath);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal((await response.json()).slots.find(slot=>slot.time==='10:00').available,true);
      assert.equal((await bookings.invoice(2,bookedId)).status,'cancelled');
      // Real admin forms expose all four statuses and submit the previously seen status.
      response=await fetch(base+'/login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'username=admin1&password=admin123',redirect:'manual'});
      assert.equal(response.status,302);
      const adminCookie=response.headers.get('set-cookie').split(';')[0];
      response=await fetch(base+'/admin/bookings',{headers:{cookie:adminCookie}});
      assert.equal(response.status,200);
      html=await response.text();
      const adminCsrf=html.match(/name="_csrf" value="([^"]+)"/)[1];
      const adminPost=body=>fetch(base+'/admin/bookings/'+bookedId+'/status',{method:'POST',headers:{cookie:adminCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({_csrf:adminCsrf,...body}),redirect:'manual'});
      response=await post('/admin/bookings/'+bookedId+'/status',{_csrf:csrf,current_status:'cancelled',status:'confirmed'});
      assert.equal(response.status,403);
      let current='cancelled';
      for (const status of ['pending','confirmed','completed','cancelled']) {
        response=await adminPost({current_status:current,status});
        assert.equal(response.status,302);
        const saved=await bookings.invoice(2,bookedId);
        assert.equal(saved.status,status); assert.equal(saved.price,'10.20');
        current=status;
      }
      response=await adminPost({current_status:'confirmed',status:'pending'});
      assert.equal(response.status,400); assert.match(await response.text(),/Another administrator/);
      response=await adminPost({current_status:'cancelled',status:'paid'});
      assert.equal(response.status,400);
      response=await adminPost({current_status:'cancelled',status:'cancelled'});
      assert.equal(response.status,302);
      // Reusing a cancelled hour must prevent restoring the original over it.
      const replacementIds=await bookings.checkout(2,draft([nextRow],'2035-02-01T10:00'));
      await assert.rejects(bookings.changeStatus(bookedId,'confirmed','cancelled'),/no longer available/);
      assert.equal((await bookings.invoice(2,bookedId)).status,'cancelled');
      await bookings.changeStatus(replacementIds[0],'cancelled');
      await bookings.changeStatus(bookedId,'pending','cancelled');
      assert.equal((await bookings.invoice(2,bookedId)).status,'pending');
      // Reporting fixtures deliberately cover midnight boundaries, all statuses,
      // exact decimals, and more rows than the booking list's first page.
      const addReportingBooking=async (start,end,status,price) => {
        const [result]=await db.execute('INSERT INTO service_booking (user_id,pets_id,service_id,start_at,end_at,status,price) VALUES (2,2,?,?,?,?,?)', [httpService.id,start,end,status,price]);
        return result.insertId;
      };
      const first=await addReportingBooking('2036-03-01 00:00:00','2036-03-01 01:00:00','completed','0.10');
      await addReportingBooking('2036-03-01 23:59:59','2036-03-02 00:30:00','completed','0.20');
      await addReportingBooking('2036-02-29 23:59:59','2036-03-01 00:30:00','completed','99.00');
      await addReportingBooking('2036-03-02 00:00:00','2036-03-02 01:00:00','completed','88.00');
      for (const status of ['pending','confirmed','cancelled']) await addReportingBooking('2036-03-01 12:00:00','2036-03-01 13:00:00',status,'100.00');
      assert.deepEqual(await bookings.dailyRevenue('2036-03-01'),{completedCount:2,totalRevenue:'0.30'});
      assert.deepEqual(await bookings.dailyRevenue('2036-03-03'),{completedCount:0,totalRevenue:'0.00'});
      await assert.rejects(bookings.dailyRevenue('2035-02-29'),/valid appointment date/);
      await services.save(httpService.id,{name:'Repriced service',cost:'999.00',session_duration:'30',is_active:'1'});
      assert.equal((await bookings.dailyRevenue('2036-03-01')).totalRevenue,'0.30');
      await bookings.changeStatus(first,'pending','completed');
      assert.deepEqual(await bookings.dailyRevenue('2036-03-01'),{completedCount:1,totalRevenue:'0.20'});
      await bookings.changeStatus(first,'completed','pending');
      await bookings.changeStatus(first,'completed','completed');
      assert.equal((await bookings.dailyRevenue('2036-03-01')).totalRevenue,'0.30');
      for (let minute=0;minute<26;minute++) {
        const time='2036-03-04 09:'+String(minute).padStart(2,'0')+':00';
        await addReportingBooking(time,time,'completed','1.00');
      }
      assert.equal((await bookings.all({date:'2036-03-04',status:'completed'})).bookings.length,25);
      assert.deepEqual(await bookings.dailyRevenue('2036-03-04'),{completedCount:26,totalRevenue:'26.00'});
      response=await fetch(base+'/admin/dashboard?date=2036-03-01',{headers:{cookie:adminCookie}});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'no-store');
      html=await response.text();
      assert.match(html,/id="daily-revenue">\$0\.30/);
      assert.match(html,/id="completed-count">2</);
      assert.ok(html.includes('/admin/bookings?status=completed&amp;date=2036-03-01'));
      response=await fetch(base+'/admin/dashboard?date=2036-03-03',{headers:{cookie:adminCookie}});
      assert.equal(response.status,200); assert.match(await response.text(),/No completed bookings/);
      response=await fetch(base+'/admin/dashboard?date=2035-02-29',{headers:{cookie:adminCookie}});
      assert.equal(response.status,400);
      response=await fetch(base+'/admin/dashboard?date=2036-03-01',{headers:{cookie}});
      assert.equal(response.status,403);
      response=await fetch(base+'/admin/dashboard',{headers:{cookie:adminCookie}});
      assert.equal(response.status,200);
    } finally { await new Promise(resolve=>server.close(resolve)); }
  } finally {
    await db.end();
    if (!/^petcare_test_\d+_\d+$/.test(database)) throw new Error('Unsafe test database name');
    await admin.query('DROP DATABASE IF EXISTS `'+database+'`');
    await admin.end();
  }
});
