let sb=null, session=null, currentProfile=null;
let people=[], photos=[], faces=[], relationships=[], suggestions=[], comments=[], feedback=[];
let currentPhoto=null, selectedFaceId=null, currentRel="mother", graphScale=1;
let showFaceBoxes=true, showFaceNames=true, currentTheme=localStorage.getItem("familyGraphTheme")||"ocean";
let currentDbTab="people", selectedDbId=null, editMode=false;
let humanDetector=null, humanReadyPromise=null;

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

function role(){return (currentProfile?.role||"viewer").toLowerCase()}
function isOwner(){return role()==="owner"}
function canEdit(){return ["owner","editor","family editor","contributor"].includes(role())}
function canDelete(){return isOwner()}
function userName(){return currentProfile?.display_name||session?.user?.email||"Someone"}
function currentUserId(){return session?.user?.id||"local"}
function setModeClasses(){document.body.classList.toggle("can-edit",canEdit());document.body.classList.toggle("can-delete",canDelete());document.body.classList.toggle("edit-mode",editMode);}
function localKey(name){return "familyGraph:"+name}
function loadLocal(name){try{return JSON.parse(localStorage.getItem(localKey(name))||"[]")}catch(e){return []}}
function saveLocal(name,data){localStorage.setItem(localKey(name),JSON.stringify(data))}
async function optionalTable(name){try{const r=await sb.from(name).select("*").order("created_at",{ascending:false});if(r.error)throw r.error;return r.data||[]}catch(e){return loadLocal(name)}}
async function addOptional(name,row){row.id=row.id||uid();row.created_at=row.created_at||new Date().toISOString();try{const r=await sb.from(name).insert(row).select().single();if(!r.error)return r.data}catch(e){}const data=loadLocal(name);data.unshift(row);saveLocal(name,data);return row}
async function updateOptional(name,id,patch){try{const r=await sb.from(name).update(patch).eq("id",id).select().single();if(!r.error)return r.data}catch(e){}const data=loadLocal(name).map(x=>x.id===id?Object.assign({},x,patch):x);saveLocal(name,data);return data.find(x=>x.id===id)}

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
  const start=(location.hash||"#dashboard").replace("#","") || "dashboard";
  showPage(start);
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
  setModeClasses();
  setEditMode(editMode);
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
  [suggestions,comments,feedback]=await Promise.all([optionalTable("suggestions"),optionalTable("comments"),optionalTable("feedback")]);
  currentPhoto=currentPhoto||photos[0]||null;
  updateDashboard();
  await renderCurrentPhoto(); updateSide(); await renderPeople(); await renderPhotoList(); renderRelationshipList();
  setStatus("Loaded");
}

async function refreshData(){await loadAll()}

function updateDashboard(){
  safeText("peopleTotal",people.length); safeText("photosTotal",photos.length); safeText("facesTotal",faces.length); safeText("relationshipsTotal",relationships.length);
}

function showPage(page){
  page = page || "dashboard";
  if(!el(page+"Page")) page = "dashboard";
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  el(page+"Page")?.classList.remove("hidden");
  document.querySelectorAll("nav button[data-page]").forEach(b=>b.classList.toggle("primary", b.dataset.page===page));
  if(location.hash !== "#"+page) history.replaceState(null,"","#"+page);
  if(page!=="photo"){ selectedFaceId=null; renderFaceEditor?.(); }
  if(page==="photo"){renderCurrentPhoto();updateSide();renderPhotoList()}
  if(page==="people"){renderPeople()}
  if(page==="relationships"){renderRelationshipList()}
  if(page==="admin"){renderDatabase()}
  if(page==="review"){renderReview()}
  if(page==="graph"){renderGraph();setTimeout(fitGraph,0)}
}
function setEditMode(on){
  editMode = !!on;
  setModeClasses();
  document.getElementById("viewModeBtn")?.classList.toggle("primary", !editMode);
  document.getElementById("editModeBtn")?.classList.toggle("primary", editMode);
}
window.addEventListener("hashchange",()=>{
  const page=(location.hash||"#dashboard").replace("#","") || "dashboard";
  if(el(page+"Page")) showPage(page);
});

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
  await renderCurrentPhoto(); updateSide(); await renderPhotoList(); setStatus("Photo saved — detecting faces…");
  setTimeout(()=>detectFacesOnPhoto(true),350);
}

function photoIndex(){return photos.findIndex(p=>p.id===currentPhoto?.id)}
async function selectPhotoById(id){
  const ph=photos.find(p=>p.id===id); if(!ph)return;
  currentPhoto=ph; selectedFaceId=null;
  await renderCurrentPhoto(); updateSide(); await renderPhotoList(); setStatus('Photo loaded');
}
async function selectLatestPhoto(){currentPhoto=photos[0]||null;selectedFaceId=null;await renderCurrentPhoto();updateSide();await renderPhotoList();setStatus('Latest photo')}
async function previousPhoto(){
  if(!photos.length)return; let i=photoIndex(); if(i<0)i=0; i=Math.max(0,i-1); await selectPhotoById(photos[i].id);
}
async function nextPhoto(){
  if(!photos.length)return; let i=photoIndex(); if(i<0)i=0; i=Math.min(photos.length-1,i+1); await selectPhotoById(photos[i].id);
}

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


