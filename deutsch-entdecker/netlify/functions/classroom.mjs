import { getStore } from '@netlify/blobs';
import { randomBytes, randomUUID, pbkdf2Sync, createHmac, timingSafeEqual } from 'node:crypto';

const storeName = 'deutsch-entdecker-shared-v1';
const topics = new Set(['greetings','colors','numbers','food','animals','school','family']);
const json=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extra}});
const env=(key)=>globalThis.Netlify?.env?.get(key)||process.env[key]||'';
const hash=(pin,salt)=>pbkdf2Sync(pin,salt,210000,32,'sha256').toString('hex');
const equals=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
const sign=(value)=>createHmac('sha256',env('SESSION_SECRET')).update(value).digest('hex');
function authenticated(req){const token=(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('de_teacher='))?.slice(11);if(!token||!env('SESSION_SECRET'))return false;const parts=token.split('.');if(parts.length!==2)return false;const [expires,mac]=parts;return /^\d+$/.test(expires)&&Number(expires)>Date.now()&&equals(sign(expires),mac)}
const cookie=(value,maxAge)=>`de_teacher=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
const validate=(w)=>w&&topics.has(w.topic)&&typeof w.german==='string'&&w.german.trim().length>0&&w.german.length<=90&&['tr','uk','ar','emoji','sentence'].every(k=>!w[k]||typeof w[k]==='string'&&w[k].length<=(k==='sentence'?250:150))&&(!w.image||typeof w.image==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(w.image)&&w.image.length<=2100000);
const clean=w=>({topic:w.topic,german:w.german.trim(),tr:String(w.tr||''),uk:String(w.uk||''),ar:String(w.ar||''),emoji:String(w.emoji||''),sentence:String(w.sentence||''),image:String(w.image||'')});
async function body(req){const raw=await req.text();if(raw.length>12500000)throw Error('Anfrage zu groß.');return JSON.parse(raw)}
export default async function handler(req){
 try{
  const url=new URL(req.url),action=url.searchParams.get('action')||'words';
  const store=getStore(storeName);
  const settings=await store.get('admin-settings',{type:'json'});
  if(action==='words'&&req.method==='GET'){
   const listing=await store.list({prefix:'word-',paginate:false});
   const words=(await Promise.all(listing.blobs.slice(0,300).map(async b=>store.get(b.key,{type:'json'})))).filter(Boolean);
   return json({words});
  }
  if(action==='status'&&req.method==='GET')return json({configured:!!settings,authenticated:authenticated(req)});
  if(action==='setup'&&req.method==='POST'){
   if(settings)return json({error:'Der PIN wurde bereits eingerichtet.'},409);
   const input=await body(req),setupSecret=env('SETUP_SECRET'),sessionSecret=env('SESSION_SECRET');
   if(!setupSecret||setupSecret.length<20||!sessionSecret||sessionSecret.length<32)return json({error:'SETUP_SECRET (mindestens 20 Zeichen) und SESSION_SECRET (mindestens 32 Zeichen) müssen in Netlify eingerichtet werden.'},503);
   if(!equals(input.setupKey,setupSecret))return json({error:'Einrichtungsschlüssel ist nicht korrekt.'},403);
   if(!/^\d{6,12}$/.test(String(input.pin)))return json({error:'PIN muss aus 6 bis 12 Ziffern bestehen.'},400);
   const salt=randomBytes(24).toString('hex');
   const result=await store.setJSON('admin-settings',{salt,hash:hash(input.pin,salt)},{onlyIfNew:true});
   if(!result.modified)return json({error:'PIN ist bereits eingerichtet.'},409);
   const expiry=String(Date.now()+8*3600*1000);return json({ok:true},200,{'set-cookie':cookie(expiry+'.'+sign(expiry),8*3600)});
  }
  if(action==='login'&&req.method==='POST'){
   if(!settings)return json({error:'Bitte zuerst den PIN einrichten.'},409);
   const input=await body(req);if(!/^\d{6,12}$/.test(String(input.pin)))return json({error:'PIN ungültig.'},403);
   // Lightweight throttling. A production deployment with broad public exposure should use a managed rate limiter.
   const ip=(req.headers.get('x-nf-client-connection-ip')||'unknown').slice(0,90);
   const bucket='attempt-'+createHmac('sha256',env('SESSION_SECRET')||'fallback').update(ip).digest('hex');
   const attempts=await store.get(bucket,{type:'json'})||{count:0,until:0};
   if(attempts.until>Date.now())return json({error:'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.'},429);
   if(!equals(hash(input.pin,settings.salt),settings.hash)){
    const count=(attempts.count||0)+1;await store.setJSON(bucket,{count:count>=5?0:count,until:count>=5?Date.now()+15*60000:0});
    return json({error:'PIN nicht korrekt.'},403);
   }
   await store.delete(bucket);const expiry=String(Date.now()+8*3600*1000);
   return json({ok:true},200,{'set-cookie':cookie(expiry+'.'+sign(expiry),8*3600)});
  }
  if(action==='logout'&&req.method==='POST')return json({ok:true},200,{'set-cookie':cookie('',0)});
  if(!authenticated(req))return json({error:'Nur für Lehrkräfte. Bitte mit PIN anmelden.'},401);
  if(action==='add'&&req.method==='POST'){
   const input=await body(req);if(!validate(input))return json({error:'Ungültiges Wort oder Bild zu groß.'},400);
   const listing=await store.list({prefix:'word-',paginate:false});if(listing.blobs.length>=300)return json({error:'Maximal 300 eigene Wörter möglich.'},400);
   const id=randomUUID();await store.setJSON('word-'+id,{...clean(input),id});return json({ok:true,id},201);
  }
  if(action==='delete'&&req.method==='POST'){
   const input=await body(req);if(!/^[0-9a-f-]{36}$/i.test(input.id||''))return json({error:'Ungültige Wort-ID.'},400);
   await store.delete('word-'+input.id);return json({ok:true});
  }
  if(action==='import'&&req.method==='POST'){
   const input=await body(req);if(!Array.isArray(input.words)||input.words.length>300||!input.words.every(validate))return json({error:'Ungültige Importdatei.'},400);
   const listing=await store.list({prefix:'word-',paginate:false});if(listing.blobs.length+input.words.length>300)return json({error:'Zusammen maximal 300 Wörter möglich.'},400);
   for(const w of input.words){const id=randomUUID();await store.setJSON('word-'+id,{...clean(w),id})}
   return json({ok:true,imported:input.words.length});
  }
  return json({error:'Unbekannte Funktion.'},404);
 }catch(e){console.error('classroom:',e);return json({error:'Der Server konnte die Anfrage nicht verarbeiten.'},500)}
}
