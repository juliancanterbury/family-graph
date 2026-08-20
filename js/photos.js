import { S, $, html, text, esc, fullName, person, titleCaseName, uid, status, userId, userName, canDelete, canEdit, canEditFace, visiblePeople, visiblePhotos, findSimilarPerson } from './state.js';
import { publicUrl, bucket, loadAll, addOptional } from './api.js';
import { avatarHtml, cropStyle, faceForPerson, personOptions, photoTitle } from './render.js';
import { renderPeople } from './people.js';
import { showPage } from './navigation.js';

export async function renderPhotoPage(){await renderCurrentPhoto(); await renderPhotos(); await renderPhotoPeople(); renderFaceEditor(); renderPhotoStats(); renderComments(); fillRelationshipSelects()}
export async function renderPhotos(){
  const box=$('photoList'); if(!box)return; const list=visiblePhotos(); if(!list.length){box.innerHTML='<p class="small">No photos in view yet — try "Show everyone" if you expected to see some here.</p>';return}
  let out=''; for(const ph of list){const url=await publicUrl(ph); const fc=S.faces.filter(f=>f.photo_id===ph.id).length; const nc=S.faces.filter(f=>f.photo_id===ph.id&&f.person_id).length; const d=ph.taken_date||ph.created_at?.slice(0,10)||''; out+=`<button class="photo-list-item ${S.currentPhoto?.id===ph.id?'active':''}" data-photo-id="${ph.id}"><img src="${url}"><span><b>${esc(photoTitle(ph))}${ph.private?' 🔒':''}</b><small>${esc(d)} · ${fc} face${fc===1?'':'s'}${nc?` · ${nc} named`:''}</small></span></button>`}
  box.innerHTML=out;
}
export async function renderPhotoPeople(){const box=$('photoPeopleNav'); if(!box)return; let out=''; for(const p of visiblePeople().slice(0,30)){const f=faceForPerson(p.id); out+=`<div class="photo-person-link" data-person-id="${p.id}"><div class="tiny-avatar" style="${f?await cropStyle(f,34):''}">${f?'':esc((fullName(p)[0]||'?').toUpperCase())}</div><div><b>${esc(fullName(p))}</b><br><span class="small">${esc(p.birth_date||'')}</span></div><span class="blue-dot"></span></div>`} box.innerHTML=out||'<p class="small">No people yet.</p>'}
export async function renderCurrentPhoto(){
  const img=$('mainPhoto'), empty=$('emptyPhoto'), c=$('photoCanvas'); if(!c)return;
  c.querySelectorAll('.face').forEach(x=>x.remove());
  if(empty) empty.style.display=S.currentPhoto?'none':'grid';
  c.classList.toggle('empty-state',!S.currentPhoto);
  if(!S.currentPhoto){if(img)img.removeAttribute('src'); return}
  if(img){img.src=await publicUrl(S.currentPhoto); try{await waitForImage(img)}catch(e){console.error(e)}}
  S.faces.filter(f=>f.photo_id===S.currentPhoto.id).forEach(f=>c.appendChild(faceEl(f)));
  c.classList.toggle('hide-boxes',!S.showBoxes); c.classList.toggle('hide-names',!S.showNames);
  $('photoDate') && ($('photoDate').value=S.currentPhoto.taken_date||'');
  $('photoPlace') && ($('photoPlace').value=S.currentPhoto.location||S.currentPhoto.place||'');
}
function boxSize(){const img=$('mainPhoto'); return {dw:img?.clientWidth||1, dh:img?.clientHeight||1, nw:img?.naturalWidth||1, nh:img?.naturalHeight||1}}
export function isLegacyPx(f){return (+f.x||0)>1.5||(+f.y||0)>1.5||(+f.w||0)>1.5||(+f.h||0)>1.5}
function toScreen(f){const {dw,dh}=boxSize(); if(isLegacyPx(f))return{left:+f.x||0,top:+f.y||0,width:+f.w||70,height:+f.h||90}; return{left:(+f.x||0)*dw,top:(+f.y||0)*dh,width:(+f.w||.1)*dw,height:(+f.h||.12)*dh}}
function faceEl(f){const editable=canEditFace(f); const d=document.createElement('div'); d.className='face'+(f.person_id?' named':'')+(f.id===S.selectedFaceId?' selected':'')+(editable?'':' not-mine'); d.dataset.faceId=f.id; const s=toScreen(f); d.style.left=s.left+'px'; d.style.top=s.top+'px'; d.style.width=s.width+'px'; d.style.height=s.height+'px'; d.innerHTML=`<span>${esc(f.label||'')}</span>${editable?'<div class="handle"></div>':''}`; d.addEventListener('pointerdown',e=>startDrag(e,f.id,d)); d.querySelector('.handle')?.addEventListener('pointerdown',e=>startResize(e,f.id,d)); d.addEventListener('click',async e=>{
  e.stopPropagation();
  if(!S.editMode && f.person_id){const {showPerson}=await import('./navigation.js'); S.returnTo={page:'photo',photoId:S.currentPhoto?.id}; await showPerson(f.person_id); return}
  if(S.selectedFaceId===f.id)return; selectFace(f.id,d); renderFaceEditor();
}); return d}
export function repositionFaceBoxes(){
  const c=$('photoCanvas'); if(!c)return;
  c.querySelectorAll('.face').forEach(el=>{
    const f=S.faces.find(x=>x.id===el.dataset.faceId); if(!f)return;
    const s=toScreen(f);
    el.style.left=s.left+'px'; el.style.top=s.top+'px'; el.style.width=s.width+'px'; el.style.height=s.height+'px';
  });
}
export function applyPhotoZoom(){
  const img=$('mainPhoto'); if(!img)return;
  if(S.photoZoom===1){img.style.width=''; S.photoBaseWidth=null}
  else {
    if(!S.photoBaseWidth) S.photoBaseWidth=img.getBoundingClientRect().width||img.clientWidth||720;
    img.style.width=Math.round(S.photoBaseWidth*S.photoZoom)+'px';
  }
  const label=$('photoZoomLabel'); if(label)label.textContent=Math.round(S.photoZoom*100)+'%';
  repositionFaceBoxes();
}
export function zoomPhoto(delta){S.photoZoom=Math.max(.3,Math.min(3,+(S.photoZoom+delta).toFixed(2))); applyPhotoZoom()}
export function resetPhotoZoom(){S.photoZoom=1; applyPhotoZoom()}
export function renderFaceEditor(){
  const w=$('faceEditor'); if(!w)return; const f=S.faces.find(x=>x.id===S.selectedFaceId);
  if(!f){w.innerHTML='<p>Select or add a face box.</p><button class="full" id="suggestFaceInline">Suggest a face/name</button>';return}
  const p=f.person_id?person(f.person_id):null;
  if(!canEdit()||!canEditFace(f)){const reason=!canEdit()?'':'<p class="small">Added by someone else — you can suggest a correction, but only they (or the owner) can edit or delete this box directly.</p>'; w.innerHTML=`<p><strong>${esc(p?fullName(p):(f.label||'Unnamed'))}</strong></p>${reason}<textarea id="faceSuggestionText" placeholder="Suggest a correction…"></textarea><button class="primary full" id="sendFaceSuggestion">Send suggestion</button>`;return}
  let suggestionHtml='';
  if(!p&&f.descriptor){
    const match=findFaceMatch(f.descriptor);
    if(match){const mp=person(match.personId); if(mp)suggestionHtml=`<div class="face-suggestion"><p class="small">Might be <strong>${esc(fullName(mp))}</strong> (${Math.round(match.score*100)}% match, testing — owner only for now)</p><button class="primary full" id="confirmSuggestedFace" data-suggested-person="${mp.id}">Yes, that's ${esc(fullName(mp).split(' ')[0])}</button></div>`}
  }
  w.innerHTML=`<div class="selected-face-summary"><p class="small">Current</p><strong>${p?`<button class="link-btn" data-person-id="${p.id}">${esc(fullName(p))} →</button>`:esc(f.label||'Unnamed face')}</strong></div>${suggestionHtml}<div class="form-grid compact-form"><label>Use existing person<select id="existingPersonSelect">${personOptions(f.person_id||'')}</select></label><button class="primary full" id="attachExistingBtn">Use selected person</button><label>Create new person<input id="faceName" value="${esc(p?fullName(p):(f.label||''))}" placeholder="Type a new full name"></label><button class="full" id="saveTypedFaceBtn">Create / save typed name</button><button class="full" id="suggestCorrectionBtn">Suggest correction instead</button></div>`;
}
export function renderPhotoStats(){text('faceCount',S.currentPhoto?S.faces.filter(f=>f.photo_id===S.currentPhoto.id).length:0); text('namedCount',S.currentPhoto?S.faces.filter(f=>f.photo_id===S.currentPhoto.id&&f.person_id).length:0); text('toggleBoxesBtn',S.showBoxes?'Hide boxes':'Show boxes'); text('toggleNamesBtn',S.showNames?'Hide names':'Show names');
  const upLine=$('photoUploaderLine');
  if(upLine){
    if(!S.currentPhoto){upLine.textContent='Uploaded by: —'}
    else if(S.currentPhoto.uploaded_by===userId()){upLine.textContent='Uploaded by: you'}
    else {const p=S.profiles?.find(x=>x.user_id===S.currentPhoto.uploaded_by); upLine.textContent='Uploaded by: '+(p?(p.display_name||p.email):(canDelete()?'Unknown account':'Only the owner can see who uploaded this'))}
  }
}
export function renderComments(){const box=$('photoComments'); if(!box)return; const rows=S.comments.filter(c=>c.photo_id===S.currentPhoto?.id).slice(0,20); box.innerHTML=rows.length?rows.map(c=>`<div class="comment"><b>${esc(c.author_name||c.created_by||'Family member')}</b><br>${esc(c.body||c.comment||'')}</div>`).join(''):'No comments yet.'}
function fillRelationshipSelects(){const opts=visiblePeople().map(p=>`<option value="${p.id}">${esc(fullName(p))}</option>`).join(''); html('relA',opts); html('relB',opts)}
export async function selectPhoto(id){const ph=S.photos.find(p=>p.id===id); if(!ph)return; S.currentPhoto=ph; S.selectedFaceId=null; S.photoZoom=1; S.photoBaseWidth=null; await renderPhotoPage(); status('Photo loaded')}
export async function uploadPhotoFile(file){
  if(!file)return; status('Uploading photo…'); const id=uid(), ext=(file.name.split('.').pop()||'jpg').toLowerCase(), path=`photos/${id}/original.${ext}`; const up=await S.sb.storage.from(bucket()).upload(path,file,{upsert:false}); if(up.error)return alert(up.error.message); const dims=await imageDims(file); const isPrivate=canDelete()&&!!$('privatePhotoToggle')?.checked; const ins=await S.sb.from('photos').insert({id,title:file.name,storage_path:path,original_filename:file.name,mime_type:file.type,width:dims.width,height:dims.height,uploaded_by:userId(),private:isPrivate}).select().single(); if(ins.error)return alert(ins.error.message); S.photos.unshift(ins.data); S.currentPhoto=ins.data; await renderPhotoPage(); status(isPrivate?'Private photo saved (only visible to you)':'Photo saved'); setTimeout(()=>detectFaces(true),350);
}
export async function uploadPhoto(ev){await uploadPhotoFile(ev.target.files?.[0])}
export async function uploadPhotoAndOpen(ev){await uploadPhotoFile(ev.target.files?.[0]); if(S.currentPhoto) await showPage('photo')}
function bindDropZone(el,onFile){
  if(!el)return;
  ['dragenter','dragover'].forEach(evt=>el.addEventListener(evt,e=>{e.preventDefault(); e.stopPropagation(); el.classList.add('drag-over')}));
  ['dragleave','dragend'].forEach(evt=>el.addEventListener(evt,e=>{if(e.target===el||!el.contains(e.relatedTarget))el.classList.remove('drag-over')}));
  el.addEventListener('drop',e=>{e.preventDefault(); e.stopPropagation(); el.classList.remove('drag-over'); const file=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith('image/')); if(!file){alert('That doesn\'t look like an image file.');return} onFile(file)});
}
function imageDims(file){return new Promise(res=>{const img=new Image(); const url=URL.createObjectURL(file); img.onload=()=>{res({width:img.naturalWidth,height:img.naturalHeight}); URL.revokeObjectURL(url)}; img.onerror=()=>res({width:null,height:null}); img.src=url})}
export async function latestPhoto(){const list=visiblePhotos(); if(list[0])await selectPhoto(list[0].id)}
export async function prevPhoto(){const list=visiblePhotos(); const i=list.findIndex(p=>p.id===S.currentPhoto?.id); if(i>0)await selectPhoto(list[i-1].id)}
export async function nextPhoto(){const list=visiblePhotos(); const i=list.findIndex(p=>p.id===S.currentPhoto?.id); if(i>=0&&i<list.length-1)await selectPhoto(list[i+1].id)}
export async function addFaceBox(){if(!S.currentPhoto)return alert('Upload a photo first.'); const ins=await S.sb.from('faces').insert({photo_id:S.currentPhoto.id,x:0.4,y:0.35,w:0.15,h:0.18,label:null,status:'manual',created_by:userId()}).select().single(); if(ins.error)return alert(ins.error.message); S.faces.push(ins.data); S.selectedFaceId=ins.data.id; await renderPhotoPage(); status('Face saved')}
export async function attachExisting(){const f=S.faces.find(x=>x.id===S.selectedFaceId), pid=$('existingPersonSelect')?.value; if(!f||!pid)return alert('Choose an existing person first.'); if(!canEditFace(f))return alert('Only whoever added this box (or the owner) can edit it directly — use "Suggest correction" instead.'); const p=person(pid); const upd=await S.sb.from('faces').update({person_id:pid,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single(); if(upd.error)return alert(upd.error.message); Object.assign(f,upd.data); await renderPhotoPage(); await renderPeople(); status('Face linked')}
export async function confirmSuggestedFace(personId){
  const f=S.faces.find(x=>x.id===S.selectedFaceId); if(!f||!personId)return;
  const p=person(personId); if(!p)return;
  const upd=await S.sb.from('faces').update({person_id:personId,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single();
  if(upd.error)return alert(upd.error.message);
  Object.assign(f,upd.data); await renderPhotoPage(); await renderPeople(); status('Confirmed — thanks!');
}
export async function saveFaceName(){const f=S.faces.find(x=>x.id===S.selectedFaceId), name=titleCaseName($('faceName')?.value||''); if(!f||!name)return; if(!canEditFace(f))return alert('Only whoever added this box (or the owner) can edit it directly — use "Suggest correction" instead.'); let p=S.people.find(x=>fullName(x).toLowerCase()===name.toLowerCase()); if(!p){const match=findSimilarPerson(name); if(match&&!match.exact&&!confirm(`"${fullName(match.person)}" already exists and looks similar. Create "${name}" as a separate new person anyway?`))return; const parts=name.split(' '); const ins=await S.sb.from('people').insert({display_name:name,given_names:parts[0]||name,family_name:parts.slice(1).join(' ')||null,created_by:userId()}).select().single(); if(ins.error)return alert(ins.error.message); p=ins.data; S.people.push(p)} const upd=await S.sb.from('faces').update({person_id:p.id,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single(); if(upd.error)return alert(upd.error.message); Object.assign(f,upd.data); await renderPhotoPage(); await renderPeople(); status('Face saved')}
export async function deleteFace(){const f=S.faces.find(x=>x.id===S.selectedFaceId); if(!f)return; if(!canEditFace(f))return alert('Only whoever added this box (or the owner) can delete it.'); const del=await S.sb.from('faces').delete().eq('id',S.selectedFaceId); if(del.error)return alert(del.error.message); S.faces=S.faces.filter(f=>f.id!==S.selectedFaceId); S.selectedFaceId=null; await renderPhotoPage()}
export async function deletePhoto(){
  if(!S.currentPhoto)return;
  const ph=S.currentPhoto;
  if(!canDelete()&&ph.uploaded_by!==userId())return alert('Only whoever uploaded this photo (or the owner) can delete it.');
  if(!confirm('Delete this photo and all its face tags? This cannot be undone.'))return;
  const del=await S.sb.from('photos').delete().eq('id',ph.id);
  if(del.error)return alert(del.error.message);
  await S.sb.storage.from(bucket()).remove([ph.storage_path]).catch(()=>{});
  S.photos=S.photos.filter(p=>p.id!==ph.id);
  S.faces=S.faces.filter(f=>f.photo_id!==ph.id);
  S.currentPhoto=null; S.selectedFaceId=null;
  await renderPhotoPage();
  status('Photo deleted');
}
export async function rotatePhoto(direction){
  if(!S.currentPhoto)return;
  const ph=S.currentPhoto;
  if(!canDelete()&&ph.uploaded_by!==userId())return alert('Only whoever uploaded this photo (or the owner) can rotate it.');
  const img=$('mainPhoto'); if(!img||!img.complete||!img.naturalWidth)return alert('Wait for the photo to finish loading first.');
  status('Rotating…');
  const nw=img.naturalWidth, nh=img.naturalHeight, newW=nh, newH=nw;
  const canvas=document.createElement('canvas'); canvas.width=newW; canvas.height=newH;
  const ctx=canvas.getContext('2d');
  if(direction===90){ctx.translate(newW,0); ctx.rotate(Math.PI/2)} else {ctx.translate(0,newH); ctx.rotate(-Math.PI/2)}
  ctx.drawImage(img,0,0,nw,nh);
  const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',0.92));
  const up=await S.sb.storage.from(bucket()).upload(ph.storage_path,blob,{upsert:true,contentType:'image/jpeg'});
  if(up.error){alert(up.error.message);return}
  const photoFaces=S.faces.filter(f=>f.photo_id===ph.id);
  for(const f of photoFaces){
    if(isLegacyPx(f))continue; // legacy boxes can't be safely rotated automatically — same one-time-nudge fix as before applies
    const x=+f.x||0,y=+f.y||0,w=+f.w||0,h=+f.h||0;
    let nx,ny,nwF,nhF;
    if(direction===90){nx=1-y-h; ny=x; nwF=h; nhF=w} else {nx=y; ny=1-x-w; nwF=h; nhF=w}
    const upd=await S.sb.from('faces').update({x:nx,y:ny,w:nwF,h:nhF}).eq('id',f.id).select().single();
    if(!upd.error)Object.assign(f,upd.data);
  }
  const updPhoto=await S.sb.from('photos').update({width:newW,height:newH,updated_at:new Date().toISOString()}).eq('id',ph.id).select().single();
  if(!updPhoto.error){Object.assign(S.currentPhoto,updPhoto.data); const idx=S.photos.findIndex(p=>p.id===ph.id); if(idx>-1)S.photos[idx]=S.currentPhoto}
  S.photoZoom=1; S.photoBaseWidth=null;
  await renderPhotoPage();
  status('Photo rotated');
}
export async function savePhotoMeta(){if(!S.currentPhoto)return; const d=$('photoDate')?.value.trim()||null, loc=$('photoPlace')?.value.trim()||null; const r=await S.sb.from('photos').update({taken_date:d,location:loc}).eq('id',S.currentPhoto.id).select().single(); if(r.error)return alert(r.error.message); Object.assign(S.currentPhoto,r.data); await renderPhotos(); status('Photo details saved')}
export async function postComment(){const body=$('commentText')?.value.trim(); if(!body)return; const row=await addOptional('comments',{photo_id:S.currentPhoto?.id,body,author_id:userId(),author_name:userName(),status:'open'}); S.comments.unshift(row); $('commentText').value=''; renderComments()}
export async function suggestFace(){const body=prompt('Who or what should be corrected/added?'); if(!body)return; const row=await addOptional('suggestions',{type:'photo_face_suggestion',photo_id:S.currentPhoto?.id,face_id:S.selectedFaceId,body,suggested_value:body,author_id:userId(),author_name:userName(),status:'open'}); S.suggestions.unshift(row); alert('Suggestion added for review.')}
let drag=null;
function selectFace(id,el){S.selectedFaceId=id; document.querySelectorAll('.photo-canvas .face.selected').forEach(x=>x.classList.remove('selected')); el?.classList.add('selected')}
function startDrag(ev,id,el){if(ev.target.classList.contains('handle')||!S.editMode)return; const f=S.faces.find(x=>x.id===id); if(!canEditFace(f))return; ev.preventDefault(); selectFace(id,el); const s=toScreen(f); drag={mode:'move',id,el,sx:ev.clientX,sy:ev.clientY,x:s.left,y:s.top,...boxSize()}; window.addEventListener('pointermove',move); window.addEventListener('pointerup',end); renderFaceEditor()}
function startResize(ev,id,el){if(!S.editMode)return; const f=S.faces.find(x=>x.id===id); if(!canEditFace(f))return; ev.preventDefault(); ev.stopPropagation(); selectFace(id,el); const s=toScreen(f); drag={mode:'resize',id,el,sx:ev.clientX,sy:ev.clientY,w:s.width,h:s.height,...boxSize()}; window.addEventListener('pointermove',move); window.addEventListener('pointerup',end)}
function move(ev){if(!drag)return; const f=S.faces.find(x=>x.id===drag.id); if(!f)return; const {dw,dh}=drag; if(!dw||!dh||!isFinite(dw)||!isFinite(dh))return;
  if(drag.mode==='move'){const px=Math.max(0,drag.x+ev.clientX-drag.sx), py=Math.max(0,drag.y+ev.clientY-drag.sy); const nx=px/dw, ny=py/dh; if(isFinite(nx)&&isFinite(ny)){f.x=nx;f.y=ny}}
  else {const pw=Math.max(24,drag.w+ev.clientX-drag.sx), ph=Math.max(24,drag.h+ev.clientY-drag.sy); const nw=pw/dw, nh=ph/dh; if(isFinite(nw)&&isFinite(nh)){f.w=nw;f.h=nh}}
  const box=drag.el; if(box){const s=toScreen(f); box.style.left=s.left+'px';box.style.top=s.top+'px';box.style.width=s.width+'px';box.style.height=s.height+'px'}}
async function end(){if(drag){const f=S.faces.find(x=>x.id===drag.id); if(f&&isFinite(+f.x)&&isFinite(+f.y)&&isFinite(+f.w)&&isFinite(+f.h))await S.sb.from('faces').update({x:f.x,y:f.y,w:f.w,h:f.h}).eq('id',f.id)} drag=null; window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',end)}
function waitForImage(img){return new Promise((res,rej)=>{if(!img)return rej(new Error('Photo missing')); if(img.complete&&img.naturalWidth)return res(img); img.onload=()=>res(img); img.onerror=()=>rej(new Error('Photo failed to load'))})}
function iou(a,b){const ax=a.x+a.w,ay=a.y+a.h,bx=b.x+b.w,by=b.y+b.h,ix=Math.max(0,Math.min(ax,bx)-Math.max(a.x,b.x)),iy=Math.max(0,Math.min(ay,by)-Math.max(a.y,b.y)),inter=ix*iy; return inter/(a.w*a.h+b.w*b.h-inter||1)}
export async function detector(){if(S.humanPromise)return S.humanPromise; S.humanPromise=(async()=>{if(!window.Human)throw new Error('Face detector library did not load.'); const wantRecognition=canDelete(); S.human=new Human.Human({modelBasePath:'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',backend:'webgl',face:{enabled:true,detector:{enabled:true,rotation:true,maxDetected:100},mesh:{enabled:wantRecognition},iris:{enabled:false},description:{enabled:wantRecognition},emotion:{enabled:false}},body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false}}); status('Loading face detector…'); await S.human.load(); await S.human.warmup(); return S.human})(); return S.humanPromise}
// --- Face recognition (owner-only for now) ---
function cosineSim(a,b){if(!a||!b||a.length!==b.length)return 0; let dot=0,na=0,nb=0; for(let i=0;i<a.length;i++){dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]} return dot/((Math.sqrt(na)*Math.sqrt(nb))||1)}
export function findFaceMatch(descriptor){
  if(!descriptor||!canDelete())return null;
  let best=null,bestScore=0;
  for(const f of S.faces){
    if(!f.person_id||!f.descriptor||f.id===S.selectedFaceId)continue;
    const score=cosineSim(descriptor,f.descriptor);
    if(score>bestScore){bestScore=score;best=f.person_id}
  }
  return (best&&bestScore>0.72)?{personId:best,score:bestScore}:null;
}
export async function detectFaces(auto=false){try{if(!S.currentPhoto)return; const img=$('mainPhoto'); await waitForImage(img); const det=await detector(); status('Detecting faces…'); const r=await det.detect(img); const nw=img.naturalWidth||1, nh=img.naturalHeight||1; const found=(r.face||[]).map(fc=>{const b=fc.box||fc.boxRaw||[];return{x:(b[0]||0)/nw,y:(b[1]||0)/nh,w:(b[2]||0)/nw,h:(b[3]||0)/nh,descriptor:(fc.embedding&&fc.embedding.length)?Array.from(fc.embedding):null}}).filter(x=>x.w*nw>=24&&x.h*nh>=24); const exist=S.faces.filter(f=>f.photo_id===S.currentPhoto.id).map(f=>isLegacyPx(f)?{x:(+f.x||0)/((img.clientWidth||1)),y:(+f.y||0)/((img.clientHeight||1)),w:(+f.w||0)/((img.clientWidth||1)),h:(+f.h||0)/((img.clientHeight||1))}:{x:+f.x||0,y:+f.y||0,w:+f.w||0,h:+f.h||0}); const fresh=found.filter(x=>!exist.some(e=>iou(e,x)>.35)); if(!fresh.length){status(found.length?'Detected; all already boxed':'No faces detected'); if(!auto&&!found.length)alert('No faces detected. Use Add face box.'); return} const rows=fresh.map(x=>({...x,photo_id:S.currentPhoto.id,label:null,status:'detected',created_by:userId()})); const ins=await S.sb.from('faces').insert(rows).select(); if(ins.error)return alert(ins.error.message); S.faces.push(...ins.data); await renderPhotoPage(); status(`Detected ${fresh.length} new face${fresh.length===1?'':'s'}`)}catch(e){console.error(e); status('Face detection unavailable'); if(!auto)alert(e.message)}}

export function bindPhotos(){document.body.addEventListener('click',e=>{const p=e.target.closest('[data-photo-id]'); if(p)selectPhoto(p.dataset.photoId)}); $('photoInput')?.addEventListener('change',uploadPhoto); $('dashboardPhotoInput')?.addEventListener('change',uploadPhotoAndOpen); $('showUploadScreenBtn')?.addEventListener('click',()=>{S.currentPhoto=null;S.selectedFaceId=null;renderPhotoPage()}); $('latestPhotoBtn')?.addEventListener('click',latestPhoto); $('prevPhotoBtn')?.addEventListener('click',prevPhoto); $('nextPhotoBtn')?.addEventListener('click',nextPhoto); $('addFaceBtn')?.addEventListener('click',addFaceBox); $('detectFacesBtn')?.addEventListener('click',()=>detectFaces(false)); $('deleteFaceBtn')?.addEventListener('click',deleteFace); $('toggleBoxesBtn')?.addEventListener('click',()=>{S.showBoxes=!S.showBoxes;renderPhotoPage()}); $('toggleNamesBtn')?.addEventListener('click',()=>{S.showNames=!S.showNames;renderPhotoPage()}); $('suggestFaceBtn')?.addEventListener('click',suggestFace); $('savePhotoMetaBtn')?.addEventListener('click',savePhotoMeta); $('postCommentBtn')?.addEventListener('click',postComment); document.body.addEventListener('click',e=>{if(e.target.id==='attachExistingBtn')attachExisting(); if(e.target.id==='saveTypedFaceBtn')saveFaceName(); if(e.target.id==='suggestCorrectionBtn'||e.target.id==='suggestFaceInline')suggestFace(); const sug=e.target.closest('#confirmSuggestedFace'); if(sug)confirmSuggestedFace(sug.dataset.suggestedPerson)}); $('mainPhoto')?.addEventListener('click',()=>{if(!S.editMode){S.selectedFaceId=null;renderFaceEditor()}});
  let resizeTimer; const onResize=()=>{clearTimeout(resizeTimer); resizeTimer=setTimeout(repositionFaceBoxes,150)}; window.addEventListener('resize',onResize); window.addEventListener('orientationchange',onResize);
  bindDropZone($('dashboardDropZone'),async file=>{await uploadPhotoFile(file); if(S.currentPhoto){const {showPage}=await import('./navigation.js'); await showPage('photo')}});
  bindDropZone($('photoCanvas'),uploadPhotoFile);
  $('photoZoomInBtn')?.addEventListener('click',()=>zoomPhoto(.25));
  $('photoZoomOutBtn')?.addEventListener('click',()=>zoomPhoto(-.25));
  $('photoZoomResetBtn')?.addEventListener('click',resetPhotoZoom);
  $('rotateLeftBtn')?.addEventListener('click',()=>rotatePhoto(-90));
  $('rotateRightBtn')?.addEventListener('click',()=>rotatePhoto(90));
  $('deletePhotoBtn')?.addEventListener('click',deletePhoto);
  bindPhotoZoomGestures();
}
function bindPhotoZoomGestures(){
  const scroll=document.querySelector('.photo-scroll'); if(!scroll)return;
  scroll.addEventListener('wheel',e=>{
    if(!S.currentPhoto)return;
    e.preventDefault();
    zoomPhoto(e.deltaY<0?.15:-.15);
  },{passive:false});
  let pinchStartDist=0, pinchStartZoom=1;
  scroll.addEventListener('touchstart',e=>{
    if(e.touches.length===2){pinchStartDist=touchDist(e.touches); pinchStartZoom=S.photoZoom}
  },{passive:true});
  scroll.addEventListener('touchmove',e=>{
    if(e.touches.length===2 && pinchStartDist>0){
      e.preventDefault();
      const ratio=touchDist(e.touches)/pinchStartDist;
      S.photoZoom=Math.max(.3,Math.min(3,+(pinchStartZoom*ratio).toFixed(2)));
      applyPhotoZoom();
    }
  },{passive:false});
  scroll.addEventListener('touchend',()=>{pinchStartDist=0});
}
function touchDist(t){const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy)}