function waitForImage(img){
  return new Promise((resolve,reject)=>{
    if(!img)return reject(new Error('Photo element missing.'));
    if(img.complete && img.naturalWidth) return resolve(img);
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Photo failed to load.'));
  });
}
function rectIoU(a,b){
  const ax2=a.x+a.w, ay2=a.y+a.h, bx2=b.x+b.w, by2=b.y+b.h;
  const ix=Math.max(0,Math.min(ax2,bx2)-Math.max(a.x,b.x));
  const iy=Math.max(0,Math.min(ay2,by2)-Math.max(a.y,b.y));
  const inter=ix*iy, areaA=a.w*a.h, areaB=b.w*b.h;
  return inter/(areaA+areaB-inter || 1);
}
async function ensureHumanDetector(){
  if(humanReadyPromise)return humanReadyPromise;
  humanReadyPromise=(async()=>{
    if(!window.Human)throw new Error('Face detector library did not load. Refresh, or check the browser can access jsDelivr.');
    humanDetector=new Human.Human({
      modelBasePath:'https://cdn.jsdelivr.net/npm/@vladmandic/human/models/',
      backend:'webgl',
      cacheSensitivity:0,
      face:{enabled:true,detector:{enabled:true,rotation:true,maxDetected:100},mesh:{enabled:false},iris:{enabled:false},description:{enabled:false},emotion:{enabled:false}},
      body:{enabled:false},hand:{enabled:false},object:{enabled:false},gesture:{enabled:false},filter:{enabled:false}
    });
    setStatus('Loading face detector…');
    await humanDetector.load();
    await humanDetector.warmup();
    return humanDetector;
  })();
  return humanReadyPromise;
}
async function detectFacesOnPhoto(auto=false){
  try{
    if(!currentPhoto)return alert('Open or upload a photo first.');
    const img=el('mainPhoto');
    await waitForImage(img);
    const detector=await ensureHumanDetector();
    setStatus('Detecting faces…');
    const result=await detector.detect(img);
    const scale=(img.clientWidth||img.naturalWidth)/(img.naturalWidth||img.clientWidth||1);
    const found=(result.face||[]).map(face=>{
      const box=face.box||face.boxRaw||[];
      return {x:Math.round((box[0]||0)*scale),y:Math.round((box[1]||0)*scale),w:Math.round((box[2]||0)*scale),h:Math.round((box[3]||0)*scale)};
    }).filter(r=>r.w>=24&&r.h>=24);
    if(!found.length){setStatus('No faces detected'); if(!auto)alert('No faces detected. Use Add face box for this photo.'); return;}
    const existing=faces.filter(f=>f.photo_id===currentPhoto.id).map(f=>({x:Number(f.x)||0,y:Number(f.y)||0,w:Number(f.w)||0,h:Number(f.h)||0}));
    const fresh=[];
    for(const r of found){
      if(existing.some(e=>rectIoU(e,r)>.35) || fresh.some(e=>rectIoU(e,r)>.35))continue;
      fresh.push(r);
    }
    if(!fresh.length){setStatus(`Detected ${found.length}; all already boxed`);return;}
    const rows=fresh.map(r=>({photo_id:currentPhoto.id,x:r.x,y:r.y,w:r.w,h:r.h,label:null,status:'detected',created_by:session.user.id}));
    const ins=await sb.from('faces').insert(rows).select();
    if(ins.error){alert(ins.error.message);setStatus('Face detection save failed');return;}
    faces.push(...(ins.data||[]));
    updateDashboard();
    await renderCurrentPhoto();
    updateSide();
    setStatus(`Detected ${fresh.length} new face${fresh.length===1?'':'s'}`);
  }catch(e){
    console.error(e);
    setStatus('Face detection unavailable');
    if(!auto)alert('Face detection could not run in this browser. Manual Add face box still works.\n\n'+e.message);
  }
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
  if(!canDelete())return alert("Only the archive owner can delete approved face boxes.");
  if(!selectedFaceId)return;
  const del=await sb.from("faces").delete().eq("id",selectedFaceId);
  if(del.error){alert(del.error.message);return}
  faces=faces.filter(f=>f.id!==selectedFaceId);selectedFaceId=null;updateDashboard();
  await renderCurrentPhoto();renderFaceEditor();updateSide();
}

function renderFaceEditor(){
  const w=el("faceEditor");if(!w)return;
  const f=faces.find(x=>x.id===selectedFaceId);
  if(!f){w.innerHTML="<p>Select or add a face box.</p><button class='full' onclick='suggestFaceForPhoto()'>Suggest a face/name</button>";return}
  const p=f.person_id?person(f.person_id):null;
  if(!canEdit()){
    w.innerHTML=`<p><strong>${escapeHtml(p?fullName(p):(f.label||"Unnamed"))}</strong></p><textarea id="faceSuggestionText" placeholder="Suggest a correction…"></textarea><button class="primary full" onclick="suggestSelectedFaceName()">Send suggestion</button>`;
    return;
  }
  const opts=['<option value="">Choose existing person…</option>'].concat(
    visiblePeople().sort((a,b)=>fullName(a).localeCompare(fullName(b))).map(pp=>`<option value="${pp.id}" ${pp.id===f.person_id?'selected':''}>${escapeHtml(fullName(pp))}</option>`)
  ).join('');
  w.innerHTML=`
    <div class="selected-face-summary">
      <p class="small">Current</p>
      <strong>${escapeHtml(p?fullName(p):(f.label||'Unnamed face'))}</strong>
    </div>
    <div class="form-grid compact-form">
      <label>Use existing person
        <select id="existingPersonSelect">${opts}</select>
      </label>
      <button class="primary full" onclick="attachFaceToExisting()">Use selected person</button>
      <label>Create new person
        <input id="faceName" value="${escapeHtml(p?fullName(p):(f.label||''))}" placeholder="Type a new full name" onblur="this.value=titleCaseName(this.value)">
      </label>
      <button class="full" onclick="saveFaceName()">Create / save typed name</button>
      <button class="full" onclick="suggestSelectedFaceName()">Suggest correction instead</button>
    </div>`;
}

