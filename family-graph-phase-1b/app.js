let sb=null, session=null, currentProfile=null;
let people=[], photos=[], faces=[], relationships=[];
let currentPhoto=null, selectedFaceId=null, currentRel="mother", graphScale=1;
let showFaceBoxes=true, showFaceNames=true, currentTheme=localStorage.getItem("familyGraphTheme")||"ocean";

const REDIRECT_URL = "https://juliancanterbury.github.io/family-graph/";

function el(id){return document.getElementById(id)}
function show(id){el(id)?.classList.remove("hidden")}
function hide(id){el(id)?.classList.add("hidden")}
function safeText(id,v){const x=el(id); if(x) x.textContent=v}
function safeHTML(id,v){const x=el(id); if(x) x.innerHTML=v}
function setStatus(t){safeText("saveStatus",t)}
function uid(){return crypto.randomUUID()}
function fullName(p){return p?.display_name || [p?.given_names,p?.family_name].filter(Boolean).join(" ") || "Unknown"}
function person(id){return people.find(p=>p.id===id)}
function initials(p){return fullName(p).split(" ").filter(Boolean).map(x=>x[0]).join("").slice(0,2).toUpperCase() || "?"}
function escapeHtml(v){return String(v||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]))}
function titleCaseName(v){return String(v||"").trim().replace(/\s+/g," ").split(" ").map(part=>part.split("-").map(piece=>piece?piece[0].toUpperCase()+piece.slice(1).toLowerCase():piece).join("-")).join(" ")}
function isRealPerson(p){const n=fullName(p).trim().toLowerCase();return !!p && n && !["unknown","unknown person","unnamed","unnamed person"].includes(n)}
function visiblePeople(){return people.filter(isRealPerson)}
function applyTheme(name){currentTheme=name||"ocean";document.body.dataset.theme=currentTheme;localStorage.setItem("familyGraphTheme",currentTheme);document.querySelectorAll(".theme-chip").forEach(b=>b.classList.toggle("active",b.dataset.theme===currentTheme))}

async function boot(){
  try{
    applyTheme(currentTheme);
    hide("login"); hide("app"); hide("problem"); show("loading");
    if(typeof SUPABASE_URL==="undefined" || typeof SUPABASE_ANON_KEY==="undefined" || SUPABASE_URL.includes("PASTE_")){
      return problem("config.js is missing or still contains placeholder values.");
    }
    sb=supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    const res=await sb.auth.getSession();
    session=res.data.session;
    sb.auth.onAuthStateChange((_event,s)=>{session=s;route()});
    await route();
  }catch(e){console.error(e);problem(e.message)}
}

function problem(msg){hide("loading");hide("login");hide("app");show("problem");safeText("problemText",msg)}

async function route(){
  if(!session){hide("loading");hide("app");hide("problem");show("login");return}
  hide("loading");hide("login");hide("problem");show("app");
  await ensureProfile();
  await loadAll();
  showPage("dashboard");
}

async function sendLogin(){
  const email=el("emailInput")?.value.trim();
  if(!email)return alert("Enter email address.");
  const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:REDIRECT_URL}});
  safeText("loginMessage",error?error.message:"Check your email for the sign-in link.");
}

async function signOut(){await sb.auth.signOut()}

async function ensureProfile(){
  const user=session.user, email=user.email||"";
  const found=await sb.from("profiles").select("*").eq("user_id",user.id).maybeSingle();
  if(found.data){currentProfile=found.data}
  else{
    const role=email.toLowerCase()==="julian.canterbury@gmail.com"?"owner":"contributor";
    const ins=await sb.from("profiles").insert({user_id:user.id,email,display_name:email.split("@")[0],role}).select().single();
    currentProfile=ins.data||{email,role};
  }
  safeText("currentUser",email);
  safeText("currentRole",currentProfile?.role||"contributor");
  safeText("status",`Signed in as ${email} · ${currentProfile?.role||"contributor"}`);
}

