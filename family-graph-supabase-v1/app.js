let sb, session;
let people=[], photos=[], faces=[], relationships=[];
let currentPhoto=null, selectedFaceId=null, currentRel='mother', graphScale=1;

function setStatus(t){ const el=document.getElementById('saveStatus'); if(el) el.textContent=t; }

async function init(){
  if(!SUPABASE_URL || SUPABASE_URL.includes('PASTE_')){
    alert('Add your Supabase URL and anon key to config.js first.');
    return;
  }
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {data} = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_event,s)=>{session=s; route();});
  route();
}
async function route(){
  if(!session){
    document.getElementById('login').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    return;
  }
  document.getElementById('login').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('status').textContent = 'Signed in as ' + session.user.email;
  await loadAll();
  showPage('photo');
}
async function sendLogin(){
  const email=document.getElementById('emailInput').value.trim();
  if(!email) return alert('Enter email address.');
  const {error}=await sb.auth.signInWithOtp({email, options:{emailRedirectTo: location.href}});
  alert(error ? error.message : 'Check your email for the sign-in link.');
}
async function signOut(){ await sb.auth.signOut(); }

async function loadAll(){
  setStatus('Loading...');
  const [p,ph,f,r]=await Promise.all([
    sb.from('people').select('*').order('created_at'),
    sb.from('photos').select('*').order('created_at',{ascending:false}),
    sb.from('faces').select('*').order('created_at'),
    sb.from('relationships').select('*').order('created_at')
  ]);
  if(p.error||ph.error||f.error||r.error) alert((p.error||ph.error||f.error||r.error).message);
  people=p.data||[]; photos=ph.data||[]; faces=f.data||[]; relationships=r.data||[];
  currentPhoto=photos[0]||null;
  await renderCurrentPhoto();
  updateSide();
  setStatus('Loaded');
}
function showPage(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  document.getElementById(page+'Page').classList.remove('hidden');
  if(page==='photo'){renderCurrentPhoto(); updateSide();}
  if(page==='graph'){renderGraph(); setTimeout(fitGraph,0);}
  if(page==='people'){renderPeople();}
  if(page==='relationships'){renderRelationshipList();}
}
function uid(){return crypto.randomUUID();}
function fullName(p){return p.display_name || [p.given_names,p.family_name].filter(Boolean).join(' ') || 'Unknown';}
function person(id){return people.find(p=>p.id===id);}
function initials(p){return fullName(p).split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();}

/* Photos */
async function uploadPhoto(ev){
  const file=ev.target.files?.[0]; if(!file) return;
  setStatus('Uploading photo...');
  const id=uid();
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase();
  const path=`photos/${id}/original.${ext}`;
  const up=await sb.storage.from(FAMILY_MEDIA_BUCKET).upload(path,file,{upsert:false});
  if(up.error){alert(up.error.message); setStatus('Upload failed'); return;}
  const rec={id,title:file.name,storage_path:path,original_filename:file.name,mime_type:file.type,uploaded_by:session.user.id};
  const ins=await sb.from('photos').insert(rec).select().single();
  if(ins.error){alert(ins.error.message);return;}
  photos.unshift(ins.data); currentPhoto=ins.data; selectedFaceId=null;
  await renderCurrentPhoto(); updateSide(); setStatus('Photo saved');
}
async function useSample(){
  const existing=photos.find(p=>p.storage_path==='sample-photo.jpg');
  if(existing){currentPhoto=existing; await renderCurrentPhoto(); updateSide(); return;}
  // sample is local only until uploaded; use for testing without storage record
  currentPhoto={id:'sample-local',title:'Sample photo',storage_path:'sample-photo.jpg',local:true};
  await renderCurrentPhoto(); updateSide();
}
async function photoUrl(photo){
  if(!photo) return '';
  if(photo.local) return photo.storage_path;
  const {data}=sb.storage.from(FAMILY_MEDIA_BUCKET).getPublicUrl(photo.storage_path);
  return data.publicUrl;
}
async function renderCurrentPhoto(){
  const img=document.getElementById('mainPhoto');
  img.src=currentPhoto ? await photoUrl(currentPhoto) : '';
  const canvas=document.getElementById('photoCanvas');
  canvas.querySelectorAll('.face').forEach(e=>e.remove());
  if(!currentPhoto) return;
  faces.filter(f=>f.photo_id===currentPhoto.id).forEach(f=>canvas.appendChild(faceElement(f)));
}