async function attachFaceToExisting(){
  const f=faces.find(x=>x.id===selectedFaceId);
  const pid=el('existingPersonSelect')?.value;
  if(!f||!pid)return alert('Choose an existing person first.');
  const p=person(pid); if(!p)return alert('Person not found.');
  const upd=await sb.from('faces').update({person_id:p.id,label:fullName(p),status:'confirmed'}).eq('id',f.id).select().single();
  if(upd.error){alert(upd.error.message);return}
  Object.assign(f,upd.data);
  updateDashboard();
  await renderCurrentPhoto();renderFaceEditor();updateSide();await renderPeople();await renderPhotoList();
  setStatus('Face linked to existing person');
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
  await renderCurrentPhoto();renderFaceEditor();updateSide();await renderPeople();await renderPhotoList();
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
  if(!canDelete())return alert("Only the archive owner can delete relationships. Others can add a correction in Review.");
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
  renderPhotoComments();
  renderPhotoPeopleNav();
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
  if(!canDelete())return alert("Only the archive owner can delete people. Please add a correction/suggestion instead.");
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
    html+=`<div class="people-card ${isRealPerson(p)?"":"ghost-person"}">${await photoHtml(p)}<strong>${escapeHtml(fullName(p))}</strong><p>${p.birth_date||"No dates yet"}${p.death_date?" – "+p.death_date:""}</p><button class="danger small-btn owner-only" onclick="deletePerson('${p.id}')">Delete</button></div>`
  }
  list.innerHTML=html||"<p>No people yet.</p>"
}

