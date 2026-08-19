import { S, REDIRECT_URL, $, text, hide, show, status, userId, uid } from './state.js';
import { renderAll } from './render.js';
export const bucket=()=>typeof FAMILY_MEDIA_BUCKET!=='undefined'?FAMILY_MEDIA_BUCKET:'family-media';
export async function initSupabase(){
  if(typeof SUPABASE_URL==='undefined'||typeof SUPABASE_ANON_KEY==='undefined'||SUPABASE_URL.includes('PASTE_')) throw new Error('config.js is missing or still contains placeholder values.');
  S.sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const res=await S.sb.auth.getSession(); S.session=res.data.session;
  S.sb.auth.onAuthStateChange((_e,s)=>{S.session=s; routeAuth()});
}
export async function routeAuth(){ if(!S.session){hide('loading');hide('app');show('login');return} hide('loading');hide('login');show('app'); await ensureProfile(); await loadAll(); }
export async function sendLogin(){const email=$('emailInput')?.value.trim(); if(!email)return alert('Enter email address.'); const {error}=await S.sb.auth.signInWithOtp({email,options:{emailRedirectTo:REDIRECT_URL}}); text('loginMessage',error?error.message:'Check your email for the sign-in link.')}
export async function signOut(){await S.sb.auth.signOut()}
export async function ensureProfile(){
  const u=S.session.user, email=u.email||'';
  let found=await S.sb.from('profiles').select('*').eq('user_id',u.id).maybeSingle();
  if(found.error) found=await S.sb.from('profiles').select('*').eq('user_id',u.id).maybeSingle(); // one retry — a real error isn't "you're a new user"
  if(found.error) throw new Error('Could not load your account (network issue). Please refresh and try again.');
  if(found.data){
    S.profile=found.data;
  } else {
    const first=await S.sb.rpc('is_first_signup');
    const role=(first.data===true)?'owner':'contributor';
    const ins=await S.sb.from('profiles').insert({user_id:u.id,email,display_name:email.split('@')[0],role}).select().single();
    if(ins.error){
      const recheck=await S.sb.from('profiles').select('*').eq('user_id',u.id).maybeSingle();
      if(recheck.data) S.profile=recheck.data; else throw new Error('Could not set up your account. Please refresh and try again.');
    } else {
      S.profile=ins.data;
      // First sign-in: if someone already invited this email to a specific person, link automatically.
      if(!S.profile.person_id){
        const match=await S.sb.from('people').select('id').ilike('invite_email',email).limit(1).maybeSingle();
        if(match.data?.id){
          const link=await S.sb.from('profiles').update({person_id:match.data.id}).eq('user_id',u.id).select().single();
          if(link.data){S.profile=link.data; S.treeFocusId=match.data.id}
        }
      }
    }
  }
  if(S.profile?.person_id && !S.treeFocusId) S.treeFocusId=S.profile.person_id;
  text('currentUser',email); text('currentRole',S.profile?.role||'contributor'); text('status',`Signed in as ${email} · ${S.profile?.role||'contributor'}`);
}
export async function setMyPerson(personId){
  const u=S.session?.user; if(!u)return null;
  const r=await S.sb.from('profiles').update({person_id:personId||null}).eq('user_id',u.id).select().single();
  if(!r.error){S.profile=r.data; S.treeFocusId=personId||null}
  return S.profile;
}
export async function invitePerson(personId,email){
  email=(email||'').trim().toLowerCase(); if(!email)return{error:'Enter an email address.'};
  const r=await S.sb.from('people').update({invite_email:email}).eq('id',personId).select().single();
  if(r.error)return{error:r.error.message};
  const idx=S.people.findIndex(p=>p.id===personId); if(idx>-1)S.people[idx]=r.data;
  return{data:r.data};
}
async function optionalTable(name){try{const r=await S.sb.from(name).select('*').order('created_at',{ascending:false}); if(r.error)throw r.error; return r.data||[]}catch(e){try{return JSON.parse(localStorage.getItem('familyGraph:'+name)||'[]')}catch{return[]}}}
export async function addOptional(name,row){row.id=row.id||uid(); row.created_at=row.created_at||new Date().toISOString(); try{const r=await S.sb.from(name).insert(row).select().single(); if(!r.error)return r.data}catch{} const key='familyGraph:'+name; const data=JSON.parse(localStorage.getItem(key)||'[]'); data.unshift(row); localStorage.setItem(key,JSON.stringify(data)); return row}
export async function updateOptional(name,id,patch){try{const r=await S.sb.from(name).update(patch).eq('id',id).select().single(); if(!r.error)return r.data}catch{} return {...patch,id}}
export async function loadAll(){
  status('Loading…'); const [p,ph,f,r]=await Promise.all([S.sb.from('people').select('*').order('created_at'),S.sb.from('photos').select('*').order('created_at',{ascending:false}),S.sb.from('faces').select('*').order('created_at'),S.sb.from('relationships').select('*').order('created_at')]);
  const err=p.error||ph.error||f.error||r.error; if(err) throw new Error('Database read failed: '+err.message);
  S.people=p.data||[]; S.photos=ph.data||[]; S.faces=f.data||[]; S.relationships=r.data||[]; [S.suggestions,S.comments,S.feedback,S.profiles]=await Promise.all([optionalTable('suggestions'),optionalTable('comments'),optionalTable('feedback'),optionalTable('profiles')]);
  S.currentPhoto=S.photos.find(x=>x.id===S.currentPhoto?.id)||S.photos[0]||null; await renderAll(); status('Loaded');
}
export async function publicUrl(photo){if(!photo)return''; const base=S.sb.storage.from(bucket()).getPublicUrl(photo.storage_path).data.publicUrl; return photo.updated_at?`${base}?v=${encodeURIComponent(photo.updated_at)}`:base}
