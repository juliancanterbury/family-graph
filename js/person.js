import { S, $, esc, fullName, person as personById, visiblePeople, canEdit, REDIRECT_URL } from './state.js';
import { avatarHtml } from './render.js';
import { publicUrl } from './api.js';
import { createRelationship, deleteRelationship } from './relationships.js';
import { invitePerson } from './api.js';

let selectedTrayId=null;

function parentLinks(id){return S.relationships.filter(r=>r.relationship_type==='parent'&&r.to_person_id===id).map(r=>({relId:r.id,p:personById(r.from_person_id)})).filter(x=>x.p)}
function childLinks(id){return S.relationships.filter(r=>r.relationship_type==='parent'&&r.from_person_id===id).map(r=>({relId:r.id,p:personById(r.to_person_id)})).filter(x=>x.p)}
function partnerLinks(id){return S.relationships.filter(r=>r.relationship_type==='partner'&&(r.from_person_id===id||r.to_person_id===id)).map(r=>({relId:r.id,p:personById(r.from_person_id===id?r.to_person_id:r.from_person_id)})).filter(x=>x.p)}
function siblingsOf(id){
  const parentIds=new Set(parentLinks(id).map(x=>x.p.id)); if(!parentIds.size)return [];
  const ids=new Set();
  S.relationships.filter(r=>r.relationship_type==='parent'&&parentIds.has(r.from_person_id)).forEach(r=>{if(r.to_person_id!==id)ids.add(r.to_person_id)});
  return [...ids].map(personById).filter(Boolean);
}
export function personPhotos(id){
  const photoIds=[...new Set(S.faces.filter(f=>f.person_id===id).map(f=>f.photo_id))];
  return photoIds.map(pid=>S.photos.find(ph=>ph.id===pid)).filter(Boolean);
}
function zoneChip(relId,p){return `<span class="zone-chip" data-remove-rel="${relId}" title="Click to remove">${esc(fullName(p))} ✕</span>`}

function inviteMessageText(p,email){
  const ownerName=S.profile?.display_name||S.profile?.email?.split('@')[0]||'A family member';
  const given=(p.given_names||fullName(p).split(' ')[0]||'there');
  return `Hi ${given},

${ownerName} has invited you to Family Graph — our private family photo archive and family tree.

To join:
1. Go to ${REDIRECT_URL}
2. Sign in using this email address: ${email}
3. You'll get a secure sign-in link by email (no password needed) — just click it.

Once you're in, you'll land straight on your own page, already connected to the family tree.

— ${ownerName}`;
}
function showInviteMessage(p,email){
  const ov=$('avatarCaptureOverlay'); if(!ov)return;
  const msg=inviteMessageText(p,email);
  ov.classList.remove('hidden');
  ov.innerHTML=`
    <div class="avatar-capture-box invite-message-box">
      <h2>Invite ${esc(fullName(p))}</h2>
      <p class="small">Copy this, or open it directly in your email app, then send it to ${esc(email)} yourself.</p>
      <textarea id="inviteMessageText" readonly rows="10">${esc(msg)}</textarea>
      <div class="avatar-align-actions">
        <button id="inviteMsgCloseBtn">Close</button>
        <button id="inviteMsgCopyBtn">Copy text</button>
        <a class="button-link" id="inviteMsgMailtoBtn" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Join our Family Graph')}&body=${encodeURIComponent(msg)}">Open in email app</a>
        <a class="primary button-link" id="inviteMsgGmailBtn" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent('Join our Family Graph')}&body=${encodeURIComponent(msg)}">Open in Gmail</a>
      </div>
    </div>`;
  $('inviteMsgCloseBtn')?.addEventListener('click',()=>{ov.classList.add('hidden');ov.innerHTML=''});
  $('inviteMsgCopyBtn')?.addEventListener('click',async e=>{try{await navigator.clipboard.writeText(msg); e.target.textContent='Copied!'; setTimeout(()=>e.target.textContent='Copy text',1500)}catch{alert('Could not copy automatically — select the text and copy manually.')}});
  ov.addEventListener('click',e=>{if(e.target===ov){ov.classList.add('hidden');ov.innerHTML=''}});
}

