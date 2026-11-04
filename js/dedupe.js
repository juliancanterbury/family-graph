// Duplicate-photo finder and merger (owner-only, run from Admin).
//
// 1. scanDuplicates() fingerprints every photo (reusing stored hashes where present) and groups
//    copies of the same picture.
// 2. planMerge() works out, without writing anything, what merging a group would do: which faces
//    move to the survivor, which are dropped as overlapping copies (and which name they hand on),
//    which comments/suggestions/links get repointed, and which duplicate rows get deleted.
// 3. The owner reviews that preview; only then does applyMerge() write. It moves everything first
//    and deletes the duplicate rows last, so an error part-way leaves nothing lost: at worst some
//    data has already moved to the survivor and the duplicate row is still there.
//
// There is no favourites table in this schema; if one is added, repoint it in applyMerge().
import { S, $, esc, fullName, person, canDelete, status } from './state.js';
import { publicUrl, bucket } from './api.js';
import { contentHash, visualHash, looksSame } from './photohash.js';

const LEGACY_DISPLAY_W=1200; // legacy screen-pixel boxes were drawn on a ~1200px-wide photo (same guess as cropStyle)
const isLegacy=f=>(+f.x||0)>1.5||(+f.y||0)>1.5||(+f.w||0)>1.5||(+f.h||0)>1.5;
function norm(f,ph){
  if(!isLegacy(f))return{x:+f.x||0,y:+f.y||0,w:+f.w||0,h:+f.h||0};
  const W=LEGACY_DISPLAY_W, H=(ph?.width&&ph?.height)?W*ph.height/ph.width:W;
  return{x:(+f.x||0)/W,y:(+f.y||0)/H,w:(+f.w||0)/W,h:(+f.h||0)/H};
}
export function iou(a,b){const ix=Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)),iy=Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)),inter=ix*iy; return inter/((a.w*a.h+b.w*b.h-inter)||1)}
export const BOX_OVERLAP=0.5; // boxes overlapping this much (intersection over union) are the same face

// ---------- grouping ----------
export function groupDuplicates(photos){
  const parent=new Map(photos.map(p=>[p.id,p.id]));
  const find=id=>{while(parent.get(id)!==id){parent.set(id,parent.get(parent.get(id))); id=parent.get(id)} return id};
  for(let i=0;i<photos.length;i++)for(let j=i+1;j<photos.length;j++)if(looksSame(photos[i],photos[j]))parent.set(find(photos[i].id),find(photos[j].id));
  const groups=new Map(); photos.forEach(p=>{const r=find(p.id); if(!groups.has(r))groups.set(r,[]); groups.get(r).push(p)});
  return [...groups.values()].filter(g=>g.length>1);
}
export function defaultSurvivor(group,faces){
  const score=p=>{const fs=faces.filter(f=>f.photo_id===p.id); return [fs.filter(f=>f.person_id).length,fs.length,p.taken_date?1:0,-new Date(p.created_at||0).getTime()]};
  return [...group].sort((a,b)=>{const sa=score(a),sb=score(b); for(let i=0;i<sa.length;i++)if(sa[i]!==sb[i])return sb[i]-sa[i]; return 0})[0];
}