async function loadAll(){
  setStatus("Loading…");
  const [p,ph,f,r]=await Promise.all([
    sb.from("people").select("*").order("created_at"),
    sb.from("photos").select("*").order("created_at",{ascending:false}),
    sb.from("faces").select("*").order("created_at"),
    sb.from("relationships").select("*").order("created_at")
  ]);
  const err=p.error||ph.error||f.error||r.error;
  if(err)return problem("Database read failed: "+err.message);
  people=p.data||[]; photos=ph.data||[]; faces=f.data||[]; relationships=r.data||[];
  currentPhoto=currentPhoto||photos[0]||null;
  updateDashboard();
  await renderCurrentPhoto(); updateSide(); await renderPeople(); renderRelationshipList();
  setStatus("Loaded");
}

async function refreshData(){await loadAll()}

function updateDashboard(){
  safeText("peopleTotal",people.length); safeText("photosTotal",photos.length); safeText("facesTotal",faces.length); safeText("relationshipsTotal",relationships.length);
}

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  el(page+"Page")?.classList.remove("hidden");
  if(page==="photo"){renderCurrentPhoto();updateSide()}
  if(page==="people"){renderPeople()}
  if(page==="relationships"){renderRelationshipList()}
  if(page==="graph"){renderGraph();setTimeout(fitGraph,0)}
}

async function uploadPhoto(ev){
  const file=ev.target.files?.[0]; if(!file)return;
  setStatus("Uploading photo…");
  const id=uid(), ext=(file.name.split(".").pop()||"jpg").toLowerCase(), path=`photos/${id}/original.${ext}`;
  const bucket=typeof FAMILY_MEDIA_BUCKET!=="undefined"?FAMILY_MEDIA_BUCKET:"family-media";
  const up=await sb.storage.from(bucket).upload(path,file,{upsert:false});
  if(up.error){alert(up.error.message);setStatus("Upload failed");return}
  const ins=await sb.from("photos").insert({id,title:file.name,storage_path:path,original_filename:file.name,mime_type:file.type,uploaded_by:session.user.id}).select().single();
  if(ins.error){alert(ins.error.message);return}
  photos.unshift(ins.data); currentPhoto=ins.data; selectedFaceId=null; updateDashboard();
  await renderCurrentPhoto(); updateSide(); setStatus("Photo saved");
}

function selectLatestPhoto(){currentPhoto=photos[0]||null;selectedFaceId=null;renderCurrentPhoto();updateSide()}

async function photoUrl(photo){
  if(!photo)return"";
  const bucket=typeof FAMILY_MEDIA_BUCKET!=="undefined"?FAMILY_MEDIA_BUCKET:"family-media";
  return sb.storage.from(bucket).getPublicUrl(photo.storage_path).data.publicUrl;
}

async function renderCurrentPhoto(){
  const img=el("mainPhoto"), empty=el("emptyPhoto");
  if(img)img.src=currentPhoto?await photoUrl(currentPhoto):"";
  if(empty)empty.style.display=currentPhoto?"none":"grid";
  const c=el("photoCanvas"); if(!c)return;
  c.querySelectorAll(".face").forEach(e=>e.remove());
  if(!currentPhoto)return;
  faces.filter(f=>f.photo_id===currentPhoto.id).forEach(f=>c.appendChild(faceElement(f)));
  c.classList.toggle("hide-boxes",!showFaceBoxes);
  c.classList.toggle("hide-names",!showFaceNames);
}

function faceElement(f){
  const d=document.createElement("div");
  d.className="face"+(f.person_id?" named":"")+(f.id===selectedFaceId?" selected":"");
  d.style.left=Number(f.x)+"px";d.style.top=Number(f.y)+"px";d.style.width=Number(f.w)+"px";d.style.height=Number(f.h)+"px";
  d.innerHTML=`<span>${escapeHtml(f.label||"")}</span><div class="handle"></div>`;
  d.addEventListener("pointerdown",ev=>startDrag(ev,f.id));
  d.querySelector(".handle").addEventListener("pointerdown",ev=>startResize(ev,f.id));
  d.addEventListener("click",ev=>{ev.stopPropagation();selectedFaceId=f.id;renderCurrentPhoto();renderFaceEditor()});
  return d;
}