function showDbTab(tab,btn){
  currentDbTab=tab;selectedDbId=null;
  document.querySelectorAll(".db-tab").forEach(b=>b.classList.remove("active"));
  btn?.classList.add("active");
  renderDatabase();
}
function dbQuery(){return (el("dbSearch")?.value||"").trim().toLowerCase()}
function dbDate(v){return v?escapeHtml(v):"—"}
function personPhotoThumb(id){const f=faceForPerson(id);return f?`<div class="db-avatar" style="${f._cachedStyle||''}">${initials(person(id))}</div>`:`<div class="db-avatar">${initials(person(id))}</div>`}
async function renderDatabase(){
  const table=el("dbTable"), editor=el("dbEditor");if(!table)return;
  const q=dbQuery();
  if(currentDbTab==="people"){
    const rows=people.filter(p=>!q||fullName(p).toLowerCase().includes(q)).sort((a,b)=>fullName(a).localeCompare(fullName(b)));
    let html='<div class="db-row db-head"><span>Person</span><span>Born</span><span>Died</span><span>Faces</span></div>';
    for(const p of rows){
      const f=faceForPerson(p.id); const thumb=f?await photoHtml(p):`<div class="node-photo mini">${initials(p)}</div>`;
      html+=`<button class="db-row ${selectedDbId===p.id?'selected':''}" onclick="selectDbPerson('${p.id}')"><span class="db-person">${thumb}<b>${escapeHtml(fullName(p))}</b></span><span>${dbDate(p.birth_date)}</span><span>${dbDate(p.death_date)}</span><span>${faces.filter(f=>f.person_id===p.id).length}</span></button>`
    }
    table.innerHTML=html||"<p>No people yet.</p>";
    if(!selectedDbId&&rows[0])selectDbPerson(rows[0].id,false); else renderDbEditor();
  }else if(currentDbTab==="photos"){
    const rows=photos.filter(ph=>!q||String(ph.title||ph.original_filename||'').toLowerCase().includes(q));
    table.innerHTML='<div class="db-row db-head"><span>Photo</span><span>Date</span><span>People</span><span>File</span></div>'+rows.map(ph=>`<button class="db-row ${selectedDbId===ph.id?'selected':''}" onclick="selectDbPhoto('${ph.id}')"><span><b>${escapeHtml(ph.title||ph.original_filename||'Untitled')}</b></span><span>${dbDate(ph.date_taken||ph.photo_date||ph.taken_at)}</span><span>${faces.filter(f=>f.photo_id===ph.id&&f.person_id).length}</span><span>${escapeHtml(ph.original_filename||'—')}</span></button>`).join('');
    if(!selectedDbId&&rows[0])selectDbPhoto(rows[0].id,false); else renderDbEditor();
  }else if(currentDbTab==="faces"){
    const rows=faces.filter(f=>!q||String(f.label||fullName(person(f.person_id))||'').toLowerCase().includes(q));
    table.innerHTML='<div class="db-row db-head"><span>Face</span><span>Person</span><span>Photo</span><span>Status</span></div>'+rows.map(f=>`<div class="db-row"><span><b>${escapeHtml(f.label||'Unnamed')}</b></span><span>${escapeHtml(fullName(person(f.person_id))||'—')}</span><span>${escapeHtml(photos.find(p=>p.id===f.photo_id)?.title||'Photo')}</span><span>${escapeHtml(f.status||'—')}</span></div>`).join('');
    safeText("dbEditorTitle","Faces"); if(editor)editor.innerHTML='<p class="small">Face boxes are edited visually on the Photos page. This table is for checking that faces are attached to the correct person.</p>';
  }else if(currentDbTab==="feedback"){
    table.innerHTML='<div class="db-row db-head"><span>Bug / request</span><span>Status</span><span>Author</span><span></span></div>'+feedback.filter(x=>!q||String((x.title||'')+' '+(x.body||'')).toLowerCase().includes(q)).map(x=>`<div class="db-row"><span><b>${escapeHtml(x.title||'Untitled')}</b><br><span class="small">${escapeHtml(x.body||'')}</span></span><span>${escapeHtml(x.status||'open')}</span><span>${escapeHtml(itemAuthor(x))}</span><span><button class="small-btn" onclick="setFeedbackStatus('${x.id}','done')">Done</button></span></div>`).join('');
    safeText("dbEditorTitle","Bugs / requests"); if(editor)editor.innerHTML='<p class="small">Use this as a shared list for bugs, requests and admin notes.</p><button class="primary full" onclick="newFeedbackPrompt()">New item</button>';
  }else{
    const rows=relationships.filter(r=>!q||relationshipSentence(r).toLowerCase().includes(q));
    table.innerHTML='<div class="db-row db-head"><span>Relationship</span><span>Type</span><span>Source</span><span></span></div>'+rows.map(r=>`<div class="db-row"><span><b>${escapeHtml(relationshipSentence(r))}</b></span><span>${escapeHtml(r.label||r.relationship_type)}</span><span>${escapeHtml(photos.find(p=>p.id===r.source_photo_id)?.title||'—')}</span><span><button class="danger small-btn" onclick="deleteRelationship('${r.id}')">Delete</button></span></div>`).join('');
    safeText("dbEditorTitle","Relationships"); if(editor)editor.innerHTML='<p class="small">Relationships can be created from the Photos page or deleted here.</p>';
  }
}
function selectDbPerson(id,rerender=true){selectedDbId=id;if(rerender)renderDatabase();else renderDbEditor()}
function selectDbPhoto(id,rerender=true){selectedDbId=id;if(rerender)renderDatabase();else renderDbEditor()}
function renderDbEditor(){
  const box=el("dbEditor");if(!box)return;
  if(currentDbTab==="people"){
    const p=person(selectedDbId);safeText("dbEditorTitle",p?fullName(p):"Select a person");
    if(!p){box.innerHTML='<p class="small">Choose a person to edit.</p>';return}
    box.innerHTML=`<div class="profile-top">${photoHtmlSync(p)}<div><h3>${escapeHtml(fullName(p))}</h3><p class="small">${faces.filter(f=>f.person_id===p.id).length} tagged photo${faces.filter(f=>f.person_id===p.id).length===1?'':'s'}</p></div></div>
      <div class="form-grid">
        <label>Full name<input id="editDisplayName" value="${escapeHtml(fullName(p))}" onblur="this.value=titleCaseName(this.value)"></label>
        <label>Preferred name<input id="editGiven" value="${escapeHtml(p.given_names||'')}"></label>
        <label>Family name<input id="editFamily" value="${escapeHtml(p.family_name||'')}"></label>
        <label>Birth date<input id="editBirth" type="date" value="${escapeHtml(p.birth_date||'')}"></label>
        ${p.death_date?`<label>Death date<input id="editDeath" type="date" value="${escapeHtml(p.death_date||'')}"></label>`:`<div id="deathFieldWrap"><button type="button" class="subtle full" onclick="showDeathDateField()">+ Add death date</button></div>`}
      </div>
      <button class="primary full" onclick="savePersonRecord('${p.id}')">Save person</button>
      <button class="danger full owner-only" onclick="deletePerson('${p.id}')">Delete person</button>`;
    hydrateAsyncPortraits();
  }else if(currentDbTab==="photos"){
    const ph=photos.find(x=>x.id===selectedDbId);safeText("dbEditorTitle",ph?(ph.title||ph.original_filename||"Photo"):"Select a photo");
    if(!ph){box.innerHTML='<p class="small">Choose a photo to edit.</p>';return}
    box.innerHTML=`<div class="form-grid">
      <label>Title<input id="editPhotoTitle" value="${escapeHtml(ph.title||'')}"></label>
      <label>Date<input id="editPhotoDate" type="date" value="${escapeHtml(ph.date_taken||ph.photo_date||ph.taken_at||'')}"></label>
      <label>Location<input id="editPhotoLocation" value="${escapeHtml(ph.location||ph.place||'')}"></label>
      <label>Caption<textarea id="editPhotoCaption">${escapeHtml(ph.caption||ph.description||'')}</textarea></label>
    </div>
    <button class="primary full" onclick="savePhotoRecord('${ph.id}')">Save photo</button>
    <p class="small">Only fields that exist in your Supabase photo table will be written back.</p>`;
  }
}
function photoHtmlSync(p){
  // Synchronous fallback for places where we cannot await the crop yet.
  // The real cropped portrait is filled immediately afterwards by hydrateAsyncPortraits().
  const f=faceForPerson(p.id);
  return f?`<div class="node-photo async-photo" data-person-id="${p.id}">${initials(p)}</div>`:`<div class="node-photo">${initials(p)}</div>`
}
async function hydrateAsyncPortraits(){
  const els=[...document.querySelectorAll('.async-photo[data-person-id]')];
  for(const e of els){
    const p=person(e.dataset.personId), f=p?faceForPerson(p.id):null;
    if(!f)continue;
    e.setAttribute('style', await cropStyle(f));
    e.textContent='';
  }
}
async function savePersonRecord(id){
  const p=person(id);if(!p)return;
  const name=titleCaseName(el("editDisplayName")?.value||fullName(p)); if(!name)return alert("Name required.");
  const patch={display_name:name,given_names:titleCaseName(el("editGiven")?.value||name.split(" ")[0]),family_name:titleCaseName(el("editFamily")?.value||name.split(" ").slice(1).join(" "))||null,birth_date:el("editBirth")?.value||null};
  if(el("editDeath"))patch.death_date=el("editDeath")?.value||null;
  const res=await sb.from("people").update(patch).eq("id",id).select().single();
  if(res.error){alert(res.error.message);return}
  Object.assign(p,res.data);faces.filter(f=>f.person_id===id).forEach(f=>{f.label=fullName(p)});
  await sb.from("faces").update({label:fullName(p)}).eq("person_id",id);
  setStatus("Person saved");updateSide();await renderPeople();renderDatabase();
}
async function savePhotoRecord(id){
  const ph=photos.find(x=>x.id===id);if(!ph)return;
  const patch={};
  if('title' in ph)patch.title=el("editPhotoTitle")?.value||null;
  const dateVal=el("editPhotoDate")?.value||null;
  ['date_taken','photo_date','taken_at'].forEach(k=>{if(k in ph)patch[k]=dateVal});
  const locVal=el("editPhotoLocation")?.value||null; ['location','place'].forEach(k=>{if(k in ph)patch[k]=locVal});
  const capVal=el("editPhotoCaption")?.value||null; ['caption','description'].forEach(k=>{if(k in ph)patch[k]=capVal});
  if(!Object.keys(patch).length)return alert('No editable photo columns found.');
  const res=await sb.from("photos").update(patch).eq("id",id).select().single();
  if(res.error){alert(res.error.message);return}
  Object.assign(ph,res.data);setStatus("Photo saved");renderDatabase();
}

