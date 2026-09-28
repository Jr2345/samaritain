'use strict';
// SYMBIOSE — backend. Node 18+, aucune dépendance. Lancer : node server.js
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000,DIR=process.env.DATA_DIR||path.join(__dirname,'data'),TZ=process.env.TZ||'Africa/Douala';
fs.mkdirSync(path.join(DIR,'img'),{recursive:true});
const F=path.join(DIR,'data.json'),SF=path.join(DIR,'secret');
const SECRET=process.env.SECRET||(fs.existsSync(SF)?fs.readFileSync(SF,'utf8'):(s=>(fs.writeFileSync(SF,s,{mode:0o600}),s))(crypto.randomBytes(32).toString('hex')));
const hash=(p,s)=>crypto.scryptSync(String(p),s,32).toString('hex');
const mkUser=(u,name,role,emp,pin,at,must)=>{const salt=crypto.randomBytes(8).toString('hex');return{u,name,role,emp,at,must:!!must,salt,h:hash(pin,salt)}};
const wall=()=>new Date(new Date().toLocaleString('en-US',{timeZone:TZ}));
const hm=()=>{const d=wall();return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};
const today=()=>Math.min((wall().getDay()+6)%7,5);
const week=()=>{const d=wall(),t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));t.setUTCDate(t.getUTCDate()+4-(t.getUTCDay()||7));const y=t.getUTCFullYear();return y+'-S'+String(Math.ceil(((t-Date.UTC(y,0,1))/864e5+1)/7)).padStart(2,'0')};
const save=()=>{fs.writeFileSync(F+'.tmp',JSON.stringify(S));fs.renameSync(F+'.tmp',F)};
let S;
if(fs.existsSync(F))S=JSON.parse(fs.readFileSync(F,'utf8'));else{
  S={n:100,emps:[],users:[mkUser(process.env.ADMIN_USER||'bonheur','Administrateur','admin',undefined,process.env.ADMIN_PASSWORD||'pemesso237',null,false)],projects:[],tasks:[],msgs:[],log:[],evals:[]};save();
  console.log('Compte administrateur créé (identifiant : bonheur).');
}
S.evals=S.evals||[];S.kaizen=S.kaizen||[];
const sign=s=>crypto.createHmac('sha256',SECRET).update(s).digest('hex');
const mkTok=u=>{const b=u+'.'+(Date.now()+12*36e5);return b+'.'+sign(b)};
function auth(req){const t=(req.headers.authorization||'').slice(7),i=t.lastIndexOf('.');if(i<0)return;
  const b=t.slice(0,i),g=t.slice(i+1),ok=sign(b);if(g.length!=ok.length||!crypto.timingSafeEqual(Buffer.from(g),Buffer.from(ok)))return;
  const[u,exp]=b.split('.');if(+exp<Date.now())return;return S.users.find(x=>x.u==u)}
const err=(c,m)=>Object.assign(new Error(m),{c});
const need=o=>{if(!o)throw err(403,'Action non autorisée')};
const all=me=>me.role=='dir'||me.role=='admin';
const P=(id,me)=>{const p=S.projects.find(p=>p.id==id);if(!p||!(all(me)||p.at==me.at))throw err(404,'Projet introuvable');return p};
const T=(id,me)=>{const t=S.tasks.find(t=>t.id==id);if(!t)throw err(404,'Tâche introuvable');P(t.pid,me);return t};
const uid=()=>++S.n,str=(v,n)=>String(v??'').trim().slice(0,n),okPw=p=>typeof p=='string'&&p.length>=8&&p.length<=64;
const slug=s=>String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');
const fails={};
function login(ip,b){const f=fails[ip]||(fails[ip]={n:0,t:Date.now()});if(Date.now()-f.t>6e5){f.n=0;f.t=Date.now()}
  if(f.n>=10)throw err(429,"Trop d'essais. Réessayez dans 10 minutes.");
  const u=S.users.find(x=>x.u==str(b.u,40).toLowerCase());
  const ok=u&&crypto.timingSafeEqual(Buffer.from(hash(b.pw,u.salt)),Buffer.from(u.h));
  if(!ok){f.n++;throw err(401,'Identifiant ou mot de passe incorrect')}return{token:mkTok(u.u)}}
