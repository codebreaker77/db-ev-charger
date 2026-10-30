'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const base=`http://127.0.0.1:${process.env.TEST_PORT||3199}/api`, suffix=crypto.randomBytes(6).toString('hex'),accounts=[],vehicles=[],checkouts=[];
async function request(path,method='GET',body,cookie){let r=await fetch(base+path,{method,headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});let data=await r.json();return {status:r.status,data,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
function cleanup(sql,params){const encode=x=>Buffer.from(String(x)).toString('base64');execFileSync('java',['-cp',`build;${process.env.ORACLE_JDBC_JAR||'D:\\ORACLE\\app\\oracle\\product\\11.2.0\\server\\jdbc\\lib\\ojdbc6.jar'}`,'OracleWrite',encode(sql),...params.map(encode)],{stdio:'ignore'});}
(async()=>{try{
 const password='LocalSignupTest123!',emails=[`signup-a-${suffix}@example.test`,`signup-b-${suffix}@example.test`];
 for(const email of emails){let r=await request('/auth/register','POST',{email,password,full_name:'Test Person'});assert.equal(r.status,201,JSON.stringify(r.data));assert.ok(r.cookie);let me=await request('/me','GET',undefined,r.cookie);assert.equal(me.status,200);assert.equal(me.data.email,email);accounts.push({id:me.data.user_id,email,cookie:r.cookie});}
 let dup=await request('/auth/register','POST',{email:emails[0].toUpperCase(),password,full_name:'Test Person'});assert.equal(dup.status,400);
 let wrong=await request('/auth/login','POST',{email:emails[0],password:'WrongPassword123!'});assert.equal(wrong.status,401);
 let login=await request('/auth/login','POST',{email:emails[0],password});assert.equal(login.status,200);
 let created=await request('/vehicles','POST',{license_plate:'T'+suffix.slice(0,8),make:'Test',model:'EV',connector_types:['CCS2'],battery_capacity_kwh:40,max_charge_rate_kw:20},login.cookie);assert.equal(created.status,200,JSON.stringify(created.data));vehicles.push(created.data.vehicle_id);
 let mine=await request('/vehicles','GET',undefined,login.cookie),other=await request('/vehicles','GET',undefined,accounts[1].cookie);assert.ok(mine.data.some(v=>v.vehicle_id===vehicles[0]));assert.ok(!other.data.some(v=>v.vehicle_id===vehicles[0]));
 let booking=await request('/reservations','POST',{vehicle_id:vehicles[0],bay_id:1,start_time:new Date(Date.now()+86400000*5).toISOString(),end_time:new Date(Date.now()+86400000*5+3600000).toISOString(),idempotency_key:crypto.randomUUID()},login.cookie);assert.equal(booking.status,200,JSON.stringify(booking.data));assert.equal(booking.data.user_id,accounts[0].id);checkouts.push(booking.data.checkout_id);
 let otherCheckouts=await request('/reservation-checkouts','GET',undefined,accounts[1].cookie);assert.ok(!otherCheckouts.data.some(c=>c.checkout_id===checkouts[0]));
 let cross=await request('/reservation-checkouts/'+checkouts[0]+'/settle','POST',{outcome:'paid'},accounts[1].cookie);assert.equal(cross.status,400);
 let saved=JSON.parse(fs.readFileSync('.local-accounts.json','utf8'));assert.ok(saved.some(a=>a.email===emails[0]&&a.hash&&!JSON.stringify(a).includes(password)));
 console.log('Signup, Oracle profile, login, duplicate handling, hashed passwords and vehicle isolation passed.');
 }finally{for(const id of checkouts)cleanup('DELETE FROM reservation_checkout WHERE checkout_id=?',[id]);for(const id of vehicles)cleanup('DELETE FROM vehicle WHERE vehicle_id=?',[id]);for(const a of accounts)cleanup('DELETE FROM app_user WHERE user_id=?',[a.id]);if(fs.existsSync('.local-accounts.json')){const records=JSON.parse(fs.readFileSync('.local-accounts.json','utf8'));fs.writeFileSync('.local-accounts.json',JSON.stringify(records.filter(a=>!accounts.some(t=>t.email===a.email)),null,2));}}
})().catch(e=>{console.error(e);process.exitCode=1});
