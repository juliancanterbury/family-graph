import { S, fullName, person, canDelete } from './state.js';
export function relationshipSentence(r){const a=person(r.from_person_id),b=person(r.to_person_id); if(!a||!b)return'Missing person'; if(r.relationship_type==='parent')return`${fullName(a)} is parent of ${fullName(b)}`; if(r.relationship_type==='partner')return`${fullName(a)} is partner of ${fullName(b)}`; if(r.relationship_type==='sibling')return`${fullName(a)} is sibling of ${fullName(b)}`; return`${fullName(a)} → ${fullName(b)}`}
function parentsOf(id){return S.relationships.filter(r=>r.relationship_type==='parent'&&r.to_person_id===id).map(r=>r.from_person_id)}
function ancestor(a,d,seen=new Set()){if(seen.has(d))return false; seen.add(d); const ps=parentsOf(d); return ps.includes(a)||ps.some(p=>ancestor(a,p,seen))}
export function validateRelationship(from,to,type){const bad=[]; if(!from||!to)bad.push('Choose two people.'); if(from===to)bad.push('A person cannot be related to themselves.'); if(S.relationships.some(r=>r.from_person_id===from&&r.to_person_id===to&&r.relationship_type===type))bad.push('This relationship already exists.'); if(type==='parent'&&ancestor(to,from))bad.push('This would create an ancestor loop.'); return bad}
export async function createRelationship(from,to,type,label){
  const bad=validateRelationship(from,to,type); if(bad.length)return{error:bad.join(' ')};
  const ins=await S.sb.from('relationships').insert({from_person_id:from,to_person_id:to,relationship_type:type,label:label||type,source_photo_id:S.currentPhoto?.id||null,created_by:S.session?.user?.id}).select().single();
  if(ins.error)return{error:ins.error.message};
  S.relationships.push(ins.data); return{data:ins.data};
}
export async function deleteRelationship(id){if(!canDelete())return alert('Only owner can delete relationships.'); const del=await S.sb.from('relationships').delete().eq('id',id); if(del.error)return alert(del.error.message); S.relationships=S.relationships.filter(r=>r.id!==id)}
