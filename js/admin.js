import { S, $, html, esc, fullName, titleCaseName, canDelete, status } from './state.js';
import { avatarHtml, photoTitle } from './render.js';
import { relationshipSentence } from './relationships.js';
import { renderPeople } from './people.js';
import { publicUrl } from './api.js';
import { detector, isLegacyPx } from './photos.js';
export async function renderAdmin(){const table=$('dbTable'), editor=$('dbEditor'); if(!table)return; if(!canDelete()){table.innerHTML='<p class="small">Admin is owner-only.</p>'; if(editor)editor.innerHTML=''; return} $('backfillFaceDataBtn')?.classList.toggle('hidden',!canDelete()); const q=($('dbSearch')?.value||'').toLowerCase(); document.querySelectorAll('.db-tab').forEach(b=>b.classList.toggle('active',b.dataset.dbtab===S.dbTab)); if(S.dbTab==='people'){const rows=S.people.filter(p=>!q||fullName(p).toLowerCase().includes(q)).sort((a,b)=>fullName(a).localeCompare(fullName(b))); let out='<div class="db-row db-head"><span>Person</span><span>Born</span><span>Died</span><span>Faces</span></div>'; for(const p of rows)out+=`<button class="db-row ${S.dbSelected===p.id?'selected':''}" data-db-person="${p.id}"><span class="db-person">${await avatarHtml(p,'node-photo mini')}<b>${esc(fullName(p))}</b></span><span>${esc(p.birth_date||'—')}</span><span>${esc(p.death_date||'—')}</span><span>${S.faces.filter(f=>f.person_id===p.id).length}</span></button>`; table.innerHTML=out; if(!S.dbSelected&&rows[0])S.dbSelected=rows[0].id; renderPersonEditor()} else if(S.dbTab==='photos'){const rows=S.photos.filter(p=>!q||photoTitle(p).toLowerCase().includes(q)); table.innerHTML='<div class="db-row db-head"><span>Photo</span><span>Date</span><span>Faces</span><span>File</span></div>'+rows.map(p=>`<button class="db-row ${S.dbSelected===p.id?'selected':''}" data-db-photo="${p.id}"><span><b>${esc(photoTitle(p))}</b></span><span>${esc(p.taken_date||'—')}</span><span>${S.faces.filter(f=>f.photo_id===p.id).length}</span><span>${esc(p.original_filename||'—')}</span></button>`).join(''); if(!S.dbSelected&&rows[0])S.dbSelected=rows[0].id; renderPhotoEditor()} else if(S.dbTab==='faces'){table.innerHTML='<div class="db-row db-head"><span>Face</span><span>Person</span><span>Photo</span><span>Status</span></div>'+S.faces.map(f=>`<div class="db-row"><span><b>${esc(f.label||'Unnamed')}</b></span><span>${esc(fullName(S.people.find(p=>p.id===f.person_id))||'—')}</span><span>${esc(photoTitle(S.photos.find(p=>p.id===f.photo_id)))}</span><span>${esc(f.status||'—')}</span></div>`).join(''); $('dbEditorTitle').textContent='Faces'; editor.innerHTML='<p class="small">Faces are edited visually on the Photos page.</p>'} else if(S.dbTab==='relationships'){table.innerHTML='<div class="db-row db-head"><span>Relationship</span><span>Type</span><span>Source</span><span></span></div>'+S.relationships.map(r=>`<div class="db-row"><span><b>${esc(relationshipSentence(r))}</b></span><span>${esc(r.label||r.relationship_type)}</span><span>—</span><span></span></div>`).join(''); $('dbEditorTitle').textContent='Relationships'; editor.innerHTML='<p class="small">Relationships can be created from the Photos page.</p>'} else if(S.dbTab==='accounts'){
    const roleOptions=['contributor','editor','guest'];
    table.innerHTML='<div class="db-row db-head"><span>Email</span><span>Role</span><span>Linked to</span><span>Can invite</span></div>'+S.profiles.map(pr=>{const linked=S.people.find(p=>p.id===pr.person_id); const roleCell=pr.role==='owner'?'Owner':`<select data-set-role="${pr.user_id}">${roleOptions.map(r=>`<option value="${r}" ${(pr.role||'contributor')===r?'selected':''}>${r==='guest'?'Guest (view only)':r[0].toUpperCase()+r.slice(1)}</option>`).join('')}</select>`; return `<div class="db-row"><span><b>${esc(pr.email||pr.user_id)}</b></span><span>${roleCell}</span><span>${linked?esc(fullName(linked)):'—'}</span><span>${pr.role==='owner'?'Always (owner)':`<label class="inline-check"><input type="checkbox" data-can-invite="${pr.user_id}" ${pr.can_invite?'checked':''}> Allowed</label>`}</span></div>`}).join('')||'<p class="small">No other accounts have signed in yet.</p>';
    $('dbEditorTitle').textContent='Accounts'; editor.innerHTML='<p class="small">Only the owner sees this tab. Toggle who\'s allowed to invite new people — off by default for anyone new.</p>';
  } else {table.innerHTML='<div class="db-row db-head"><span>Bug / request</span><span>Status</span><span>Author</span><span></span></div>'+S.feedback.map(x=>`<div class="db-row"><span><b>${esc(x.title||'Untitled')}</b><br><span class="small">${esc(x.body||'')}</span></span><span>${esc(x.status||'open')}</span><span>${esc(x.author_name||'')}</span><span></span></div>`).join(''); $('dbEditorTitle').textContent='Bugs / requests'; editor.innerHTML='<p class="small">Shared admin notes.</p>'}}