async function renderPhotoPeopleNav(){
  const box=el('photoPeopleNav'); if(!box)return;
  let rows=visiblePeople().slice(0,8);
  let html='';
  for(const p of rows){
    const f=faceForPerson(p.id); const st=f?await cropStyle(f,34):'';
    html+=`<div class="photo-person-link"><div class="tiny-avatar" style="${st}">${f?'':escapeHtml(initials(p))}</div><div><b>${escapeHtml(fullName(p))}</b><br><span class="small">${escapeHtml(p.birth_date||'')}</span></div><span class="blue-dot"></span></div>`
  }
  box.innerHTML=html||'<p class="small">No people yet.</p>';
}


async function renderPhotoList(){
  const box=el('photoList'); if(!box)return;
  if(!photos.length){box.innerHTML='<p class="small">No photos yet.</p>';return;}
  let html='';
  for(const ph of photos){
    const url=await photoUrl(ph);
    const faceCount=faces.filter(f=>f.photo_id===ph.id).length;
    const namedCount=faces.filter(f=>f.photo_id===ph.id && f.person_id).length;
    const date=ph.date_taken||ph.photo_date||ph.taken_at||ph.created_at?.slice(0,10)||'';
    html+=`<button class="photo-list-item ${currentPhoto?.id===ph.id?'active':''}" onclick="selectPhotoById('${ph.id}')">
      <img src="${url}" alt="">
      <span><b>${escapeHtml(photoTitle(ph))}</b><small>${escapeHtml(date)} · ${faceCount} face${faceCount===1?'':'s'}${namedCount?` · ${namedCount} named`:''}</small></span>
    </button>`;
  }
  box.innerHTML=html;
}
function photoTitle(ph){return ph?.title||ph?.original_filename||'Photo'}
function itemAuthor(x){return x.author_name||x.created_by_email||x.created_by||'Family member'}
function renderPhotoComments(){
  const box=el('photoComments'); if(!box)return;
  const rows=comments.filter(c=>c.photo_id===currentPhoto?.id).slice(0,8);
  box.innerHTML=rows.length?rows.map(c=>`<div class="comment"><b>${escapeHtml(itemAuthor(c))}</b><br>${escapeHtml(c.body||c.comment||'')}</div>`).join(''):'No comments yet.';
}
async function addPhotoComment(){
  const body=(el('commentText')?.value||'').trim(); if(!body)return;
  const row=await addOptional('comments',{photo_id:currentPhoto?.id,person_id:selectedFaceId?faces.find(f=>f.id===selectedFaceId)?.person_id:null,body,author_id:currentUserId(),author_name:userName(),status:'open'});
  comments.unshift(row); if(el('commentText'))el('commentText').value=''; renderPhotoComments(); renderReview(); setStatus('Comment posted');
}
async function suggestSelectedFaceName(){
  const f=faces.find(x=>x.id===selectedFaceId); if(!f)return suggestFaceForPhoto();
  const body=(el('faceSuggestionText')?.value||el('faceName')?.value||'').trim(); if(!body)return alert('Type the suggested name or correction.');
  const row=await addOptional('suggestions',{type:'face_correction',photo_id:f.photo_id,face_id:f.id,person_id:f.person_id||null,suggested_value:titleCaseName(body),body,author_id:currentUserId(),author_name:userName(),status:'open'});
  suggestions.unshift(row); setStatus('Suggestion sent for review'); renderReview(); alert('Suggestion sent. It will not overwrite the approved archive until accepted.');
}
async function suggestFaceForPhoto(){
  if(!currentPhoto)return alert('Open a photo first.');
  const body=prompt('Who or what should be added/corrected on this photo?'); if(!body)return;
  const row=await addOptional('suggestions',{type:'photo_face_suggestion',photo_id:currentPhoto.id,body,suggested_value:body,author_id:currentUserId(),author_name:userName(),status:'open'});
  suggestions.unshift(row); renderReview(); alert('Suggestion added for review.');
}
async function newFeedbackPrompt(){
  const title=prompt('Bug or request title'); if(!title)return;
  const body=prompt('Details');
  const row=await addOptional('feedback',{title,body:body||'',kind:'request',status:'open',author_id:currentUserId(),author_name:userName()});
  feedback.unshift(row); renderReview(); renderDatabase();
}
async function setSuggestionStatus(id,status){
  if(!isOwner() && status==='approved')return alert('Only the archive owner can approve changes.');
  const row=await updateOptional('suggestions',id,{status,reviewed_by:userName(),reviewed_at:new Date().toISOString()});
  suggestions=suggestions.map(x=>x.id===id?Object.assign(x,row):x); renderReview();
}
async function setFeedbackStatus(id,status){
  const row=await updateOptional('feedback',id,{status}); feedback=feedback.map(x=>x.id===id?Object.assign(x,row):x); renderReview(); renderDatabase();
}
function renderReview(){
  const sug=el('suggestionList'), com=el('commentList'), fb=el('feedbackList');
  if(sug){sug.innerHTML=(suggestions.length?suggestions:[]).map(x=>`<div class="review-item ${escapeHtml(x.status||'open')}"><b>${escapeHtml(x.suggested_value||x.type||'Suggestion')}</b><p>${escapeHtml(x.body||'')}</p><p class="small">${escapeHtml(itemAuthor(x))} · ${escapeHtml(x.status||'open')}</p><div class="review-actions"><button class="owner-only" onclick="setSuggestionStatus('${x.id}','approved')">Approve</button><button onclick="setSuggestionStatus('${x.id}','rejected')">Reject</button><button onclick="setSuggestionStatus('${x.id}','open')">Reopen</button></div></div>`).join('')||'<p class="small">No suggestions yet.</p>';}
  if(com){com.innerHTML=comments.map(x=>`<div class="review-item"><b>${escapeHtml(itemAuthor(x))}</b><p>${escapeHtml(x.body||x.comment||'')}</p><p class="small">${escapeHtml(x.created_at||'')}</p></div>`).join('')||'<p class="small">No comments yet.</p>';}
  if(fb){fb.innerHTML=feedback.map(x=>`<div class="review-item ${escapeHtml(x.status||'open')}"><b>${escapeHtml(x.title||'Untitled')}</b><p>${escapeHtml(x.body||'')}</p><p class="small">${escapeHtml(itemAuthor(x))} · ${escapeHtml(x.status||'open')}</p><div class="review-actions"><button onclick="setFeedbackStatus('${x.id}','open')">Open</button><button onclick="setFeedbackStatus('${x.id}','done')">Done</button></div></div>`).join('')||'<p class="small">No bugs or requests yet.</p>';}
  setModeClasses();
  setEditMode(editMode);
}

