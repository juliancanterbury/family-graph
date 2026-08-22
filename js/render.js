import { S, text, html, setClasses, applyTheme, $, esc, fullName, visiblePeople, person, initial } from './state.js';
import { renderPhotos, renderPhotoPage, renderFaceEditor } from './photos.js';
import { renderPeople } from './people.js';
import { renderTree } from './tree.js';
import { renderAdmin } from './admin.js';
import { renderReview } from './review.js';
export async function renderAll(){updateDashboard(); setClasses(); applyTheme(); await renderPhotos(); await renderPeople(); await renderPage(((location.hash||'#dashboard').replace('#','').split('/')[0])||'dashboard')}
export async function renderPage(page){
  updateDashboard(); setClasses();
  if(page==='photo') await renderPhotoPage();
  if(page==='people') await renderPeople();
  if(page==='graph') await renderTree();
  if(page==='admin') await renderAdmin();
  if(page==='review') renderReview();
}
function updateDashboard(){text('peopleTotal',S.people.length); text('photosTotal',S.photos.length); text('facesTotal',S.faces.length); text('relationshipsTotal',S.relationships.length); renderWhoAreYou()}
function renderWhoAreYou(){
  const card=$('whoAreYouCard'); if(!card)return;
  if(S.profile?.person_id){card.classList.add('hidden'); return}
  card.classList.remove('hidden');
  const picker=$('whoAreYouSelect'); if(picker){picker.dataset.value=''; picker.innerHTML=personPickerHtml('')}
}
export function photoTitle(ph){return ph?.title||ph?.original_filename||'Photo'}
export function faceForPerson(id){return S.faces.find(f=>f.person_id===id)}
const dimCache=new Map();
async function ensureDims(ph){
  if(ph.width&&ph.height)return {w:ph.width,h:ph.height};
  if(dimCache.has(ph.id))return dimCache.get(ph.id);
  const { publicUrl } = await import('./api.js'); const url=await publicUrl(ph);
  const dims=await new Promise(res=>{const img=new Image(); img.onload=()=>res({w:img.naturalWidth,h:img.naturalHeight}); img.onerror=()=>res({w:1200,h:1200}); img.src=url});
  dimCache.set(ph.id,dims);
  S.sb.from('photos').update({width:dims.w,height:dims.h}).eq('id',ph.id).then(()=>{ph.width=dims.w;ph.height=dims.h});
  return dims;
}
export async function cropStyle(f,size=92){
  if(!f)return''; const ph=S.photos.find(p=>p.id===f.photo_id); if(!ph)return''; const { publicUrl } = await import('./api.js'); const url=await publicUrl(ph);
  const legacy=(+f.x||0)>1.5||(+f.y||0)>1.5||(+f.w||0)>1.5||(+f.h||0)>1.5;
  if(legacy){
    const w=Math.max(1,+f.w||1), h=Math.max(1,+f.h||1), x=+f.x||0, y=+f.y||0, displayW=1200, scale=size/Math.max(w,h);
    return `background-image:url('${url}');background-size:${displayW*scale}px auto;background-position:${-(x*scale)+(size-w*scale)/2}px ${-(y*scale)+(size-h*scale)/2}px;background-repeat:no-repeat;`;
  }
  const dims=await ensureDims(ph); const nw=dims.w||1200, nh=dims.h||1200;
  const fw=Math.max(.02,+f.w||.1), fh=Math.max(.02,+f.h||.12), fx=+f.x||0, fy=+f.y||0;
  const wPx=fw*nw, hPx=fh*nh, scale=size/Math.max(wPx,hPx), renderedW=nw*scale, xPx=fx*nw, yPx=fy*nh;
  return `background-image:url('${url}');background-size:${renderedW}px auto;background-position:${-(xPx*scale)+(size-wPx*scale)/2}px ${-(yPx*scale)+(size-hPx*scale)/2}px;background-repeat:no-repeat;`;
}
export async function avatarHtml(p,cls='node-photo'){
  if(p.avatar_path){const bucketName=typeof FAMILY_MEDIA_BUCKET!=='undefined'?FAMILY_MEDIA_BUCKET:'family-media'; const url=S.sb.storage.from(bucketName).getPublicUrl(p.avatar_path).data.publicUrl; return `<div class="${cls}" style="background-image:url('${url}');background-size:cover;background-position:center;"></div>`}
  const f=faceForPerson(p.id); return f?`<div class="${cls}" style="${await cropStyle(f)}"></div>`:`<div class="${cls}">${esc(initial(p))}</div>`
}
// Native <select> has a known macOS bug (Safari and Chrome both) where the
// popup closes before a click on an option registers — this custom dropdown
// avoids relying on native OS select behaviour entirely.
export function personPickerHtml(selected=''){
  const people=visiblePeople().sort((a,b)=>fullName(a).localeCompare(fullName(b)));
  const selectedPerson=people.find(p=>p.id===selected);
  return `<button type="button" class="custom-select-btn person-picker-btn">${selectedPerson?esc(fullName(selectedPerson)):'Choose existing person…'}</button>
    <div class="custom-select-menu person-picker-menu hidden">
      <input type="text" class="person-picker-filter" placeholder="Type to filter…">
      <div class="person-picker-list">${people.map(p=>`<button type="button" data-value="${p.id}">${esc(fullName(p))}</button>`).join('')}</div>
    </div>`;
}
export function bindPersonPickers(){
  document.body.addEventListener('click',e=>{
    const btn=e.target.closest('.person-picker-btn');
    if(btn){
      e.stopPropagation();
      const menu=btn.nextElementSibling;
      document.querySelectorAll('.custom-select-menu').forEach(m=>{if(m!==menu)m.classList.add('hidden')});
      menu.classList.toggle('hidden');
      if(!menu.classList.contains('hidden'))menu.querySelector('.person-picker-filter')?.focus();
      return;
    }
    const opt=e.target.closest('.person-picker-menu [data-value]');
    if(opt){
      const wrap=opt.closest('.person-picker');
      wrap.dataset.value=opt.dataset.value;
      wrap.querySelector('.person-picker-btn').textContent=opt.textContent;
      opt.closest('.person-picker-menu').classList.add('hidden');
      wrap.dispatchEvent(new CustomEvent('personpick',{detail:{value:opt.dataset.value},bubbles:true}));
    }
  });
  document.body.addEventListener('input',e=>{
    const filterInput=e.target.closest('.person-picker-filter'); if(!filterInput)return;
    const q=filterInput.value.toLowerCase();
    filterInput.closest('.person-picker-menu').querySelectorAll('.person-picker-list button').forEach(b=>b.classList.toggle('hidden',!b.textContent.toLowerCase().includes(q)));
  });
  document.addEventListener('click',()=>document.querySelectorAll('.custom-select-menu').forEach(m=>m.classList.add('hidden')));
}
