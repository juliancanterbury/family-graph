import { S, $, html, text, esc, fullName, person, titleCaseName, uid, status, userId, userName, canDelete, canEdit, canEditFace, visiblePeople, visiblePhotos, findSimilarPerson } from './state.js';
import { publicUrl, bucket, loadAll, addOptional } from './api.js';
import { avatarHtml, cropStyle, faceForPerson, personPickerHtml } from './render.js';
import { readExifDate } from './exif.js';
import { contentHash, visualHash, looksSame } from './photohash.js';
import { renderPeople } from './people.js';
import { showPage } from './navigation.js';

export async function renderPhotoPage(){await renderCurrentPhoto(); await renderPhotos(); await renderPhotoPeople(); renderFaceEditor(); renderPhotoStats(); renderComments(); fillRelationshipSelects()}
export async function renderPhotos(){
  const box=$('photoList'); if(!box)return;
  let list=visiblePhotos();
  const samePeopleOnly=document.querySelector('#photoFilterToggle [data-filter="same"]')?.classList.contains('primary');
  if(samePeopleOnly&&S.currentPhoto){
    const peopleHere=new Set(S.faces.filter(f=>f.photo_id===S.currentPhoto.id&&f.person_id).map(f=>f.person_id));
    if(peopleHere.size)list=list.filter(ph=>ph.id===S.currentPhoto.id||S.faces.some(f=>f.photo_id===ph.id&&f.person_id&&peopleHere.has(f.person_id)));
  }
  if(!list.length){box.innerHTML=samePeopleOnly?'<p class="small">No other photos with these people yet.</p>':'<p class="small">No photos in view yet — try "Show everyone" if you expected to see some here.</p>';return}
  let out=''; for(const ph of list){const url=await publicUrl(ph); const fc=S.faces.filter(f=>f.photo_id===ph.id).length; const nc=S.faces.filter(f=>f.photo_id===ph.id&&f.person_id).length; const d=ph.taken_date||''; const hasCaption=ph.title&&ph.title!==ph.original_filename; out+=`<button class="photo-list-item ${S.currentPhoto?.id===ph.id?'active':''}" data-photo-id="${ph.id}"><img src="${url}"><b>${esc(d||'Undated')}${ph.private?' 🔒':''}</b>${hasCaption?`<span class="photo-list-title">${esc(ph.title)}</span>`:''}<small>${fc} face${fc===1?'':'s'}${nc?` · ${nc} named`:''}</small></button>`}
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
  text('photoMetaLine',[S.currentPhoto.taken_date,S.currentPhoto.location||S.currentPhoto.place].filter(Boolean).join(' · '));
}
function boxSize(){const img=$('mainPhoto'); return {dw:img?.clientWidth||1, dh:img?.clientHeight||1, nw:img?.naturalWidth||1, nh:img?.naturalHeight||1}}
export function isLegacyPx(f){return (+f.x||0)>1.5||(+f.y||0)>1.5||(+f.w||0)>1.5||(+f.h||0)>1.5}
function toScreen(f){const {dw,dh}=boxSize(); if(isLegacyPx(f))return{left:+f.x||0,top:+f.y||0,width:+f.w||70,height:+f.h||90}; return{left:(+f.x||0)*dw,top:(+f.y||0)*dh,width:(+f.w||.1)*dw,height:(+f.h||.12)*dh}}
const LOCK_SVG='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const UNLOCK_SVG='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 5.8-1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const canChangeFace=f=>canEdit()&&canEditFace(f);
function faceEl(f){
  const editable=canChangeFace(f), locked=!!f.locked;
  const d=document.createElement('div');
  d.className='face'+(f.person_id?' named':'')+(f.id===S.selectedFaceId?' selected':'')+(editable?'':' not-mine')+(locked?' locked':'');
  d.dataset.faceId=f.id; const s=toScreen(f); d.style.left=s.left+'px'; d.style.top=s.top+'px'; d.style.width=s.width+'px'; d.style.height=s.height+'px';
  const lockBtn=editable
    ?`<button type="button" class="face-lock" data-face-lock="${f.id}" aria-pressed="${locked}" aria-label="${locked?'Unlock this box':'Lock this box'}" title="${locked?'Locked: tap to unlock':'Lock this box so it can\'t be moved by accident'}">${locked?LOCK_SVG:UNLOCK_SVG}</button>`
    :(locked?`<i class="face-lock readonly" aria-label="Locked">${LOCK_SVG}</i>`:'');
  const handles=(editable&&!locked)?['nw','ne','sw','se'].map(c=>`<div class="handle handle-${c}" data-corner="${c}"></div>`).join(''):'';
  d.innerHTML=`<span class="face-label">${esc(f.label||'')}</span>${lockBtn}${handles}`;
  d.addEventListener('pointerdown',e=>startFacePointer(e,f.id,d));
  d.addEventListener('click',async e=>{
    e.stopPropagation();
    if(e.target.closest('.face-lock'))return;
    if(suppressClick){suppressClick=false;return}
    if(!S.editMode && f.person_id){const {showPerson}=await import('./navigation.js'); S.returnTo={page:'photo',photoId:S.currentPhoto?.id}; await showPerson(f.person_id); return}
    if(S.editMode&&f.locked)return; // locked boxes can't be picked in Edit mode
    if(S.selectedFaceId===f.id)return; selectFace(f.id,d); renderFaceEditor();
  });
  return d;
}
function redrawFace(f){const el=document.querySelector(`.photo-canvas .face[data-face-id="${f.id}"]`); if(el)el.replaceWith(faceEl(f))}
export async function toggleFaceLock(id){
  const f=S.faces.find(x=>x.id===id); if(!f)return;
  if(!canChangeFace(f))return alert('Only whoever added this box (or the owner) can lock or unlock it.');
  const next=!f.locked;
  const upd=await S.sb.from('faces').update({locked:next}).eq('id',f.id).select().single();
  if(upd.error)return alert(/locked|column/i.test(upd.error.message||'')?'Locking needs a small database update first (sql/2026-11-04-photo-dedupe-and-face-lock.sql). Ask the owner to run it in Supabase.':upd.error.message);
  Object.assign(f,upd.data||{locked:next}); f.locked=next;
  if(next&&S.selectedFaceId===f.id){S.selectedFaceId=null; renderFaceEditor()}
  redrawFace(f); status(next?'Box locked':'Box unlocked');
}
export function deselectFace(){if(!S.selectedFaceId)return; S.selectedFaceId=null; document.querySelectorAll('.photo-canvas .face.selected').forEach(x=>{const f=S.faces.find(y=>y.id===x.dataset.faceId); if(f)redrawFace(f)}); renderFaceEditor()}
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
export function zoomPhoto(delta){zoomPhotoAt(delta,null)}
export function resetPhotoZoom(){S.photoZoom=1; applyPhotoZoom()}
// Zoom while keeping the point under (clientX,clientY) fixed on screen — falls back to
// the center of the visible photo area if no point is given (e.g. toolbar +/- buttons).
export function zoomPhotoAt(delta,point){
  const img=$('mainPhoto'), scroll=document.querySelector('.photo-scroll');
  const newZoom=Math.max(.3,Math.min(3,+(S.photoZoom+delta).toFixed(2)));
  if(!img||!scroll||newZoom===S.photoZoom){S.photoZoom=newZoom; applyPhotoZoom(); return}
  const rectBefore=img.getBoundingClientRect();
  const px=point?point.x:rectBefore.left+rectBefore.width/2;
  const py=point?point.y:rectBefore.top+rectBefore.height/2;
  const fracX=rectBefore.width?(px-rectBefore.left)/rectBefore.width:.5;
  const fracY=rectBefore.height?(py-rectBefore.top)/rectBefore.height:.5;
  S.photoZoom=newZoom;
  applyPhotoZoom();
  const rectAfter=img.getBoundingClientRect();
  const targetX=rectAfter.left+fracX*rectAfter.width, targetY=rectAfter.top+fracY*rectAfter.height;
  scroll.scrollLeft+=targetX-px; scroll.scrollTop+=targetY-py;
}
export function setPhotoZoomAbsolute(newZoom,point){
  const img=$('mainPhoto'), scroll=document.querySelector('.photo-scroll');
  newZoom=Math.max(.3,Math.min(3,+newZoom.toFixed(2)));
  if(!img||!scroll){S.photoZoom=newZoom; applyPhotoZoom(); return}
  const rectBefore=img.getBoundingClientRect();
  const px=point?point.x:rectBefore.left+rectBefore.width/2;
  const py=point?point.y:rectBefore.top+rectBefore.height/2;
  const fracX=rectBefore.width?(px-rectBefore.left)/rectBefore.width:.5;
  const fracY=rectBefore.height?(py-rectBefore.top)/rectBefore.height:.5;
  S.photoZoom=newZoom;
  applyPhotoZoom();
  const rectAfter=img.getBoundingClientRect();
  const targetX=rectAfter.left+fracX*rectAfter.width, targetY=rectAfter.top+fracY*rectAfter.height;
  scroll.scrollLeft+=targetX-px; scroll.scrollTop+=targetY-py;
}
export function renderFaceEditor(){
  const w=$('faceEditor'); if(!w)return; const f=S.faces.find(x=>x.id===S.selectedFaceId);
  if(!f){w.innerHTML=canEdit()?'<p>Tap a face box to name it.</p><button class="full" id="suggestFaceInline">Suggest a face/name</button>':'<p>Tap a face to see who it is.</p>';return}
  const p=f.person_id?person(f.person_id):null;
  const nameHtml=p?`<button class="link-btn" data-person-id="${p.id}">${esc(fullName(p))} →</button>`:esc(f.label||'Not named yet');
  if(!canEdit()){w.innerHTML=`<p><strong>${nameHtml}</strong></p>`;return}
  if(!canEditFace(f)){w.innerHTML=`<p><strong>${nameHtml}</strong></p><p class="small">Added by someone else. You can suggest a correction; only they (or the owner) can change this box.</p><textarea id="faceSuggestionText" placeholder="Suggest a correction…"></textarea><button class="primary full" id="sendFaceSuggestion">Send suggestion</button>`;return}
  let suggestionHtml='';
  if(!p&&f.descriptor){
    const match=findFaceMatch(f.descriptor);
    if(match){const mp=person(match.personId); if(mp)suggestionHtml=`<div class="face-suggestion"><p class="small">Might be <strong>${esc(fullName(mp))}</strong> (${Math.round(match.score*100)}% match, testing — owner only for now)</p><button class="primary full" id="confirmSuggestedFace" data-suggested-person="${mp.id}">Yes, that's ${esc(fullName(mp).split(' ')[0])}</button></div>`}
  }
  w.innerHTML=`<div class="selected-face-summary"><p class="small">Current</p><strong>${p?`<button class="link-btn" data-person-id="${p.id}">${esc(fullName(p))} →</button>`:esc(f.label||'Unnamed face')}</strong></div>${suggestionHtml}<div class="form-grid compact-form"><label>Use existing person<div id="existingPersonSelect" class="person-picker custom-select" data-value="${f.person_id||''}">${personPickerHtml(f.person_id||'')}</div></label><button class="primary full" id="attachExistingBtn">Use selected person</button><label>Create new person<input id="faceName" value="${esc(p?fullName(p):(f.label||''))}" placeholder="Type a new full name"></label><button class="full" id="saveTypedFaceBtn">Create / save typed name</button><button class="full" id="suggestCorrectionBtn">Suggest correction instead</button><button class="full" data-face-lock="${f.id}">${f.locked?'Unlock this box':'Lock this box'}</button></div>`;
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
export async function selectPhoto(id){const ph=S.photos.find(p=>p.id===id); if(!ph)return; S.currentPhoto=ph; S.selectedFaceId=null; S.photoZoom=1; S.photoBaseWidth=null; const target='#photo/'+id; if(location.hash!==target)history.replaceState(null,'',target); await renderPhotoPage(); status('Photo loaded')}
// Duplicate prevention: one upload at a time (a second pick while the first is still saving was
// how double-submits on slow phones created two rows), and every file is fingerprinted first so the
// same photo can't be added twice — exact copies are refused, resized copies need a confirm.
let uploadBusy=false;
const isMissingColumn=e=>e&&(e.code==='42703'||e.code==='PGRST204'||/content_hash|phash|column/i.test(e.message||''));
async function findExistingCopy(hash,vis,dims){
  let exact=S.photos.find(p=>p.content_hash&&p.content_hash===hash);
  if(!exact){const r=await S.sb.from('photos').select('*').eq('content_hash',hash).limit(1); if(!r.error&&r.data?.[0])exact=r.data[0]}
  if(exact)return{photo:exact,exact:true};
  const probe={phash:vis?.hash,width:dims.width||vis?.width,height:dims.height||vis?.height};
  let near=vis&&S.photos.find(p=>looksSame(probe,p,4));
  // Older photos have no fingerprint yet: fingerprint the few with exactly the same pixel size now.
  if(!near&&probe.width){
    const cands=S.photos.filter(p=>!p.content_hash&&+p.width===probe.width&&+p.height===probe.height).slice(0,12);
    for(const p of cands){
      try{const b=await (await fetch(await publicUrl(p))).blob(); p.content_hash=await contentHash(b); if(p.content_hash===hash)return{photo:p,exact:true}; const v=await visualHash(b); if(v){p.phash=v.hash; if(vis&&!near&&looksSame(probe,p,4))near=p}}catch{}
    }
  }
  return near?{photo:near,exact:false}:null;
}
async function openIfVisible(ph){if(ph&&visiblePhotos().some(p=>p.id===ph.id))await selectPhoto(ph.id)}
export async function uploadPhotoFile(file){
  if(!file)return; if(!canEdit())return alert('You don\'t have permission to upload photos.');
  if(uploadBusy){status('Still saving the last photo…');return}
  uploadBusy=true;
  try{
    status('Checking photo…');
    const hash=await contentHash(file), vis=await visualHash(file), dims=await imageDims(file);
    const copy=await findExistingCopy(hash,vis,dims);
    if(copy){
      const when=copy.photo.taken_date?` (${copy.photo.taken_date})`:'';
      if(copy.exact){alert(`This photo is already in the archive${when}, so it wasn't added again.`); await openIfVisible(copy.photo); status('Already in the archive'); return}
      if(!confirm(`This looks like the same picture as one already in the archive${when}, maybe a resized copy. Add it anyway?`)){await openIfVisible(copy.photo); status('Upload cancelled'); return}
    }
    status('Uploading photo…');
    const id=uid(), ext=(file.name.split('.').pop()||'jpg').toLowerCase(), path=`photos/${id}/original.${ext}`;
    const up=await S.sb.storage.from(bucket()).upload(path,file,{upsert:false}); if(up.error)return alert(up.error.message);
    const takenDate=await readExifDate(file); const isPrivate=canDelete()&&!!$('privatePhotoToggle')?.checked;
    const row={id,storage_path:path,original_filename:file.name,mime_type:file.type,width:dims.width,height:dims.height,taken_date:takenDate,uploaded_by:userId(),private:isPrivate,content_hash:hash,phash:vis?.hash||null};
    let ins=await S.sb.from('photos').insert(row).select().single();
    if(ins.error&&isMissingColumn(ins.error)){const {content_hash,phash,...rest}=row; ins=await S.sb.from('photos').insert(rest).select().single(); if(!ins.error)ins.data={...ins.data,content_hash,phash}} // database not migrated yet: still works, check is session-only
    if(ins.error){await S.sb.storage.from(bucket()).remove([path]).catch(()=>{}); return alert(ins.error.message)}
    S.photos.unshift(ins.data); S.currentPhoto=ins.data; S.selectedFaceId=null; await renderPhotoPage(); status(isPrivate?'Private photo saved (only visible to you)':'Photo saved'); setTimeout(()=>detectFaces(true),350);
  } finally {uploadBusy=false}
}
export async function uploadPhoto(ev){const f=ev.target.files?.[0]; ev.target.value=''; await uploadPhotoFile(f)}
export async function uploadPhotoAndOpen(ev){const f=ev.target.files?.[0]; ev.target.value=''; await uploadPhotoFile(f); if(S.currentPhoto) await showPage('photo')}
// Drags that start inside the page (the photo itself, a thumbnail) are never uploads. Before this,
// pressing on the photo in Edit mode and missing a box dragged the image, and letting go over the
// photo uploaded it again as a brand-new copy.
let dragFromPage=false;
document.addEventListener('dragstart',e=>{if(e.target.closest?.('.photo-canvas')){e.preventDefault(); return} dragFromPage=true});
document.addEventListener('dragend',()=>{dragFromPage=false});
const isFileDrag=e=>!dragFromPage&&[...(e.dataTransfer?.types||[])].includes('Files');
function bindDropZone(el,onFile,enabled=()=>true){
  if(!el)return;
  ['dragenter','dragover'].forEach(evt=>el.addEventListener(evt,e=>{e.preventDefault(); e.stopPropagation(); if(isFileDrag(e)&&enabled())el.classList.add('drag-over')}));
  ['dragleave','dragend'].forEach(evt=>el.addEventListener(evt,e=>{if(e.target===el||!el.contains(e.relatedTarget))el.classList.remove('drag-over')}));
  el.addEventListener('drop',e=>{e.preventDefault(); e.stopPropagation(); el.classList.remove('drag-over'); if(!isFileDrag(e)||!enabled()){dragFromPage=false; return} const file=[...(e.dataTransfer?.files||[])].find(f=>f.type.startsWith('image/')); if(!file){alert('That doesn\'t look like an image file.');return} onFile(file)});
}
function imageDims(file){return new Promise(res=>{const img=new Image(); const url=URL.createObjectURL(file); img.onload=()=>{res({width:img.naturalWidth,height:img.naturalHeight}); URL.revokeObjectURL(url)}; img.onerror=()=>res({width:null,height:null}); img.src=url})}
export async function latestPhoto(){const list=visiblePhotos(); if(list[0])await selectPhoto(list[0].id)}
export async function prevPhoto(){const list=visiblePhotos(); const i=list.findIndex(p=>p.id===S.currentPhoto?.id); if(i>0)await selectPhoto(list[i-1].id)}
export async function nextPhoto(){const list=visiblePhotos(); const i=list.findIndex(p=>p.id===S.currentPhoto?.id); if(i>=0&&i<list.length-1)await selectPhoto(list[i+1].id)}
export async function addFaceBox(){if(!S.currentPhoto)return alert('Upload a photo first.'); const ins=await S.sb.from('faces').insert({photo_id:S.currentPhoto.id,x:0.4,y:0.35,w:0.15,h:0.18,label:null,status:'manual',created_by:userId()}).select().single(); if(ins.error)return alert(ins.error.message); S.faces.push(ins.data); S.selectedFaceId=ins.data.id; await renderPhotoPage(); status('Face saved')}
export async function attachExisting(){const f=S.faces.find(x=>x.id===S.selectedFaceId), pid=$('existingPersonSelect')?.dataset.value; if(!f||!pid)return alert('Choose an existing person first.'); if(!canEditFace(f))return alert('Only whoever added this box (or the owner) can edit it directly — use "Suggest correction" instead.'); const p=person(pid); const upd=await S.sb.from('faces').update({person_id:pid,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single(); if(upd.error)return alert(upd.error.message); Object.assign(f,upd.data); await renderPhotoPage(); await renderPeople(); status('Face linked')}
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
  const patch={width:newW,height:newH,updated_at:new Date().toISOString()};
  const vis=await visualHash(blob); const prints={content_hash:await contentHash(blob),phash:vis?.hash||null}; // the file changed, so its fingerprint did too
  let updPhoto=await S.sb.from('photos').update({...patch,...prints}).eq('id',ph.id).select().single();
  if(updPhoto.error&&isMissingColumn(updPhoto.error))updPhoto=await S.sb.from('photos').update(patch).eq('id',ph.id).select().single();
  if(!updPhoto.error){Object.assign(S.currentPhoto,updPhoto.data); const idx=S.photos.findIndex(p=>p.id===ph.id); if(idx>-1)S.photos[idx]=S.currentPhoto}
  S.photoZoom=1; S.photoBaseWidth=null;
  await renderPhotoPage();
  status('Photo rotated');
}
export async function savePhotoMeta(){if(!S.currentPhoto||!canEdit())return; const d=$('photoDate')?.value.trim()||null, loc=$('photoPlace')?.value.trim()||null; const r=await S.sb.from('photos').update({taken_date:d,location:loc}).eq('id',S.currentPhoto.id).select().single(); if(r.error)return alert(r.error.message); Object.assign(S.currentPhoto,r.data); await renderPhotos(); status('Photo details saved')}
export async function postComment(){if(!canEdit())return alert('You don\'t have permission to post comments.'); const body=$('commentText')?.value.trim(); if(!body)return; const row=await addOptional('comments',{photo_id:S.currentPhoto?.id,body,author_id:userId(),author_name:userName(),status:'open'}); S.comments.unshift(row); $('commentText').value=''; renderComments()}
async function sendFaceSuggestion(){const body=$('faceSuggestionText')?.value.trim(); if(!body)return alert('Type your suggestion first.'); const row=await addOptional('suggestions',{type:'photo_face_suggestion',photo_id:S.currentPhoto?.id,face_id:S.selectedFaceId,body,suggested_value:body,author_id:userId(),author_name:userName(),status:'open'}); S.suggestions.unshift(row); $('faceSuggestionText').value=''; status('Suggestion sent for review')}
export async function suggestFace(){if(!canEdit())return; const body=prompt('Who or what should be corrected/added?'); if(!body)return; const row=await addOptional('suggestions',{type:'photo_face_suggestion',photo_id:S.currentPhoto?.id,face_id:S.selectedFaceId,body,suggested_value:body,author_id:userId(),author_name:userName(),status:'open'}); S.suggestions.unshift(row); alert('Suggestion added for review.')}
// --- Face box move/resize ---
// Why it used to move by itself: a press on any box started a drag straight away with no
// movement threshold, so a click meant to deselect (often landing on a neighbouring box in a
// crowded photo) nudged and saved that box; a cancelled touch (iPad scroll) never ended the
// drag; and moving a legacy screen-pixel box saved x/y as fractions but left w/h in pixels,
// which made it jump. Now: only the already-selected box can be dragged, nothing moves until
// the pointer travels a few pixels, nothing is saved unless it actually moved, cancel restores
// the box, and every drag saves all four values as fractions.
let drag=null, suppressClick=false;
function selectFace(id,el){
  const prev=S.selectedFaceId; S.selectedFaceId=id;
  if(prev&&prev!==id){const pf=S.faces.find(x=>x.id===prev); if(pf)redrawFace(pf)}
  const f=S.faces.find(x=>x.id===id); if(f&&el){const fresh=faceEl(f); el.replaceWith(fresh)}
}
function startFacePointer(ev,id,el){
  if(!S.editMode||ev.button>0||ev.target.closest('.face-lock'))return;
  const f=S.faces.find(x=>x.id===id); if(!f||f.locked||!canChangeFace(f))return;
  if(S.selectedFaceId!==id)return; // first tap selects (via click); drag only the selected box
  const handle=ev.target.closest('.handle');
  ev.preventDefault(); ev.stopPropagation();
  try{el.setPointerCapture(ev.pointerId)}catch{}
  const s=toScreen(f);
  drag={mode:handle?'resize':'move',corner:handle?.dataset.corner||'se',id,el,pointerId:ev.pointerId,sx:ev.clientX,sy:ev.clientY,s,orig:{x:f.x,y:f.y,w:f.w,h:f.h},moved:false,slop:ev.pointerType==='touch'?8:4,...boxSize()};
  window.addEventListener('pointermove',move); window.addEventListener('pointerup',end); window.addEventListener('pointercancel',cancel);
}
function move(ev){
  if(!drag||ev.pointerId!==drag.pointerId)return; const f=S.faces.find(x=>x.id===drag.id); if(!f)return;
  const {dw,dh,s}=drag; if(!dw||!dh||!isFinite(dw)||!isFinite(dh))return;
  const dx=ev.clientX-drag.sx, dy=ev.clientY-drag.sy;
  if(!drag.moved){if(Math.hypot(dx,dy)<drag.slop)return; drag.moved=true; drag.el.classList.add('dragging')}
  const MIN=16; let {left,top,width,height}=s;
  if(drag.mode==='move'){left=Math.min(Math.max(0,left+dx),Math.max(0,dw-width)); top=Math.min(Math.max(0,top+dy),Math.max(0,dh-height))}
  else{
    const c=drag.corner;
    if(c.includes('e'))width=Math.min(Math.max(MIN,s.width+dx),dw-s.left);
    if(c.includes('s'))height=Math.min(Math.max(MIN,s.height+dy),dh-s.top);
    if(c.includes('w')){const nl=Math.min(Math.max(0,s.left+dx),s.left+s.width-MIN); width=s.left+s.width-nl; left=nl}
    if(c.includes('n')){const nt=Math.min(Math.max(0,s.top+dy),s.top+s.height-MIN); height=s.top+s.height-nt; top=nt}
  }
  const nx=left/dw, ny=top/dh, nw=width/dw, nh=height/dh;
  if([nx,ny,nw,nh].every(isFinite)){f.x=nx; f.y=ny; f.w=nw; f.h=nh}
  const r=toScreen(f); drag.el.style.left=r.left+'px'; drag.el.style.top=r.top+'px'; drag.el.style.width=r.width+'px'; drag.el.style.height=r.height+'px';
}
function stopListening(){window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',end); window.removeEventListener('pointercancel',cancel)}
function cancel(ev){
  if(!drag||(ev&&ev.pointerId!==drag.pointerId))return; const d=drag; drag=null; stopListening();
  const f=S.faces.find(x=>x.id===d.id); if(f){Object.assign(f,d.orig); const r=toScreen(f); Object.assign(d.el.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'})}
  d.el.classList.remove('dragging');
}
async function end(ev){
  if(!drag||(ev&&ev.pointerId!==drag.pointerId))return; const d=drag; drag=null; stopListening();
  d.el.classList.remove('dragging'); if(!d.moved)return;
  suppressClick=true; setTimeout(()=>{suppressClick=false},0); // the click that ends a drag shouldn't also count as a tap
  const f=S.faces.find(x=>x.id===d.id);
  if(f&&[f.x,f.y,f.w,f.h].every(v=>isFinite(+v))){const r=await S.sb.from('faces').update({x:f.x,y:f.y,w:f.w,h:f.h}).eq('id',f.id); if(r.error){Object.assign(f,d.orig); redrawFace(f); alert(r.error.message)} else status('Box saved')}
}
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

function closePhotoDrawer(){$('photoLeftPanel')?.classList.remove('drawer-open'); $('photoLeftBackdrop')?.classList.remove('drawer-open')}
function togglePhotoDrawer(){$('photoLeftPanel')?.classList.toggle('drawer-open'); $('photoLeftBackdrop')?.classList.toggle('drawer-open')}
export function bindPhotos(){document.body.addEventListener('click',e=>{const p=e.target.closest('[data-photo-id]'); if(p){selectPhoto(p.dataset.photoId); closePhotoDrawer()}}); $('photoDrawerToggleBtn')?.addEventListener('click',togglePhotoDrawer); $('photoDrawerCloseBtn')?.addEventListener('click',closePhotoDrawer); $('photoLeftBackdrop')?.addEventListener('click',closePhotoDrawer); $('photoFilterToggle')?.addEventListener('click',e=>{const b=e.target.closest('[data-filter]'); if(!b)return; document.querySelectorAll('#photoFilterToggle [data-filter]').forEach(x=>x.classList.toggle('primary',x===b)); renderPhotos()}); $('photoInput')?.addEventListener('change',uploadPhoto); $('dashboardPhotoInput')?.addEventListener('change',uploadPhotoAndOpen); $('showUploadScreenBtn')?.addEventListener('click',()=>{S.currentPhoto=null;S.selectedFaceId=null;renderPhotoPage()}); $('latestPhotoBtn')?.addEventListener('click',latestPhoto); $('prevPhotoBtn')?.addEventListener('click',prevPhoto); $('nextPhotoBtn')?.addEventListener('click',nextPhoto); $('addFaceBtn')?.addEventListener('click',addFaceBox); $('detectFacesBtn')?.addEventListener('click',()=>detectFaces(false)); $('deleteFaceBtn')?.addEventListener('click',deleteFace); $('toggleBoxesBtn')?.addEventListener('click',()=>{S.showBoxes=!S.showBoxes;renderPhotoPage()}); $('toggleNamesBtn')?.addEventListener('click',()=>{S.showNames=!S.showNames;renderPhotoPage()}); $('suggestFaceBtn')?.addEventListener('click',suggestFace); $('savePhotoMetaBtn')?.addEventListener('click',savePhotoMeta); $('postCommentBtn')?.addEventListener('click',postComment); document.body.addEventListener('click',e=>{if(e.target.id==='attachExistingBtn')attachExisting(); if(e.target.id==='saveTypedFaceBtn')saveFaceName(); if(e.target.id==='sendFaceSuggestion')sendFaceSuggestion(); if(e.target.id==='suggestCorrectionBtn'||e.target.id==='suggestFaceInline')suggestFace(); const sug=e.target.closest('#confirmSuggestedFace'); if(sug)confirmSuggestedFace(sug.dataset.suggestedPerson)}); $('photoCanvas')?.addEventListener('click',e=>{if(!e.target.closest('.face'))deselectFace()}); document.body.addEventListener('click',e=>{const l=e.target.closest('[data-face-lock]'); if(l){e.preventDefault(); e.stopPropagation(); toggleFaceLock(l.dataset.faceLock)}},true);
  let resizeTimer; const onResize=()=>{clearTimeout(resizeTimer); resizeTimer=setTimeout(repositionFaceBoxes,150)}; window.addEventListener('resize',onResize); window.addEventListener('orientationchange',onResize);
  bindDropZone($('dashboardDropZone'),async file=>{await uploadPhotoFile(file); if(S.currentPhoto){const {showPage}=await import('./navigation.js'); await showPage('photo')}});
  // On the Photos page, drag-and-drop only uploads on the empty "upload a photo" screen: a drop
  // over a photo that's already showing is far more likely an accident than a new upload.
  bindDropZone($('photoCanvas'),uploadPhotoFile,()=>!S.currentPhoto);
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
    zoomPhotoAt(e.deltaY<0?.15:-.15,{x:e.clientX,y:e.clientY});
  },{passive:false});
  let pinchStartDist=0, pinchStartZoom=1, pinchMid=null;
  scroll.addEventListener('touchstart',e=>{
    if(e.touches.length===2){pinchStartDist=touchDist(e.touches); pinchStartZoom=S.photoZoom; pinchMid=touchMid(e.touches)}
  },{passive:true});
  scroll.addEventListener('touchmove',e=>{
    if(e.touches.length===2 && pinchStartDist>0){
      e.preventDefault();
      const ratio=touchDist(e.touches)/pinchStartDist;
      setPhotoZoomAbsolute(pinchStartZoom*ratio,pinchMid);
    }
  },{passive:false});
  scroll.addEventListener('touchend',()=>{pinchStartDist=0; pinchMid=null});
}
function touchDist(t){const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy)}
function touchMid(t){return {x:(t[0].clientX+t[1].clientX)/2,y:(t[0].clientY+t[1].clientY)/2}}