function faceForPerson(id){return faces.find(f=>f.person_id===id)}
async function cropStyle(f,size=92){
  if(!f)return"";
  const ph=photos.find(p=>p.id===f.photo_id);if(!ph)return"";
  const url=await photoUrl(ph);
  const w=Math.max(1,Number(f.w)||1), h=Math.max(1,Number(f.h)||1), x=Number(f.x)||0, y=Number(f.y)||0;
  // Use the real displayed photo width from the builder when available. This keeps old
  // face-box coordinates aligned even when the uploaded image is not exactly 1200px wide.
  const img=el('mainPhoto');
  const displayW=(img&&img.complete&&img.naturalWidth)?img.clientWidth||1200:1200;
  const scale=size/Math.max(w,h);
  const bgW=displayW*scale;
  const bgX=-(x*scale)+(size-w*scale)/2;
  const bgY=-(y*scale)+(size-h*scale)/2;
  return`background-image:url('${url}');background-size:${bgW}px auto;background-position:${bgX}px ${bgY}px;background-repeat:no-repeat;`
}
async function photoHtml(p){const f=faceForPerson(p.id);if(f)return`<div class="node-photo" style="${await cropStyle(f)}"></div>`;return`<div class="node-photo">${initials(p)}</div>`}
function showDeathDateField(){
  const wrap=el('deathFieldWrap');
  if(wrap)wrap.outerHTML='<label>Death date<input id="editDeath" type="date" value=""></label>';
}

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