function pause(t){if(t.startedAt){t.spent=(t.spent||0)+(Date.now()-t.startedAt);t.startedAt=null}}
function act(t,b,me){const chef=me.role=='chef',own=me.role=='emp'&&t.emp==me.emp,a=b.a,x=str(b.x,300),n=me.name.split(' ')[0];
  const av=S.tasks.filter(o=>o.pid==t.pid&&o.ord<t.ord).every(o=>o.st=='validated');
  const L=s=>S.log.push({pid:t.pid,t:hm(),text:s}),st=(...a)=>{if(!a.includes(t.st))throw err(409,'Statut déjà modifié : la page va se rafraîchir')};
  if(['start','resume','finish','block'].includes(a))need(own||chef);
  if(a=='start'){st('todo','correction');if(!av)throw err(409,"La tâche précédente n'est pas validée");t.st='doing';t.startedAt=Date.now();L(`${n} commence « ${t.title} »`)}
  else if(a=='resume'){st('waiting');t.st='doing';t.why='';t.startedAt=Date.now();L(`${n} reprend « ${t.title} »`)}
  else if(a=='finish'){st('doing');pause(t);t.realH=+((t.spent||0)/36e5).toFixed(2);t.ok=today()<=t.d;t.st=t.qc?'review':'validated';L(`${n} termine « ${t.title} » — ${t.realH} h réelles (prévu ${t.h} h)`+(t.qc?' — à contrôler':''))}
  else if(a=='block'){st('doing');pause(t);t.st='waiting';t.why=x;L(`⚠️ Blocage sur « ${t.title} » : ${x}`)}
  else if(a=='ok'||a=='corr'){need(me.role=='qc'||chef);st('review');
    if(a=='ok'){t.st='validated';L(`${n} valide « ${t.title} »`)}else{t.st='correction';t.c++;t.why=x||'À reprendre';t.spent=0;t.startedAt=null;L(`${n} demande une correction sur « ${t.title} » : ${t.why}`)}}
  else throw err(400,'Action inconnue')}
function set(t,b){const k=b.k,v=b.v;
  if(k=='emp'){const eid=v===''||v==null?null:+v;if(eid){const p=S.projects.find(x=>x.id==t.pid),e=S.emps.find(e=>e.id==eid);
      if(!e)throw err(400,'Employé inconnu');if(e.at!=p.at)throw err(403,"Cet employé n'appartient pas à cet atelier")}
    t.emp=eid}
  else if(k=='d'){if(!(+v>=0&&+v<=5))throw err(400,'Jour invalide');t.d=+v}
  else if(k=='h'){if(!(+v>0&&+v<=24))throw err(400,'Durée invalide');t.h=+v}
  else if(k=='prio'){if(![1,2,3].includes(+v))throw err(400,'Priorité invalide');t.prio=+v}
  else if(k=='qc')t.qc=!!v;else if(k=='note')t.note=str(v,500);else throw err(400,'Champ inconnu')}
const newTask=(pid,ord,title,prio,skill,qc)=>({id:uid(),pid,ord,title,emp:null,d:today(),h:2,prio,st:'todo',qc:!!qc,skill:str(skill,30),note:'',c:0,why:'',ok:null,spent:0,startedAt:null,realH:null});
const CR=['Respect des délais','Qualité','Respect des consignes','Ponctualité',"Esprit d'équipe",'Utilisation du matériel'];
function state(me){const adm=me.role=='admin',vp=adm?[]:S.projects.filter(p=>all(me)||p.at==me.at),ids=new Set(vp.map(p=>p.id)),ve=adm?[]:S.emps.filter(e=>all(me)||e.at==me.at);
  const evs=me.role=='chef'?S.evals.filter(v=>ve.some(e=>e.id==v.emp)):me.role=='dir'?S.evals:me.emp?S.evals.filter(v=>v.emp==me.emp):[];
  const us=adm?S.users.filter(u=>u.role!='admin'):me.role=='chef'?S.users.filter(u=>u.at==me.at&&['emp','qc'].includes(u.role)):[];
  const kz=adm?[]:S.kaizen.filter(k=>all(me)||k.at==me.at);
  return{me:{role:me.role,emp:me.emp,name:me.name,at:me.at,must:me.must},week:week(),emps:ve,projects:vp,tasks:S.tasks.filter(t=>ids.has(t.pid)),msgs:S.msgs.filter(m=>ids.has(m.pid)).slice(-500),log:S.log.filter(l=>ids.has(l.pid)).slice(-1000),evals:evs,kaizen:kz,users:us.map(u=>({u:u.u,name:u.name,role:u.role,at:u.at}))}}