async function addFaceBox(){
  if(!currentPhoto)return alert("Upload a photo first.");
  const ins=await sb.from("faces").insert({photo_id:currentPhoto.id,x:200,y:160,w:70,h:90,label:null,created_by:session.user.id}).select().single();
  if(ins.error){alert(ins.error.message);return}
  faces.push(ins.data);selectedFaceId=ins.data.id;updateDashboard();
  await renderCurrentPhoto();renderFaceEditor();updateSide();setStatus("Face saved");
}

let dragState=null;
function startDrag(ev,id){
  if(ev.target.classList.contains("handle"))return;
  ev.preventDefault();ev.stopPropagation();selectedFaceId=id;
  const f=faces.find(x=>x.id===id); if(!f)return;
  dragState={mode:"drag",id,startX:ev.clientX,startY:ev.clientY,x:Number(f.x),y:Number(f.y)};
  ev.currentTarget.setPointerCapture(ev.pointerId);
  window.addEventListener("pointermove",onPointerMove);window.addEventListener("pointerup",endPointer);
  renderCurrentPhoto();renderFaceEditor();
}
function startResize(ev,id){
  ev.preventDefault();ev.stopPropagation();selectedFaceId=id;
  const f=faces.find(x=>x.id===id); if(!f)return;
  dragState={mode:"resize",id,startX:ev.clientX,startY:ev.clientY,w:Number(f.w),h:Number(f.h)};
  ev.currentTarget.parentElement.setPointerCapture(ev.pointerId);
  window.addEventListener("pointermove",onPointerMove);window.addEventListener("pointerup",endPointer);
}
function onPointerMove(ev){
  if(!dragState)return; const f=faces.find(x=>x.id===dragState.id); if(!f)return;
  if(dragState.mode==="drag"){f.x=Math.max(0,dragState.x+ev.clientX-dragState.startX);f.y=Math.max(0,dragState.y+ev.clientY-dragState.startY)}
  else{f.w=Math.max(30,dragState.w+ev.clientX-dragState.startX);f.h=Math.max(30,dragState.h+ev.clientY-dragState.startY)}
  const box=document.querySelector(".face.selected"); if(box){box.style.left=f.x+"px";box.style.top=f.y+"px";box.style.width=f.w+"px";box.style.height=f.h+"px"}
}
async function endPointer(){
  if(dragState){const f=faces.find(x=>x.id===dragState.id); if(f)await sb.from("faces").update({x:f.x,y:f.y,w:f.w,h:f.h}).eq("id",f.id)}
  dragState=null;window.removeEventListener("pointermove",onPointerMove);window.removeEventListener("pointerup",endPointer);
}

async function deleteSelectedFace(){
  if(!selectedFaceId)return;
  const del=await sb.from("faces").delete().eq("id",selectedFaceId);
  if(del.error){alert(del.error.message);return}
  faces=faces.filter(f=>f.id!==selectedFaceId);selectedFaceId=null;updateDashboard();
  await renderCurrentPhoto();renderFaceEditor();updateSide();
}

function renderFaceEditor(){
  const w=el("faceEditor");if(!w)return;
  const f=faces.find(x=>x.id===selectedFaceId);
  if(!f){w.innerHTML="<p>Select or add a face box.</p>";return}
  const p=f.person_id?person(f.person_id):null;
  w.innerHTML=`<div class="row"><label>Name</label><input id="faceName" value="${escapeHtml(p?fullName(p):(f.label||""))}" placeholder="Unnamed person" oninput="this.value=titleCaseName(this.value)"></div><button class="primary" onclick="saveFaceName()">Save name</button>`;
}

