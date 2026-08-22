import { S, $, setClasses } from './state.js';
import { renderPage } from './render.js';
import { renderPersonPage } from './person.js';
export function pageName(){return ((location.hash||'#dashboard').replace('#','').split('/')[0])||'dashboard'}
export async function showPage(page='dashboard'){
  if(!$(page+'Page')) page='dashboard';
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  $(page+'Page')?.classList.remove('hidden');
  document.querySelectorAll('nav button[data-page]').forEach(b=>b.classList.toggle('primary',b.dataset.page===page));
  const hashBase=(location.hash||'').split('/')[0];
  if(hashBase!=='#'+page) history.pushState(null,'','#'+page);
  if(page!=='photo') S.selectedFaceId=null;
  if(page==='graph'){
    const h=location.hash||'';
    if(h.startsWith('#graph/')){
      const parts=h.slice('#graph/'.length).split('/');
      const id=decodeURIComponent(parts[0]||'');
      if(id) S.treeFocusId=id;
      if(parts[1]==='tree'||parts[1]==='fan') S.treeViewMode=parts[1];
      if(parts[2]) S.treeGenerationLimit=parts[2]==='all'?'all':+parts[2];
    }
  }
  await renderPage(page);
  if(page==='photo'){
    const h=location.hash||'';
    if(h.startsWith('#photo/')){
      const id=decodeURIComponent(h.slice('#photo/'.length));
      const {selectPhoto}=await import('./photos.js'); await selectPhoto(id);
    }
  }
}
export async function showPerson(id){
  if(!id)return;
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  $('personPage')?.classList.remove('hidden');
  document.querySelectorAll('nav button[data-page]').forEach(b=>b.classList.remove('primary'));
  const target='#person/'+id; if(location.hash!==target) history.pushState(null,'',target);
  S.currentPersonId=id;
  await renderPersonPage(id);
}
export function setEditMode(on){S.editMode=!!on; setClasses(); $('viewModeBtn')?.classList.toggle('primary',!S.editMode); $('editModeBtn')?.classList.toggle('primary',S.editMode); if(S.currentPersonId&&!$('personPage')?.classList.contains('hidden')){import('./person.js').then(m=>m.renderPersonPage(S.currentPersonId))}}
export async function goBack(){
  const rt=S.returnTo; S.returnTo=null;
  if(rt?.page==='photo'){
    await showPage('photo');
    if(rt.photoId){const {selectPhoto}=await import('./photos.js'); await selectPhoto(rt.photoId)}
    return;
  }
  await showPage('dashboard');
}
export function bindNavigation(){
  document.body.addEventListener('click',e=>{
    const back=e.target.closest('[data-back]'); if(back){e.preventDefault(); goBack(); return}
    const person=e.target.closest('[data-person-id]'); if(person && !e.target.closest('[data-no-nav]')){e.preventDefault(); showPerson(person.dataset.personId); return}
    const btn=e.target.closest('[data-page]'); if(btn){e.preventDefault(); if(btn.dataset.page==='graph'&&S.currentPersonId)S.treeFocusId=S.currentPersonId; showPage(btn.dataset.page)}
  });
  window.addEventListener('hashchange',()=>{
    const h=location.hash||'';
    if(h.startsWith('#person/')) showPerson(h.slice('#person/'.length));
    else showPage(pageName());
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!$('personPage')?.classList.contains('hidden')){goBack(); return}
    S.selectedFaceId=null; renderPage('photo');
  });
}