// ---------- planning (pure: reads data, writes nothing) ----------
export function planMerge(group,survivorId,data){
  const {faces=[],comments=[],suggestions=[],people=[],relationships=[]}=data;
  const survivor=group.find(p=>p.id===survivorId), dups=group.filter(p=>p.id!==survivorId);
  const photoById=new Map(group.map(p=>[p.id,p]));
  const nameOf=f=>f.person_id?fullName(people.find(p=>p.id===f.person_id)||{display_name:f.label||'Unknown'}):null;
  // working copies of the faces that will end up on the survivor
  const kept=faces.filter(f=>f.photo_id===survivorId).map(f=>({f,box:norm(f,survivor),patch:{},origin:'survivor'}));
  const plan={survivorId,duplicateIds:dups.map(p=>p.id),faceMoves:[],faceDrops:[],faceUpdates:[],conflicts:[],
    commentMoves:[],suggestionMoves:[],suggestionFaceRepoints:[],preferredFaceRepoints:[],relationshipRepoints:[],
    photoPatch:{},storageRemove:[],namesByCopy:[],namesAfter:[],namesLost:[]};
  const eff=k=>({...k.f,...k.patch});
  for(const dup of dups){
    // named faces first, so when two copies of a face disagree the named one wins
    const dupFaces=faces.filter(f=>f.photo_id===dup.id).sort((a,b)=>(b.person_id?1:0)-(a.person_id?1:0));
    for(const f of dupFaces){
      const box=norm(f,dup);
      const samePerson=f.person_id&&kept.find(k=>eff(k).person_id===f.person_id);
      const overlap=kept.map(k=>({k,o:iou(k.box,box)})).filter(x=>x.o>=BOX_OVERLAP).sort((a,b)=>b.o-a.o)[0]?.k;
      const match=samePerson||overlap;
      const ef=match&&eff(match);
      if(match&&!(ef.person_id&&f.person_id&&ef.person_id!==f.person_id)){
        // same face: drop the duplicate copy, hand on anything the kept one is missing
        if(!ef.person_id&&f.person_id)Object.assign(match.patch,{person_id:f.person_id,label:f.label,status:f.status||'confirmed'});
        else if(!ef.person_id&&!ef.label&&f.label)match.patch.label=f.label;
        if(!ef.descriptor&&f.descriptor)match.patch.descriptor=f.descriptor;
        if(f.locked&&!ef.locked)match.patch.locked=true;
        plan.faceDrops.push({faceId:f.id,fromPhotoId:dup.id,keptFaceId:match.f.id,reason:samePerson?'same person':'same box',name:nameOf(f)});
        continue;
      }
      if(match)plan.conflicts.push({faceId:f.id,otherFaceId:match.f.id,names:[nameOf(f),nameOf(ef)]});
      const moved={f,box,patch:{},origin:dup.id};
      kept.push(moved);
    }
  }
  // faces that move = kept faces from duplicates; patches on them ride along with the move
  for(const k of kept){
    if(k.origin==='survivor'){if(Object.keys(k.patch).length)plan.faceUpdates.push({faceId:k.f.id,patch:k.patch})}
    else plan.faceMoves.push({faceId:k.f.id,fromPhotoId:k.origin,patch:{...k.patch,photo_id:survivorId}});
  }
  const dropTo=new Map(plan.faceDrops.map(d=>[d.faceId,d.keptFaceId]));
  const dupSet=new Set(plan.duplicateIds);
  plan.commentMoves=comments.filter(c=>dupSet.has(c.photo_id)).map(c=>c.id);
  plan.suggestionMoves=suggestions.filter(s=>dupSet.has(s.photo_id)).map(s=>s.id);
  plan.suggestionFaceRepoints=suggestions.filter(s=>dropTo.has(s.face_id)).map(s=>({id:s.id,faceId:dropTo.get(s.face_id)}));
  plan.preferredFaceRepoints=people.filter(p=>dropTo.has(p.preferred_face_id)).map(p=>({personId:p.id,faceId:dropTo.get(p.preferred_face_id)}));
  plan.relationshipRepoints=relationships.filter(r=>dupSet.has(r.source_photo_id)).map(r=>r.id);
  // photo details: fill gaps on the survivor from the copies, never overwrite what it has
  for(const k of ['taken_date','location','title']){if(!survivor[k]){const v=dups.map(d=>d[k]).find(Boolean); if(v)plan.photoPatch[k]=v}}
  if(survivor.private&&dups.some(d=>!d.private))plan.photoPatch.private=false; // never hide a photo the family could already see
  for(const k of ['content_hash','phash']){if(!survivor[k]){const v=dups.map(d=>d[k]).find(Boolean); if(v)plan.photoPatch[k]=v}}
  plan.storageRemove=dups.map(d=>d.storage_path).filter(p=>p&&p!==survivor.storage_path);
  // name audit: every name on any copy must still be on the survivor afterwards
  plan.namesByCopy=group.map(p=>({photoId:p.id,names:[...new Set(faces.filter(f=>f.photo_id===p.id&&f.person_id).map(nameOf))]}));
  plan.namesAfter=[...new Set(kept.map(eff).filter(f=>f.person_id).map(nameOf))];
  const before=new Set(plan.namesByCopy.flatMap(c=>c.names));
  plan.namesLost=[...before].filter(n=>!plan.namesAfter.includes(n));
  plan.facesBefore=faces.filter(f=>photoById.has(f.photo_id)).length; plan.facesAfter=kept.length;
  return plan;
}

