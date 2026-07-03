import { S, $, setClasses } from './state.js';
import { renderPage } from './render.js';
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
export function setEditMode(on){S.editMode=!!on; setClasses(); $('viewModeBtn')?.classList.toggle('primary',!S.editMode); $('editModeBtn')?.classList.toggle('primary',S.editMode)}
export function bindNavigation(){
  document.body.addEventListener('click',e=>{const btn=e.target.closest('[data-page]'); if(btn){e.preventDefault();showPage(btn.dataset.page)}});
  window.addEventListener('hashchange',()=>showPage(pageName()));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){S.selectedFaceId=null; renderPage('photo')}});
}
