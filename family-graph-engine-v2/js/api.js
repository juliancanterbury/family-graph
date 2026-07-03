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
  const u=S.session.user, email=u.email||''; const found=await S.sb.from('profiles').select('*').eq('user_id',u.id).maybeSingle();
  if(found.data) S.profile=found.data; else {const role=email.toLowerCase()==='julian.canterbury@gmail.com'?'owner':'contributor'; const ins=await S.sb.from('profiles').insert({user_id:u.id,email,display_name:email.split('@')[0],role}).select().single(); S.profile=ins.data||{email,role}}
  text('currentUser',email); text('currentRole',S.profile?.role||'contributor'); text('status',`Signed in as ${email} · ${S.profile?.role||'contributor'}`);
}
async function optionalTable(name){try{const r=await S.sb.from(name).select('*').order('created_at',{ascending:false}); if(r.error)throw r.error; return r.data||[]}catch(e){try{return JSON.parse(localStorage.getItem('familyGraph:'+name)||'[]')}catch{return[]}}}
export async function addOptional(name,row){row.id=row.id||uid(); row.created_at=row.created_at||new Date().toISOString(); try{const r=await S.sb.from(name).insert(row).select().single(); if(!r.error)return r.data}catch{} const key='familyGraph:'+name; const data=JSON.parse(localStorage.getItem(key)||'[]'); data.unshift(row); localStorage.setItem(key,JSON.stringify(data)); return row}
export async function updateOptional(name,id,patch){try{const r=await S.sb.from(name).update(patch).eq('id',id).select().single(); if(!r.error)return r.data}catch{} return {...patch,id}}
export async function loadAll(){
  status('Loading…'); const [p,ph,f,r]=await Promise.all([S.sb.from('people').select('*').order('created_at'),S.sb.from('photos').select('*').order('created_at',{ascending:false}),S.sb.from('faces').select('*').order('created_at'),S.sb.from('relationships').select('*').order('created_at')]);
  const err=p.error||ph.error||f.error||r.error; if(err) throw new Error('Database read failed: '+err.message);
  S.people=p.data||[]; S.photos=ph.data||[]; S.faces=f.data||[]; S.relationships=r.data||[]; [S.suggestions,S.comments,S.feedback]=await Promise.all([optionalTable('suggestions'),optionalTable('comments'),optionalTable('feedback')]);
  S.currentPhoto=S.photos.find(x=>x.id===S.currentPhoto?.id)||S.photos[0]||null; await renderAll(); status('Loaded');
}
export async function publicUrl(photo){if(!photo)return''; return S.sb.storage.from(bucket()).getPublicUrl(photo.storage_path).data.publicUrl}
