import { S, $, esc, fullName, person as personById } from './state.js';
import { avatarHtml } from './render.js';
import { publicUrl } from './api.js';

function parentsOf(id){return S.relationships.filter(r=>r.relationship_type==='parent'&&r.to_person_id===id).map(r=>personById(r.from_person_id)).filter(Boolean)}
function childrenOf(id){return S.relationships.filter(r=>r.relationship_type==='parent'&&r.from_person_id===id).map(r=>personById(r.to_person_id)).filter(Boolean)}
function partnersOf(id){return S.relationships.filter(r=>r.relationship_type==='partner'&&(r.from_person_id===id||r.to_person_id===id)).map(r=>personById(r.from_person_id===id?r.to_person_id:r.from_person_id)).filter(Boolean)}
function siblingsOf(id){
  const parentIds=new Set(parentsOf(id).map(p=>p.id)); if(!parentIds.size)return [];
  const ids=new Set();
  S.relationships.filter(r=>r.relationship_type==='parent'&&parentIds.has(r.from_person_id)).forEach(r=>{if(r.to_person_id!==id)ids.add(r.to_person_id)});
  return [...ids].map(personById).filter(Boolean);
}
function linkRow(label,people){
  if(!people.length)return'';
  return `<div class="person-rel-row"><span class="person-rel-label">${esc(label)}</span><div class="person-rel-list">${people.map(p=>`<button class="person-chip" data-person-id="${p.id}">${esc(fullName(p))}</button>`).join('')}</div></div>`;
}
export function personPhotos(id){
  const photoIds=[...new Set(S.faces.filter(f=>f.person_id===id).map(f=>f.photo_id))];
  return photoIds.map(pid=>S.photos.find(ph=>ph.id===pid)).filter(Boolean);
}
export async function renderPersonPage(id){
  const root=$('personPage'); if(!root)return;
  const p=personById(id);
  if(!p){root.innerHTML='<button data-page="dashboard" class="back-link">← Back</button><p class="small">Person not found.</p>'; return}
  const parents=parentsOf(id), partners=partnersOf(id), children=childrenOf(id), siblings=siblingsOf(id), photos=personPhotos(id);
  const galleryHtml=(await Promise.all(photos.map(async ph=>{const url=await publicUrl(ph); return `<button class="person-photo-thumb" data-open-photo="${ph.id}"><img src="${url}" alt=""></button>`}))).join('');
  root.innerHTML=`
    <button data-page="dashboard" class="back-link">← Back</button>
    <div class="person-hero">
      ${await avatarHtml(p,'person-hero-photo')}
      <div>
        <h2>${esc(fullName(p))}</h2>
        <p class="small">${esc(p.birth_date||'Birth date unknown')}${p.death_date?' – '+esc(p.death_date):(p.living===false?' – deceased':'')}</p>
      </div>
    </div>
    <div class="person-rel-grid">
      ${linkRow('Parents',parents)}${linkRow('Partner',partners)}${linkRow('Children',children)}${linkRow('Siblings',siblings)}
    </div>
    <h3>Photos (${photos.length})</h3>
    <div class="person-photo-grid">${galleryHtml||'<p class="small">No photos of this person yet.</p>'}</div>
  `;
}
export function bindPerson(){
  document.body.addEventListener('click',async e=>{
    const t=e.target.closest('[data-open-photo]'); if(!t)return; e.preventDefault();
    const [{showPage},{selectPhoto}]=await Promise.all([import('./navigation.js'),import('./photos.js')]);
    await showPage('photo'); await selectPhoto(t.dataset.openPhoto);
  });
}