async function saveFaceName(){
  const f=faces.find(x=>x.id===selectedFaceId), raw=el("faceName")?.value.trim();
  const name=titleCaseName(raw);
  if(!f||!name)return;
  if(["unknown","unknown person","unnamed","unnamed person"].includes(name.toLowerCase()))return alert("Please enter a real name, or leave it blank until known.");
  let p=people.find(p=>fullName(p).toLowerCase()===name.toLowerCase());
  if(!p){
    const parts=name.split(" ");
    const ins=await sb.from("people").insert({display_name:name,given_names:parts[0]||name,family_name:parts.slice(1).join(" ")||null,created_by:session.user.id}).select().single();
    if(ins.error){alert(ins.error.message);return}
    p=ins.data;people.push(p);
  }
  const upd=await sb.from("faces").update({person_id:p.id,label:fullName(p),status:"confirmed"}).eq("id",f.id).select().single();
  if(upd.error){alert(upd.error.message);return}
  Object.assign(f,upd.data);updateDashboard();
  await renderCurrentPhoto();renderFaceEditor();updateSide();await renderPeople();
}

function setRel(type,btn){currentRel=type;document.querySelectorAll(".relationship-buttons button").forEach(b=>b.classList.remove("active"));btn?.classList.add("active");previewRelationship()}
function relationshipCandidate(){
  const a=el("relA")?.value,b=el("relB")?.value;let type=currentRel,from=a,to=b,label=type;
  if(["mother","father","parent"].includes(type)){type="parent";label=currentRel}else if(type==="child"){type="parent";from=b;to=a;label="parent"}else if(type==="partner")label="partner";else if(type==="sibling")label="sibling";
  return{from,to,type,label}
}
function parentsOf(id){return relationships.filter(r=>r.relationship_type==="parent"&&r.to_person_id===id).map(r=>r.from_person_id)}
function isAncestor(a,d,seen=new Set()){if(seen.has(d))return false;seen.add(d);const ps=parentsOf(d);if(ps.includes(a))return true;return ps.some(p=>isAncestor(a,p,seen))}
function validationFor(c){
  const fatal=[];if(!c.from||!c.to)fatal.push("Choose two people.");if(c.from===c.to)fatal.push("A person cannot be related to themselves.");
  const dup=relationships.some(r=>r.from_person_id===c.from&&r.to_person_id===c.to&&r.relationship_type===c.type);
  const rev=relationships.some(r=>["partner","sibling"].includes(c.type)&&r.relationship_type===c.type&&r.from_person_id===c.to&&r.to_person_id===c.from);
  if(dup||rev)fatal.push("This relationship already exists.");if(c.type==="parent"&&isAncestor(c.to,c.from))fatal.push("This would create an ancestor loop.");
  return{fatal,issues:[]}
}
function previewRelationship(){
  const box=el("relationshipWarning");if(!box)return;const v=validationFor(relationshipCandidate());
  if(!v.fatal.length&&!v.issues.length){box.classList.add("hidden");return}
  box.classList.remove("hidden");box.classList.toggle("bad",v.fatal.length>0);box.innerHTML=[...v.fatal,...v.issues].join("<br>");
}
async function saveRelationship(){
  const c=relationshipCandidate(),v=validationFor(c);if(v.fatal.length){previewRelationship();return}
  const ins=await sb.from("relationships").insert({from_person_id:c.from,to_person_id:c.to,relationship_type:c.type,label:c.label,source_photo_id:currentPhoto?currentPhoto.id:null,created_by:session.user.id}).select().single();
  if(ins.error){alert(ins.error.message);return}
  relationships.push(ins.data);updateDashboard();updateSide();renderRelationshipList();
}
async function deleteRelationship(id){
  const del=await sb.from("relationships").delete().eq("id",id);if(del.error){alert(del.error.message);return}
  relationships=relationships.filter(r=>r.id!==id);updateDashboard();renderRelationshipList();updateSide();
}
function relationshipSentence(r){
  const a=person(r.from_person_id),b=person(r.to_person_id);if(!a||!b)return"Missing person";
  if(r.relationship_type==="parent")return`${fullName(a)} is ${r.label||"parent"} of ${fullName(b)}`;
  if(r.relationship_type==="partner")return`${fullName(a)} is partner of ${fullName(b)}`;
  if(r.relationship_type==="sibling")return`${fullName(a)} is sibling of ${fullName(b)}`;
  return`${fullName(a)} → ${fullName(b)}`
}
function renderRelationshipList(){safeHTML("relationshipList",relationships.map(r=>`<div class="rel-row"><div><strong>${relationshipSentence(r)}</strong></div><button class="danger" onclick="deleteRelationship('${r.id}')">Delete</button></div>`).join("")||"<p>No relationships yet.</p>")}
function updateSide(){
  safeText("faceCount",currentPhoto?faces.filter(f=>f.photo_id===currentPhoto.id).length:0);safeText("namedCount",currentPhoto?faces.filter(f=>f.photo_id===currentPhoto.id&&f.person_id).length:0);
  const opts=visiblePeople().map(p=>`<option value="${p.id}">${escapeHtml(fullName(p))}</option>`).join("");safeHTML("relA",opts);safeHTML("relB",opts);renderFaceEditor();renderRelationshipList();previewRelationship();
}
async function addUnknownPerson(){
  const raw=prompt("Full name");
  const name=titleCaseName(raw);
  if(!name)return;
  const parts=name.split(" ");
  const ins=await sb.from("people").insert({display_name:name,given_names:parts[0]||name,family_name:parts.slice(1).join(" ")||null,created_by:session.user.id}).select().single();
  if(ins.error){alert(ins.error.message);return}
  people.push(ins.data);updateDashboard();await renderPeople();updateSide();
}
async function deletePerson(id){
  const p=person(id);if(!p)return;
  if(!confirm(`Delete ${fullName(p)}? Face boxes will remain but become unnamed.`))return;
  await sb.from("relationships").delete().or(`from_person_id.eq.${id},to_person_id.eq.${id}`);
  await sb.from("faces").update({person_id:null,label:null,status:"unconfirmed"}).eq("person_id",id);
  const del=await sb.from("people").delete().eq("id",id);
  if(del.error){alert(del.error.message);return}
  people=people.filter(x=>x.id!==id);relationships=relationships.filter(r=>r.from_person_id!==id&&r.to_person_id!==id);faces.forEach(f=>{if(f.person_id===id){f.person_id=null;f.label=null;f.status="unconfirmed"}});
  updateDashboard();await renderCurrentPhoto();await renderPeople();updateSide();renderRelationshipList();
}
function toggleFaceBoxes(){showFaceBoxes=!showFaceBoxes;renderCurrentPhoto();safeText("boxToggleText",showFaceBoxes?"Hide boxes":"Show boxes")}
function toggleFaceNames(){showFaceNames=!showFaceNames;renderCurrentPhoto();safeText("nameToggleText",showFaceNames?"Hide names":"Show names")}
async function renderPeople(){
  const list=el("peopleList");if(!list)return;let html="";
  for(const p of people){
    html+=`<div class="people-card ${isRealPerson(p)?"":"ghost-person"}">${await photoHtml(p)}<strong>${escapeHtml(fullName(p))}</strong><p>${p.birth_date||"No dates yet"}${p.death_date?" – "+p.death_date:""}</p><button class="danger small-btn" onclick="deletePerson('${p.id}')">Delete</button></div>`
  }
  list.innerHTML=html||"<p>No people yet.</p>"
}