async function trayHtml(excludeIds){
  const people=visiblePeople().filter(p=>!excludeIds.has(p.id));
  const rows=await Promise.all(people.map(async p=>`<div class="tray-chip" draggable="true" data-tray-person="${p.id}">${await avatarHtml(p,'tray-avatar')}<span>${esc(fullName(p))}</span></div>`));
  return rows.join('')||'<p class="small">No one else in view to link — try "Show everyone" in the header.</p>';
}

function readOnlyRow(label,people){
  if(!people.length)return'';
  return `<div class="person-rel-row"><span class="person-rel-label">${esc(label)}</span><div class="person-rel-list">${people.map(p=>`<button class="person-chip" data-person-id="${p.id}">${esc(fullName(p))}</button>`).join('')}</div></div>`;
}
export async function renderPersonPage(id){
  const root=$('personPage'); if(!root)return;
  const p=personById(id);
  if(!p){root.innerHTML='<button data-page="dashboard" class="back-link">← Back</button><p class="small">Person not found.</p>'; return}
  const parents=parentLinks(id), partners=partnerLinks(id), children=childLinks(id), siblings=siblingsOf(id), photos=personPhotos(id);
  const excludeIds=new Set([id,...parents.map(x=>x.p.id),...partners.map(x=>x.p.id),...children.map(x=>x.p.id)]);
  const galleryHtml=(await Promise.all(photos.map(async ph=>{const url=await publicUrl(ph); return `<button class="person-photo-thumb" data-open-photo="${ph.id}"><img src="${url}" alt=""></button>`}))).join('');

  const relSection = S.editMode ? `
    <div class="rel-builder" data-focus="${id}">
      <div class="rel-zone" data-zone="parent"><div class="zone-label">Parent</div><div class="zone-chips">${parents.map(x=>zoneChip(x.relId,x.p)).join('')||'<span class="zone-empty">drop here</span>'}</div></div>
      <div class="rel-builder-center">${await avatarHtml(p,'rel-center-photo')}<strong>${esc(fullName(p))}</strong></div>
      <div class="rel-zone" data-zone="partner"><div class="zone-label">Partner</div><div class="zone-chips">${partners.map(x=>zoneChip(x.relId,x.p)).join('')||'<span class="zone-empty">drop here</span>'}</div></div>
      <div class="rel-zone" data-zone="child"><div class="zone-label">Child</div><div class="zone-chips">${children.map(x=>zoneChip(x.relId,x.p)).join('')||'<span class="zone-empty">drop here</span>'}</div></div>
    </div>
    <p class="small rel-builder-hint">Drag someone onto Parent / Partner / Child. On touch: tap a person below, then tap a zone. Click a chip's ✕ to remove it.</p>
    <div class="rel-tray" id="relTray">${await trayHtml(excludeIds)}</div>
  ` : `
    <div class="person-rel-grid">
      ${readOnlyRow('Parents',parents.map(x=>x.p))}
      ${readOnlyRow('Partner',partners.map(x=>x.p))}
      ${readOnlyRow('Children',children.map(x=>x.p))}
    </div>
    <p class="small rel-builder-hint">Switch to Edit mode (top of page) to add or change relationships. Tap any name to go to their page.</p>
  `;

  const isMe = S.profile?.person_id===id;
  const inviteHtml = canEdit() ? (
    isMe ? '<p class="small invite-status">This is you.</p>'
    : p.invite_email ? `<p class="small invite-status">Invited: ${esc(p.invite_email)} — waiting for them to sign in.</p>`
    : `<div class="invite-row"><input id="inviteEmailInput" type="email" placeholder="Their email address"><button id="inviteSendBtn" data-invite-person="${id}">Invite by email</button></div>`
  ) : '';
  const avatarBtnHtml = (isMe||canEdit()) ? `<button class="small-btn avatar-set-btn" data-set-avatar="${id}">${isMe?'Set my photo':'Set their photo'}</button>` : '';

  root.innerHTML=`
    <button data-page="dashboard" class="back-link">← Back</button>
    <div class="person-mode-toggle"><button id="personViewModeBtn" class="${S.editMode?'':'primary'}">View mode</button><button id="personEditModeBtn" class="${S.editMode?'primary':''}">Edit mode</button></div>
    <div class="person-hero">
      ${await avatarHtml(p,'person-hero-photo')}
      <div>
        <h2>${esc(fullName(p))}</h2>
        <p class="small">${esc(p.birth_date||'Birth date unknown')}${p.death_date?' – '+esc(p.death_date):(p.living===false?' – deceased':'')}</p>
        ${avatarBtnHtml}
        ${inviteHtml}
      </div>
    </div>

    ${relSection}
    ${siblings.length?`<div class="person-rel-row siblings-row"><span class="person-rel-label">Siblings</span><div class="person-rel-list">${siblings.map(s=>`<button class="person-chip" data-person-id="${s.id}">${esc(fullName(s))}</button>`).join('')}</div><span class="small">(derived from shared parents)</span></div>`:''}

    <h3>Photos (${photos.length})</h3>
    <div class="person-photo-grid">${galleryHtml||'<p class="small">No photos of this person yet.</p>'}</div>
  `;
}