// ---------- applying (writes) ----------
const missingTable=e=>e&&(e.code==='42P01'||e.code==='PGRST205'||/does not exist|schema cache/i.test(e.message||''));
const missingColumn=e=>e&&(e.code==='42703'||e.code==='PGRST204'||/column/i.test(e.message||''));
export async function applyMerge(sb,plan,log=()=>{}){
  const must=async(what,q)=>{const r=await q; if(r.error)throw new Error(`${what}: ${r.error.message}`); return r};
  const optional=async(what,q)=>{const r=await q; if(r.error&&!missingTable(r.error))throw new Error(`${what}: ${r.error.message}`); return r};
  const faceUpdate=async(id,patch)=>{
    let r=await sb.from('faces').update(patch).eq('id',id);
    if(r.error&&'locked' in patch&&missingColumn(r.error)){const {locked,...rest}=patch; r=Object.keys(rest).length?await sb.from('faces').update(rest).eq('id',id):{error:null}}
    if(r.error)throw new Error(`face ${id}: ${r.error.message}`);
  };
  for(const u of plan.faceUpdates){await faceUpdate(u.faceId,u.patch); log(`Updated face ${u.faceId}`)}
  for(const m of plan.faceMoves){await faceUpdate(m.faceId,m.patch); log(`Moved face ${m.faceId}`)}
  for(const s of plan.suggestionFaceRepoints)await optional('suggestion',sb.from('suggestions').update({face_id:s.faceId}).eq('id',s.id));
  for(const p of plan.preferredFaceRepoints)await must('person',sb.from('people').update({preferred_face_id:p.faceId}).eq('id',p.personId));
  if(plan.commentMoves.length)await optional('comments',sb.from('comments').update({photo_id:plan.survivorId}).in('id',plan.commentMoves));
  if(plan.suggestionMoves.length)await optional('suggestions',sb.from('suggestions').update({photo_id:plan.survivorId}).in('id',plan.suggestionMoves));
  if(plan.relationshipRepoints.length)await must('relationships',sb.from('relationships').update({source_photo_id:plan.survivorId}).in('id',plan.relationshipRepoints));
  if(Object.keys(plan.photoPatch).length){
    let r=await sb.from('photos').update(plan.photoPatch).eq('id',plan.survivorId);
    if(r.error&&missingColumn(r.error)){const {content_hash,phash,...rest}=plan.photoPatch; r=Object.keys(rest).length?await sb.from('photos').update(rest).eq('id',plan.survivorId):{error:null}}
    if(r.error)throw new Error('survivor photo: '+r.error.message);
  }
  // Everything worth keeping is on the survivor now. Only the duplicates' leftovers are deleted.
  const dropIds=plan.faceDrops.map(d=>d.faceId);
  if(dropIds.length)await must('drop faces',sb.from('faces').delete().in('id',dropIds));
  const left=await must('check',sb.from('faces').select('id').in('photo_id',plan.duplicateIds));
  if(left.data?.length)throw new Error(`${left.data.length} face(s) still on a duplicate — stopped before deleting it.`);
  await must('delete duplicates',sb.from('photos').delete().in('id',plan.duplicateIds));
  if(plan.storageRemove.length)await sb.storage.from(bucket()).remove(plan.storageRemove).catch(()=>{});
  log(`Merged ${plan.duplicateIds.length} duplicate(s) into ${plan.survivorId}`);
}

// ---------- fingerprinting existing photos ----------
export async function fingerprint(photos,onProgress=()=>{}){
  const out=new Map(); let i=0;
  for(const p of photos){
    onProgress(++i,photos.length);
    if(p.content_hash&&p.phash){out.set(p.id,{content_hash:p.content_hash,phash:p.phash});continue}
    try{
      const res=await fetch(await publicUrl(p)); if(!res.ok)continue; const blob=await res.blob();
      const [h,v]=await Promise.all([contentHash(blob),visualHash(blob)]);
      out.set(p.id,{content_hash:h,phash:v?.hash||null,width:p.width||v?.width,height:p.height||v?.height});
    }catch{/* unreadable: left out of grouping */}
  }
  return out;
}

