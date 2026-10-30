const express = require('express');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const app=express(), sessions=new Map();
app.use(express.json());
app.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
function role(req){const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('local_session='));return sessions.get(cookie?.slice(14));}
function query(type,role,uid=role==='manager'?1:2){return new Promise((resolve,reject)=>execFile('java',['-Duser.timezone=UTC','-cp',cp,'OracleRead',type,role,String(uid)],{cwd:__dirname,timeout:20000},(e,out,err)=>{if(e)return reject(new Error(err||e.message));try{const rows=JSON.parse(out);for(const row of rows)for(const key of ['quote','snapshot','tariff_snapshot'])if(typeof row[key]==='string'){try{row[key]=JSON.parse(row[key])}catch{row[key]=null}}resolve(rows);}catch(e){reject(e);}}));}
const cp=['build', process.env.ORACLE_JDBC_JAR || 'D:\\ORACLE\\app\\oracle\\product\\11.2.0\\server\\jdbc\\lib\\ojdbc6.jar'].join(path.delimiter);
function write(sql,values){const enc=x=>x===null||x===undefined||x===''?'~':x==='!SEQ'?'!SEQ':Buffer.from(String(x)).toString('base64');return new Promise((resolve,reject)=>execFile('java',['-cp',cp,'OracleWrite',enc(sql),...values.map(enc)],{cwd:__dirname,timeout:20000},(e,out,err)=>{if(e){const msg=err||e.message;const match=msg.match(/ORA-20001: ([^\r\n]+)/);const error=new Error(match?match[1]:msg);if(match||msg.includes('ORA-00001'))error.status=409;return reject(error)}resolve(Number(out))}));}
const bad=(s)=>{const e=Error(s);e.status=400;throw e};
const flow=require('./flows')({query,write,bad});
let taskQueue=Promise.resolve();
async function mutate(req,r){
 const flowResult=await flow(req,r);if(flowResult!==undefined)return flowResult;
 const p=req.body||{}, parts=req.path.split('/').filter(Boolean), type=parts[0], id=Number(parts[1])||0, action=parts[2], uid=req.localUid;
 if(type==='me'&&req.method==='PATCH'){if(!p.full_name||p.full_name.trim().length<2)bad('Enter a valid name.');await write('UPDATE app_user SET full_name=?,phone=? WHERE user_id=?',[p.full_name.trim(),p.phone,uid]);return (await query('me',r,uid))[0]}
 if(type==='vehicles'){
  const rows=await query('vehicles',r,uid),old=rows.find(x=>x.vehicle_id===id);if(id&&!old)bad('Vehicle not found');
  if(id){const sessions=await query('sessions',r,uid),reservations=await query('reservations',r,uid);if(sessions.some(x=>x.vehicle_id===id&&['active','queued','scheduled'].includes(x.status))||reservations.some(x=>x.vehicle_id===id&&x.status==='confirmed'&&new Date(x.end_time)>new Date()))bad('Resolve open sessions and bookings first.');}
  if(req.method==='DELETE'){await write('UPDATE vehicle SET archived_at=SYSTIMESTAMP WHERE vehicle_id=?',[id]);return {vehicle_id:id};}
  if(!p.license_plate||!p.make||!p.model||!Array.isArray(p.connector_types)||!p.connector_types.length||p.connector_types.some(x=>!['CCS2','Type2','CHAdeMO','NACS'].includes(x)))bad('Enter a registration, make, model and supported connector.');
  if(p.battery_capacity_kwh!=null&&p.battery_capacity_kwh!==''&&Number(p.battery_capacity_kwh)<=0||p.max_charge_rate_kw!=null&&p.max_charge_rate_kw!==''&&Number(p.max_charge_rate_kw)<=0)bad('Power and battery capacity must be positive.');
  const vals=[p.license_plate.toUpperCase().trim(),p.make,p.model,p.vehicle_type||'car',p.connector_types.join(','),p.battery_capacity_kwh,p.max_charge_rate_kw];
  let target=id;if(id)await write('UPDATE vehicle SET license_plate=?,make=?,model=?,vehicle_type=?,connector_types=?,battery_capacity_kwh=?,max_charge_rate_kw=? WHERE vehicle_id=?',[...vals,id]);else target=await write('INSERT INTO vehicle(vehicle_id,license_plate,make,model,vehicle_type,connector_types,battery_capacity_kwh,max_charge_rate_kw,user_id,ownership_type) VALUES(?,?,?,?,?,?,?,?,?,?)',['!SEQ',...vals,uid,'PERSONAL']);return (await query('vehicles',r,uid)).find(x=>x.vehicle_id===target);
 }
 if(['substations','stations','bays','tariffs'].includes(type)){
  if(r!=='manager')bad('Manager access required.');
  const cfg={substations:['substation','substation_id',['name','code','region_code','location','max_grid_capacity_kw','base_load_kw','capacity_limit_pct','operational_status','load_source','constraints_note']],stations:['charging_station','station_id',['substation_id','org_id','station_name','street_address','city','status','timezone']],bays:['charger_bay','bay_id',['station_id','bay_number','plug_type','max_kw_output','is_operational']],tariffs:['tariff_plan','tariff_id',['station_id','plan_name','start_hour','end_hour','base_rate_per_kwh','idle_fee_per_min','currency','tax_pct','service_fee','discount_amount','active']]}[type];
  let [table,key,cols]=cfg;let vals=cols.map(k=>typeof p[k]==='boolean'?(p[k]?1:0):p[k]);
  if(type==='bays'&&p.is_operational&&(await query('maintenance',r)).some(x=>x.bay_id===id&&['OPEN','IN_PROGRESS'].includes(x.repair_status)))bad('Resolve all open faults before enabling the bay.');
  let target=id;if(id){const n=await write(`UPDATE ${table} SET ${cols.map(k=>k+'=?').join(',')} WHERE ${key}=?`,[...vals,id]);if(n===0)bad('Record not found');}else target=await write(`INSERT INTO ${table} (${key},${cols.join(',')}) VALUES (?,${cols.map(()=>'?').join(',')})`,['!SEQ',...vals]);return (await query(type,r)).find(x=>x[key]===target);
 }
 if(type==='maintenance'){
  if(r!=='manager')bad('Manager access required.');
  if(action==='resolve'){const n=await write("UPDATE maintenance_log SET repair_status='RESOLVED',resolved_at=SYSTIMESTAMP WHERE log_id=? AND repair_status IN ('OPEN','IN_PROGRESS')",[id]);if(n===0)bad('Open fault not found');return (await query(type,r)).find(x=>x.log_id===id);}
  if(!p.bay_id||String(p.issue_reported||'').trim().length<3)bad('Enter a bay and issue.');
  if((await query('sessions',r,uid)).some(x=>x.bay_id===Number(p.bay_id)&&x.status==='active'))bad('Stop active charging first.');
  const target=await write("INSERT INTO maintenance_log(log_id,bay_id,technician_id,issue_reported) VALUES(?,?,?,?)",['!SEQ',p.bay_id,uid,p.issue_reported]);return (await query(type,r)).find(x=>x.log_id===target);
 }
 bad('This local Oracle workflow is not implemented yet.');
}
app.get('/api/health',(req,res)=>res.json({status:'ok',configured:true,payment_mode:'test',metering:'local experiment'}));
const accountFile=path.join(__dirname,'.local-accounts.json');
function readAccounts(){try {const data=JSON.parse(fs.readFileSync(accountFile,'utf8'));if(!Array.isArray(data))throw Error('Invalid account file');return data;}catch(e){if(e.code==='ENOENT')return [];throw e;}}
function writeAccounts(accounts){const temp=accountFile+'.tmp';fs.writeFileSync(temp,JSON.stringify(accounts,null,2),{mode:0o600});fs.renameSync(temp,accountFile);}
function makeSession(res,account){const token=crypto.randomBytes(24).toString('hex');sessions.set(token,{role:account.role,uid:account.uid});res.setHeader('Set-Cookie',`local_session=${token}; Path=/; HttpOnly; SameSite=Strict`);}
const normalizeEmail=x=>typeof x==='string'?x.trim().toLowerCase():'';
app.post('/api/auth/register',async(req,res)=>{
 const email=normalizeEmail(req.body.email),password=req.body.password,name=typeof req.body.full_name==='string'?req.body.full_name.trim():'';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>150||typeof password!=='string'||password.length<12||password.length>128||name.length<2||name.length>100)return res.status(400).json({error:'Enter a name, valid email and a password of 12 to 128 characters.'});
 const task=taskQueue.then(async()=>{
  if((await query('customers','manager')).some(u=>normalizeEmail(u.email)===email)||readAccounts().some(a=>a.email===email))bad('An account with that email already exists.');
  const salt=crypto.randomBytes(16).toString('hex'),hash=crypto.scryptSync(password,salt,64).toString('hex');
  const uid=await write("INSERT INTO app_user(user_id,full_name,email,role) VALUES(?,?,?,'customer')",['!SEQ',name,email]);
  try{const accounts=readAccounts();accounts.push({uid,email,salt,hash});writeAccounts(accounts);}catch(e){try{await write('DELETE FROM app_user WHERE user_id=?',[uid]);}catch(cleanup){console.error('Account cleanup failed:',cleanup.message);}throw e;}
  return {uid,role:'customer'};
 });taskQueue=task.catch(()=>{});
 try{const account=await task;makeSession(res,account);res.status(201).json({signed_in:true});}catch(e){console.error('Registration failed:',e.message);res.status(e.status||500).json({error:e.status?e.message:'Could not create account. Check the local server console.'});}
});
app.post('/api/auth/login',async(req,res)=>{
 const email=normalizeEmail(req.body.email),password=req.body.password;if(typeof password!=='string'||password.length>128)return res.status(400).json({error:'Email and password are required.'});
 try{
  let account;if(password==='LocalExperiment123!'&&['manager@local.test','customer@local.test'].includes(email))account={uid:email.startsWith('manager@')?1:2,role:email.startsWith('manager@')?'manager':'customer'};
  else {const saved=readAccounts().find(a=>a.email===email);if(saved){const expected=Buffer.from(saved.hash,'hex'),actual=crypto.scryptSync(password,saved.salt,64);if(expected.length===actual.length&&crypto.timingSafeEqual(expected,actual))account={uid:saved.uid,role:'customer'};}}
  if(!account)return res.status(401).json({error:'Invalid local email or password.'});
  const profile=(await query('me',account.role,account.uid))[0];if(!profile||normalizeEmail(profile.email)!==email)return res.status(401).json({error:'Account profile is unavailable.'});
  makeSession(res,account);res.json({signed_in:true});
 }catch(e){console.error('Login failed:',e.message);res.status(500).json({error:'Could not sign in. Check the local server console.'});}
});
app.post('/api/auth/logout',(req,res)=>{const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('local_session='));if(cookie)sessions.delete(cookie.slice(14));res.setHeader('Set-Cookie','local_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');res.json({signed_out:true});});
app.use('/api',async(req,res)=>{const account=role(req);if(!account)return res.status(401).json({error:'Sign in to the local experiment.'});const r=account.role;req.localUid=account.uid;if(req.method!=='GET'){try{const task=taskQueue.then(()=>mutate(req,r));taskQueue=task.catch(()=>{});return res.json(await task);}catch(e){console.error(e.message);return res.status(e.status||500).json({error:e.status?(e.message.includes('ORA-00001')?'This record already exists.':e.message):'Oracle write failed. See local server console.'});}}const name=req.path.slice(1);if(r!=='manager'&&['customers','missions','organizations','maintenance'].includes(name))return res.status(403).json({error:'Manager access required.'});try{const rows=await query(name,r,account.uid);res.json(name==='me'?rows[0]:rows);}catch(e){console.error(e.message);res.status(500).json({error:'Oracle query failed. See the local server console.'});}});
const frontend=path.join(__dirname,'frontend');
app.use(express.static(frontend));app.get(['/login','/manager','/customer'],(req,res)=>res.sendFile(path.join(frontend,req.path==='/login'?'login.html':'dashboard.html')));
const port=Number(process.env.PORT||3199);
app.listen(port,'127.0.0.1',()=>console.log(`Oracle experiment: http://127.0.0.1:${port}`));
