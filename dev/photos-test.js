// Fake but deliberately messy photo archive, with an in-memory stand-in for Supabase that
// copies the real schema's cascade rules (deleting a photo deletes its faces, comments and
// suggestions; deleting a face deletes its suggestions), so a merge that loses data shows up here.
//
//  beach-1  original upload: Julian, Andrew, an unnamed box, 4 boxes total
//  beach-2  exact copy (same bytes) uploaded later: Andrew again, Paul on the box that's unnamed
//           on beach-1, Jean on a box beach-1 doesn't have, an unnamed copy of Julian's box
//  beach-3  resized copy (WhatsApp): Julian again, "Rachel" on Andrew's box (a real conflict),
//           a comment, a suggestion on the Julian box, and Julian's preferred avatar face
//  beach-4  the same scene rotated: NOT matched (documented limitation)
//  garden   crowded: 9 overlapping boxes, some by another account, one legacy screen-pixel box
//  kitchen-1/2  two exact copies with no faces; only one is dated, only the other has a place
import { S, applyTheme, setClasses } from '../js/state.js';

// ---------- fake images ----------
function scene(w,h,{rotate=false,seed=1}={}){
  const c=document.createElement('canvas'); c.width=rotate?h:w; c.height=rotate?w:h; const x=c.getContext('2d');
  if(rotate){x.translate(h,0); x.rotate(Math.PI/2)}
  const g=x.createLinearGradient(0,0,0,h); g.addColorStop(0,seed===1?'#6ab7ff':'#9bd27a'); g.addColorStop(1,seed===1?'#e8d49a':'#3d6b2a'); x.fillStyle=g; x.fillRect(0,0,w,h);
  const heads=seed===1?[[.18,.35],[.4,.3],[.6,.38],[.8,.33]]:seed===2?[[.1,.4],[.2,.42],[.3,.38],[.4,.41],[.5,.4],[.6,.43],[.7,.39],[.8,.41],[.9,.4]]:[[.5,.5]];
  heads.forEach(([hx,hy],i)=>{x.fillStyle=['#f1c27d','#e0ac69','#c68642','#8d5524'][i%4]; x.beginPath(); x.arc(hx*w,hy*h,h*.08,0,7); x.fill(); x.fillStyle='#234'; x.fillRect(hx*w-h*.08,hy*h+h*.09,h*.16,h*.3)});
  x.fillStyle='#fff'; x.font=`${Math.round(h*.05)}px sans-serif`; x.fillText(seed===1?'Beach 1995':seed===2?'Garden party':'Kitchen',w*.04,h*.95);
  return c;
}
const toBlob=(c,type='image/png',q)=>new Promise(r=>c.toBlob(r,type,q));
const beach=await toBlob(scene(1200,800)), beachSmall=await toBlob(scene(600,400),'image/jpeg',.8), beachRot=await toBlob(scene(1200,800,{rotate:true}));
const garden=await toBlob(scene(1400,700,{seed:2})), kitchen=await toBlob(scene(900,900,{seed:3}));
const fresh=await toBlob(scene(1000,700,{seed:2,rotate:false}).getContext('2d').canvas,'image/jpeg',.5);
const urls={}; const store=(path,blob)=>{urls[path]=URL.createObjectURL(blob)};

