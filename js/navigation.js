import { S, $, setClasses } from './state.js';
import { renderPage } from './render.js';
import { renderPersonPage } from './person.js';
export function pageName(){return (location.hash||'#dashboard').replace('#','')||'dashboard'}
export async function showPage(page='dashboard'){
  if(!$(page+'Page')) page='dashboard';
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  $(page+'Page')?.classList.remove('hidden');
  document.querySelectorAll('nav button[data-page]').forEach(b=>b.classList.toggle('primary',b.dataset.page===page));
  if(location.hash!=='#'+page) history.replaceState(null,'','#'+page);
  if(page!=='photo') S.selectedFaceId=null;
  await renderPage(page);
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
export function bindNavigation(){
  document.body.addEventListener('click',e=>{
    const person=e.target.closest('[data-person-id]'); if(person && !e.target.closest('[data-no-nav]')){e.preventDefault(); showPerson(person.dataset.personId); return}
    const btn=e.target.closest('[data-page]'); if(btn){e.preventDefault();showPage(btn.dataset.page)}
  });
  window.addEventListener('hashchange',()=>{
    const h=location.hash||'';
    if(h.startsWith('#person/')) showPerson(h.slice('#person/'.length));
    else showPage(pageName());
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){S.selectedFaceId=null; renderPage('photo')}});
}