// ---------- owner UI ----------
let ui=null; // {groups, prints, survivors:Map, include:Set}
function overlay(){
  let o=$('dedupeOverlay');
  if(!o){o=document.createElement('div'); o.id='dedupeOverlay'; o.className='dedupe-overlay'; document.body.appendChild(o)}
  o.classList.remove('hidden'); return o;
}
export function closeDedupe(){$('dedupeOverlay')?.classList.add('hidden'); ui=null}
export async function openDedupe(){
  if(!canDelete())return alert('Only the owner can merge duplicate photos.');
  const o=overlay();
  o.innerHTML='<div class="dedupe-panel"><div class="dedupe-head"><h2>Duplicate photos</h2><button data-dedupe-close>Close</button></div><p class="small" id="dedupeProgress">Fingerprinting photos…</p></div>';
  const prints=await fingerprint(S.photos,(i,n)=>{const p=$('dedupeProgress'); if(p)p.textContent=`Fingerprinting photo ${i} of ${n}…`});
  const enriched=S.photos.map(p=>({...p,...(prints.get(p.id)||{})}));
  const groups=groupDuplicates(enriched);
  ui={groups,prints,survivors:new Map(groups.map(g=>[g[0].id,defaultSurvivor(g,S.faces).id])),include:new Set(groups.map(g=>g[0].id))};
  await renderDedupe();
}
const dataNow=()=>({faces:S.faces,comments:S.comments,suggestions:S.suggestions,people:S.people,relationships:S.relationships});
async function renderDedupe(){
  const o=overlay(); if(!ui)return;
  const unread=S.photos.length-ui.prints.size;
  let body='';
  for(const g of ui.groups){
    const key=g[0].id, sid=ui.survivors.get(key), plan=planMerge(g,sid,dataNow());
    const cards=await Promise.all(g.map(async p=>{
      const names=plan.namesByCopy.find(c=>c.photoId===p.id).names, fc=S.faces.filter(f=>f.photo_id===p.id).length;
      return `<label class="dedupe-copy ${p.id===sid?'survivor':''}"><input type="radio" name="surv-${key}" data-dedupe-survivor="${key}" value="${p.id}" ${p.id===sid?'checked':''}><img src="${await publicUrl(p)}" alt=""><b>${p.id===sid?'Keep this one':'Merge into kept'}</b><span class="small">${esc(p.taken_date||'Undated')} · ${fc} face${fc===1?'':'s'} · added ${esc(String(p.created_at||'').slice(0,10)||'?')}</span><span class="small">${names.length?esc(names.join(', ')):'No names'}</span></label>`;
    }));
    const spread=plan.namesByCopy.filter(c=>c.names.length).length>1;
    const lines=[
      `${plan.facesBefore} face boxes across ${g.length} copies → ${plan.facesAfter} on the kept photo`,
      plan.faceMoves.length?`${plan.faceMoves.length} face box${plan.faceMoves.length===1?'':'es'} move across`:'',
      plan.faceDrops.length?`${plan.faceDrops.length} overlapping copy box${plan.faceDrops.length===1?'':'es'} removed (${plan.faceDrops.map(d=>esc(d.name||'unnamed')).join(', ')})`:'',
      plan.faceUpdates.length?`${plan.faceUpdates.length} box${plan.faceUpdates.length===1?'':'es'} on the kept photo gain a name or detail from a copy`:'',
      plan.commentMoves.length?`${plan.commentMoves.length} comment${plan.commentMoves.length===1?'':'s'} move across`:'',
      plan.suggestionMoves.length?`${plan.suggestionMoves.length} suggestion${plan.suggestionMoves.length===1?'':'s'} move across`:'',
      Object.keys(plan.photoPatch).filter(k=>!['content_hash','phash'].includes(k)).length?`Fills in ${Object.keys(plan.photoPatch).filter(k=>!['content_hash','phash'].includes(k)).join(', ').replace('taken_date','date')} from a copy`:'',
      `Deletes ${plan.duplicateIds.length} duplicate photo row${plan.duplicateIds.length===1?'':'s'}`,
    ].filter(Boolean);
    const warn=[
      ...plan.conflicts.map(c=>`Two different names on the same face: ${esc(c.names[0])} vs ${esc(c.names[1])}. Both boxes are kept; fix by hand afterwards.`),
      ...plan.namesLost.map(n=>`Would lose the name ${esc(n)}`),
    ];
    body+=`<section class="dedupe-group card"><label class="dedupe-include"><input type="checkbox" data-dedupe-include="${key}" ${ui.include.has(key)?'checked':''}> Merge this group</label>${spread?'<p class="small dedupe-spread">Names are split across these copies; merging puts them all on one photo.</p>':''}<div class="dedupe-copies">${cards.join('')}</div><ul class="small dedupe-plan">${lines.map(l=>`<li>${l}</li>`).join('')}</ul>${warn.length?`<ul class="small dedupe-warn">${warn.map(w=>`<li>${w}</li>`).join('')}</ul>`:''}<p class="small">Names after merge: ${plan.namesAfter.length?esc(plan.namesAfter.join(', ')):'none'}</p></section>`;
  }
  const n=[...ui.include].filter(k=>ui.groups.some(g=>g[0].id===k)).length;
  const unsaved=unsavedPrints().length;
  o.innerHTML=`<div class="dedupe-panel"><div class="dedupe-head"><h2>Duplicate photos</h2><button data-dedupe-close>Close</button></div>
    <p class="small">${ui.groups.length?`Found ${ui.groups.length} group${ui.groups.length===1?'':'s'} of copies. Nothing has been changed yet. Check each group, pick which copy to keep, then merge.`:'No duplicate photos found.'}${unread?` ${unread} photo${unread===1?'':'s'} couldn't be read and were skipped.`:''} Exact copies and resized copies are found; rotated or cropped copies are not.</p>
    ${body}
    <div class="dedupe-actions">${unsaved?`<button data-dedupe-save-prints title="Only adds fingerprint columns; changes no photos, faces or names">Save fingerprints for ${unsaved} photo${unsaved===1?'':'s'}</button>`:''}${ui.groups.length?`<button class="primary" data-dedupe-apply ${n?'':'disabled'}>Merge ${n} group${n===1?'':'s'}</button>`:''}</div>
    <p class="small">Saving fingerprints lets the upload check spot resized copies of older photos too.</p>
    <p class="small" id="dedupeLog"></p></div>`;
}
const unsavedPrints=()=>ui?[...ui.prints].filter(([id,pr])=>{const p=S.photos.find(x=>x.id===id); return p&&pr.content_hash&&(p.content_hash!==pr.content_hash||(pr.phash&&p.phash!==pr.phash))}):[];
// Fingerprints only (content_hash/phash columns). Returns false if the columns don't exist yet.
async function savePrints(){
  for(const [id,pr] of unsavedPrints()){
    const r=await S.sb.from('photos').update({content_hash:pr.content_hash,phash:pr.phash}).eq('id',id);
    if(r.error)return false;
    const p=S.photos.find(x=>x.id===id); if(p)Object.assign(p,{content_hash:pr.content_hash,phash:pr.phash});
  }
  return true;
}
async function applySelected(btn){
  const groups=ui.groups.filter(g=>ui.include.has(g[0].id));
  const plans=groups.map(g=>planMerge(g,ui.survivors.get(g[0].id),dataNow()));
  if(plans.some(p=>p.namesLost.length))return alert('A group would lose a name. Untick it or pick a different copy to keep.');
  const del=plans.reduce((a,p)=>a+p.duplicateIds.length,0), mv=plans.reduce((a,p)=>a+p.faceMoves.length,0);
  if(!confirm(`Merge ${plans.length} group${plans.length===1?'':'s'}? This moves ${mv} face box${mv===1?'':'es'} onto the kept photos and then deletes ${del} duplicate photo${del===1?'':'s'}. The kept photos and their names are not touched except to add what the copies had. This can't be undone.`))return;
  btn.disabled=true; const log=$('dedupeLog'); let ok=0; const errors=[];
  await savePrints();
  for(const plan of plans){
    try{await applyMerge(S.sb,plan,m=>{if(log)log.textContent=m}); ok++}
    catch(e){console.error(e); errors.push(e.message)}
  }
  status(`Merged ${ok} of ${plans.length} duplicate group${plans.length===1?'':'s'}`);
  alert(`Merged ${ok} of ${plans.length} group${plans.length===1?'':'s'}.${errors.length?'\n\nStopped on:\n'+errors.join('\n'):''}`);
  const {loadAll}=await import('./api.js'); await loadAll();
  closeDedupe();
}
export function bindDedupe(){
  document.body.addEventListener('click',e=>{
    if(e.target.closest('[data-dedupe-close]'))return closeDedupe();
    if(e.target.id==='findDuplicatesBtn')return openDedupe();
    const a=e.target.closest('[data-dedupe-apply]'); if(a&&ui)return applySelected(a);
    const sp=e.target.closest('[data-dedupe-save-prints]'); if(sp&&ui){sp.disabled=true; savePrints().then(ok=>{if(!ok)alert('Fingerprints need the database update in sql/2026-11-04-photo-dedupe-and-face-lock.sql first.'); else status('Fingerprints saved'); renderDedupe()})}
  });
  document.body.addEventListener('change',e=>{
    if(!ui)return;
    const s=e.target.closest('[data-dedupe-survivor]'); if(s){ui.survivors.set(s.dataset.dedupeSurvivor,s.value); renderDedupe(); return}
    const i=e.target.closest('[data-dedupe-include]'); if(i){i.checked?ui.include.add(i.dataset.dedupeInclude):ui.include.delete(i.dataset.dedupeInclude); renderDedupe()}
  });
}