// ---------- fake database ----------
const ME='u-julian', ANDREW='u-andrew';
const db={people:[],photos:[],faces:[],relationships:[],comments:[],suggestions:[],feedback:[],profiles:[],sources:[]};
const P=(id,display_name)=>db.people.push({id,display_name,created_at:'2026-01-01'});
P('julian','Julian Canterbury'); P('andrew','Andrew Canterbury'); P('paul','Paul Canterbury'); P('jean','Jean Canterbury'); P('rachel','Rachel Canterbury'); P('sophie','Sophie Canterbury');
const photo=(id,blob,w,h,extra={})=>{const path=`photos/${id}/original.png`; store(path,blob); db.photos.push({id,storage_path:path,original_filename:'IMG_1995.png',width:w,height:h,uploaded_by:ME,private:false,created_at:'2026-10-01',...extra})};
photo('beach-1',beach,1200,800,{created_at:'2026-10-01',taken_date:'1995'});
photo('beach-2',beach,1200,800,{created_at:'2026-10-20',uploaded_by:ANDREW,location:'Bondi'});
photo('beach-3',beachSmall,600,400,{created_at:'2026-10-25',uploaded_by:ANDREW,original_filename:'WhatsApp Image.jpeg'});
photo('beach-4',beachRot,800,1200,{created_at:'2026-10-26'});
photo('garden',garden,1400,700,{created_at:'2026-09-01',taken_date:'2001'});
photo('kitchen-1',kitchen,900,900,{created_at:'2026-08-01',taken_date:'1988'});
photo('kitchen-2',kitchen,900,900,{created_at:'2026-08-02',location:'Grandma\'s house'});
let n=0; const F=(photo_id,x,y,w,h,person_id=null,extra={})=>{const p=db.people.find(p=>p.id===person_id); const f={id:`f${++n}-${photo_id}`,photo_id,x,y,w,h,person_id,label:p?p.display_name:null,status:person_id?'confirmed':'detected',created_by:ME,created_at:`2026-10-0${1+n%9}`,locked:false,...extra}; db.faces.push(f); return f};
// head boxes (fractions) for the beach scene
const A=[.11,.22,.14,.22], B=[.33,.17,.14,.22], C=[.53,.25,.14,.22], D=[.73,.2,.14,.22];
F('beach-1',...A,'julian'); F('beach-1',...B,'andrew'); F('beach-1',...C);
F('beach-2',...B,'andrew',{created_by:ANDREW}); F('beach-2',C[0]+.01,C[1],C[2],C[3],'paul',{created_by:ANDREW}); F('beach-2',...D,'jean',{created_by:ANDREW}); F('beach-2',A[0]+.005,A[1]+.005,A[2],A[3],null,{created_by:ANDREW});
const j3=F('beach-3',A[0]+.03,A[1]+.04,A[2]*.9,A[3]*.9,'julian',{created_by:ANDREW}); F('beach-3',...B,'rachel',{created_by:ANDREW});
F('beach-4',.2,.1,.2,.14,'sophie');
for(let i=0;i<9;i++)F('garden',.04+i*.1,.26+(i%2)*.03,.13,.3,i===2?'andrew':i===5?'jean':null,{created_by:i%3===0?ANDREW:ME});
F('garden',60,40,70,90,'paul'); // legacy screen-pixel box
db.people.find(p=>p.id==='julian').preferred_face_id=j3.id;
db.comments.push({id:'c1',photo_id:'beach-3',body:'This is Bondi, summer 1995',author_name:'Andrew',created_at:'2026-10-26'});
db.suggestions.push({id:'s1',type:'photo_face_suggestion',photo_id:'beach-3',face_id:j3.id,body:'Julian looks about 10 here',author_name:'Andrew',status:'open',created_at:'2026-10-26'});
db.relationships.push({id:'r1',from_person_id:'paul',to_person_id:'julian',relationship_type:'parent',source_photo_id:'beach-2'});
db.profiles.push({user_id:ME,email:'julian@example.test',role:'owner'},{user_id:ANDREW,email:'andrew@example.test',role:'editor'});