/* Faces */
function faceElement(f){
  const el=document.createElement('div');
  el.className='face'+(f.person_id?' named':'')+(f.id===selectedFaceId?' selected':'');
  el.style.left=f.x+'px'; el.style.top=f.y+'px'; el.style.width=f.w+'px'; el.style.height=f.h+'px';
  el.innerHTML=`<span>${f.label||'Unnamed'}</span><div class="handle"></div>`;
  el.addEventListener('pointerdown',ev=>startDrag(ev,f.id));
  el.querySelector('.handle').addEventListener('pointerdown',ev=>startResize(ev,f.id));
  el.addEventListener('click',ev=>{ev.stopPropagation();selectedFaceId=f.id;renderCurrentPhoto();renderFaceEditor();});
  return el;
}
async function addFaceBox(){
  if(!currentPhoto) return alert('Upload or choose a photo first.');
  if(currentPhoto.local) return alert('Upload a real photo before saving face boxes to Supabase.');
  const rec={photo_id:currentPhoto.id,x:200,y:160,w:70,h:90,label:'Unnamed',created_by:session.user.id};
  const ins=await sb.from('faces').insert(rec).select().single();
  if(ins.error){alert(ins.error.message);return;}
  faces.push(ins.data); selectedFaceId=ins.data.id; await renderCurrentPhoto(); renderFaceEditor(); updateSide(); setStatus('Face saved');
}
let dragState=null;
function startDrag(ev,id){
  if(ev.target.classList.contains('handle'))return;
  ev.preventDefault();ev.stopPropagation();selectedFaceId=id;
  const f=faces.find(x=>x.id===id);
  dragState={mode:'drag',id,startX:ev.clientX,startY:ev.clientY,x:Number(f.x),y:Number(f.y)};
  ev.currentTarget.setPointerCapture(ev.pointerId);
  window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',endPointer);
  renderCurrentPhoto(); renderFaceEditor();
}
function startResize(ev,id){
  ev.preventDefault();ev.stopPropagation();selectedFaceId=id;
  const f=faces.find(x=>x.id===id);
  dragState={mode:'resize',id,startX:ev.clientX,startY:ev.clientY,w:Number(f.w),h:Number(f.h)};
  ev.currentTarget.parentElement.setPointerCapture(ev.pointerId);
  window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',endPointer);
}
function onPointerMove(ev){
  if(!dragState)return;
  const f=faces.find(x=>x.id===dragState.id); if(!f)return;
  if(dragState.mode==='drag'){f.x=Math.max(0,dragState.x+ev.clientX-dragState.startX);f.y=Math.max(0,dragState.y+ev.clientY-dragState.startY);}
  else{f.w=Math.max(30,dragState.w+ev.clientX-dragState.startX);f.h=Math.max(30,dragState.h+ev.clientY-dragState.startY);}
  const el=document.querySelector('.face.selected');
  if(el){el.style.left=f.x+'px';el.style.top=f.y+'px';el.style.width=f.w+'px';el.style.height=f.h+'px';}
}
async function endPointer(){
  if(dragState){
    const f=faces.find(x=>x.id===dragState.id);
    await sb.from('faces').update({x:f.x,y:f.y,w:f.w,h:f.h}).eq('id',f.id);
    setStatus('Face position saved');
  }
  dragState=null; window.removeEventListener('pointermove',onPointerMove); window.removeEventListener('pointerup',endPointer);
}
async function deleteSelectedFace(){
  if(!selectedFaceId)return;
  const del=await sb.from('faces').delete().eq('id',selectedFaceId);
  if(del.error){alert(del.error.message);return;}
  faces=faces.filter(f=>f.id!==selectedFaceId); selectedFaceId=null; await renderCurrentPhoto(); renderFaceEditor(); updateSide();
}
function renderFaceEditor(){
  const wrap=document.getElementById('faceEditor'), f=faces.find(x=>x.id===selectedFaceId);
  if(!f){wrap.innerHTML='<p>Select or add a face box.</p>';return;}
  const p=f.person_id?person(f.person_id):null;
  wrap.innerHTML=`<div class="row"><label>Name</label><input id="faceName" value="${p?fullName(p):(f.label||'')}" placeholder="Full name or Unknown"></div><button class="primary" onclick="saveFaceName()">Save name</button>`;
}
async function saveFaceName(){
  const f=faces.find(x=>x.id===selectedFaceId), name=document.getElementById('faceName').value.trim();
  if(!f||!name)return;
  let p=people.find(p=>fullName(p).toLowerCase()===name.toLowerCase());
  if(!p){
    const parts=name.split(' ');
    const rec={display_name:name,given_names:parts[0]||name,family_name:parts.slice(1).join(' ')||null,created_by:session.user.id};
    const ins=await sb.from('people').insert(rec).select().single();
    if(ins.error){alert(ins.error.message);return;}
    p=ins.data; people.push(p);
  }
  const upd=await sb.from('faces').update({person_id:p.id,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single();
  if(upd.error){alert(upd.error.message);return;}
  Object.assign(f,upd.data); await renderCurrentPhoto(); renderFaceEditor(); updateSide(); setStatus('Name saved');
}

/* Relationships */
function setRel(type,btn){currentRel=type;document.querySelectorAll('.relationship-buttons button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');previewRelationship();}
function relationshipCandidate(){
  const a=document.getElementById('relA').value,b=document.getElementById('relB').value;
  let type=currentRel,from=a,to=b,label=type;
  if(['mother','father','parent'].includes(type)){type='parent';label=currentRel;}
  else if(type==='child'){type='parent';from=b;to=a;label='parent';}
  else if(type==='partner'){label='partner';}
  else if(type==='sibling'){label='sibling';}
  return{from,to,type,label};
}
function parentsOf(id){return relationships.filter(r=>r.relationship_type==='parent'&&r.to_person_id===id).map(r=>r.from_person_id);}
function isAncestor(ancestor,desc,seen=new Set()){if(seen.has(desc))return false;seen.add(desc);const ps=parentsOf(desc);if(ps.includes(ancestor))return true;return ps.some(p=>isAncestor(ancestor,p,seen));}
function validationFor(c){
  const fatal=[],issues=[];
  if(!c.from||!c.to)fatal.push('Choose two people.');
  if(c.from===c.to)fatal.push('A person cannot be related to themselves.');
  const dup=relationships.some(r=>r.from_person_id===c.from&&r.to_person_id===c.to&&r.relationship_type===c.type);
  const rev=relationships.some(r=>['partner','sibling'].includes(c.type)&&r.relationship_type===c.type&&r.from_person_id===c.to&&r.to_person_id===c.from);
  if(dup||rev)fatal.push('This relationship already exists.');
  if(c.type==='parent'&&isAncestor(c.to,c.from))fatal.push('This would create an ancestor loop.');
  if((c.type==='partner'||c.type==='sibling')&&(isAncestor(c.from,c.to)||isAncestor(c.to,c.from)))fatal.push('This conflicts with a parent/child chain.');
  return{fatal,issues};
}
function previewRelationship(){
  const box=document.getElementById('relationshipWarning'),v=validationFor(relationshipCandidate());
  if(!v.fatal.length&&!v.issues.length){box.classList.add('hidden');return;}
  box.classList.remove('hidden');box.classList.toggle('bad',v.fatal.length>0);box.innerHTML=[...v.fatal,...v.issues].join('<br>');
}
async function saveRelationship(){
  const c=relationshipCandidate(),v=validationFor(c);
  if(v.fatal.length){previewRelationship();return;}
  const rec={from_person_id:c.from,to_person_id:c.to,relationship_type:c.type,label:c.label,source_photo_id:currentPhoto&&!currentPhoto.local?currentPhoto.id:null,created_by:session.user.id};
  const ins=await sb.from('relationships').insert(rec).select().single();
  if(ins.error){alert(ins.error.message);return;}
  relationships.push(ins.data); updateSide(); renderRelationshipList(); setStatus('Relationship saved');
}
async function deleteRelationship(id){
  const del=await sb.from('relationships').delete().eq('id',id);
  if(del.error){alert(del.error.message);return;}
  relationships=relationships.filter(r=>r.id!==id); renderRelationshipList(); updateSide();
}
function relationshipSentence(r){
  const a=person(r.from_person_id),b=person(r.to_person_id); if(!a||!b)return'Missing person';
  if(r.relationship_type==='parent')return`${fullName(a)} is ${r.label||'parent'} of ${fullName(b)}`;
  if(r.relationship_type==='partner')return`${fullName(a)} is partner of ${fullName(b)}`;
  if(r.relationship_type==='sibling')return`${fullName(a)} is sibling of ${fullName(b)}`;
  return `${fullName(a)} → ${fullName(b)}`;
}
function renderRelationshipList(){
  document.getElementById('relationshipList').innerHTML=relationships.map(r=>`<div class="rel-row"><div><strong>${relationshipSentence(r)}</strong></div><button class="danger" onclick="deleteRelationship('${r.id}')">Delete</button></div>`).join('')||'<p>No relationships yet.</p>';
}
function updateSide(){
  document.getElementById('faceCount').textContent=currentPhoto?faces.filter(f=>f.photo_id===currentPhoto.id).length:0;
  document.getElementById('namedCount').textContent=currentPhoto?faces.filter(f=>f.photo_id===currentPhoto.id&&f.person_id).length:0;
  const opts=people.map(p=>`<option value="${p.id}">${fullName(p)}</option>`).join('');
  document.getElementById('relA').innerHTML=opts; document.getElementById('relB').innerHTML=opts;
  renderFaceEditor(); renderRelationshipList(); previewRelationship();
}

/* Graph */
function faceForPerson(id){return faces.find(f=>f.person_id===id);}
async function cropStyle(f,size=92){
  if(!f)return'';
  const ph=photos.find(p=>p.id===f.photo_id); if(!ph)return'';
  const url=await photoUrl(ph);
  const scale=size/Math.max(Number(f.w),Number(f.h));
  const x=-(Number(f.x)*scale)+(size-Number(f.w)*scale)/2;
  const y=-(Number(f.y)*scale)+(size-Number(f.h)*scale)/2;
  return `background-image:url('${url}');background-size:${1200*scale}px auto;background-position:${x}px ${y}px;background-repeat:no-repeat;`;
}
async function photoHtml(p){
  const f=faceForPerson(p.id);
  if(f){return `<div class="node-photo" style="${await cropStyle(f)}"></div>`;}
  return `<div class="node-photo">${initials(p)}</div>`;
}
function parentGroups(){
  const byChild={};
  relationships.filter(r=>r.relationship_type==='parent').forEach(r=>(byChild[r.to_person_id]||=[]).push(r.from_person_id));
  const groups={};
  Object.entries(byChild).forEach(([child,parents])=>{
    const key=parents.slice().sort().join('|');
    if(!groups[key])groups[key]={parents:parents.slice().sort(),children:[]};
    groups[key].children.push(child);
  });
  return Object.values(groups);
}
function generationDepth(id,seen=new Set()){
  if(seen.has(id))return 0;seen.add(id);
  const ps=parentsOf(id); if(!ps.length)return 0;
  return 1+Math.max(...ps.map(p=>generationDepth(p,seen)));
}
function layoutPositions(){
  const pos={},rows={};
  people.forEach(p=>{const d=generationDepth(p.id);(rows[d]||=[]).push(p.id);});
  Object.entries(rows).forEach(([d,ids])=>{
    ids.sort((a,b)=>fullName(person(a)).localeCompare(fullName(person(b))));
    ids.forEach((id,i)=>pos[id]={x:320+i*260,y:170+Number(d)*430});
  });
  relationships.filter(r=>r.relationship_type==='partner').forEach(r=>{
    if(pos[r.from_person_id]&&pos[r.to_person_id]){
      pos[r.to_person_id].y=pos[r.from_person_id].y;
      pos[r.to_person_id].x=pos[r.from_person_id].x+230;
    }
  });
  parentGroups().forEach(g=>{
    const parents=g.parents.filter(id=>pos[id]),kids=g.children.filter(id=>pos[id]);
    if(!parents.length||!kids.length)return;
    const pc=parents.reduce((s,id)=>s+pos[id].x,0)/parents.length;
    const start=pc-((kids.length-1)*260)/2;
    kids.forEach((id,i)=>pos[id].x=start+i*260);
  });
  return pos;
}
async function renderGraph(){
  const g=document.getElementById('graph'); g.innerHTML='<div class="graph-inner" id="graphInner"></div>';
  const inner=document.getElementById('graphInner'),pos=layoutPositions();
  relationships.filter(r=>r.relationship_type==='partner'||r.relationship_type==='sibling').forEach(r=>{
    if(!pos[r.from_person_id]||!pos[r.to_person_id])return;
    const y=pos[r.from_person_id].y+(r.relationship_type==='partner'?78:145);
    drawH(inner,pos[r.from_person_id].x+178,y,pos[r.to_person_id].x-(pos[r.from_person_id].x+178));
    label(inner,pos[r.from_person_id].x+185,y-25,r.relationship_type);
  });
  parentGroups().forEach(group=>{
    const parents=group.parents.filter(id=>pos[id]),children=group.children.filter(id=>pos[id]);
    if(!parents.length||!children.length)return;
    const pc=parents.reduce((s,id)=>s+pos[id].x+89,0)/parents.length;
    const parentBottom=Math.max(...parents.map(id=>pos[id].y+156));
    const childTop=Math.min(...children.map(id=>pos[id].y));
    const busY=(parentBottom+childTop)/2;
    drawV(inner,pc,parentBottom,busY-parentBottom);
    const left=Math.min(...children.map(id=>pos[id].x+89)),right=Math.max(...children.map(id=>pos[id].x+89));
    drawH(inner,left,busY,right-left);
    children.forEach(id=>drawV(inner,pos[id].x+89,busY,pos[id].y-busY));
  });
  for(const p of people){
    const xy=pos[p.id]||{x:100,y:100},e=document.createElement('div');
    e.className='node'; e.style.left=xy.x+'px'; e.style.top=xy.y+'px';
    e.innerHTML=`${await photoHtml(p)}<strong>${fullName(p)}</strong><span class="small">${p.birth_date||''}</span>`;
    inner.appendChild(e);
  }
  applyGraphZoom();
}
function drawH(g,x,y,w){const e=document.createElement('div');e.className='line h';if(w<0){e.style.left=x+w+'px';e.style.width=-w+'px'}else{e.style.left=x+'px';e.style.width=w+'px'}e.style.top=y+'px';g.appendChild(e)}
function drawV(g,x,y,h){const e=document.createElement('div');e.className='line v';e.style.left=x+'px';e.style.top=y+'px';e.style.height=Math.max(0,h)+'px';g.appendChild(e)}
function label(g,x,y,text){const e=document.createElement('div');e.className='rel-label';e.style.left=x+'px';e.style.top=y+'px';e.textContent=text;g.appendChild(e)}
function applyGraphZoom(){const inner=document.getElementById('graphInner');if(inner)inner.style.transform=`scale(${graphScale})`;document.getElementById('zoomLabel').textContent=Math.round(graphScale*100)+'%';}
function zoomGraph(delta){const wrap=document.getElementById('graphWrap');const old=graphScale;const cx=wrap.scrollLeft+wrap.clientWidth/2,cy=wrap.scrollTop+wrap.clientHeight/2;graphScale=Math.max(.25,Math.min(2.2,graphScale+delta));applyGraphZoom();wrap.scrollLeft=(cx/old)*graphScale-wrap.clientWidth/2;wrap.scrollTop=(cy/old)*graphScale-wrap.clientHeight/2;}
function resetGraphZoom(){graphScale=1;applyGraphZoom();}
function fitGraph(){const wrap=document.getElementById('graphWrap');graphScale=.72;applyGraphZoom();wrap.scrollLeft=120;wrap.scrollTop=80;}

async function addUnknownPerson(){
  const name=prompt('Name, or leave blank for Unknown');
  const rec={display_name:name||'Unknown person',given_names:name||'Unknown',created_by:session.user.id};
  const ins=await sb.from('people').insert(rec).select().single();
  if(ins.error){alert(ins.error.message);return;}
  people.push(ins.data); renderPeople(); updateSide();
}
async function renderPeople(){
  const list=document.getElementById('peopleList');
  let html='';
  for(const p of people){
    html += `<div class="people-card">${await photoHtml(p)}<strong>${fullName(p)}</strong><p>${p.birth_date||'No dates yet'}</p></div>`;
  }
  list.innerHTML=html||'<p>No people yet.</p>';
}
init();
