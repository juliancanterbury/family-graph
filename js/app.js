import { initSupabase, routeAuth, sendLogin, signOut, loadAll } from './api.js';
import { $, hide, show, text, applyTheme, S } from './state.js';
import { renderAll } from './render.js';
import { bindNavigation, showPage, pageName, setEditMode } from './navigation.js';
import { bindPhotos } from './photos.js';
import { bindPeople } from './people.js';
import { bindRelationships } from './relationships.js';
import { bindTree } from './tree.js';
import { bindReview } from './review.js';
import { bindAdmin } from './admin.js';
export async function boot(){
  try{applyTheme(); hide('login');hide('app');hide('problem');show('loading'); bindAll(); await initSupabase(); await routeAuth(); await showPage(pageName());}
  catch(e){console.error(e); hide('loading');hide('login');hide('app');show('problem'); text('problemText',e.message)}
}
function bindAll(){
  bindNavigation(); bindPhotos(); bindPeople(); bindRelationships(); bindTree(); bindReview(); bindAdmin();
  $('loginBtn')?.addEventListener('click',sendLogin); $('signOutBtn')?.addEventListener('click',signOut); $('refreshBtn')?.addEventListener('click',loadAll);
  $('viewModeBtn')?.addEventListener('click',()=>setEditMode(false)); $('editModeBtn')?.addEventListener('click',()=>setEditMode(true));
  $('scopeToggleBtn')?.addEventListener('click',toggleScope);
  syncScopeLabel();
  setEditMode(false);
}
function toggleScope(){S.showEveryone=!S.showEveryone; localStorage.setItem('familyGraphShowEveryone',S.showEveryone?'1':'0'); syncScopeLabel(); renderAll()}
function syncScopeLabel(){const b=$('scopeToggleBtn'); if(b)b.textContent=S.showEveryone?'Show my family only':'Show everyone'}
boot();