function faceForPerson(id){return faces.find(f=>f.person_id===id)}
async function cropStyle(f,size=92){
  if(!f)return"";const ph=photos.find(p=>p.id===f.photo_id);if(!ph)return"";const url=await photoUrl(ph);
  const scale=size/Math.max(Number(f.w),Number(f.h)),x=-(Number(f.x)*scale)+(size-Number(f.w)*scale)/2,y=-(Number(f.y)*scale)+(size-Number(f.h)*scale)/2;
  return`background-image:url('${url}');background-size:${1200*scale}px auto;background-position:${x}px ${y}px;background-repeat:no-repeat;`
}
async function photoHtml(p){const f=faceForPerson(p.id);if(f)return`<div class="node-photo" style="${await cropStyle(f)}"></div>`;return`<div class="node-photo">${initials(p)}</div>`}

function partnerPairs(){
  const out=[];const seen=new Set();
  relationships.filter(r=>r.relationship_type==="partner").forEach(r=>{
    const a=person(r.from_person_id),b=person(r.to_person_id);
    if(!isRealPerson(a)||!isRealPerson(b))return;
    const key=[a.id,b.id].sort().join("|");if(seen.has(key))return;seen.add(key);out.push([a.id,b.id]);
  });
  return out;
}
function parentsOf(id){return relationships.filter(r=>r.relationship_type==="parent"&&r.to_person_id===id&&isRealPerson(person(r.from_person_id))).map(r=>r.from_person_id)}
function parentGroups(){
  const byChild={};relationships.filter(r=>r.relationship_type==="parent"&&isRealPerson(person(r.from_person_id))&&isRealPerson(person(r.to_person_id))).forEach(r=>(byChild[r.to_person_id]||=[]).push(r.from_person_id));
  const groups={};Object.entries(byChild).forEach(([child,parents])=>{const key=parents.slice().sort().join("|");if(!groups[key])groups[key]={parents:parents.slice().sort(),children:[]};groups[key].children.push(child)});
  return Object.values(groups);
}
function generationDepth(id,seen=new Set()){
  if(seen.has(id))return 0;seen.add(id);const ps=parentsOf(id);if(!ps.length)return 0;return 1+Math.max(...ps.map(p=>generationDepth(p,seen)))
}
function layoutPositions(){
  const real=visiblePeople(), pos={}, nodeW=178, unitGap=46, rowGap=360, startY=130;
  const partner=new Map();partnerPairs().forEach(([a,b])=>{partner.set(a,b);partner.set(b,a)});
  const depth={};real.forEach(p=>depth[p.id]=generationDepth(p.id));
  // Partners should sit on the same generation as the known partner.
  for(let i=0;i<6;i++)partnerPairs().forEach(([a,b])=>{const d=Math.max(depth[a]||0,depth[b]||0);depth[a]=d;depth[b]=d});
  const unitsByRow={};const used=new Set();
  real.forEach(p=>{
    if(used.has(p.id))return;const q=partner.get(p.id);
    let members=[p.id];
    if(q&&!used.has(q)&&(depth[q]||0)===(depth[p.id]||0)){members=[p.id,q].sort((a,b)=>fullName(person(a)).localeCompare(fullName(person(b))));used.add(q)}
    used.add(p.id);const d=depth[p.id]||0;(unitsByRow[d]||=[]).push({members,x:0,width:members.length*nodeW+(members.length-1)*unitGap});
  });
  Object.values(unitsByRow).forEach(units=>units.sort((u,v)=>fullName(person(u.members[0])).localeCompare(fullName(person(v.members[0])))));
  Object.entries(unitsByRow).forEach(([d,units])=>{let x=420;units.forEach(u=>{u.x=x;x+=u.width+110});});
  const findUnit=id=>Object.values(unitsByRow).flat().find(u=>u.members.includes(id));
  const unitCenter=u=>u.x+u.width/2;
  const setUnitX=(u,x)=>{u.x=x};
  parentGroups().sort((a,b)=>Math.max(...a.parents.map(id=>depth[id]||0))-Math.max(...b.parents.map(id=>depth[id]||0))).forEach(g=>{
    const parentUnits=[...new Set(g.parents.map(findUnit).filter(Boolean))];
    const childUnits=[...new Set(g.children.map(findUnit).filter(Boolean))];
    if(!parentUnits.length||!childUnits.length)return;
    const pc=parentUnits.reduce((s,u)=>s+unitCenter(u),0)/parentUnits.length;
    const total=childUnits.reduce((s,u)=>s+u.width,0)+(childUnits.length-1)*70;
    let x=pc-total/2;childUnits.forEach(u=>{setUnitX(u,x);x+=u.width+70});
  });
  Object.entries(unitsByRow).forEach(([d,units])=>{
    units.sort((a,b)=>a.x-b.x);let min=120;
    units.forEach(u=>{if(u.x<min)u.x=min;min=u.x+u.width+70});
    const y=startY+Number(d)*rowGap;
    units.forEach(u=>u.members.forEach((id,i)=>{pos[id]={x:u.x+i*(nodeW+unitGap),y,unit:u}}));
  });
  return pos;
}
async function renderGraph(){
  const graph=el("graph");if(!graph)return;graph.innerHTML='<div class="graph-inner" id="graphInner"></div>';const inner=el("graphInner"),pos=layoutPositions(), nodeW=178, nodeH=156;
  // Partner lines only connect cards on the same level.
  partnerPairs().forEach(([a,b])=>{if(!pos[a]||!pos[b])return;const left=pos[a].x<pos[b].x?a:b,right=left===a?b:a;const y=pos[left].y+74;drawH(inner,pos[left].x+nodeW,y,pos[right].x-(pos[left].x+nodeW));label(inner,(pos[left].x+nodeW+pos[right].x)/2-38,y-27,"Partner")});
  // Parent buses. Sibling relationships are intentionally not drawn; shared parents imply siblings.
  parentGroups().forEach(group=>{const parents=group.parents.filter(id=>pos[id]),children=group.children.filter(id=>pos[id]);if(!parents.length||!children.length)return;const pc=parents.reduce((s,id)=>s+pos[id].x+nodeW/2,0)/parents.length,parentBottom=Math.max(...parents.map(id=>pos[id].y+nodeH)),childTop=Math.min(...children.map(id=>pos[id].y)),busY=(parentBottom+childTop)/2;drawV(inner,pc,parentBottom,busY-parentBottom);const left=Math.min(...children.map(id=>pos[id].x+nodeW/2)),right=Math.max(...children.map(id=>pos[id].x+nodeW/2));drawH(inner,left,busY,right-left);children.forEach(id=>drawV(inner,pos[id].x+nodeW/2,busY,pos[id].y-busY))});
  for(const p of visiblePeople()){const xy=pos[p.id]||{x:100,y:100},n=document.createElement("div");n.className="node";n.style.left=xy.x+"px";n.style.top=xy.y+"px";n.innerHTML=`${await photoHtml(p)}<strong>${escapeHtml(fullName(p))}</strong><span class="small">${p.birth_date||""}${p.death_date?" – "+p.death_date:""}</span>`;inner.appendChild(n)}
  applyGraphZoom()
}
function drawH(g,x,y,w){const e=document.createElement("div");e.className="line h";if(w<0){e.style.left=x+w+"px";e.style.width=-w+"px"}else{e.style.left=x+"px";e.style.width=w+"px"}e.style.top=y+"px";g.appendChild(e)}
function drawV(g,x,y,h){const e=document.createElement("div");e.className="line v";e.style.left=x+"px";e.style.top=y+"px";e.style.height=Math.max(0,h)+"px";g.appendChild(e)}
function label(g,x,y,text){const e=document.createElement("div");e.className="rel-label";e.style.left=x+"px";e.style.top=y+"px";e.textContent=text;g.appendChild(e)}
function applyGraphZoom(){const inner=el("graphInner");if(inner)inner.style.transform=`scale(${graphScale})`;safeText("zoomLabel",Math.round(graphScale*100)+"%")}
function zoomGraph(delta){const wrap=el("graphWrap");if(!wrap)return;const old=graphScale,cx=wrap.scrollLeft+wrap.clientWidth/2,cy=wrap.scrollTop+wrap.clientHeight/2;graphScale=Math.max(.25,Math.min(2.2,graphScale+delta));applyGraphZoom();wrap.scrollLeft=(cx/old)*graphScale-wrap.clientWidth/2;wrap.scrollTop=(cy/old)*graphScale-wrap.clientHeight/2}
function resetGraphZoom(){graphScale=1;applyGraphZoom()}
function fitGraph(){const wrap=el("graphWrap");if(!wrap)return;graphScale=.72;applyGraphZoom();wrap.scrollLeft=120;wrap.scrollTop=80}

Object.assign(window,{sendLogin,signOut,showPage,refreshData,uploadPhoto,selectLatestPhoto,addFaceBox,deleteSelectedFace,saveFaceName,setRel,saveRelationship,deleteRelationship,renderGraph,fitGraph,zoomGraph,resetGraphZoom,addUnknownPerson,deletePerson,toggleFaceBoxes,toggleFaceNames,applyTheme,titleCaseName});
boot();