// ---------- fake Supabase client ----------
const NEW_COLS={photos:['content_hash','phash'],faces:['locked']};
const clone=v=>JSON.parse(JSON.stringify(v));
const ops=[]; window.H={db,ops,migrated:true};
function cascadeDelete(table,rows){
  const ids=new Set(rows.map(r=>r.id));
  if(table==='photos'){for(const t of ['faces','comments','suggestions']){const gone=db[t].filter(r=>ids.has(r.photo_id)); if(gone.length)cascadeDelete(t,gone); db[t]=db[t].filter(r=>!ids.has(r.photo_id))} db.relationships.forEach(r=>{if(ids.has(r.source_photo_id))r.source_photo_id=null})}
  if(table==='faces'){db.suggestions=db.suggestions.filter(s=>!ids.has(s.face_id)); db.people.forEach(p=>{if(ids.has(p.preferred_face_id))p.preferred_face_id=null})}
}
class Q{
  constructor(t){this.t=t;this.op='select';this.f=[];this.cols=[]}
  select(){if(this.op==='select')this.op='select'; this.ret=true; return this}
  insert(p){this.op='insert';this.p=p;return this} update(p){this.op='update';this.p=p;return this} delete(){this.op='delete';return this}
  eq(c,v){this.cols.push(c);this.f.push(r=>r[c]===v);return this} in(c,v){this.cols.push(c);this.f.push(r=>v.includes(r[c]));return this}
  ilike(c,v){this.f.push(r=>String(r[c]||'').toLowerCase()===String(v).toLowerCase());return this}
  order(){return this} limit(n){this.lim=n;return this} single(){this.one=true;return this} maybeSingle(){this.maybe=true;return this}
  then(a,b){return Promise.resolve().then(()=>this.run()).then(a,b)}
  run(){
    const rows=db[this.t]||(db[this.t]=[]);
    const touched=[...Object.keys(this.op==='insert'?[].concat(this.p)[0]||{}:this.p||{}),...this.cols];
    if(!window.H.migrated){const bad=touched.find(c=>(NEW_COLS[this.t]||[]).includes(c)); if(bad)return{data:null,error:{code:'PGRST204',message:`Could not find the '${bad}' column of '${this.t}' in the schema cache`}}}
    ops.push(`${this.op} ${this.t}`);
    let out;
    if(this.op==='insert'){out=[].concat(this.p).map(r=>({id:crypto.randomUUID(),created_at:new Date().toISOString(),...(this.t==='faces'?{locked:false}:{}),...clone(r)})); rows.push(...out)}
    else{
      out=rows.filter(r=>this.f.every(fn=>fn(r)));
      if(this.op==='update')out.forEach(r=>Object.assign(r,clone(this.p)));
      if(this.op==='delete'){cascadeDelete(this.t,out); db[this.t]=rows.filter(r=>!out.includes(r))}
    }
    if(this.lim)out=out.slice(0,this.lim);
    out=clone(out);
    if(this.one)return out.length===1?{data:out[0],error:null}:{data:null,error:{message:`expected one row, got ${out.length}`}};
    if(this.maybe)return{data:out[0]||null,error:null};
    return{data:out,error:null};
  }
}
S.sb={from:t=>new Q(t),rpc:async()=>({data:false}),storage:{from:()=>({
  getPublicUrl:p=>({data:{publicUrl:urls[p]||''}}),
  upload:async(p,blob)=>{store(p,blob); ops.push('storage upload'); return{error:null}},
  remove:async ps=>{ps.forEach(p=>delete urls[p]); ops.push(`storage remove ${ps.length}`); return{error:null}},
})}};
S.session={user:{id:ME,email:'julian@example.test'}};
const reload=()=>{S.people=clone(db.people);S.photos=clone(db.photos).sort((a,b)=>b.created_at.localeCompare(a.created_at));S.faces=clone(db.faces);S.relationships=clone(db.relationships);S.comments=clone(db.comments);S.suggestions=clone(db.suggestions);S.profiles=clone(db.profiles)};
reload(); S.showEveryone=true;
// Dialogs are logged instead of blocking the page; confirm() answers H.confirmAnswer.
window.H.dialogs=[]; window.H.confirmAnswer=true;
window.alert=m=>{window.H.dialogs.push(['alert',m]); console.log('[alert]',m)};
window.confirm=m=>{window.H.dialogs.push(['confirm',m]); console.log('[confirm]',m); return window.H.confirmAnswer};

// ---------- mount the real Photos page ----------
const index=new DOMParser().parseFromString(await (await fetch('../index.html')).text(),'text/html');
const page=index.getElementById('photoPage'); page.classList.remove('hidden'); document.body.append(page);
// The real loadAll() runs against the fake client too (the merge tool calls it afterwards).
const photos=await import('../js/photos.js');
const dedupe=await import('../js/dedupe.js');
const { setEditMode }=await import('../js/navigation.js');
photos.bindPhotos(); dedupe.bindDedupe(); applyTheme('ocean');
const setRole=r=>{S.profile={user_id:ME,person_id:'julian',role:r}; setClasses(); if(!['owner','editor','contributor'].includes(r))setEditMode(false); photos.renderPhotoPage()};
document.getElementById('hRole').addEventListener('change',e=>setRole(e.target.value));
document.getElementById('hEdit').addEventListener('change',e=>{setEditMode(e.target.checked); photos.renderPhotoPage()});
document.getElementById('hMigrated').addEventListener('change',e=>{window.H.migrated=e.target.checked});
document.getElementById('hDupes').addEventListener('click',()=>dedupe.openDedupe());
const up=(blob,name)=>photos.uploadPhotoFile(new File([blob],name,{type:blob.type}));
document.getElementById('hUpExact').addEventListener('click',()=>up(beach,'IMG_1995.png'));
document.getElementById('hUpResized').addEventListener('click',()=>up(beachSmall,'copy.jpeg'));
document.getElementById('hUpNew').addEventListener('click',()=>up(fresh,'new.jpeg'));
S.profile={user_id:ME,person_id:'julian',role:'owner'}; setClasses(); setEditMode(false);
const want=location.hash.startsWith('#photo/')?decodeURIComponent(location.hash.slice(7)):'beach-1';
await photos.selectPhoto(want);
setInterval(()=>{document.getElementById('harnessLog').textContent=`${db.photos.length} photos · ${db.faces.length} faces · ${ops.length} db ops · last dialog: ${(window.H.dialogs.at(-1)?.[1]||'—').slice(0,80)}`},500);
window.S=S; Object.assign(window.H,{photos,dedupe,reload,setRole,up,blobs:{beach,beachSmall,beachRot,fresh}});
