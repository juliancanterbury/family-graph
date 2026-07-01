const hasSupabase = typeof SUPABASE_URL !== "undefined" && SUPABASE_URL && !SUPABASE_URL.includes("PASTE_");
const client = hasSupabase ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const STORAGE_KEY = "familyGraphSharedMvpDemo";

const starter = {
  people: [
    {id:"jean", first_name:"Jean", last_name:"Canterbury", birth_year:"1942", death_year:"2018", living:false, bio:"Family graph starter."},
    {id:"paul", first_name:"Paul", last_name:"Canterbury", birth_year:"1940", death_year:"2020", living:false, bio:"Family graph starter."},
    {id:"julian", first_name:"Julian", last_name:"Canterbury", birth_year:"1970", death_year:"", living:true, bio:"Can edit own profile and choose own tree photo."},
    {id:"zoe", first_name:"Zoe", last_name:"Phillips", birth_year:"", death_year:"", living:true, bio:"Julian’s partner."},
    {id:"rachel", first_name:"Rachel", last_name:"Canterbury", birth_year:"1973", death_year:"", living:true, bio:""},
    {id:"andrew", first_name:"Andrew", last_name:"Canterbury", birth_year:"1976", death_year:"", living:true, bio:""}
  ],
  relationships: [
    {id:"r1", from:"jean", to:"paul", type:"spouse", label:"Married"},
    {id:"r2", from:"jean", to:"julian", type:"parent", label:"Mother"},
    {id:"r3", from:"paul", to:"julian", type:"parent", label:"Father"},
    {id:"r4", from:"jean", to:"rachel", type:"parent", label:"Mother"},
    {id:"r5", from:"paul", to:"rachel", type:"parent", label:"Father"},
    {id:"r6", from:"jean", to:"andrew", type:"parent", label:"Mother"},
    {id:"r7", from:"paul", to:"andrew", type:"parent", label:"Father"},
    {id:"r8", from:"julian", to:"zoe", type:"partner", label:"Partners"}
  ],
  faces: [
    {id:"f1", person_id:"jean", x:580, y:250, w:60, h:86, label:"Jean Canterbury"},
    {id:"f2", person_id:"paul", x:650, y:270, w:60, h:86, label:"Paul Canterbury"},
    {id:"f3", person_id:"julian", x:350, y:370, w:60, h:86, label:"Julian Canterbury"},
    {id:"f4", person_id:"zoe", x:780, y:380, w:60, h:86, label:"Zoe Phillips"},
    {id:"f5", person_id:"rachel", x:880, y:370, w:60, h:86, label:"Rachel Canterbury"},
    {id:"f6", person_id:"andrew", x:1010, y:370, w:60, h:86, label:"Andrew Canterbury"}
  ]
};

let data = structuredClone(starter);
let session = null;
let selectedPersonId = "julian";
let positions = {};
let scale = .72;
let addFaceNextClick = false;
let selectedFaceId = null;

async function init(){
  if(client){
    const { data: sess } = await client.auth.getSession();
    session = sess.session;
    client.auth.onAuthStateChange((_event, s)=>{ session=s; routeAuth(); });
  }
  routeAuth();
}

async function routeAuth(){
  if(client && session){
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("statusText").textContent = "Signed in as " + session.user.email;
    await loadShared();
  } else if(!client) {
    continueDemo();
  } else {
    document.getElementById("loginScreen").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }
}

async function sendMagicLink(){
  if(!client) return continueDemo();
  const email = document.getElementById("email").value.trim();
  if(!email) return alert("Enter an email address.");
  const { error } = await client.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.href } });
  alert(error ? error.message : "Check your email for the sign-in link.");
}

function continueDemo(){
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("statusText").textContent = "Demo mode — not shared yet";
  try{ data = JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(starter); }catch{ data = structuredClone(starter); }
  boot();
}

async function signOut(){
  if(client && session) await client.auth.signOut();
  else location.reload();
}

async function loadShared(){
  const pr = await client.from("people").select("*");
  const rr = await client.from("relationships").select("*");
  const fr = await client.from("photo_faces").select("*");
  data.people = pr.data?.length ? pr.data.map(p=>({id:p.id,first_name:p.first_name,last_name:p.last_name,birth_year:p.birth_year,death_year:p.death_year,living:p.living,bio:p.bio})) : structuredClone(starter.people);
  data.relationships = rr.data?.length ? rr.data.map(r=>({id:r.id,from:r.from_person_id,to:r.to_person_id,type:r.relationship_type,label:r.label})) : structuredClone(starter.relationships);
  data.faces = fr.data?.length ? fr.data.map(f=>({id:f.id,person_id:f.person_id,x:f.x,y:f.y,w:f.w,h:f.h,label:f.label})) : structuredClone(starter.faces);
  if(!pr.data?.length) await seedStarter();
  boot();
}