async function link(zone,focusId,otherId){
  let from=focusId,to=otherId,type=zone;
  if(zone==='parent'){from=otherId;to=focusId;type='parent'}
  else if(zone==='child'){from=focusId;to=otherId;type='parent'}
  else {type='partner'}
  const res=await createRelationship(from,to,type,zone);
  if(res.error){alert(res.error);return}
  await renderPersonPage(focusId);
}

export function bindPerson(){
  document.body.addEventListener('click',async e=>{
    const modeBtn=e.target.closest('#personViewModeBtn,#personEditModeBtn');
    if(modeBtn){e.preventDefault(); const {setEditMode}=await import('./navigation.js'); setEditMode(modeBtn.id==='personEditModeBtn'); return}

    const inviteBtn=e.target.closest('[data-invite-person]');
    if(inviteBtn){e.preventDefault(); const email=($('inviteEmailInput')?.value||'').trim(); if(!email)return alert('Enter an email address first.'); const targetId=inviteBtn.dataset.invitePerson; const res=await invitePerson(targetId,email); if(res.error){alert(res.error);return} showInviteMessage(res.data,email); renderPersonPage(targetId); return}

    const openPhoto=e.target.closest('[data-open-photo]');
    if(openPhoto){e.preventDefault(); const [{showPage},{selectPhoto}]=await Promise.all([import('./navigation.js'),import('./photos.js')]); await showPage('photo'); await selectPhoto(openPhoto.dataset.openPhoto); return}

    const removeChip=e.target.closest('[data-remove-rel]');
    if(removeChip){e.preventDefault(); if(!confirm('Remove this relationship?'))return; const focusId=e.target.closest('.rel-builder')?.dataset.focus; await deleteRelationship(removeChip.dataset.removeRel); if(focusId)await renderPersonPage(focusId); return}

    const trayChip=e.target.closest('[data-tray-person]');
    if(trayChip){
      const zoneClicked=e.target.closest('[data-zone]');
      if(!zoneClicked){ // tap-select
        document.querySelectorAll('.tray-chip.selected').forEach(c=>c.classList.remove('selected'));
        if(selectedTrayId===trayChip.dataset.trayPerson){selectedTrayId=null} else {selectedTrayId=trayChip.dataset.trayPerson; trayChip.classList.add('selected')}
        return;
      }
    }
    const zone=e.target.closest('[data-zone]');
    if(zone && selectedTrayId){
      const focusId=e.target.closest('.rel-builder')?.dataset.focus;
      if(focusId){await link(zone.dataset.zone,focusId,selectedTrayId); selectedTrayId=null}
      return;
    }
  });
  document.body.addEventListener('dragstart',e=>{const t=e.target.closest('[data-tray-person]'); if(t)e.dataTransfer.setData('text/plain',t.dataset.trayPerson)});
  document.body.addEventListener('dragover',e=>{if(e.target.closest('[data-zone]'))e.preventDefault()});
  document.body.addEventListener('dragenter',e=>{const z=e.target.closest('[data-zone]'); if(z)z.classList.add('drag-over')});
  document.body.addEventListener('dragleave',e=>{const z=e.target.closest('[data-zone]'); if(z&&!z.contains(e.relatedTarget))z.classList.remove('drag-over')});
  document.body.addEventListener('drop',async e=>{
    const zone=e.target.closest('[data-zone]'); if(!zone)return; e.preventDefault(); zone.classList.remove('drag-over');
    const otherId=e.dataTransfer.getData('text/plain'); const focusId=e.target.closest('.rel-builder')?.dataset.focus;
    if(otherId&&focusId)await link(zone.dataset.zone,focusId,otherId);
  });
}