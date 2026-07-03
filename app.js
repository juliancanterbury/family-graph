'use strict';

let sb=null, session=null, currentProfile=null;
let people=[], photos=[], faces=[], relationships=[], suggestions=[], comments=[], feedback=[];
let currentPhoto=null, selectedFaceId=null, selectedPersonId=null, currentRel='mother';
let editMode=false, showFaceBoxes=true, showFaceNames=true, graphScale=1;
let currentTheme=localStorage.getItem('familyGraphTheme')||'ocean';
let currentDbTab='people', selectedDbId=null, treeMode='family', treeFocusId='';
let humanDetector=null, humanReadyPromise=null, assistantTimer=null;
const REDIRECT_URL='https://juliancanterbury.github.io/family-graph/';
const MEDIA_BUCKET=()=>typeof FAMILY_MEDIA_BUCKET!=='undefined'?FAMILY_MEDIA_BUCKET:'family-media';

function el(id){return document.getElementById(id)}
function show(id){el(id)?.classList.remove('hidden')}
function hide(id){el(id)?.classList.add('hidden')}
function safeText(id,v){const x=el(id); if(x)x.textContent=v??''}
function safeHTML(id,v){const x=el(id); if(x)x.innerHTML=v??''}
function setStatus(t){safeText('saveStatus',t)}
function uid(){return crypto.randomUUID()}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function titleCaseName(v){return String(v||'').replace(/\s+/g,' ').trim().split(' ').map(part=>part.split('-').map(piece=>piece?piece[0].toUpperCase()+piece.slice(1).toLowerCase():piece).join('-')).join(' ')}
function fullName(p){return p?.display_name || [p?.given_names,p?.family_name].filter(Boolean).join(' ') || 'Unknown'}
function person(id){return people.find(p=>p.id===id)}
function initials(p){return fullName(p).split(' ').filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'?'}
function isRealPerson(p){const n=fullName(p).trim().toLowerCase();return !!p&&n&&!['unknown','unknown person','unnamed','unnamed person'].includes(n)}
function visiblePeople(){return people.filter(isRealPerson).sort((a,b)=>fullName(a).localeCompare(fullName(b)))}
function role(){return (currentProfile?.role||'viewer').toLowerCase()}
function isOwner(){return role()==='owner'}
function canEdit(){return ['owner','editor','family editor','contributor'].includes(role())}
function canDelete(){return isOwner()}
function canAdmin(){return ['owner','editor','family editor'].includes(role())}
function userName(){return currentProfile?.display_name||session?.user?.email||'Someone'}
function currentUserId(){return session?.user?.id||'local'}
function setModeClasses(){document.body.classList.toggle('can-edit',canEdit());document.body.classList.toggle('can-delete',canDelete());document.body.classList.toggle('edit-mode',editMode);document.body.classList.toggle('can-admin',canAdmin())}
function localKey(name){return 'familyGraph:'+name}
function loadLocal(name){try{return JSON.parse(localStorage.getItem(localKey(name))||'[]')}catch(e){return []}}
function saveLocal(name,data){localStorage.setItem(localKey(name),JSON.stringify(data))}
function profilePersonId(){return currentProfile?.person_id||localStorage.getItem('familyGraph:profilePersonId')||null}
function setActiveNav(page){document.querySelectorAll('nav button[data-page]').forEach(b=>b.classList.toggle('primary',b.dataset.page===page))}

async function optionalTable(name){try{const r=await sb.from(name).select('*').order('created_at',{ascending:false}); if(r.error)throw r.error; return r.data||[]}catch(e){return loadLocal(name)}}
async function addOptional(name,row){row.id=row.id||uid(); row.created_at=row.created_at||new Date().toISOString(); try{const r=await sb.from(name).insert(row).select().single(); if(!r.error)return r.data}catch(e){} const data=loadLocal(name); data.unshift(row); saveLocal(name,data); return row}
async function updateOptional(name,id,patch){try{const r=await sb.from(name).update(patch).eq('id',id).select().single(); if(!r.error)return r.data}catch(e){} const data=loadLocal(name).map(x=>x.id===id?Object.assign({},x,patch):x); saveLocal(name,data); return data.find(x=>x.id===id)}

function problem(msg){hide('loading');hide('login');hide('app');show('problem');safeText('problemText',msg)}
async function boot(){try{applyTheme(currentTheme); hide('login');hide('app');hide('problem');show('loading'); if(typeof SUPABASE_URL==='undefined'||typeof SUPABASE_ANON_KEY==='undefined'||SUPABASE_URL.includes('PASTE_'))return problem('config.js is missing or still contains placeholder values.'); sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY); const res=await sb.auth.getSession(); session=res.data.session; sb.auth.onAuthStateChange((_e,s)=>{session=s;route()}); await route()}catch(e){console.error(e);problem(e.message)}}
async function route(){if(!session){hide('loading');hide('app');hide('problem');show('login');return} hide('loading');hide('login');hide('problem');show('app'); await ensureProfile(); await loadAll(); const start=(location.hash||'#dashboard').replace('#','')||'dashboard'; showPage(start)}
async function sendLogin(){const email=el('emailInput')?.value.trim(); if(!email)return alert('Enter email address.'); const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:REDIRECT_URL}}); safeText('loginMessage',error?error.message:'Check your email for the sign-in link.')}
async function signOut(){await sb.auth.signOut()}
async function ensureProfile(){const user=session.user,email=user.email||''; const found=await sb.from('profiles').select('*').eq('user_id',user.id).maybeSingle(); if(found.data)currentProfile=found.data; else{const r=email.toLowerCase()==='julian.canterbury@gmail.com'?'owner':'contributor'; const ins=await sb.from('profiles').insert({user_id:user.id,email,display_name:email.split('@')[0],role:r}).select().single(); currentProfile=ins.data||{email,role:r}} safeText('currentUser',email); safeText('currentRole',currentProfile?.role||'contributor'); safeText('status',`Signed in as ${email} · ${currentProfile?.role||'contributor'}`); setModeClasses(); setEditMode(editMode)}
async function loadAll(){setStatus('Loading…'); const [p,ph,f,r]=await Promise.all([sb.from('people').select('*').order('created_at'),sb.from('photos').select('*').order('created_at',{ascending:false}),sb.from('faces').select('*').order('created_at'),sb.from('relationships').select('*').order('created_at')]); const err=p.error||ph.error||f.error||r.error; if(err)return problem('Database read failed: '+err.message); people=p.data||[]; photos=ph.data||[]; faces=f.data||[]; relationships=r.data||[]; [suggestions,comments,feedback]=await Promise.all([optionalTable('suggestions'),optionalTable('comments'),optionalTable('feedback')]); currentPhoto=currentPhoto||photos[0]||null; selectedPersonId=selectedPersonId||profilePersonId()||visiblePeople()[0]?.id||null; updateDashboard(); await renderCurrentPhoto(); updateSide(); await renderPeople(); await renderPhotoSidebar(); renderRelationshipList(); populateTreeFocus(); setStatus('Loaded')}
async function refreshData(){await loadAll(); const page=(location.hash||'#dashboard').replace('#','')||'dashboard'; showPage(page)}