async function seedStarter(){
  await client.from("people").upsert(starter.people);
  await client.from("relationships").upsert(starter.relationships.map(r=>({id:r.id,from_person_id:r.from,to_person_id:r.to,relationship_type:r.type,label:r.label})));
  await client.from("photo_faces").upsert(starter.faces);
}

function boot(){
  selectedPersonId = data.people.find(p=>p.id==="julian")?.id || data.people[0]?.id;
  showPage("graph");
  renderFaces();
  updatePhotoPanel();
}

function saveLocal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
async function savePersonDb(p){
  if(!client || !session) return saveLocal();
  await client.from("people").upsert(p);
}
async function saveRelationshipDb(r){
  if(!client || !session) return saveLocal();
  await client.from("relationships").upsert({id:r.id,from_person_id:r.from,to_person_id:r.to,relationship_type:r.type,label:r.label});
}
async function saveFaceDb(f){
  if(!client || !session) return saveLocal();
  await client.from("photo_faces").upsert(f);
}

function uid(prefix="id"){ return prefix + "_" + Math.random().toString(36).slice(2,10); }
function slug(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || uid("person"); }
function person(id){ return data.people.find(p=>p.id===id); }
function fullName(p){ return `${p.first_name||""} ${p.last_name||""}`.trim(); }
function initials(p){ return `${p.first_name?.[0]||""}${p.last_name?.[0]||""}`.toUpperCase(); }
function isPartnerType(t){ return ["partner","spouse","ex_partner"].includes(t); }

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.getElementById(page+"Page").classList.remove("hidden");
  if(page==="graph"){ renderGraph(); renderProfile(); setTimeout(fitGraph,0); }
  if(page==="photo"){ renderFaces(); updatePhotoPanel(); }
  if(page==="people"){ renderPeopleList(); }
}

function autoLayout(){
  positions = {};
  if(person("jean")) positions.jean = {x:760,y:210};
  if(person("paul")) positions.paul = {x:1180,y:210};
  if(person("julian")) positions.julian = {x:480,y:650};
  if(person("zoe")) positions.zoe = {x:720,y:650};
  if(person("rachel")) positions.rachel = {x:1120,y:650};
  if(person("andrew")) positions.andrew = {x:1520,y:650};
  let x=400;
  data.people.forEach(p=>{ if(!positions[p.id]){ positions[p.id]={x:x,y:930}; x+=260; }});
}

function renderGraph(){
  autoLayout();
  const g=document.getElementById("graph"); g.innerHTML="";
  drawRelationships(g);
  data.people.forEach(p=>{
    const pos=positions[p.id]||{x:1000,y:1000};
    const el=document.createElement("div");
    el.className="person"+(selectedPersonId===p.id?" selected":"");
    el.style.left=pos.x+"px"; el.style.top=pos.y+"px";
    el.innerHTML=`<div class="photo">${initials(p)}</div><div><div class="name">${p.first_name}<br>${p.last_name||""}</div><div class="dates">${dateText(p)}</div><div class="tag">${p.living?"living":"deceased"}</div></div>`;
    el.onclick=()=>{selectedPersonId=p.id;renderGraph();renderProfile();};
    g.appendChild(el);
  });
}
function dateText(p){ if(p.id==="zoe")return"Partner"; if(p.birth_year&&p.death_year)return`${p.birth_year}–${p.death_year}`; if(p.birth_year)return`${p.birth_year}–`; return""; }
function drawRelationships(g){
  data.relationships.filter(r=>isPartnerType(r.type)).forEach(r=>{
    if(!positions[r.from]||!positions[r.to]) return;
    const a=positions[r.from], b=positions[r.to], y=a.y+60;
    const x1=a.x<b.x?a.x+190:b.x+190, x2=a.x<b.x?b.x:a.x;
    drawH(g,x1,y,x2-x1); drawRel(g,x1+(x2-x1)/2-42,y-24,r.label||"Partners");
  });
  const groups={};
  data.people.forEach(ch=>{
    const parents=data.relationships.filter(r=>r.type==="parent"&&r.to===ch.id).map(r=>r.from).sort();
    if(parents.length){ const key=parents.join("|"); (groups[key] ||= []).push(ch.id); }
  });
  Object.entries(groups).forEach(([key,children])=>{
    const parents=key.split("|").filter(id=>positions[id]); if(!parents.length)return;
    const parentCenter=parents.reduce((s,id)=>s+centerX(id),0)/parents.length;
    const parentY=Math.max(...parents.map(id=>centerY(id)));
    const kids=children.filter(id=>positions[id]); if(!kids.length)return;
    const busY=Math.min(...kids.map(id=>topY(id)))-115;
    drawV(g,parentCenter,parentY,busY-parentY);
    const left=Math.min(...kids.map(id=>centerX(id))), right=Math.max(...kids.map(id=>centerX(id)));
    drawH(g,left,busY,right-left); kids.forEach(id=>drawV(g,centerX(id),busY,topY(id)-busY));
  });
}
function centerX(id){return positions[id].x+95} function centerY(id){return positions[id].y+60} function topY(id){return positions[id].y}
function drawH(g,x,y,w){const e=document.createElement("div");e.className="line h";e.style.left=x+"px";e.style.top=y+"px";e.style.width=Math.max(0,w)+"px";g.appendChild(e);}
function drawV(g,x,y,h){const e=document.createElement("div");e.className="line v";e.style.left=x+"px";e.style.top=y+"px";e.style.height=Math.max(0,h)+"px";g.appendChild(e);}
function drawRel(g,x,y,h){const e=document.createElement("div");e.className="rel";e.style.left=x+"px";e.style.top=y+"px";e.innerHTML=h;g.appendChild(e);}