Object.assign(window,{attachFaceToExisting,selectPhotoById,previousPhoto,nextPhoto,detectFacesOnPhoto,setEditMode,addPhotoComment,suggestSelectedFaceName,suggestFaceForPhoto,newFeedbackPrompt,setSuggestionStatus,setFeedbackStatus,showDeathDateField,sendLogin,signOut,showPage,refreshData,uploadPhoto,selectLatestPhoto,addFaceBox,deleteSelectedFace,saveFaceName,setRel,saveRelationship,deleteRelationship,renderGraph,fitGraph,zoomGraph,resetGraphZoom,addUnknownPerson,deletePerson,toggleFaceBoxes,toggleFaceNames,applyTheme,titleCaseName,showDbTab,renderDatabase,selectDbPerson,selectDbPhoto,savePersonRecord,savePhotoRecord});
boot();

/* === Functional polish pass: dashboard, people profiles, admin visibility, tree clicks === */
function profilePersonId(){return currentProfile?.person_id || localStorage.getItem('familyGraph:profilePersonId') || null}
function canAdmin(){return ['owner','editor','family editor'].includes(role())}
function setModeClasses(){document.body.classList.toggle('can-edit',canEdit());document.body.classList.toggle('can-delete',canDelete());document.body.classList.toggle('edit-mode',editMode);document.body.classList.toggle('can-admin',canAdmin());}

function updateDashboard(){
  safeText('peopleTotal',people.length); safeText('photosTotal',photos.length); safeText('facesTotal',faces.length); safeText('relationshipsTotal',relationships.length);
  renderDashboardExtras?.();
}
async function renderDashboardExtras(){
  const photoBox=el('dashboardPhotos'), taskBox=el('dashboardTasks'), peopleBox=el('dashboardPeople');
  if(photoBox){
    let html='';
    for(const ph of photos.slice(0,6)){
      const url=await photoUrl(ph); const c=faces.filter(f=>f.photo_id===ph.id).length;
      html+=`<button class="mini-photo" onclick="selectPhotoById('${ph.id}');showPage('photo')"><img src="${url}" alt=""><span>${escapeHtml(photoTitle(ph))}<small>${c} face${c===1?'':'s'}</small></span></button>`;
    }
    photoBox.innerHTML=html||'<p class="small">No photos yet.</p>';
  }
  if(taskBox){
    const unknown=faces.filter(f=>!f.person_id).length;
    const noDates=visiblePeople().filter(p=>!p.birth_date).length;
    const profileLinked=!!profilePersonId();
    taskBox.innerHTML=`
      <button onclick="showPage('photo')"><b>${unknown}</b><span>Unnamed faces to identify</span></button>
      <button onclick="showPage('people')"><b>${noDates}</b><span>People without birth dates</span></button>
      <button onclick="showPage('people')"><b>${profileLinked?'✓':'!'}</b><span>${profileLinked?'Your login is linked to a person':'Link your login to your person record'}</span></button>`;
  }
  if(peopleBox){
    const rows=visiblePeople().slice().sort((a,b)=>fullName(a).localeCompare(fullName(b))).slice(0,8);
    let html='';
    for(const p of rows){html+=`<button onclick="showPerson('${p.id}')">${await photoHtml(p)}<span>${escapeHtml(fullName(p))}<small>${escapeHtml(p.birth_date||'')}</small></span></button>`}
    peopleBox.innerHTML=html||'<p class="small">No people yet.</p>';
  }
}