function showPage(page){page=page||'dashboard'; if(!el(page+'Page'))page='dashboard'; if(page==='admin'&&!canAdmin())page='dashboard'; document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden')); el(page+'Page')?.classList.remove('hidden'); setActiveNav(page); if(location.hash!=='#'+page)history.replaceState(null,'','#'+page); if(page!=='photo'){selectedFaceId=null; renderFaceEditor()} if(page==='dashboard')updateDashboard(); if(page==='photo'){renderCurrentPhoto();updateSide();renderPhotoSidebar()} if(page==='people')renderPeople(); if(page==='person')renderPersonProfile(); if(page==='relationships'){renderRelationshipAssistant();renderRelationshipList()} if(page==='review')renderReview(); if(page==='admin')renderDatabase(); if(page==='graph'){populateTreeFocus();renderGraph();setTimeout(fitGraph,0)}}
window.addEventListener('hashchange',()=>{const page=(location.hash||'#dashboard').replace('#','')||'dashboard';showPage(page)});
function setEditMode(on){editMode=!!on; setModeClasses(); el('viewModeBtn')?.classList.toggle('primary',!editMode); el('editModeBtn')?.classList.toggle('primary',editMode)}

function applyTheme(name){currentTheme=name||'ocean'; document.body.dataset.theme=currentTheme; localStorage.setItem('familyGraphTheme',currentTheme); document.querySelectorAll('.theme-chip').forEach(b=>b.classList.toggle('active',b.dataset.theme===currentTheme))}
function updateDashboard(){safeText('peopleTotal',people.length);safeText('photosTotal',photos.length);safeText('facesTotal',faces.length);safeText('relationshipsTotal',relationships.length); const hour=new Date().getHours(); const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening'; safeText('dashboardGreeting',`${greeting}, ${currentProfile?.display_name?.split(' ')[0]||'Julian'}`); renderDashboardExtras()}
async function renderDashboardExtras(){const photoBox=el('dashboardPhotos'),taskBox=el('dashboardTasks'),peopleBox=el('dashboardPeople'); if(photoBox){let html=''; for(const ph of photos.slice(0,6)){const url=await photoUrl(ph); const c=faces.filter(f=>f.photo_id===ph.id).length; html+=`<button class="mini-photo" onclick="selectPhotoById('${ph.id}');showPage('photo')"><img src="${url}" alt=""><span>${escapeHtml(photoTitle(ph))}<small>${c} face${c===1?'':'s'}</small></span></button>`} photoBox.innerHTML=html||'<p class="small">No photos yet.</p>'} if(taskBox){const unknown=faces.filter(f=>!f.person_id).length; const noDates=visiblePeople().filter(p=>!p.birth_date).length; const linked=!!profilePersonId(); taskBox.innerHTML=`<button onclick="showPage('photo')"><b>${unknown}</b><span>Unnamed faces to identify</span></button><button onclick="showPage('people')"><b>${noDates}</b><span>People without birth dates</span></button><button onclick="showPage('people')"><b>${linked?'✓':'!'}</b><span>${linked?'Your login is linked':'Link your login to a person'}</span></button>`} if(peopleBox){let html=''; for(const p of visiblePeople().slice(0,8)){html+=`<button onclick="showPerson('${p.id}')">${await photoHtml(p,42)}<span>${escapeHtml(fullName(p))}<small>${escapeHtml(p.birth_date||'')}</small></span></button>`} peopleBox.innerHTML=html||'<p class="small">No people yet.</p>'}}

async function photoUrl(photo){if(!photo)return''; return sb.storage.from(MEDIA_BUCKET()).getPublicUrl(photo.storage_path).data.publicUrl}
function photoTitle(ph){return ph?.title||ph?.original_filename||'Photo'}
function photoIndex(){return photos.findIndex(p=>p.id===currentPhoto?.id)}
async function selectPhotoById(id){const ph=photos.find(p=>p.id===id); if(!ph)return; currentPhoto=ph;selectedFaceId=null; await renderCurrentPhoto();updateSide();await renderPhotoSidebar();setStatus('Photo loaded')}
async function selectLatestPhoto(){currentPhoto=photos[0]||null;selectedFaceId=null;await renderCurrentPhoto();updateSide();await renderPhotoSidebar();setStatus('Latest photo')}
async function previousPhoto(){if(!photos.length)return;let i=photoIndex();if(i<0)i=0;await selectPhotoById(photos[Math.max(0,i-1)].id)}
async function nextPhoto(){if(!photos.length)return;let i=photoIndex();if(i<0)i=0;await selectPhotoById(photos[Math.min(photos.length-1,i+1)].id)}
async function uploadPhoto(ev){const file=ev.target.files?.[0]; if(!file)return; setStatus('Uploading photo…'); const id=uid(),ext=(file.name.split('.').pop()||'jpg').toLowerCase(),path=`photos/${id}/original.${ext}`; const up=await sb.storage.from(MEDIA_BUCKET()).upload(path,file,{upsert:false}); if(up.error){alert(up.error.message);setStatus('Upload failed');return} const ins=await sb.from('photos').insert({id,title:file.name,storage_path:path,original_filename:file.name,mime_type:file.type,uploaded_by:session.user.id}).select().single(); if(ins.error){alert(ins.error.message);return} photos.unshift(ins.data); currentPhoto=ins.data; selectedFaceId=null; updateDashboard(); await renderCurrentPhoto();updateSide();await renderPhotoSidebar();setStatus('Photo saved — detecting faces…'); setTimeout(()=>detectFacesOnPhoto(true),350)}
async function renderCurrentPhoto(){const img=el('mainPhoto'),empty=el('emptyPhoto'),c=el('photoCanvas'); if(img)img.src=currentPhoto?await photoUrl(currentPhoto):''; if(empty)empty.style.display=currentPhoto?'none':'grid'; if(!c)return; c.querySelectorAll('.face').forEach(e=>e.remove()); if(!currentPhoto)return; faces.filter(f=>f.photo_id===currentPhoto.id).forEach(f=>c.appendChild(faceElement(f))); c.classList.toggle('hide-boxes',!showFaceBoxes); c.classList.toggle('hide-names',!showFaceNames); const ph=currentPhoto; if(el('photoDate'))el('photoDate').value=ph.date_taken||ph.photo_date||ph.taken_at||''; if(el('photoPlace'))el('photoPlace').value=ph.location||ph.place||''}
async function renderPhotoSidebar(query=''){query=String(query||'').toLowerCase(); await renderPhotoPeopleNav(query); await renderPhotoList(query)}
async function renderPhotoPeopleNav(query=''){const box=el('photoPeopleNav'); if(!box)return; let rows=visiblePeople().filter(p=>!query||fullName(p).toLowerCase().includes(query)).slice(0,12); let html=''; for(const p of rows){html+=`<button class="photo-person-link" onclick="showPerson('${p.id}')">${await photoHtml(p,34,'tiny-avatar')}<div><b>${escapeHtml(fullName(p))}</b><br><span class="small">${escapeHtml(p.birth_date||'')}</span></div><span class="blue-dot"></span></button>`} box.innerHTML=html||'<p class="small">No people found.</p>'}
async function renderPhotoList(query=''){const box=el('photoList'); if(!box)return; let rows=photos.filter(ph=>!query||photoTitle(ph).toLowerCase().includes(query)); let html=''; for(const ph of rows){const url=await photoUrl(ph); const fc=faces.filter(f=>f.photo_id===ph.id).length,nc=faces.filter(f=>f.photo_id===ph.id&&f.person_id).length; const date=ph.date_taken||ph.photo_date||ph.taken_at||ph.created_at?.slice(0,10)||''; html+=`<button class="photo-list-item ${currentPhoto?.id===ph.id?'active':''}" onclick="selectPhotoById('${ph.id}')"><img src="${url}" alt=""><span><b>${escapeHtml(photoTitle(ph))}</b><small>${escapeHtml(date)} · ${fc} face${fc===1?'':'s'}${nc?` · ${nc} named`:''}</small></span></button>`} box.innerHTML=html||'<p class="small">No photos found.</p>'}
async function saveCurrentPhotoDetails(){if(!currentPhoto)return; const patch={}; const dv=el('photoDate')?.value||null, pv=el('photoPlace')?.value||null; ['date_taken','photo_date','taken_at'].forEach(k=>{if(k in currentPhoto)patch[k]=dv}); ['location','place'].forEach(k=>{if(k in currentPhoto)patch[k]=pv}); if(!Object.keys(patch).length){patch.date_taken=dv;patch.location=pv} const res=await sb.from('photos').update(patch).eq('id',currentPhoto.id).select().single(); if(res.error){alert(res.error.message);return} Object.assign(currentPhoto,res.data); setStatus('Photo details saved'); renderPhotoSidebar()}
function toggleFaceBoxes(){showFaceBoxes=!showFaceBoxes;renderCurrentPhoto();safeText('boxToggleText',showFaceBoxes?'Hide boxes':'Show boxes')}
function toggleFaceNames(){showFaceNames=!showFaceNames;renderCurrentPhoto();safeText('nameToggleText',showFaceNames?'Hide names':'Show names')}

function faceElement(f){
  const d=document.createElement('div');
  d.className='face'+(f.person_id?' named':'')+(f.id===selectedFaceId?' selected':'')+(!f.person_id?' unknown':'');
  d.style.left=Number(f.x)+'px';d.style.top=Number(f.y)+'px';d.style.width=Number(f.w)+'px';d.style.height=Number(f.h)+'px';
  const label=f.label || (f.id===selectedFaceId?'Unnamed face':'');
  d.innerHTML=`<span>${escapeHtml(label)}</span><div class="handle"></div>`;
  d.addEventListener('pointerdown',ev=>startDrag(ev,f.id));
  d.querySelector('.handle').addEventListener('pointerdown',ev=>startResize(ev,f.id));
  d.addEventListener('click',ev=>{ev.stopPropagation();selectedFaceId=f.id;renderCurrentPhoto();renderFaceEditor()});
  return d
}
async function addFaceBox(){if(!currentPhoto)return alert('Upload a photo first.'); const ins=await sb.from('faces').insert({photo_id:currentPhoto.id,x:200,y:160,w:80,h:100,label:null,status:'manual',created_by:session.user.id}).select().single(); if(ins.error){alert(ins.error.message);return} faces.push(ins.data); selectedFaceId=ins.data.id; updateDashboard(); await renderCurrentPhoto();updateSide();setStatus('Face saved')}
let dragState=null;
function startDrag(ev,id){
  if(ev.target.classList.contains('handle'))return;
  selectedFaceId=id;
  renderCurrentPhoto();
  renderFaceEditor();
  if(!editMode)return;
  ev.preventDefault();ev.stopPropagation();
  const f=faces.find(x=>x.id===id); if(!f)return;
  dragState={mode:'drag',id,startX:ev.clientX,startY:ev.clientY,x:Number(f.x),y:Number(f.y)};
  ev.currentTarget.setPointerCapture(ev.pointerId);
  window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',endPointer)
}
function startResize(ev,id){if(!editMode)return; ev.preventDefault();ev.stopPropagation(); selectedFaceId=id; const f=faces.find(x=>x.id===id); if(!f)return; dragState={mode:'resize',id,startX:ev.clientX,startY:ev.clientY,w:Number(f.w),h:Number(f.h)}; ev.currentTarget.parentElement.setPointerCapture(ev.pointerId); window.addEventListener('pointermove',onPointerMove);window.addEventListener('pointerup',endPointer)}
function onPointerMove(ev){if(!dragState)return; const f=faces.find(x=>x.id===dragState.id); if(!f)return; if(dragState.mode==='drag'){f.x=Math.max(0,dragState.x+ev.clientX-dragState.startX);f.y=Math.max(0,dragState.y+ev.clientY-dragState.startY)}else{f.w=Math.max(30,dragState.w+ev.clientX-dragState.startX);f.h=Math.max(30,dragState.h+ev.clientY-dragState.startY)} const box=document.querySelector('.face.selected'); if(box){box.style.left=f.x+'px';box.style.top=f.y+'px';box.style.width=f.w+'px';box.style.height=f.h+'px'}}
async function endPointer(){if(dragState){const f=faces.find(x=>x.id===dragState.id); if(f)await sb.from('faces').update({x:f.x,y:f.y,w:f.w,h:f.h}).eq('id',f.id)} dragState=null;window.removeEventListener('pointermove',onPointerMove);window.removeEventListener('pointerup',endPointer)}
async function deleteSelectedFace(){if(!canDelete())return alert('Only the archive owner can delete face boxes.'); if(!selectedFaceId)return; const del=await sb.from('faces').delete().eq('id',selectedFaceId); if(del.error){alert(del.error.message);return} faces=faces.filter(f=>f.id!==selectedFaceId); selectedFaceId=null; updateDashboard(); await renderCurrentPhoto();updateSide()}
function renderFaceEditor(){
  const w=el('faceEditor'); if(!w)return;
  const f=faces.find(x=>x.id===selectedFaceId);
  if(!f){w.innerHTML='<p>Select or add a face box.</p><button class="full" onclick="suggestFaceForPhoto()">Suggest a face/name</button>';return}
  const p=f.person_id?person(f.person_id):null;
  if(!canEdit()){
    w.innerHTML=`<p><strong>${escapeHtml(p?fullName(p):(f.label||'Unnamed face'))}</strong></p><textarea id="faceSuggestionText" placeholder="Suggest a correction…"></textarea><button class="primary full" onclick="suggestSelectedFaceName()">Send suggestion</button>`;return
  }
  const opts=['<option value="">Choose existing person…</option>'].concat(visiblePeople().sort((a,b)=>fullName(a).localeCompare(fullName(b))).map(pp=>`<option value="${pp.id}" ${pp.id===f.person_id?'selected':''}>${escapeHtml(fullName(pp))}</option>`)).join('');
  const current=p?fullName(p):(f.label||'Unnamed face');
  const typed=p?'':(f.label||'');
  w.innerHTML=`
    <div class="selected-face-summary"><p class="small">Current</p><strong>${escapeHtml(current)}</strong></div>
    <div class="form-grid compact-form">
      <label>Use existing person<select id="existingPersonSelect">${opts}</select></label>
      <button class="primary full" onclick="attachFaceToExisting()">Use selected person</button>
      <label>Create new person<input id="faceName" value="${escapeHtml(typed)}" placeholder="Type a new full name" autocomplete="off" onblur="this.value=titleCaseName(this.value)"></label>
      <button class="full" onclick="saveFaceName()">Create / save typed name</button>
      ${p?'<button class="full" onclick="unlinkSelectedFace()">Unlink this face</button>':''}
      <button class="full" onclick="suggestSelectedFaceName()">Suggest correction instead</button>
    </div>`
}
async function unlinkSelectedFace(){
  const f=faces.find(x=>x.id===selectedFaceId); if(!f)return;
  const upd=await sb.from('faces').update({person_id:null,label:null,status:'unconfirmed'}).eq('id',f.id).select().single();
  if(upd.error){alert(upd.error.message);return}
  Object.assign(f,upd.data);
  await renderCurrentPhoto();renderFaceEditor();updateSide();await renderPeople();await renderPhotoSidebar();updateDashboard();setStatus('Face unlinked')
}
async function attachFaceToExisting(){const f=faces.find(x=>x.id===selectedFaceId),pid=el('existingPersonSelect')?.value; if(!f||!pid)return alert('Choose an existing person first.'); const p=person(pid); const upd=await sb.from('faces').update({person_id:p.id,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single(); if(upd.error){alert(upd.error.message);return} Object.assign(f,upd.data); await renderCurrentPhoto();updateSide();await renderPeople();await renderPhotoSidebar();updateDashboard();setStatus('Face linked')}
async function saveFaceName(){
  const f=faces.find(x=>x.id===selectedFaceId);
  const raw=(el('faceName')?.value||'').replace(/\s+/g,' ').trim();
  const name=titleCaseName(raw);
  if(!f||!name)return alert('Type a name first, or choose an existing person.');
  if(['unknown','unknown person','unnamed','unnamed person'].includes(name.toLowerCase()))return alert('Please enter a real name, or leave it blank until known.');
  let p=people.find(p=>fullName(p).toLowerCase()===name.toLowerCase());
  if(!p){
    const parts=name.split(' ');
    const ins=await sb.from('people').insert({display_name:name,given_names:parts[0]||name,family_name:parts.slice(1).join(' ')||null,created_by:session.user.id}).select().single();
    if(ins.error){alert(ins.error.message);return}
    p=ins.data; people.push(p)
  }
  const upd=await sb.from('faces').update({person_id:p.id,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single();
  if(upd.error){alert(upd.error.message);return}
  Object.assign(f,upd.data);
  await renderCurrentPhoto();renderFaceEditor();updateSide();await renderPeople();await renderPhotoSidebar();updateDashboard();setStatus('Face named')
}
function waitForImage(img){return new Promise((res,rej)=>{if(!img)return rej(new Error('Photo element missing.')); if(img.complete&&img.naturalWidth)return res(img); img.onload=()=>res(img); img.onerror=()=>rej(new Error('Photo failed to load.'))})}
function timeoutPromise(ms){return new Promise((_,rej)=>setTimeout(()=>rej(new Error('Face detector timed out. Use manual Add face box.')),ms))}
async function ensureHumanDetector(){if(humanReadyPromise)return humanReadyPromise; humanReadyPromise=(async()=>{if(!window.Human)throw new Error('Face detector library did not load.'); humanDetector=new Human.Human({modelBasePath:'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',backend:'webgl',face:{enabled:true,detector:{enabled:true,rotation:true,maxDetected:100},mesh:{enabled:false},iris:{enabled:false},description:{enabled:false},emotion:{enabled:false}},body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},filter:{enabled:false}}); setStatus('Loading face detector…'); await humanDetector.load(); await humanDetector.warmup(); return humanDetector})(); return humanReadyPromise}
function rectIoU(a,b){const ax2=a.x+a.w,ay2=a.y+a.h,bx2=b.x+b.w,by2=b.y+b.h; const ix=Math.max(0,Math.min(ax2,bx2)-Math.max(a.x,b.x)),iy=Math.max(0,Math.min(ay2,by2)-Math.max(a.y,b.y)); const inter=ix*iy; return inter/((a.w*a.h)+(b.w*b.h)-inter||1)}
async function detectFacesOnPhoto(auto=false){try{if(!currentPhoto)return alert('Open or upload a photo first.'); const img=el('mainPhoto'); await waitForImage(img); const detector=await Promise.race([ensureHumanDetector(),timeoutPromise(20000)]); setStatus('Detecting faces…'); const result=await Promise.race([detector.detect(img),timeoutPromise(20000)]); const scale=(img.clientWidth||img.naturalWidth)/(img.naturalWidth||img.clientWidth||1); const found=(result.face||[]).map(face=>{const box=face.box||face.boxRaw||[]; return {x:Math.round((box[0]||0)*scale),y:Math.round((box[1]||0)*scale),w:Math.round((box[2]||0)*scale),h:Math.round((box[3]||0)*scale)}}).filter(r=>r.w>=24&&r.h>=24); if(!found.length){setStatus('No faces detected'); if(!auto)alert('No faces detected. Use Add face box.'); return} const existing=faces.filter(f=>f.photo_id===currentPhoto.id).map(f=>({x:+f.x||0,y:+f.y||0,w:+f.w||0,h:+f.h||0})); const fresh=[]; for(const r of found){if(existing.some(e=>rectIoU(e,r)>.35)||fresh.some(e=>rectIoU(e,r)>.35))continue; fresh.push(r)} if(!fresh.length){setStatus(`Detected ${found.length}; all already boxed`);return} const rows=fresh.map(r=>({photo_id:currentPhoto.id,x:r.x,y:r.y,w:r.w,h:r.h,label:null,status:'detected',created_by:session.user.id})); const ins=await sb.from('faces').insert(rows).select(); if(ins.error){alert(ins.error.message);setStatus('Face save failed');return} faces.push(...(ins.data||[])); await renderCurrentPhoto();updateSide();updateDashboard();setStatus(`Detected ${fresh.length} new face${fresh.length===1?'':'s'}`)}catch(e){console.error(e);setStatus('Face detection unavailable'); if(!auto)alert(e.message)}}

function faceForPerson(id){
  const rows=faces.filter(f=>f.person_id===id);
  if(!rows.length)return null;
  return rows.slice().sort((a,b)=>{
    const score=x=>(x.status==='confirmed'?1000000:0)+(Number(x.w)||0)*(Number(x.h)||0);
    return score(b)-score(a);
  })[0];
}
async function cropStyle(f,size=92){
  if(!f)return'';
  const ph=photos.find(p=>p.id===f.photo_id); if(!ph)return'';
  const url=await photoUrl(ph);
  const x=Number(f.x)||0, y=Number(f.y)||0, w=Math.max(1,Number(f.w)||1), h=Math.max(1,Number(f.h)||1);
  // Face boxes are stored in the same pixel coordinate system used by the photo builder.
  // Most uploaded images are displayed at roughly 1200px wide when boxes are drawn.
  // Use that coordinate system to crop a face from the larger photo instead of showing
  // the whole photograph in every avatar.
  const baseW=1200;
  const zoom=(size*1.85)/Math.max(w,h);
  const bgW=baseW*zoom;
  const bgX=-(x*zoom)+(size-w*zoom)/2;
  const bgY=-(y*zoom)+(size-h*zoom)/2;
  return `background-image:url('${url}');background-size:${bgW}px auto;background-position:${bgX}px ${bgY}px;background-repeat:no-repeat;`;
}
async function photoHtml(p,size=92,cls='node-photo'){const f=faceForPerson(p.id); if(f)return `<div class="${cls}" style="${await cropStyle(f,size)}"></div>`; return `<div class="${cls}">${escapeHtml(initials(p))}</div>`}
function photoHtmlSync(p,cls='node-photo'){const f=faceForPerson(p.id); return f?`<div class="${cls} async-photo" data-person-id="${p.id}">${escapeHtml(initials(p))}</div>`:`<div class="${cls}">${escapeHtml(initials(p))}</div>`}
async function hydrateAsyncPortraits(){for(const e of [...document.querySelectorAll('.async-photo[data-person-id]')]){const p=person(e.dataset.personId),f=p?faceForPerson(p.id):null;if(!f)continue;e.setAttribute('style',await cropStyle(f));e.textContent=''}}

async function renderPeople(){const list=el('peopleList'); if(!list)return; let html=''; for(const p of visiblePeople()){html+=`<button class="people-card person-button" onclick="showPerson('${p.id}')">${await photoHtml(p)}<strong>${escapeHtml(fullName(p))}</strong><p>${p.birth_date||'No dates yet'}${p.death_date?' – '+p.death_date:''}</p></button>`} list.innerHTML=html||'<p>No people yet.</p>'}
function showPerson(id){selectedPersonId=id;showPage('person');renderPersonProfile()}
async function renderPersonProfile(){
  const box=el('personProfile'); if(!box)return;
  const p=person(selectedPersonId)||visiblePeople()[0];
  if(!p){box.innerHTML='<p>No person selected.</p>';return}
  selectedPersonId=p.id;
  const tagged=faces.filter(f=>f.person_id===p.id);
  const photoIds=[...new Set(tagged.map(f=>f.photo_id))];
  const rels=relationships.filter(r=>r.from_person_id===p.id||r.to_person_id===p.id);
  const parentIds=parentsOf(p.id);
  const childIds=childrenOf(p.id);
  const partnerIds=partnersOf(p.id);
  const siblingIds=[...new Set(relationships.filter(r=>r.relationship_type==='sibling'&&(r.from_person_id===p.id||r.to_person_id===p.id)).map(r=>r.from_person_id===p.id?r.to_person_id:r.from_person_id))];
  const cardList=async(ids)=>{
    let html='';
    for(const id of ids.filter(Boolean)){const pp=person(id); if(!pp)continue; html+=`<button class="mini-person" onclick="showPerson('${pp.id}')">${await photoHtml(pp,42)}<span><b>${escapeHtml(fullName(pp))}</b><small>${escapeHtml(pp.birth_date||'')}</small></span></button>`}
    return html||'<p class="small">Not recorded yet.</p>';
  };
  let photosHtml='';
  for(const pid of photoIds.slice(0,12)){const ph=photos.find(x=>x.id===pid); if(!ph)continue; photosHtml+=`<button class="mini-photo" onclick="selectPhotoById('${ph.id}');showPage('photo')"><img src="${await photoUrl(ph)}" alt=""><span>${escapeHtml(photoTitle(ph))}</span></button>`}
  box.innerHTML=`
    <div class="person-hero card">
      ${await photoHtml(p,96)}
      <div><h2>${escapeHtml(fullName(p))}</h2><p>${escapeHtml(p.birth_date||'')}${p.death_date?' – '+escapeHtml(p.death_date):''}</p><p class="small">${tagged.length} tagged face${tagged.length===1?'':'s'} · ${rels.length} direct relationship${rels.length===1?'':'s'}</p></div>
      <div class="person-actions"><button class="primary" onclick="focusTreeOnPerson('${p.id}')">Focus in tree</button><button onclick="linkMyProfileToPerson('${p.id}')">Link my login to this person</button></div>
    </div>
    <div class="person-profile-grid">
      <section class="card"><h2>Family</h2>
        <div class="profile-relation-block"><h3>Parents</h3><div class="mini-person-list">${await cardList(parentIds)}</div></div>
        <div class="profile-relation-block"><h3>Partner</h3><div class="mini-person-list">${await cardList(partnerIds)}</div></div>
        <div class="profile-relation-block"><h3>Children</h3><div class="mini-person-list">${await cardList(childIds)}</div></div>
        <div class="profile-relation-block"><h3>Siblings</h3><div class="mini-person-list">${await cardList(siblingIds)}</div></div>
      </section>
      <section class="card"><h2>Photos</h2><div class="mini-photo-grid">${photosHtml||'<p class="small">No tagged photos yet.</p>'}</div></section>
      <section class="card wide-profile"><h2>Direct relationship records</h2><div class="relationship-list">${rels.map(r=>`<div class="rel-row"><strong>${escapeHtml(relationshipSentence(r))}</strong></div>`).join('')||'<p class="small">No direct relationships yet.</p>'}</div></section>
    </div>`;
}
async function linkMyProfileToPerson(id){const p=person(id); if(!p)return; try{const r=await sb.from('profiles').update({person_id:id}).eq('user_id',session.user.id).select().single(); if(!r.error)currentProfile=Object.assign(currentProfile||{},r.data)}catch(e){} localStorage.setItem('familyGraph:profilePersonId',id); alert(`This login is now linked to ${fullName(p)}.`); updateDashboard();renderPersonProfile()}
function focusTreeOnPerson(id){treeFocusId=id;treeMode='focus';showPage('graph')}
async function addUnknownPerson(){const name=titleCaseName(prompt('Full name')||''); if(!name)return; const parts=name.split(' '); const ins=await sb.from('people').insert({display_name:name,given_names:parts[0]||name,family_name:parts.slice(1).join(' ')||null,created_by:session.user.id}).select().single(); if(ins.error){alert(ins.error.message);return} people.push(ins.data); updateDashboard(); await renderPeople(); updateSide()}
async function deletePerson(id){if(!canDelete())return alert('Only the archive owner can delete people.'); const p=person(id); if(!p)return; if(!confirm(`Delete ${fullName(p)}?`))return; await sb.from('relationships').delete().or(`from_person_id.eq.${id},to_person_id.eq.${id}`); await sb.from('faces').update({person_id:null,label:null,status:'unconfirmed'}).eq('person_id',id); const del=await sb.from('people').delete().eq('id',id); if(del.error){alert(del.error.message);return} people=people.filter(x=>x.id!==id); relationships=relationships.filter(r=>r.from_person_id!==id&&r.to_person_id!==id); faces.forEach(f=>{if(f.person_id===id){f.person_id=null;f.label=null}}); await refreshData()}

function parentsOf(id){return relationships.filter(r=>r.relationship_type==='parent'&&r.to_person_id===id).map(r=>r.from_person_id)}
function childrenOf(id){return relationships.filter(r=>r.relationship_type==='parent'&&r.from_person_id===id).map(r=>r.to_person_id)}
function partnersOf(id){return relationships.filter(r=>r.relationship_type==='partner'&&(r.from_person_id===id||r.to_person_id===id)).map(r=>r.from_person_id===id?r.to_person_id:r.from_person_id)}
function relationshipSentence(r){const a=person(r.from_person_id),b=person(r.to_person_id); if(!a||!b)return'Missing person'; if(r.relationship_type==='parent')return`${fullName(a)} is ${r.label||'parent'} of ${fullName(b)}`; if(r.relationship_type==='partner')return`${fullName(a)} is partner of ${fullName(b)}`; if(r.relationship_type==='sibling')return`${fullName(a)} is sibling of ${fullName(b)}`; return`${fullName(a)} → ${fullName(b)}`}
function setRel(type,btn){currentRel=type;document.querySelectorAll('.relationship-buttons button').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');previewRelationship()}
function relationshipCandidate(){const a=el('relA')?.value,b=el('relB')?.value; let type=currentRel,from=a,to=b,label=type; if(['mother','father','parent'].includes(type)){type='parent';label=currentRel}else if(type==='child'){type='parent';from=b;to=a;label='parent'}else if(type==='partner')label='partner';else if(type==='sibling')label='sibling'; return{from,to,type,label}}
function isAncestor(a,d,seen=new Set()){if(seen.has(d))return false;seen.add(d);const ps=parentsOf(d); if(ps.includes(a))return true; return ps.some(p=>isAncestor(a,p,seen))}
function validationFor(c){const fatal=[]; if(!c.from||!c.to)fatal.push('Choose two people.'); if(c.from===c.to)fatal.push('A person cannot be related to themselves.'); const dup=relationships.some(r=>r.from_person_id===c.from&&r.to_person_id===c.to&&r.relationship_type===c.type); const rev=relationships.some(r=>['partner','sibling'].includes(c.type)&&r.relationship_type===c.type&&r.from_person_id===c.to&&r.to_person_id===c.from); if(dup||rev)fatal.push('This relationship already exists.'); if(c.type==='parent'&&isAncestor(c.to,c.from))fatal.push('This would create an ancestor loop.'); return{fatal}}
function previewRelationship(){const box=el('relationshipWarning'); if(!box)return; const v=validationFor(relationshipCandidate()); if(!v.fatal.length){box.classList.add('hidden');return} box.classList.remove('hidden');box.classList.add('bad');box.innerHTML=v.fatal.join('<br>')}
async function saveRelationship(){const c=relationshipCandidate(),v=validationFor(c); if(v.fatal.length){previewRelationship();return} await insertRelationship(c.from,c.to,c.type,c.label,currentPhoto?.id||null); await refreshData()}
async function insertRelationship(from,to,type,label,source=null){const v=validationFor({from,to,type,label}); if(v.fatal.length)return null; const ins=await sb.from('relationships').insert({from_person_id:from,to_person_id:to,relationship_type:type,label,source_photo_id:source,created_by:session.user.id}).select().single(); if(ins.error){console.warn(ins.error.message);return null} relationships.push(ins.data); return ins.data}
async function deleteRelationship(id){if(!canDelete())return alert('Only the archive owner can delete relationships.'); const del=await sb.from('relationships').delete().eq('id',id); if(del.error){alert(del.error.message);return} relationships=relationships.filter(r=>r.id!==id); updateDashboard();renderRelationshipList();renderRelationshipAssistant();renderGraph()}
function renderRelationshipList(){const box=el('relationshipList'); if(!box)return; const q=(el('relationshipSearch')?.value||'').toLowerCase(); const rows=relationships.filter(r=>!q||relationshipSentence(r).toLowerCase().includes(q)); box.innerHTML=rows.map(r=>`<div class="rel-row"><div><strong>${escapeHtml(relationshipSentence(r))}</strong><br><span class="small">Direct fact · ${escapeHtml(r.relationship_type)}</span></div><button class="danger owner-only" onclick="deleteRelationship('${r.id}')">Delete</button></div>`).join('')||'<p>No relationships yet.</p>'}
function updateSide(){safeText('faceCount',currentPhoto?faces.filter(f=>f.photo_id===currentPhoto.id).length:0);safeText('namedCount',currentPhoto?faces.filter(f=>f.photo_id===currentPhoto.id&&f.person_id).length:0);renderPhotoComments(); const opts=visiblePeople().map(p=>`<option value="${p.id}">${escapeHtml(fullName(p))}</option>`).join(''); safeHTML('relA',opts);safeHTML('relB',opts);renderFaceEditor();renderRelationshipList();previewRelationship()}
function renderRelationshipAssistant(){const sub=el('assistantSubject'),other=el('assistantOther'); if(!sub||!other)return; const opts='<option value="">Choose person…</option>'+visiblePeople().map(p=>`<option value="${p.id}">${escapeHtml(fullName(p))}</option>`).join(''); const oldS=sub.value,oldO=other.value; sub.innerHTML=opts; other.innerHTML=opts; if(oldS)sub.value=oldS; if(oldO)other.value=oldO; const checklist=assistantDirectFacts(); renderAssistantChecklist(checklist)}
function queueRelationshipAssistantRender(){clearTimeout(assistantTimer);assistantTimer=setTimeout(renderRelationshipAssistant,250)}
function assistantDirectFacts(){const subject=el('assistantSubject')?.value,type=el('assistantType')?.value,other=el('assistantOther')?.value; const newName=titleCaseName(el('assistantNewPerson')?.value||''); const items=[]; const s=person(subject),o=person(other); const otherLabel=o?fullName(o):newName; if(!s||!otherLabel){safeText('assistantPreview','Choose a person and another existing/new person.');safeHTML('derivedPreview','');return items} safeText('assistantPreview',`${fullName(s)} ${assistantTypeText(type)} ${otherLabel}. Tick any other direct facts that should also be true.`); function add(fromName,toName,fromId,toId,rel,label,checked=true){items.push({fromName,toName,fromId,toId,rel,label,checked})} if(type==='partner'){add(fullName(s),otherLabel,subject,other,'partner','partner',true); for(const childId of childrenOf(subject)){const child=person(childId); if(child&&!parentsOf(childId).includes(other))add(otherLabel,fullName(child),other,childId,'parent','parent',false)}} if(type==='parent'){add(fullName(s),otherLabel,subject,other,'parent','parent',true); for(const partnerId of partnersOf(subject)){const pp=person(partnerId); if(pp&&!parentsOf(other).includes(partnerId))add(fullName(pp),otherLabel,partnerId,other,'parent','parent',false)}} if(type==='child'){add(otherLabel,fullName(s),other,subject,'parent','parent',true); for(const partnerId of partnersOf(other)){const pp=person(partnerId); if(pp&&!parentsOf(subject).includes(partnerId))add(fullName(pp),fullName(s),partnerId,subject,'parent','parent',false)}} if(type==='sibling'){add(fullName(s),otherLabel,subject,other,'sibling','sibling',true); for(const parentId of parentsOf(subject)){const pp=person(parentId); if(pp&&!parentsOf(other).includes(parentId))add(fullName(pp),otherLabel,parentId,other,'parent','parent',false)}} safeHTML('derivedPreview',`Derived later: cousins, nieces, nephews, grandparents and aunts/uncles are not saved as direct facts.`); return items}
function assistantTypeText(t){return {partner:'is partner of',parent:'is parent of',child:'is child of',sibling:'is sibling of'}[t]||'is related to'}
function renderAssistantChecklist(items){const box=el('assistantChecklist'); if(!box)return; box.innerHTML=items.map((it,i)=>`<label class="assistant-check"><input type="checkbox" data-assistant-index="${i}" ${it.checked?'checked':''}> <span><b>${escapeHtml(it.fromName)}</b> is ${escapeHtml(it.label)} of <b>${escapeHtml(it.toName)}</b></span></label>`).join('')||'<p class="small">No suggestions yet.</p>'; window._assistantItems=items}
async function saveAssistantRelationships(){let items=window._assistantItems||[]; if(!items.length)return alert('No relationships to save.'); let otherId=el('assistantOther')?.value; const newName=titleCaseName(el('assistantNewPerson')?.value||''); if(!otherId&&newName){let p=people.find(p=>fullName(p).toLowerCase()===newName.toLowerCase()); if(!p){const parts=newName.split(' '); const ins=await sb.from('people').insert({display_name:newName,given_names:parts[0]||newName,family_name:parts.slice(1).join(' ')||null,created_by:session.user.id}).select().single(); if(ins.error){alert(ins.error.message);return} p=ins.data; people.push(p)} otherId=p.id} const checks=[...document.querySelectorAll('[data-assistant-index]')]; for(const cb of checks){if(!cb.checked)continue; const it=items[+cb.dataset.assistantIndex]; const from=it.fromId||otherId, to=it.toId||otherId; if(from&&to)await insertRelationship(from,to,it.rel,it.label)} await refreshData(); showPage('relationships')}

function itemAuthor(x){return x.author_name||x.created_by_email||x.created_by||'Family member'}
function renderPhotoComments(){const box=el('photoComments'); if(!box)return; const rows=comments.filter(c=>c.photo_id===currentPhoto?.id).slice(0,8); box.innerHTML=rows.length?rows.map(c=>`<div class="comment"><b>${escapeHtml(itemAuthor(c))}</b><br>${escapeHtml(c.body||c.comment||'')}</div>`).join(''):'No comments yet.'}
async function addPhotoComment(){const body=(el('commentText')?.value||'').trim(); if(!body)return; const row=await addOptional('comments',{photo_id:currentPhoto?.id,body,author_id:currentUserId(),author_name:userName(),status:'open'}); comments.unshift(row); if(el('commentText'))el('commentText').value='';renderPhotoComments();renderReview();setStatus('Comment posted')}
async function suggestSelectedFaceName(){const f=faces.find(x=>x.id===selectedFaceId); if(!f)return suggestFaceForPhoto(); const body=(el('faceSuggestionText')?.value||el('faceName')?.value||'').trim(); if(!body)return alert('Type the suggested name or correction.'); const row=await addOptional('suggestions',{type:'face_correction',photo_id:f.photo_id,face_id:f.id,person_id:f.person_id||null,suggested_value:titleCaseName(body),body,author_id:currentUserId(),author_name:userName(),status:'open'}); suggestions.unshift(row);renderReview();setStatus('Suggestion sent')}
async function suggestFaceForPhoto(){if(!currentPhoto)return alert('Open a photo first.'); const body=prompt('Who or what should be added/corrected on this photo?'); if(!body)return; const row=await addOptional('suggestions',{type:'photo_face_suggestion',photo_id:currentPhoto.id,body,suggested_value:body,author_id:currentUserId(),author_name:userName(),status:'open'}); suggestions.unshift(row);renderReview();alert('Suggestion added for review.')}
async function newFeedbackPrompt(){const title=prompt('Bug or request title'); if(!title)return; const body=prompt('Details'); const row=await addOptional('feedback',{title,body:body||'',kind:'request',status:'open',author_id:currentUserId(),author_name:userName()}); feedback.unshift(row);renderReview();renderDatabase()}
async function setSuggestionStatus(id,status){if(status==='approved'&&!isOwner())return alert('Only the owner can approve changes.'); const row=await updateOptional('suggestions',id,{status,reviewed_by:userName(),reviewed_at:new Date().toISOString()}); suggestions=suggestions.map(x=>x.id===id?Object.assign(x,row):x);renderReview()}
async function setFeedbackStatus(id,status){const row=await updateOptional('feedback',id,{status}); feedback=feedback.map(x=>x.id===id?Object.assign(x,row):x);renderReview();renderDatabase()}
function renderReview(){safeHTML('suggestionList',suggestions.map(x=>`<div class="review-item ${escapeHtml(x.status||'open')}"><b>${escapeHtml(x.suggested_value||x.type||'Suggestion')}</b><p>${escapeHtml(x.body||'')}</p><p class="small">${escapeHtml(itemAuthor(x))} · ${escapeHtml(x.status||'open')}</p><div class="review-actions"><button class="owner-only" onclick="setSuggestionStatus('${x.id}','approved')">Approve</button><button onclick="setSuggestionStatus('${x.id}','rejected')">Reject</button><button onclick="setSuggestionStatus('${x.id}','open')">Reopen</button></div></div>`).join('')||'<p class="small">No suggestions yet.</p>'); safeHTML('commentList',comments.map(x=>`<div class="review-item"><b>${escapeHtml(itemAuthor(x))}</b><p>${escapeHtml(x.body||x.comment||'')}</p></div>`).join('')||'<p class="small">No comments yet.</p>'); safeHTML('feedbackList',feedback.map(x=>`<div class="review-item"><b>${escapeHtml(x.title||'Untitled')}</b><p>${escapeHtml(x.body||'')}</p><div class="review-actions"><button onclick="setFeedbackStatus('${x.id}','open')">Open</button><button onclick="setFeedbackStatus('${x.id}','done')">Done</button></div></div>`).join('')||'<p class="small">No bugs or requests yet.</p>')}

function showDbTab(tab,btn){currentDbTab=tab;selectedDbId=null;document.querySelectorAll('.db-tab').forEach(b=>b.classList.remove('active'));btn?.classList.add('active');renderDatabase()}
function dbQuery(){return (el('dbSearch')?.value||'').trim().toLowerCase()} function dbDate(v){return v?escapeHtml(v):'—'}
async function renderDatabase(){const table=el('dbTable'),editor=el('dbEditor'); if(!table)return; const q=dbQuery(); if(currentDbTab==='people'){const rows=visiblePeople().filter(p=>!q||fullName(p).toLowerCase().includes(q)); let html='<div class="db-row db-head"><span>Person</span><span>Born</span><span>Died</span><span>Faces</span></div>'; for(const p of rows){html+=`<button class="db-row ${selectedDbId===p.id?'selected':''}" onclick="selectDbPerson('${p.id}')"><span class="db-person">${await photoHtml(p,48)}<b>${escapeHtml(fullName(p))}</b></span><span>${dbDate(p.birth_date)}</span><span>${dbDate(p.death_date)}</span><span>${faces.filter(f=>f.person_id===p.id).length}</span></button>`} table.innerHTML=html; if(!selectedDbId&&rows[0])selectDbPerson(rows[0].id,false); else renderDbEditor()} else if(currentDbTab==='photos'){const rows=photos.filter(ph=>!q||photoTitle(ph).toLowerCase().includes(q)); table.innerHTML='<div class="db-row db-head"><span>Photo</span><span>Date</span><span>People</span><span>File</span></div>'+rows.map(ph=>`<button class="db-row ${selectedDbId===ph.id?'selected':''}" onclick="selectDbPhoto('${ph.id}')"><span><b>${escapeHtml(photoTitle(ph))}</b></span><span>${dbDate(ph.date_taken||ph.photo_date||ph.taken_at)}</span><span>${faces.filter(f=>f.photo_id===ph.id&&f.person_id).length}</span><span>${escapeHtml(ph.original_filename||'—')}</span></button>`).join(''); if(!selectedDbId&&rows[0])selectDbPhoto(rows[0].id,false); else renderDbEditor()} else if(currentDbTab==='faces'){table.innerHTML='<div class="db-row db-head"><span>Face</span><span>Person</span><span>Photo</span><span>Status</span></div>'+faces.map(f=>`<div class="db-row"><span><b>${escapeHtml(f.label||'Unnamed')}</b></span><span>${escapeHtml(fullName(person(f.person_id))||'—')}</span><span>${escapeHtml(photoTitle(photos.find(p=>p.id===f.photo_id)))}</span><span>${escapeHtml(f.status||'—')}</span></div>`).join(''); safeText('dbEditorTitle','Faces'); if(editor)editor.innerHTML='<p class="small">Edit face boxes visually on the Photos page.</p>'} else if(currentDbTab==='feedback'){table.innerHTML='<div class="db-row db-head"><span>Bug / request</span><span>Status</span><span>Author</span><span></span></div>'+feedback.map(x=>`<div class="db-row"><span><b>${escapeHtml(x.title||'Untitled')}</b><br><span class="small">${escapeHtml(x.body||'')}</span></span><span>${escapeHtml(x.status||'open')}</span><span>${escapeHtml(itemAuthor(x))}</span><span><button class="small-btn" onclick="setFeedbackStatus('${x.id}','done')">Done</button></span></div>`).join(''); safeText('dbEditorTitle','Bugs / requests'); if(editor)editor.innerHTML='<button class="primary full" onclick="newFeedbackPrompt()">New item</button>'} else {renderRelationshipList(); const rows=relationships.filter(r=>!q||relationshipSentence(r).toLowerCase().includes(q)); table.innerHTML='<div class="db-row db-head"><span>Relationship</span><span>Type</span><span>Source</span><span></span></div>'+rows.map(r=>`<div class="db-row"><span><b>${escapeHtml(relationshipSentence(r))}</b></span><span>${escapeHtml(r.label||r.relationship_type)}</span><span>${escapeHtml(photoTitle(photos.find(p=>p.id===r.source_photo_id)))}</span><span><button class="danger small-btn" onclick="deleteRelationship('${r.id}')">Delete</button></span></div>`).join(''); safeText('dbEditorTitle','Relationships'); if(editor)editor.innerHTML='<p class="small">Use the Relationship Assistant for new records.</p>'}}
function selectDbPerson(id,rerender=true){selectedDbId=id;if(rerender)renderDatabase();else renderDbEditor()}
function selectDbPhoto(id,rerender=true){selectedDbId=id;if(rerender)renderDatabase();else renderDbEditor()}
function renderDbEditor(){const box=el('dbEditor'); if(!box)return; if(currentDbTab==='people'){const p=person(selectedDbId); safeText('dbEditorTitle',p?fullName(p):'Select a person'); if(!p){box.innerHTML='<p class="small">Choose a person to edit.</p>';return} box.innerHTML=`<div class="profile-top">${photoHtmlSync(p)}<div><h3>${escapeHtml(fullName(p))}</h3><p class="small">${faces.filter(f=>f.person_id===p.id).length} tagged photo${faces.filter(f=>f.person_id===p.id).length===1?'':'s'}</p></div></div><div class="form-grid"><label>Full name<input id="editDisplayName" value="${escapeHtml(fullName(p))}" onblur="this.value=titleCaseName(this.value)"></label><label>Preferred name<input id="editGiven" value="${escapeHtml(p.given_names||'')}"></label><label>Family name<input id="editFamily" value="${escapeHtml(p.family_name||'')}"></label><label>Birth date<input id="editBirth" type="date" value="${escapeHtml(p.birth_date||'')}"></label>${p.death_date?`<label>Death date<input id="editDeath" type="date" value="${escapeHtml(p.death_date||'')}"></label>`:`<div id="deathFieldWrap"><button type="button" class="subtle full" onclick="showDeathDateField()">+ Add death date</button></div>`}</div><button class="primary full" onclick="savePersonRecord('${p.id}')">Save person</button><button class="danger full owner-only" onclick="deletePerson('${p.id}')">Delete person</button>`; hydrateAsyncPortraits()} else if(currentDbTab==='photos'){const ph=photos.find(x=>x.id===selectedDbId); safeText('dbEditorTitle',ph?photoTitle(ph):'Select a photo'); if(!ph){box.innerHTML='<p class="small">Choose a photo.</p>';return} box.innerHTML=`<div class="form-grid"><label>Title<input id="editPhotoTitle" value="${escapeHtml(photoTitle(ph))}"></label><label>Date<input id="editPhotoDate" type="date" value="${escapeHtml(ph.date_taken||ph.photo_date||ph.taken_at||'')}"></label><label>Location<input id="editPhotoLocation" value="${escapeHtml(ph.location||ph.place||'')}"></label><label>Caption<textarea id="editPhotoCaption">${escapeHtml(ph.caption||ph.description||'')}</textarea></label></div><button class="primary full" onclick="savePhotoRecord('${ph.id}')">Save photo</button>`}}
function showDeathDateField(){const wrap=el('deathFieldWrap'); if(wrap)wrap.outerHTML='<label>Death date<input id="editDeath" type="date" value=""></label>'}
async function savePersonRecord(id){const p=person(id); if(!p)return; const name=titleCaseName(el('editDisplayName')?.value||fullName(p)); const patch={display_name:name,given_names:titleCaseName(el('editGiven')?.value||name.split(' ')[0]),family_name:titleCaseName(el('editFamily')?.value||name.split(' ').slice(1).join(' '))||null,birth_date:el('editBirth')?.value||null}; if(el('editDeath'))patch.death_date=el('editDeath').value||null; const res=await sb.from('people').update(patch).eq('id',id).select().single(); if(res.error){alert(res.error.message);return} Object.assign(p,res.data); faces.filter(f=>f.person_id===id).forEach(f=>f.label=fullName(p)); await sb.from('faces').update({label:fullName(p)}).eq('person_id',id); setStatus('Person saved'); await refreshData()}
async function savePhotoRecord(id){const ph=photos.find(x=>x.id===id); if(!ph)return; const patch={title:el('editPhotoTitle')?.value||null}; const dv=el('editPhotoDate')?.value||null,lv=el('editPhotoLocation')?.value||null,cv=el('editPhotoCaption')?.value||null; ['date_taken','photo_date','taken_at'].forEach(k=>{if(k in ph)patch[k]=dv}); ['location','place'].forEach(k=>{if(k in ph)patch[k]=lv}); ['caption','description'].forEach(k=>{if(k in ph)patch[k]=cv}); const res=await sb.from('photos').update(patch).eq('id',id).select().single(); if(res.error){alert(res.error.message);return} Object.assign(ph,res.data);setStatus('Photo saved');renderDatabase();renderPhotoSidebar()}

function partnerPairs(){const out=[],seen=new Set(); relationships.filter(r=>r.relationship_type==='partner').forEach(r=>{const a=person(r.from_person_id),b=person(r.to_person_id); if(!isRealPerson(a)||!isRealPerson(b))return; const key=[a.id,b.id].sort().join('|'); if(seen.has(key))return; seen.add(key); out.push([a.id,b.id])}); return out}
function generationDepth(id,seen=new Set()){if(seen.has(id))return 0; seen.add(id); const ps=parentsOf(id).filter(pid=>isRealPerson(person(pid))); if(!ps.length)return 0; return 1+Math.max(...ps.map(p=>generationDepth(p,seen)))}
function parentGroups(){const groups={}; relationships.filter(r=>r.relationship_type==='parent'&&isRealPerson(person(r.from_person_id))&&isRealPerson(person(r.to_person_id))).forEach(r=>{const child=r.to_person_id; const ps=parentsOf(child).filter(pid=>isRealPerson(person(pid))).sort(); const key=ps.join('|')||r.from_person_id; if(!groups[key])groups[key]={parents:ps.length?ps:[r.from_person_id],children:[]}; if(!groups[key].children.includes(child))groups[key].children.push(child)}); return Object.values(groups)}
function populateTreeFocus(){const sel=el('treeFocusSelect'); if(!sel)return; const old=treeFocusId||sel.value; sel.innerHTML='<option value="">Whole archive</option>'+visiblePeople().map(p=>`<option value="${p.id}">${escapeHtml(fullName(p))}</option>`).join(''); sel.value=old||''; document.querySelectorAll('.tree-mode-btn').forEach(b=>b.classList.toggle('primary',b.dataset.mode===treeMode)); applyTheme(currentTheme)}
function setGraphFocus(id){treeFocusId=id; renderGraph()}
function setTreeMode(mode){treeMode=mode; populateTreeFocus(); renderGraph()}
function peopleForTree(){let ids=new Set(visiblePeople().map(p=>p.id)); if(treeMode==='ancestors'&&treeFocusId){ids=new Set([treeFocusId]); const walk=id=>parentsOf(id).forEach(p=>{ids.add(p);walk(p)}); walk(treeFocusId)} else if(treeMode==='descendants'&&treeFocusId){ids=new Set([treeFocusId]); const walk=id=>childrenOf(id).forEach(c=>{ids.add(c);walk(c)}); walk(treeFocusId)} else if(treeMode==='focus'&&treeFocusId){ids=new Set([treeFocusId,...parentsOf(treeFocusId),...childrenOf(treeFocusId),...partnersOf(treeFocusId)]); parentsOf(treeFocusId).forEach(p=>parentsOf(p).forEach(g=>ids.add(g))); childrenOf(treeFocusId).forEach(c=>childrenOf(c).forEach(g=>ids.add(g)))} else if(treeMode==='photo'&&currentPhoto){ids=new Set(faces.filter(f=>f.photo_id===currentPhoto.id&&f.person_id).map(f=>f.person_id))} return ids}
function layoutPositions(){const include=peopleForTree(),real=visiblePeople().filter(p=>include.has(p.id)),pos={},nodeW=178,unitGap=28,rowGap=250,startY=120; const partner=new Map(); partnerPairs().forEach(([a,b])=>{partner.set(a,b);partner.set(b,a)}); const depth={}; real.forEach(p=>depth[p.id]=generationDepth(p.id)); for(let i=0;i<6;i++)partnerPairs().forEach(([a,b])=>{if(!include.has(a)||!include.has(b))return; const d=Math.max(depth[a]||0,depth[b]||0); depth[a]=d;depth[b]=d}); const unitsByRow={},used=new Set(); real.forEach(p=>{if(used.has(p.id))return; const q=partner.get(p.id); let members=[p.id]; if(q&&!used.has(q)&&include.has(q)&&(depth[q]||0)===(depth[p.id]||0)){members=[p.id,q].sort((a,b)=>fullName(person(a)).localeCompare(fullName(person(b))));used.add(q)} used.add(p.id); const d=depth[p.id]||0; (unitsByRow[d]||=[]).push({members,x:0,width:members.length*nodeW+(members.length-1)*unitGap})}); Object.values(unitsByRow).forEach(units=>units.sort((u,v)=>fullName(person(u.members[0])).localeCompare(fullName(person(v.members[0]))))); Object.entries(unitsByRow).forEach(([d,units])=>{let x=160; units.forEach(u=>{u.x=x; x+=u.width+80})}); const findUnit=id=>Object.values(unitsByRow).flat().find(u=>u.members.includes(id)); const unitCenter=u=>u.x+u.width/2; const setUnitX=(u,x)=>u.x=x; parentGroups().forEach(g=>{const parentUnits=[...new Set(g.parents.filter(id=>include.has(id)).map(findUnit).filter(Boolean))]; const childUnits=[...new Set(g.children.filter(id=>include.has(id)).map(findUnit).filter(Boolean))]; if(!parentUnits.length||!childUnits.length)return; const pc=parentUnits.reduce((s,u)=>s+unitCenter(u),0)/parentUnits.length; const total=childUnits.reduce((s,u)=>s+u.width,0)+(childUnits.length-1)*80; let x=pc-total/2; childUnits.forEach(u=>{setUnitX(u,x);x+=u.width+80})}); Object.entries(unitsByRow).forEach(([d,units])=>{units.sort((a,b)=>a.x-b.x); let min=80; units.forEach(u=>{if(u.x<min)u.x=min;min=u.x+u.width+70}); const y=startY+Number(d)*rowGap; units.forEach(u=>u.members.forEach((id,i)=>{pos[id]={x:u.x+i*(nodeW+unitGap),y,unit:u}}))}); return pos}
async function renderGraph(){const graph=el('graph'); if(!graph)return; graph.innerHTML='<div class="graph-inner" id="graphInner"></div>'; const inner=el('graphInner'),pos=layoutPositions(),nodeW=178,nodeH=140,include=peopleForTree(); partnerPairs().forEach(([a,b])=>{if(!include.has(a)||!include.has(b)||!pos[a]||!pos[b])return; const left=pos[a].x<pos[b].x?a:b,right=left===a?b:a; const y=pos[left].y+62; drawH(inner,pos[left].x+nodeW,y,pos[right].x-(pos[left].x+nodeW)); label(inner,(pos[left].x+nodeW+pos[right].x)/2-28,y-24,'Partner')}); parentGroups().forEach(g=>{const parents=g.parents.filter(id=>include.has(id)&&pos[id]),children=g.children.filter(id=>include.has(id)&&pos[id]); if(!parents.length||!children.length)return; const pc=parents.reduce((s,id)=>s+pos[id].x+nodeW/2,0)/parents.length; const parentBottom=Math.max(...parents.map(id=>pos[id].y+nodeH)); const childTop=Math.min(...children.map(id=>pos[id].y)); const busY=(parentBottom+childTop)/2; drawV(inner,pc,parentBottom,busY-parentBottom); const left=Math.min(...children.map(id=>pos[id].x+nodeW/2)),right=Math.max(...children.map(id=>pos[id].x+nodeW/2)); drawH(inner,left,busY,right-left); children.forEach(id=>drawV(inner,pos[id].x+nodeW/2,busY,pos[id].y-busY))}); for(const p of visiblePeople().filter(p=>include.has(p.id))){const xy=pos[p.id]||{x:100,y:100},n=document.createElement('button');n.className='node tree-node'+(p.id===treeFocusId?' selected-node':'');n.style.left=xy.x+'px';n.style.top=xy.y+'px';n.onclick=()=>showPerson(p.id);n.innerHTML=`${await photoHtml(p,64)}<strong>${escapeHtml(fullName(p))}</strong><span class="small">${p.birth_date||''}${p.death_date?' – '+p.death_date:''}</span>`; inner.appendChild(n)} applyGraphZoom()}
function drawH(g,x,y,w){const e=document.createElement('div');e.className='line h';if(w<0){e.style.left=x+w+'px';e.style.width=-w+'px'}else{e.style.left=x+'px';e.style.width=w+'px'}e.style.top=y+'px';g.appendChild(e)}
function drawV(g,x,y,h){const e=document.createElement('div');e.className='line v';e.style.left=x+'px';e.style.top=y+'px';e.style.height=Math.max(0,h)+'px';g.appendChild(e)}
function label(g,x,y,text){const e=document.createElement('div');e.className='rel-label';e.style.left=x+'px';e.style.top=y+'px';e.textContent=text;g.appendChild(e)}
function applyGraphZoom(){const inner=el('graphInner'); if(inner)inner.style.transform=`scale(${graphScale})`;safeText('zoomLabel',Math.round(graphScale*100)+'%')}
function zoomGraph(delta){const wrap=el('graphWrap'); if(!wrap)return; const old=graphScale,cx=wrap.scrollLeft+wrap.clientWidth/2,cy=wrap.scrollTop+wrap.clientHeight/2; graphScale=Math.max(.25,Math.min(2.2,graphScale+delta));applyGraphZoom();wrap.scrollLeft=(cx/old)*graphScale-wrap.clientWidth/2;wrap.scrollTop=(cy/old)*graphScale-wrap.clientHeight/2}
function resetGraphZoom(){graphScale=1;applyGraphZoom()}
function fitGraph(){const wrap=el('graphWrap'); if(!wrap)return; graphScale=.78;applyGraphZoom();wrap.scrollLeft=60;wrap.scrollTop=40}



/* === Emergency fix: robust selected-face naming ===
   This intentionally overrides the earlier face selection/editor functions.
   Click selects immediately; editing panel is always rebuilt; save works for unnamed faces.
*/
function selectFaceForEditing(id){
  selectedFaceId=id;
  setStatus('Face selected');
  renderFaceEditor();
  renderCurrentPhoto();
}

function faceElement(f){
  const d=document.createElement('div');
  d.className='face'+(f.person_id?' named':'')+(f.id===selectedFaceId?' selected':'')+(!f.person_id?' unknown':'');
  d.style.left=Number(f.x)+'px';
  d.style.top=Number(f.y)+'px';
  d.style.width=Number(f.w)+'px';
  d.style.height=Number(f.h)+'px';
  const label=f.label || (f.person_id ? '' : 'Unnamed face');
  d.innerHTML=`<span>${escapeHtml(label)}</span><div class="handle"></div>`;

  d.addEventListener('click',ev=>{
    ev.preventDefault();
    ev.stopPropagation();
    selectFaceForEditing(f.id);
  });

  d.addEventListener('dblclick',ev=>{
    ev.preventDefault();
    ev.stopPropagation();
    selectFaceForEditing(f.id);
    setEditMode(true);
    setTimeout(()=>el('faceName')?.focus(),0);
  });

  d.addEventListener('pointerdown',ev=>startDrag(ev,f.id));
  const h=d.querySelector('.handle');
  if(h)h.addEventListener('pointerdown',ev=>startResize(ev,f.id));
  return d;
}

function startDrag(ev,id){
  if(ev.target.classList.contains('handle'))return;
  selectedFaceId=id;
  renderFaceEditor();
  if(!editMode)return;
  ev.preventDefault();
  ev.stopPropagation();
  const f=faces.find(x=>x.id===id); if(!f)return;
  dragState={mode:'drag',id,startX:ev.clientX,startY:ev.clientY,x:Number(f.x),y:Number(f.y)};
  try{ev.currentTarget.setPointerCapture(ev.pointerId)}catch(e){}
  window.addEventListener('pointermove',onPointerMove);
  window.addEventListener('pointerup',endPointer);
}

function renderFaceEditor(){
  const w=el('faceEditor'); if(!w)return;
  const f=faces.find(x=>x.id===selectedFaceId);
  if(!f){
    w.innerHTML='<p>Select or add a face box.</p><button class="full" onclick="suggestFaceForPhoto()">Suggest a face/name</button>';
    return;
  }
  const p=f.person_id?person(f.person_id):null;
  const current=p?fullName(p):(f.label||'Unnamed face');

  if(!canEdit()){
    w.innerHTML=`<p><strong>${escapeHtml(current)}</strong></p><textarea id="faceSuggestionText" placeholder="Suggest a correction…"></textarea><button class="primary full" onclick="suggestSelectedFaceName()">Send suggestion</button>`;
    return;
  }

  const opts=['<option value="">Choose existing person…</option>'].concat(
    visiblePeople().map(pp=>`<option value="${pp.id}" ${pp.id===f.person_id?'selected':''}>${escapeHtml(fullName(pp))}</option>`)
  ).join('');
  const typed=p?'':(f.label||'');
  w.innerHTML=`
    <div class="selected-face-summary">
      <p class="small">Current</p>
      <strong>${escapeHtml(current)}</strong>
    </div>
    <div class="form-grid compact-form">
      <label>Use existing person
        <select id="existingPersonSelect">${opts}</select>
      </label>
      <button class="primary full" onclick="attachFaceToExisting()">Use selected person</button>
      <label>Name / create person
        <input id="faceName" value="${escapeHtml(typed)}" placeholder="Type full name" autocomplete="off">
      </label>
      <button class="full" onclick="saveFaceName()">Save typed name</button>
      ${p?'<button class="full" onclick="unlinkSelectedFace()">Unlink this face</button>':''}
      <button class="full" onclick="suggestSelectedFaceName()">Suggest correction instead</button>
    </div>`;

  const input=el('faceName');
  if(input){
    input.addEventListener('keydown',ev=>{ if(ev.key==='Enter'){ ev.preventDefault(); saveFaceName(); }});
    input.addEventListener('blur',()=>{ input.value=titleCaseName(input.value); });
  }
}

async function saveFaceName(){
  const f=faces.find(x=>x.id===selectedFaceId);
  const input=el('faceName');
  const raw=(input?.value||'').replace(/\s+/g,' ').trim();
  const name=titleCaseName(raw);
  if(!f){ alert('Select a face first.'); return; }
  if(!name){ alert('Type a name first, or choose an existing person.'); input?.focus(); return; }
  if(['unknown','unknown person','unnamed','unnamed person','unnamed face'].includes(name.toLowerCase())){
    alert('Please enter the real name, or leave this face unnamed until known.');
    input?.focus();
    return;
  }
  let p=people.find(pp=>fullName(pp).toLowerCase()===name.toLowerCase());
  if(!p){
    const parts=name.split(' ');
    const ins=await sb.from('people').insert({
      display_name:name,
      given_names:parts[0]||name,
      family_name:parts.slice(1).join(' ')||null,
      created_by:session.user.id
    }).select().single();
    if(ins.error){alert(ins.error.message);return;}
    p=ins.data;
    people.push(p);
  }
  const upd=await sb.from('faces').update({person_id:p.id,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single();
  if(upd.error){alert(upd.error.message);return;}
  Object.assign(f,upd.data);
  setStatus('Face named');
  await renderCurrentPhoto();
  renderFaceEditor();
  updateSide();
  await renderPeople();
  await renderPhotoSidebar();
  updateDashboard();
}

Object.assign(window,{selectFaceForEditing,sendLogin,signOut,showPage,refreshData,setEditMode,uploadPhoto,selectPhotoById,selectLatestPhoto,previousPhoto,nextPhoto,detectFacesOnPhoto,addFaceBox,deleteSelectedFace,attachFaceToExisting,unlinkSelectedFace,saveFaceName,suggestSelectedFaceName,suggestFaceForPhoto,toggleFaceBoxes,toggleFaceNames,saveCurrentPhotoDetails,addPhotoComment,setRel,saveRelationship,deleteRelationship,renderRelationshipAssistant,queueRelationshipAssistantRender,saveAssistantRelationships,newFeedbackPrompt,setSuggestionStatus,setFeedbackStatus,addUnknownPerson,deletePerson,showPerson,linkMyProfileToPerson,focusTreeOnPerson,showDbTab,renderDatabase,selectDbPerson,selectDbPhoto,savePersonRecord,savePhotoRecord,showDeathDateField,renderGraph,fitGraph,zoomGraph,resetGraphZoom,setGraphFocus,setTreeMode,applyTheme,titleCaseName});
boot();