function renderProfile(){
  const p=person(selectedPersonId), panel=document.getElementById("profile");
  if(!p){ panel.innerHTML=""; return; }
  panel.innerHTML=`<div class="card"><h2>${fullName(p)}</h2><p class="note">${p.living?"Living":"Deceased"}</p>
  <div class="row"><label>First</label><input value="${p.first_name||""}" oninput="editPerson('${p.id}','first_name',this.value)"></div>
  <div class="row"><label>Last</label><input value="${p.last_name||""}" oninput="editPerson('${p.id}','last_name',this.value)"></div>
  <div class="row"><label>Birth</label><input value="${p.birth_year||""}" oninput="editPerson('${p.id}','birth_year',this.value)"></div>
  <div class="row"><label>Death</label><input value="${p.death_year||""}" oninput="editPerson('${p.id}','death_year',this.value)"></div>
  <div class="row"><label>Bio</label><textarea oninput="editPerson('${p.id}','bio',this.value)">${p.bio||""}</textarea></div></div>
  <div class="card"><h2>Relationships</h2><div class="relationship-list">${relationshipText(p.id)||"<p>No direct relationships yet.</p>"}</div></div>`;
}
function relationshipText(id){
  return data.relationships.filter(r=>r.from===id||r.to===id).map(r=>{
    const o=person(r.from===id?r.to:r.from); if(!o)return"";
    let label=r.type; if(r.type==="parent")label=r.from===id?"Parent of":"Child of"; if(isPartnerType(r.type))label="Partner";
    return`<p><strong>${label}</strong>: ${fullName(o)}</p>`;
  }).join("");
}
function editPerson(id,field,value){const p=person(id); if(!p)return; p[field]=value; savePersonDb(p); renderGraph();}
function fitGraph(){const wrap=document.getElementById("graphWrap"), graph=document.getElementById("graph"); scale=Math.min(wrap.clientWidth/2200,wrap.clientHeight/900,.78); graph.style.transform=`scale(${scale})`; wrap.scrollLeft=420*scale; wrap.scrollTop=120*scale;}
function centreOn(id){autoLayout(); const pos=positions[id]; if(!pos)return; const wrap=document.getElementById("graphWrap"); wrap.scrollLeft=(pos.x*scale)-(wrap.clientWidth/2)+(95*scale); wrap.scrollTop=(pos.y*scale)-(wrap.clientHeight/2)+(60*scale);}
function searchPerson(q){q=q.toLowerCase(); const p=data.people.find(x=>fullName(x).toLowerCase().includes(q)); if(p){selectedPersonId=p.id;renderGraph();renderProfile();centreOn(p.id);}}

