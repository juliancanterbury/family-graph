export const S = {
  sb:null, session:null, profile:null,
  people:[], photos:[], faces:[], relationships:[], suggestions:[], comments:[], feedback:[],
  currentPhoto:null, selectedFaceId:null, currentRel:'mother', graphScale:1,
  showBoxes:true, showNames:true, editMode:false, dbTab:'people', dbSelected:null,
  theme:localStorage.getItem('familyGraphTheme') || 'ocean', human:null, humanPromise:null,
  showEveryone:localStorage.getItem('familyGraphShowEveryone')==='1', treeFocusId:null
};
export const REDIRECT_URL='https://juliancanterbury.github.io/family-graph/';
export const $=id=>document.getElementById(id);
export const show=id=>$(id)?.classList.remove('hidden');
export const hide=id=>$(id)?.classList.add('hidden');
export const text=(id,v)=>{const e=$(id); if(e)e.textContent=v??''};
export const html=(id,v)=>{const e=$(id); if(e)e.innerHTML=v??''};
export const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export const uid=()=>crypto.randomUUID();
export const titleCaseName=v=>String(v||'').trim().replace(/\s+/g,' ').split(' ').map(part=>part.split('-').map(p=>p?p[0].toUpperCase()+p.slice(1).toLowerCase():p).join('-')).join(' ');
export const fullName=p=>p?.display_name || [p?.given_names,p?.family_name].filter(Boolean).join(' ') || 'Unknown';
export const person=id=>S.people.find(p=>p.id===id);
export const initial=p=>fullName(p).split(' ').filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase()||'?';
export function isRealPerson(p){const n=fullName(p).trim().toLowerCase();return !!p&&n&&!['unknown','unknown person','unnamed','unnamed person'].includes(n)}

// --- Family-side scoping ---
// Blood relatives: everyone reachable via parent/child/sibling links, transitively.
export function bloodRelativeIds(startId,seen=new Set()){
  if(!startId||seen.has(startId))return seen; seen.add(startId);
  S.relationships.forEach(r=>{
    if(r.relationship_type==='parent'){
      if(r.to_person_id===startId) bloodRelativeIds(r.from_person_id,seen);
      if(r.from_person_id===startId) bloodRelativeIds(r.to_person_id,seen);
    }
    if(r.relationship_type==='sibling'){
      if(r.from_person_id===startId) bloodRelativeIds(r.to_person_id,seen);
      if(r.to_person_id===startId) bloodRelativeIds(r.from_person_id,seen);
    }
  });
  return seen;
}
// Blood relatives plus their direct partners (but not the partners' own blood relatives).
export function myFamilyIds(){
  const me=S.profile?.person_id; if(!me)return null;
  const blood=bloodRelativeIds(me), out=new Set(blood);
  S.relationships.forEach(r=>{
    if(r.relationship_type!=='partner')return;
    if(blood.has(r.from_person_id)) out.add(r.to_person_id);
    if(blood.has(r.to_person_id)) out.add(r.from_person_id);
  });
  return out;
}
export function inScope(p){
  if(S.showEveryone||!S.profile?.person_id)return true;
  const mine=myFamilyIds(); return !mine||mine.has(p?.id);
}
export function visible(p){return isRealPerson(p)&&inScope(p)}
export const visiblePeople=()=>S.people.filter(visible);
export function visiblePhotos(){
  if(S.showEveryone||!S.profile?.person_id)return S.photos;
  const mine=myFamilyIds(); const me=S.session?.user?.id;
  return S.photos.filter(ph=>{
    if(ph.uploaded_by&&ph.uploaded_by===me)return true;
    return S.faces.some(f=>f.photo_id===ph.id&&f.person_id&&mine.has(f.person_id));
  });
}
export const canDelete=()=>String(S.profile?.role||'viewer').toLowerCase()==='owner';
export const canEdit=()=>['owner','editor','family editor','contributor'].includes(String(S.profile?.role||'viewer').toLowerCase());
export const userName=()=>S.profile?.display_name || S.session?.user?.email || 'Family member';
export const userId=()=>S.session?.user?.id || 'local';
export function status(t){text('saveStatus',t)}
export function setClasses(){document.body.classList.toggle('can-edit',canEdit());document.body.classList.toggle('can-delete',canDelete());document.body.classList.toggle('edit-mode',S.editMode)}
export function applyTheme(name=S.theme){S.theme=name;document.body.dataset.theme=name;localStorage.setItem('familyGraphTheme',name);document.querySelectorAll('.theme-chip').forEach(b=>b.classList.toggle('active',b.dataset.theme===name))}