function renderPersonEditor(){const p=S.people.find(x=>x.id===S.dbSelected), box=$('dbEditor'); $('dbEditorTitle').textContent=p?fullName(p):'Select a person'; if(!p){box.innerHTML='';return} box.innerHTML=`<div class="form-grid"><label>Full name<input id="editDisplayName" value="${esc(fullName(p))}"></label><label>Preferred name<input id="editGiven" value="${esc(p.given_names||'')}"></label><label>Family name<input id="editFamily" value="${esc(p.family_name||'')}"></label><label>Birth date<input id="editBirth" type="date" value="${esc(p.birth_date||'')}"></label><label>Death date<input id="editDeath" type="date" value="${esc(p.death_date||'')}"></label><button class="primary full" id="savePersonRecordBtn">Save person</button></div>`}
function renderPhotoEditor(){const p=S.photos.find(x=>x.id===S.dbSelected), box=$('dbEditor'); $('dbEditorTitle').textContent=p?photoTitle(p):'Select a photo'; if(!p){box.innerHTML='';return} box.innerHTML=`<div class="form-grid"><label>Title<input id="editPhotoTitle" value="${esc(p.title||'')}"></label><label>Date<input id="editPhotoDate" type="text" placeholder="e.g. 1975, May 2003, 12 Jan 1998" value="${esc(p.taken_date||'')}"></label><label>Location<input id="editPhotoLocation" value="${esc(p.location||'')}"></label><label>Caption<textarea id="editPhotoCaption">${esc(p.caption||p.description||'')}</textarea></label><button class="primary full" id="savePhotoRecordBtn">Save photo</button></div>`}
async function savePerson(){if(!canDelete())return; const p=S.people.find(x=>x.id===S.dbSelected); if(!p)return; const name=titleCaseName($('editDisplayName').value); const patch={display_name:name,given_names:titleCaseName($('editGiven').value||name.split(' ')[0]),family_name:titleCaseName($('editFamily').value||name.split(' ').slice(1).join(' '))||null,birth_date:$('editBirth').value||null,death_date:$('editDeath').value||null}; const r=await S.sb.from('people').update(patch).eq('id',p.id).select().single(); if(r.error)return alert(r.error.message); Object.assign(p,r.data); S.faces.filter(f=>f.person_id===p.id).forEach(f=>f.label=fullName(p)); await S.sb.from('faces').update({label:fullName(p)}).eq('person_id',p.id); await renderAdmin(); await renderPeople()}
async function savePhoto(){if(!canDelete())return; const p=S.photos.find(x=>x.id===S.dbSelected); if(!p)return; const patch={}; if('title' in p)patch.title=$('editPhotoTitle').value||null; patch.taken_date=$('editPhotoDate').value.trim()||null; patch.location=$('editPhotoLocation').value.trim()||null; const cap=$('editPhotoCaption').value||null; ['caption','description'].forEach(k=>{if(k in p)patch[k]=cap}); const r=await S.sb.from('photos').update(patch).eq('id',p.id).select().single(); if(r.error)return alert(r.error.message); Object.assign(p,r.data); await renderAdmin()}
async function backfillFaceDescriptors(btn){
  if(!canDelete())return;
  const targets=S.faces.filter(f=>f.person_id&&!f.descriptor&&!isLegacyPx(f));
  const legacyCount=S.faces.filter(f=>f.person_id&&!f.descriptor&&isLegacyPx(f)).length;
  if(!targets.length){alert(legacyCount?`No faces need backfilling — but ${legacyCount} named face${legacyCount===1?'':'s'} use an old coordinate format and can't be safely backfilled automatically.`:'Every named face already has recognition data.'); return}
  if(!confirm(`This computes recognition data for ${targets.length} already-named face${targets.length===1?'':'s'}${legacyCount?` (skipping ${legacyCount} in an old format)`:''}. It runs in your browser and can take a few minutes. Continue?`))return;
  btn.disabled=true;
  let human;
  try{human=await detector()}catch(e){alert(e.message); btn.disabled=false; return}
  const byPhoto=new Map();
  for(const f of targets){if(!byPhoto.has(f.photo_id))byPhoto.set(f.photo_id,[]); byPhoto.get(f.photo_id).push(f)}
  const total=targets.length; let done=0, failed=0;
  const tick=()=>{done++; btn.textContent=`Backfilling ${done} of ${total}…`};
  for(const [photoId,faces] of byPhoto){
    const photo=S.photos.find(p=>p.id===photoId);
    if(!photo){failed+=faces.length; faces.forEach(tick); continue}
    let img;
    try{
      img=new Image(); img.crossOrigin='anonymous';
      const url=await publicUrl(photo);
      await new Promise((res,rej)=>{img.onload=res; img.onerror=()=>rej(new Error('image load failed')); img.src=url});
    }catch(e){failed+=faces.length; faces.forEach(tick); continue}
    const nw=img.naturalWidth||1, nh=img.naturalHeight||1;
    for(const f of faces){
      try{
        const bx=(+f.x||0)*nw, by=(+f.y||0)*nh, bw=(+f.w||.1)*nw, bh=(+f.h||.12)*nh;
        const padX=bw*0.4, padY=bh*0.4;
        const cx=Math.max(0,bx-padX), cy=Math.max(0,by-padY);
        const cw=Math.min(nw,bx+bw+padX)-cx, ch=Math.min(nh,by+bh+padY)-cy;
        const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(cw)); canvas.height=Math.max(1,Math.round(ch));
        canvas.getContext('2d').drawImage(img,cx,cy,cw,ch,0,0,canvas.width,canvas.height);
        const r=await Promise.race([human.detect(canvas),new Promise((_,rej)=>setTimeout(()=>rej(new Error('timed out')),15000))]);
        const face=(r.face||[])[0];
        const descriptor=(face?.embedding&&face.embedding.length)?Array.from(face.embedding):null;
        if(!descriptor){failed++; tick(); continue}
        const upd=await S.sb.from('faces').update({descriptor}).eq('id',f.id).select().single();
        if(!upd.error)Object.assign(f,upd.data); else failed++;
      }catch(e){failed++}
      tick();
    }
  }
  btn.disabled=false; btn.textContent='Backfill face recognition data';
  status(`Backfill complete — ${total-failed} of ${total} faces updated`);
  alert(`Done. ${total-failed} of ${total} faces now have recognition data.${failed?` ${failed} couldn't be processed (no face found in the cropped region).`:''}`);
}
export function bindAdmin(){document.getElementById('adminTabs')?.addEventListener('click',e=>{const b=e.target.closest('[data-dbtab]'); if(b){S.dbTab=b.dataset.dbtab;S.dbSelected=null;renderAdmin()}}); $('dbSearch')?.addEventListener('input',renderAdmin); $('dbRefreshBtn')?.addEventListener('click',renderAdmin); $('backfillFaceDataBtn')?.addEventListener('click',e=>backfillFaceDescriptors(e.target)); document.body.addEventListener('click',e=>{let b=e.target.closest('[data-db-person]'); if(b){S.dbSelected=b.dataset.dbPerson;renderAdmin()} b=e.target.closest('[data-db-photo]'); if(b){S.dbSelected=b.dataset.dbPhoto;renderAdmin()} if(e.target.id==='savePersonRecordBtn')savePerson(); if(e.target.id==='savePhotoRecordBtn')savePhoto()}); document.body.addEventListener('change',async e=>{
    const inviteToggle=e.target.closest('[data-can-invite]');
    if(inviteToggle){if(!canDelete())return; const r=await S.sb.from('profiles').update({can_invite:inviteToggle.checked}).eq('user_id',inviteToggle.dataset.canInvite).select().single(); if(r.error){alert(r.error.message);return} const idx=S.profiles.findIndex(p=>p.user_id===inviteToggle.dataset.canInvite); if(idx>-1)S.profiles[idx]=r.data; if(S.profile?.user_id===inviteToggle.dataset.canInvite)S.profile=r.data; return}
    const roleSelect=e.target.closest('[data-set-role]');
    if(roleSelect){if(!canDelete())return; const r=await S.sb.from('profiles').update({role:roleSelect.value}).eq('user_id',roleSelect.dataset.setRole).select().single(); if(r.error){alert(r.error.message);return} const idx=S.profiles.findIndex(p=>p.user_id===roleSelect.dataset.setRole); if(idx>-1)S.profiles[idx]=r.data; if(S.profile?.user_id===roleSelect.dataset.setRole)S.profile=r.data}
  })}