function showPerson(id){selectedPersonId=id;showPage('person');renderPersonProfile();}
async function renderPersonProfile(){
  const box=el('personProfile'); if(!box)return;
  const p=person(selectedPersonId)||visiblePeople().slice().sort((a,b)=>fullName(a).localeCompare(fullName(b)))[0];
  if(!p){box.innerHTML='<p>No person selected.</p>';return}
  selectedPersonId=p.id;
  const rels=relationships.filter(r=>r.from_person_id===p.id||r.to_person_id===p.id);
  const tagged=faces.filter(f=>f.person_id===p.id);
  const photoIds=[...new Set(tagged.map(f=>f.photo_id))];
  let photosHtml='';
  for(const pid of photoIds.slice(0,12)){const ph=photos.find(x=>x.id===pid); if(!ph)continue; photosHtml+=`<button class="mini-photo" onclick="selectPhotoById('${ph.id}');showPage('photo')"><img src="${await photoUrl(ph)}" alt=""><span>${escapeHtml(photoTitle(ph))}</span></button>`}
  box.innerHTML=`
    <div class="person-hero card">
      ${await photoHtml(p)}
      <div><h2>${escapeHtml(fullName(p))}</h2><p>${escapeHtml(p.birth_date||'')}${p.death_date?' – '+escapeHtml(p.death_date):''}</p><p class="small">${tagged.length} tagged face${tagged.length===1?'':'s'} · ${rels.length} direct relationship${rels.length===1?'':'s'}</p></div>
      <div class="person-actions">
        <button class="primary" onclick="focusTreeOnPerson('${p.id}')">Focus in tree</button>
        <button onclick="linkMyProfileToPerson('${p.id}')">Link my login to this person</button>
      </div>
    </div>
    <div class="person-profile-grid">
      <section class="card"><h2>Photos</h2><div class="mini-photo-grid">${photosHtml||'<p class="small">No tagged photos yet.</p>'}</div></section>
      <section class="card"><h2>Direct relationships</h2><div class="relationship-list">${rels.map(r=>`<div class="rel-row"><strong>${escapeHtml(relationshipSentence(r))}</strong></div>`).join('')||'<p class="small">No direct relationships yet.</p>'}</div></section>
    </div>`;
}
async function linkMyProfileToPerson(id){
  const p=person(id); if(!p)return;
  try{const r=await sb.from('profiles').update({person_id:id}).eq('user_id',session.user.id).select().single(); if(!r.error){currentProfile=Object.assign(currentProfile||{},r.data);}}
  catch(e){}
  localStorage.setItem('familyGraph:profilePersonId',id);
  alert(`This login is now linked to ${fullName(p)} on this browser${currentProfile?.person_id?' and in Supabase.':'.'} `);
  updateDashboard(); renderPersonProfile();
}
function focusTreeOnPerson(id){selectedPersonId=id;showPage('graph');setTimeout(()=>{const sel=el('treeFocusPerson'); if(sel)sel.value=id; renderGraph();},0)}

async function renderPeople(){
  const list=el('peopleList');if(!list)return;let html='';
  const rows=people.slice().filter(isRealPerson).sort((a,b)=>fullName(a).localeCompare(fullName(b)));
  for(const p of rows){html+=`<button class="people-card person-button" onclick="showPerson('${p.id}')">${await photoHtml(p)}<strong>${escapeHtml(fullName(p))}</strong><p>${p.birth_date||'No dates yet'}${p.death_date?' – '+p.death_date:''}</p></button>`}
  list.innerHTML=html||'<p>No people yet.</p>';
}

function showPage(page){
  page = page || 'dashboard';
  if(!el(page+'Page')) page = 'dashboard';
  if(page==='admin' && !canAdmin()) page='dashboard';
  document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
  el(page+'Page')?.classList.remove('hidden');
  document.querySelectorAll('nav button[data-page]').forEach(b=>b.classList.toggle('primary', b.dataset.page===page));
  if(location.hash !== '#'+page) history.replaceState(null,'','#'+page);
  if(page!=='photo'){ selectedFaceId=null; renderFaceEditor?.(); }
  if(page==='dashboard') updateDashboard();
  if(page==='photo'){renderCurrentPhoto();updateSide();renderPhotoList()}
  if(page==='people'){renderPeople()}
  if(page==='person'){renderPersonProfile()}
  if(page==='relationships'){renderRelationshipList()}
  if(page==='admin'){renderDatabase()}
  if(page==='review'){renderReview()}
  if(page==='graph'){renderGraph();setTimeout(fitGraph,0)}
}

// Make tree nodes clickable and keep avatars stable. This reuses the existing layout engine for now.
async function renderGraph(){
  const graph=el('graph');if(!graph)return;graph.innerHTML='<div class="graph-inner" id="graphInner"></div>';const inner=el('graphInner'),pos=layoutPositions(), nodeW=178, nodeH=156;
  partnerPairs().forEach(([a,b])=>{if(!pos[a]||!pos[b])return;const left=pos[a].x<pos[b].x?a:b,right=left===a?b:a;const y=pos[left].y+74;drawH(inner,pos[left].x+nodeW,y,pos[right].x-(pos[left].x+nodeW));label(inner,(pos[left].x+nodeW+pos[right].x)/2-38,y-27,'Partner')});
  parentGroups().forEach(group=>{const parents=group.parents.filter(id=>pos[id]),children=group.children.filter(id=>pos[id]);if(!parents.length||!children.length)return;const pc=parents.reduce((s,id)=>s+pos[id].x+nodeW/2,0)/parents.length,parentBottom=Math.max(...parents.map(id=>pos[id].y+nodeH)),childTop=Math.min(...children.map(id=>pos[id].y)),busY=(parentBottom+childTop)/2;drawV(inner,pc,parentBottom,busY-parentBottom);const left=Math.min(...children.map(id=>pos[id].x+nodeW/2)),right=Math.max(...children.map(id=>pos[id].x+nodeW/2));drawH(inner,left,busY,right-left);children.forEach(id=>drawV(inner,pos[id].x+nodeW/2,busY,pos[id].y-busY))});
  for(const p of visiblePeople()){const xy=pos[p.id]||{x:100,y:100},n=document.createElement('button');n.className='node tree-node';n.style.left=xy.x+'px';n.style.top=xy.y+'px';n.onclick=()=>showPerson(p.id);n.innerHTML=`${await photoHtml(p)}<strong>${escapeHtml(fullName(p))}</strong><span class="small">${p.birth_date||''}${p.death_date?' – '+p.death_date:''}</span>`;inner.appendChild(n)}
  applyGraphZoom();
}
