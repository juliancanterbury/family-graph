import { S, text, html, setClasses, applyTheme, $, esc, fullName, visiblePeople, person, initial } from './state.js';
import { renderPhotos, renderPhotoPage, renderFaceEditor } from './photos.js';
import { renderPeople } from './people.js';
import { renderTree } from './tree.js';
import { renderAdmin } from './admin.js';
import { renderReview } from './review.js';
import { renderRelationshipList } from './relationships.js';
export async function renderAll(){updateDashboard(); setClasses(); applyTheme(); await renderPhotos(); await renderPeople(); renderRelationshipList(); await renderPage((location.hash||'#dashboard').replace('#','')||'dashboard')}
export async function renderPage(page){
  updateDashboard(); setClasses();
  if(page==='photo') await renderPhotoPage();
  if(page==='people') await renderPeople();
  if(page==='relationships') renderRelationshipList();
  if(page==='graph') await renderTree();
  if(page==='admin') await renderAdmin();
  if(page==='review') renderReview();
}
function updateDashboard(){text('peopleTotal',S.people.length); text('photosTotal',S.photos.length); text('facesTotal',S.faces.length); text('relationshipsTotal',S.relationships.length)}
export function photoTitle(ph){return ph?.title||ph?.original_filename||'Photo'}
export function faceForPerson(id){return S.faces.find(f=>f.person_id===id)}
export async function cropStyle(f,size=92){
  if(!f)return''; const ph=S.photos.find(p=>p.id===f.photo_id); if(!ph)return''; const { publicUrl } = await import('./api.js'); const url=await publicUrl(ph);
  const w=Math.max(1,+f.w||1), h=Math.max(1,+f.h||1), x=+f.x||0, y=+f.y||0; const img=$('mainPhoto'); const displayW=(img&&img.complete&&img.naturalWidth)?img.clientWidth||1200:1200; const scale=size/Math.max(w,h);
  return `background-image:url('${url}');background-size:${displayW*scale}px auto;background-position:${-(x*scale)+(size-w*scale)/2}px ${-(y*scale)+(size-h*scale)/2}px;background-repeat:no-repeat;`;
}
export async function avatarHtml(p,cls='node-photo'){const f=faceForPerson(p.id); return f?`<div class="${cls}" style="${await cropStyle(f)}"></div>`:`<div class="${cls}">${esc(initial(p))}</div>`}
export function personOptions(selected=''){return ['<option value="">Choose existing person…</option>'].concat(visiblePeople().sort((a,b)=>fullName(a).localeCompare(fullName(b))).map(p=>`<option value="${p.id}" ${p.id===selected?'selected':''}>${esc(fullName(p))}</option>`)).join('')}