/* photo */
function renderFaces(){
  const wrap=document.getElementById("photoWrap"); wrap.querySelectorAll(".face").forEach(f=>f.remove());
  data.faces.forEach(f=>{
    const el=document.createElement("div"); el.className="face"+(f.person_id?" named":"")+(selectedFaceId===f.id?" selected":"");
    el.style.left=f.x+"px"; el.style.top=f.y+"px"; el.style.width=f.w+"px"; el.style.height=f.h+"px"; el.innerHTML=`<span>${f.label||"Face"}</span>`;
    el.onclick=ev=>{ev.stopPropagation();selectedFaceId=f.id;renderFaces();renderFaceEditor();};
    wrap.appendChild(el);
  });
  wrap.onclick=ev=>{
    if(!addFaceNextClick)return;
    const img=document.getElementById("mainPhoto"), r=img.getBoundingClientRect(), wrapRect=wrap.getBoundingClientRect();
    const x=ev.clientX-r.left+wrap.scrollLeft, y=ev.clientY-r.top+wrap.scrollTop;
    const f={id:uid("face"),x:x-30,y:y-40,w:60,h:80,label:"Unnamed"};
    data.faces.push(f); selectedFaceId=f.id; addFaceNextClick=false; saveFaceDb(f); renderFaces(); renderFaceEditor(); updatePhotoPanel();
  };
}
function addFaceMode(){addFaceNextClick=true; alert("Now click the centre of a face in the photo.");}
function renderFaceEditor(){
  const f=data.faces.find(x=>x.id===selectedFaceId), el=document.getElementById("faceEditor");
  if(!f){el.innerHTML="<h2>Selected face</h2><p>Click “Add face”, then click on a face in the photo.</p>";return;}
  const p=f.person_id?person(f.person_id):null;
  el.innerHTML=`<h2>Selected face</h2><div class="row"><label>Name</label><input id="faceName" value="${p?fullName(p):""}" placeholder="Full name"></div>
  <button class="primary" onclick="saveFaceName()">Save name</button> <button onclick="deleteFace()">Delete face</button>`;
}
async function saveFaceName(){
  const f=data.faces.find(x=>x.id===selectedFaceId), name=document.getElementById("faceName").value.trim(); if(!f||!name)return;
  let p=data.people.find(p=>fullName(p).toLowerCase()===name.toLowerCase());
  if(!p){const parts=name.split(" ");p={id:slug(name),first_name:parts[0]||"",last_name:parts.slice(1).join(" ")||"",birth_year:"",death_year:"",living:true,bio:"Created from photo."};data.people.push(p);await savePersonDb(p);}
  f.person_id=p.id; f.label=fullName(p); await saveFaceDb(f); saveLocal(); renderFaces(); renderFaceEditor(); updatePhotoPanel(); renderGraph(); renderProfile();
}
async function deleteFace(){data.faces=data.faces.filter(f=>f.id!==selectedFaceId);selectedFaceId=null;saveLocal();renderFaces();renderFaceEditor();updatePhotoPanel();}
function updatePhotoPanel(){
  const a=document.getElementById("relA"); if(!a)return;
  document.getElementById("photoPeople").innerHTML=data.faces.filter(f=>f.person_id).map(f=>person(f.person_id)).filter(Boolean).map(p=>`<span class="pill">${fullName(p)}</span>`).join("")||"<p>No named people yet.</p>";
  refreshRelationshipSelects();
}
function refreshRelationshipSelects(){const opts=data.people.map(p=>`<option value="${p.id}">${fullName(p)}</option>`).join("");document.getElementById("relA").innerHTML=opts;document.getElementById("relB").innerHTML=opts;}
function setRel(t){document.getElementById("relType").value=t;document.querySelectorAll(".relationship-buttons button").forEach(b=>b.classList.remove("active"));event.target.classList.add("active");}
async function addRelationshipFromForm(){
  const a=document.getElementById("relA").value,b=document.getElementById("relB").value;let type=document.getElementById("relType").value;if(!a||!b||a===b)return alert("Choose two different people.");
  let rel;
  if(type==="mother"||type==="father"){rel={id:uid("rel"),from:a,to:b,type:"parent",label:type[0].toUpperCase()+type.slice(1)};}
  else if(type==="child"){rel={id:uid("rel"),from:b,to:a,type:"parent",label:"Parent"};}
  else rel={id:uid("rel"),from:a,to:b,type:type,label:type==="partner"?"Partners":"Relationship"};
  data.relationships.push(rel); await saveRelationshipDb(rel); saveLocal(); alert("Relationship saved."); renderGraph(); renderProfile();
}
function loadPhoto(ev){const file=ev.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=e=>{document.getElementById("mainPhoto").src=e.target.result;data.faces=[];saveLocal();renderFaces();updatePhotoPanel();};reader.readAsDataURL(file);}
function useSamplePhoto(){document.getElementById("mainPhoto").src="birthday-photo.jpg";renderFaces();updatePhotoPanel();}

function renderPeopleList(){document.getElementById("peopleList").innerHTML=data.people.map(p=>`<div class="people-card"><strong>${fullName(p)}</strong><p class="note">${dateText(p)||"No dates yet"}</p><button onclick="selectedPersonId='${p.id}';showPage('graph')">Open</button></div>`).join("");}
function addPersonPrompt(){const name=prompt("Full name:"); if(!name)return; const parts=name.trim().split(" "); const p={id:slug(name),first_name:parts[0]||"",last_name:parts.slice(1).join(" ")||"",birth_year:"",death_year:"",living:true,bio:""}; data.people.push(p); selectedPersonId=p.id; savePersonDb(p); showPage("graph");}
window.addEventListener("resize",fitGraph);
init();