function saveImg(d){if(typeof d!='string'||d.length>2.8e6)throw err(400,'Image trop lourde');const m=/^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/.exec(d);if(!m)throw err(400,'Image JPEG requise');
  const buf=Buffer.from(m[1],'base64');if(buf[0]!=0xFF||buf[1]!=0xD8)throw err(400,'Image invalide');const id=crypto.randomBytes(16).toString('hex');fs.writeFileSync(path.join(DIR,'img',id+'.jpg'),buf);return'/img/'+id}
function route(m,url,b,me,ip){let r;
  if(m=='POST'&&url=='/api/login')return login(ip,b);
  if(!me)throw err(401,'Connexion requise');
  if(me.must&&url!='/api/password'&&url!='/api/state')throw err(403,'Changez votre mot de passe provisoire pour continuer');
  if(m=='GET'&&url=='/api/state')return state(me);
  if(m!='POST')throw err(404,'Introuvable');
  const chef=me.role=='chef';
  if(r=url.match(/^\/api\/task\/(\d+)\/act$/))act(T(r[1],me),b,me);
  else if(r=url.match(/^\/api\/task\/(\d+)\/set$/)){need(chef);set(T(r[1],me),b)}
  else if(r=url.match(/^\/api\/project\/(\d+)\/task$/)){need(chef);const p=P(r[1],me),o=S.tasks.filter(t=>t.pid==p.id).reduce((a,t)=>Math.max(a,t.ord),0);
    if(!str(b.title,120))throw err(400,'Titre requis');S.tasks.push(newTask(p.id,o+1,str(b.title,120),p.prio,b.skill))}
  else if(r=url.match(/^\/api\/project\/(\d+)\/msg$/)){need(['chef','emp','qc'].includes(me.role));const p=P(r[1],me),text=str(b.text,500);let img,tid;
    if(b.tid){const t=T(b.tid,me);need(t.pid==p.id&&(chef||me.role=='qc'||(me.role=='emp'&&t.emp==me.emp)));tid=t.id}
    if(b.img)img=saveImg(b.img);if(!text&&!img)throw err(400,'Message vide');
    S.msgs.push({pid:p.id,who:me.name.split(' ')[0],text:text||'📷 Photo',t:hm(),img,tid})}
  else if(url=='/api/project'){need(chef);if(!str(b.name,80))throw err(400,'Nom requis');const id=uid(),pr=[1,2,3].includes(+b.prio)?+b.prio:1;
    S.projects.push({id,at:me.at,name:str(b.name,80),client:str(b.client,80),type:str(b.type,80),prio:pr,due:Math.min(5,Math.max(0,+b.due||0)),why:str(b.why,200)});
    String(b.steps||'').split('\n').map(s=>str(s,120)).filter(Boolean).slice(0,40).forEach((s,i)=>S.tasks.push(newTask(id,i+1,s,pr,'',/contr/i.test(s))));S.log.push({pid:id,t:hm(),text:`Projet créé par ${me.name}`});save();return{id}}
  else if(url=='/api/users'){need(chef||me.role=='admin');const adm=me.role=='admin',name=str(b.name,40),u=slug(str(b.login,30)||name),role=b.role,pw=String(b.pw||'');
    if(!adm&&role!='emp'&&role!='qc')throw err(403,"Seul l'administrateur peut créer ce type de compte");
    if(!u||!(adm?['chef','dir','emp','qc']:['emp','qc']).includes(role)||!okPw(pw))throw err(400,'Nom, rôle et mot de passe provisoire (8 caractères minimum) requis');
    if(S.users.some(x=>x.u==u))throw err(409,'Cet identifiant existe déjà : précisez-en un autre');
    let at=me.at,emp;if(adm)at=role=='dir'?null:slug(str(b.atelier,40));
    if(adm&&role!='dir'){if(!at)throw err(400,"Nom de l'atelier requis");if(role!='chef'&&!S.users.some(x=>x.role=='chef'&&x.at==at))throw err(400,"Atelier inconnu : créez d'abord son chef d'atelier")}
    if(role=='emp'||role=='qc'){const sk={};String(b.sk||'').split(',').forEach(s=>{const[k,v]=s.split(':');if(k&&+v>=1&&+v<=5)sk[str(k,30)]=+v});emp=uid();S.emps.push({id:emp,name,poste:str(b.poste,60),sk,at})}
    S.users.push(mkUser(u,name,role,emp,pw,at,true));save();return{u}}
  else if(url=='/api/users/reset'){const u=S.users.find(x=>x.u==b.u);need(u&&okPw(b.pw)&&((me.role=='admin'&&u.role!='admin')||(chef&&u.at==me.at&&['emp','qc'].includes(u.role))));u.salt=crypto.randomBytes(8).toString('hex');u.h=hash(b.pw,u.salt);u.must=true}
  else if(url=='/api/eval'){need(chef);const e=S.emps.find(e=>e.id==b.emp&&e.at==me.at);if(!e)throw err(404,'Employé introuvable');
    if(!str(b.comment,500))throw err(400,'Ajoutez un commentaire : une note seule ne suffit pas');
    const notes={};for(const c of CR){const v=+(b.notes||{})[c];if(!(v>=0&&v<=10))throw err(400,'Notes de 0 à 10');notes[c]=v}
    const w=week(),i=S.evals.findIndex(v=>v.emp==e.id&&v.week==w),ev={id:i>=0?S.evals[i].id:uid(),emp:e.id,week:w,by:me.name,notes,comment:str(b.comment,500),t:hm()};i>=0?S.evals[i]=ev:S.evals.push(ev)}
  else if(url=='/api/kaizen'){need(chef||me.role=='dir');
    const problem=str(b.problem,200);if(!problem)throw err(400,'Décrivez le problème observé');
    let at,pid=null;
    if(b.pid){const p=P(+b.pid,me);pid=p.id;at=p.at}
    else if(chef)at=me.at;
    else{at=slug(str(b.atelier,40));if(!at||!S.users.some(x=>x.role=='chef'&&x.at==at))throw err(400,"Choisissez un atelier existant, ou liez la fiche à un projet")}
    const status=['test','adopted','rejected'].includes(b.status)?b.status:'test';
    const fields={at,pid,problem,cause:str(b.cause,200),action:str(b.action,300),owner:str(b.owner,60),impact:str(b.impact,200),status,by:me.name,t:hm()};
    if(b.id){const i=S.kaizen.findIndex(k=>k.id==+b.id&&k.at==at);if(i<0)throw err(404,'Fiche introuvable');S.kaizen[i]={...S.kaizen[i],...fields}}
    else S.kaizen.push({id:uid(),...fields})}
  else if(url=='/api/password'){if(!okPw(b.new))throw err(400,'Mot de passe de 8 caractères minimum');
    if(hash(b.old,me.salt)!==me.h)throw err(403,'Ancien mot de passe incorrect');me.salt=crypto.randomBytes(8).toString('hex');me.h=hash(b.new,me.salt);me.must=false}
  else throw err(404,'Introuvable');
  save();return{ok:1}}
http.createServer((req,res)=>{
  const url=req.url.split('?')[0],send=(c,o)=>{res.writeHead(c,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(o))};
  if(req.method=='GET'&&(url=='/'||url=='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com"});return fs.createReadStream(path.join(__dirname,'public','index.html')).pipe(res)}
  const im=url.match(/^\/img\/([a-f0-9]{32})$/),fp=im&&path.join(DIR,'img',im[1]+'.jpg');
  if(req.method=='GET'&&im&&fs.existsSync(fp)){res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});return fs.createReadStream(fp).pipe(res)}
  if(!url.startsWith('/api/'))return send(404,{error:'Introuvable'});
  let raw='';req.on('data',c=>{raw+=c;if(raw.length>3e6)req.destroy()});
  req.on('end',()=>{try{send(200,route(req.method,url,raw?JSON.parse(raw):{},auth(req),req.socket.remoteAddress))}catch(e){if(!e.c)console.error(e);send(e.c||(e instanceof SyntaxError?400:500),{error:e.c?e.message:'Requête invalide'})}});
}).listen(PORT,()=>console.log(`SYMBIOSE → http://localhost:${PORT}`));
