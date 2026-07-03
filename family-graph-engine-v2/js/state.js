export const S = {
  sb:null, session:null, profile:null,
  people:[], photos:[], faces:[], relationships:[], suggestions:[], comments:[], feedback:[],
  currentPhoto:null, selectedFaceId:null, currentRel:'mother', graphScale:1,
  showBoxes:true, showNames:true, editMode:false, dbTab:'people', dbSelected:null,
  theme:localStorage.getItem('familyGraphTheme') || 'ocean', human:null, humanPromise:null
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
export const visiblePeople=()=>S.people.filter(isRealPerson);
export const canDelete=()=>String(S.profile?.role||'viewer').toLowerCase()==='owner';
export const canEdit=()=>['owner','editor','family editor','contributor'].includes(String(S.profile?.role||'viewer').toLowerCase());
export const userName=()=>S.profile?.display_name || S.session?.user?.email || 'Family member';
export const userId=()=>S.session?.user?.id || 'local';
export function status(t){text('saveStatus',t)}
export function setClasses(){document.body.classList.toggle('can-edit',canEdit());document.body.classList.toggle('can-delete',canDelete());document.body.classList.toggle('edit-mode',S.editMode)}
export function applyTheme(name=S.theme){S.theme=name;document.body.dataset.theme=name;localStorage.setItem('familyGraphTheme',name);document.querySelectorAll('.theme-chip').forEach(b=>b.classList.toggle('active',b.dataset.theme===name))}
