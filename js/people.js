import { S, $, esc, fullName, titleCaseName, userId, canDelete, visiblePeople, findSimilarPerson } from './state.js';
import { avatarHtml } from './render.js';
import { renderAll } from './render.js';
import { setMyPerson } from './api.js';
export async function renderPeople(){
  const list=$('peopleList'); if(!list)return;
  const sortBy=localStorage.getItem('familyGraphPeopleSort')||'given_names';
  const sorted=[...visiblePeople()].sort((a,b)=>(a[sortBy]||fullName(a)).localeCompare(b[sortBy]||fullName(b)));
  const btn=$('peopleSortBtn'); if(btn)btn.textContent=sortBy==='given_names'?'Sort: First name':'Sort: Surname';
  let out=''; for(const p of sorted){out+=`<div class="people-card" data-person-id="${p.id}">${await avatarHtml(p)}<strong>${esc(fullName(p))}</strong><p>${esc(p.birth_date||'No dates yet')}${p.death_date?' – '+esc(p.death_date):''}</p><button class="danger small-btn owner-only" data-no-nav data-delete-person="${p.id}">Delete</button></div>`}
  list.innerHTML=out||'<p>No one in view yet — try "Show everyone" if you expected to see someone here.</p>';
}
function togglePeopleSort(){const cur=localStorage.getItem('familyGraphPeopleSort')||'given_names'; localStorage.setItem('familyGraphPeopleSort',cur==='given_names'?'family_name':'given_names'); renderPeople()}
export async function addPerson(){
  const raw=prompt('Full name'); const name=titleCaseName(raw); if(!name)return;
  const match=findSimilarPerson(name);
  if(match?.exact){alert(`${fullName(match.person)} already exists — opening their page instead of creating a duplicate.`); const {showPerson}=await import('./navigation.js'); await showPerson(match.person.id); return}
  if(match&&!confirm(`"${fullName(match.person)}" already exists and looks similar. Create "${name}" as a separate new person anyway?`))return;
  const parts=name.split(' '); const ins=await S.sb.from('people').insert({display_name:name,given_names:parts[0]||name,family_name:parts.slice(1).join(' ')||null,created_by:userId()}).select().single(); if(ins.error)return alert(ins.error.message); S.people.push(ins.data); await renderAll()
}
export async function deletePerson(id){if(!canDelete())return alert('Only owner can delete people.'); const p=S.people.find(x=>x.id===id); if(!p||!confirm(`Delete ${fullName(p)}?`))return; await S.sb.from('relationships').delete().or(`from_person_id.eq.${id},to_person_id.eq.${id}`); await S.sb.from('faces').update({person_id:null,label:null,status:'unconfirmed'}).eq('person_id',id); const del=await S.sb.from('people').delete().eq('id',id); if(del.error)return alert(del.error.message); S.people=S.people.filter(x=>x.id!==id); S.relationships=S.relationships.filter(r=>r.from_person_id!==id&&r.to_person_id!==id); S.faces.forEach(f=>{if(f.person_id===id){f.person_id=null;f.label=null}}); await renderAll()}
export function bindPeople(){document.getElementById('addPersonBtn')?.addEventListener('click',addPerson); document.getElementById('peopleSortBtn')?.addEventListener('click',togglePeopleSort); document.body.addEventListener('click',e=>{const b=e.target.closest('[data-delete-person]'); if(b)deletePerson(b.dataset.deletePerson)}); $('whoAreYouBtn')?.addEventListener('click',saveMyPerson)}
async function saveMyPerson(){
  const id=$('whoAreYouSelect')?.value; if(!id)return alert('Pick yourself from the list first.');
  await setMyPerson(id); await renderAll();
}
