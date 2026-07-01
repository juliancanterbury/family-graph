const STORAGE_KEY = "familyGraphMvpData";

const defaultData = {
  people: [
    {id:"jean", first_name:"Jean", last_name:"Canterbury", birth_year:"1942", death_year:"2018", living:false, bio:"Family graph starter."},
    {id:"paul", first_name:"Paul", last_name:"Canterbury", birth_year:"1940", death_year:"2020", living:false, bio:"Family graph starter."},
    {id:"julian", first_name:"Julian", last_name:"Canterbury", birth_year:"1970", death_year:"", living:true, bio:"Can edit own profile and choose own tree photo."},
    {id:"zoe", first_name:"Zoe", last_name:"Phillips", birth_year:"", death_year:"", living:true, bio:"Julian’s partner."},
    {id:"rachel", first_name:"Rachel", last_name:"Canterbury", birth_year:"1973", death_year:"", living:true, bio:"Profile editable by Rachel once invited."},
    {id:"andrew", first_name:"Andrew", last_name:"Canterbury", birth_year:"1976", death_year:"", living:true, bio:"Profile editable by Andrew once invited."}
  ],
  relationships: [
    {id:"r1", from:"jean", to:"paul", type:"spouse", label:"Married 1966"},
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

let data = load();
let selectedPersonId = "julian";
let positions = {};
let scale = .72;
let addFaceNextClick = false;
let selectedFaceId = null;

function load(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultData); }
  catch { return structuredClone(defaultData); }
}
function save(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function uid(prefix="id"){
  return prefix + "_" + Math.random().toString(36).slice(2,10);
}
function person(id){ return data.people.find(p=>p.id===id); }
function fullName(p){ return `${p.first_name||""} ${p.last_name||""}`.trim(); }
function initials(p){ return `${p.first_name?.[0]||""}${p.last_name?.[0]||""}`.toUpperCase(); }
function isPartnerType(t){ return ["partner","spouse","ex_partner"].includes(t); }

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.getElementById(page+"Page").classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(n=>n.classList.toggle("active", n.dataset.page===page));
  if(page==="graph"){ renderGraph(); renderProfile(); setTimeout(fitGraph,0); }
  if(page==="photo"){ renderFaces(); updatePhotoPanel(); }
  if(page==="people"){ renderPeopleList(); }
}

function autoLayout(){
  positions = {};
  const people = data.people;
  const rels = data.relationships;

  const childIds = [...new Set(rels.filter(r=>r.type==="parent").map(r=>r.to))];
  const parentIds = [...new Set(rels.filter(r=>r.type==="parent").map(r=>r.from))];

  // Known starter layout, then general fallback.
  if(person("jean")) positions.jean = {x:760,y:210};
  if(person("paul")) positions.paul = {x:1180,y:210};
  if(person("julian")) positions.julian = {x:480,y:650};
  if(person("zoe")) positions.zoe = {x:720,y:650};
  if(person("rachel")) positions.rachel = {x:1120,y:650};
  if(person("andrew")) positions.andrew = {x:1520,y:650};

  let nextX = 400;
  data.people.forEach(p=>{
    if(!positions[p.id]){
      const hasParents = data.relationships.some(r=>r.type==="parent" && r.to===p.id);
      positions[p.id] = {x:nextX, y: hasParents ? 910 : 210};
      nextX += 260;
    }
  });
}

function renderGraph(){
  autoLayout();
  const g = document.getElementById("graph");
  g.innerHTML = "";
  drawRelationships(g);

  data.people.forEach(p=>{
    const pos = positions[p.id] || {x:1000,y:1000};
    const el = document.createElement("div");
    el.className = "person" + (selectedPersonId===p.id ? " selected" : "");
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.innerHTML = `<div class="photo">${initials(p)}</div>
      <div><div class="name">${p.first_name}<br>${p.last_name}</div>
      <div class="dates">${dateText(p)}</div><div class="tag">${p.living ? "chosen by person" : "admin photo"}</div></div>`;
    el.onclick = ()=>{ selectedPersonId=p.id; renderGraph(); renderProfile(); };
    g.appendChild(el);
  });
}
function dateText(p){
  if(p.id==="zoe") return "Partner";
  if(p.birth_year && p.death_year) return `${p.birth_year}–${p.death_year}`;
  if(p.birth_year) return `${p.birth_year}–`;
  return "";
}
function drawRelationships(g){
  // partner lines
  data.relationships.filter(r=>isPartnerType(r.type)).forEach(r=>{
    if(!positions[r.from] || !positions[r.to]) return;
    const a = positions[r.from], b = positions[r.to];
    const y = a.y + 60;
    const x1 = a.x < b.x ? a.x+190 : b.x+190;
    const x2 = a.x < b.x ? b.x : a.x;
    drawH(g, x1, y, x2-x1);
    drawRel(g, x1 + (x2-x1)/2 - 42, y-24, r.label || "Partners");
  });

  // group children by parent pair
  const childGroups = {};
  data.people.forEach(ch=>{
    const parents = data.relationships.filter(r=>r.type==="parent" && r.to===ch.id).map(r=>r.from).sort();
    if(parents.length){
      const key = parents.join("|");
      if(!childGroups[key]) childGroups[key]=[];
      childGroups[key].push(ch.id);
    }
  });

  Object.entries(childGroups).forEach(([key, children])=>{
    const parents = key.split("|").filter(id=>positions[id]);
    if(!parents.length) return;
    const parentCenterX = parents.reduce((s,id)=>s+centerX(id),0)/parents.length;
    const parentY = Math.max(...parents.map(id=>centerY(id)));
    const validChildren = children.filter(id=>positions[id]);
    if(!validChildren.length) return;
    const yBus = Math.min(...validChildren.map(id=>topY(id))) - 115;
    drawV(g, parentCenterX, parentY, yBus-parentY);
    const left = Math.min(...validChildren.map(id=>centerX(id)));
    const right = Math.max(...validChildren.map(id=>centerX(id)));
    drawH(g, left, yBus, right-left);
    validChildren.forEach(id=>drawV(g, centerX(id), yBus, topY(id)-yBus));
  });
}
function leftX(id){return positions[id].x}
function rightX(id){return positions[id].x+190}
function centerX(id){return positions[id].x+95}
function topY(id){return positions[id].y}
function centerY(id){return positions[id].y+60}
function drawH(g,x,y,w){ const e=document.createElement("div"); e.className="line h"; e.style.left=x+"px"; e.style.top=y+"px"; e.style.width=Math.max(0,w)+"px"; g.appendChild(e); }
function drawV(g,x,y,h){ const e=document.createElement("div"); e.className="line v"; e.style.left=x+"px"; e.style.top=y+"px"; e.style.height=Math.max(0,h)+"px"; g.appendChild(e); }
function drawRel(g,x,y,html){ const e=document.createElement("div"); e.className="rel"; e.style.left=x+"px"; e.style.top=y+"px"; e.innerHTML=html; g.appendChild(e); }

function renderProfile(){
  const p = person(selectedPersonId);
  const panel = document.getElementById("profile");
  if(!p){ panel.innerHTML = ""; return; }
  panel.innerHTML = `<div class="card"><h2>${fullName(p)}</h2>
    <p class="note">${p.living ? "Living" : "Deceased"}</p>
    <div class="row"><label>First</label><input value="${p.first_name||""}" oninput="editPerson('${p.id}','first_name',this.value)"></div>
    <div class="row"><label>Last</label><input value="${p.last_name||""}" oninput="editPerson('${p.id}','last_name',this.value)"></div>
    <div class="row"><label>Birth</label><input value="${p.birth_year||""}" oninput="editPerson('${p.id}','birth_year',this.value)"></div>
    <div class="row"><label>Death</label><input value="${p.death_year||""}" oninput="editPerson('${p.id}','death_year',this.value)"></div>
    <div class="row"><label>Bio</label><textarea oninput="editPerson('${p.id}','bio',this.value)">${p.bio||""}</textarea></div>
    </div>
    <div class="card"><h2>Relationships</h2><div class="relationship-list">${relationshipText(p.id)||"<p>No direct relationships yet.</p>"}</div></div>`;
}
function relationshipText(id){
  return data.relationships.filter(r=>r.from===id || r.to===id).map(r=>{
    const other = person(r.from===id ? r.to : r.from);
    if(!other) return "";
    let label = r.type;
    if(r.type==="parent") label = r.from===id ? "Parent of" : "Child of";
    if(isPartnerType(r.type)) label = "Partner";
    return `<p><strong>${label}</strong>: ${fullName(other)}</p>`;
  }).join("");
}
function editPerson(id, field, value){
  const p = person(id); if(!p) return;
  p[field] = value;
  save(); renderGraph();
}
function fitGraph(){
  const wrap=document.getElementById("graphWrap"), graph=document.getElementById("graph");
  scale=Math.min(wrap.clientWidth/2200, wrap.clientHeight/900, .78);
  graph.style.transform=`scale(${scale})`;
  wrap.scrollLeft=420*scale; wrap.scrollTop=120*scale;
}
function centreOn(id){
  autoLayout();
  const pos=positions[id]; if(!pos) return;
  const wrap=document.getElementById("graphWrap");
  wrap.scrollLeft=(pos.x*scale)-(wrap.clientWidth/2)+(95*scale);
  wrap.scrollTop=(pos.y*scale)-(wrap.clientHeight/2)+(60*scale);
}
function searchPerson(q){
  q = q.toLowerCase();
  const p = data.people.find(x=>fullName(x).toLowerCase().includes(q));
  if(p){ selectedPersonId=p.id; renderGraph(); renderProfile(); centreOn(p.id); }
}

/* Photo builder */
function renderFaces(){
  const wrap = document.getElementById("photoWrap");
  wrap.querySelectorAll(".face").forEach(f=>f.remove());
  data.faces.forEach(f=>{
    const el=document.createElement("div");
    el.className = "face" + (f.person_id ? " named" : "") + (selectedFaceId===f.id ? " selected" : "");
    el.style.left=f.x+"px"; el.style.top=f.y+"px"; el.style.width=f.w+"px"; el.style.height=f.h+"px";
    el.innerHTML = `<span>${f.label || "Face"}</span>`;
    el.onclick = (ev)=>{ ev.stopPropagation(); selectedFaceId=f.id; renderFaces(); renderFaceEditor(); };
    wrap.appendChild(el);
  });
  wrap.onclick = ev=>{
    if(!addFaceNextClick) return;
    const rect = wrap.getBoundingClientRect();
    const img = document.getElementById("mainPhoto");
    const imgRect = img.getBoundingClientRect();
    const x = ev.clientX - imgRect.left + wrap.scrollLeft;
    const y = ev.clientY - imgRect.top + wrap.scrollTop;
    const f = {id:uid("face"), x:x-30, y:y-40, w:60, h:80, label:"Unnamed"};
    data.faces.push(f);
    selectedFaceId = f.id;
    addFaceNextClick = false;
    save(); renderFaces(); renderFaceEditor(); updatePhotoPanel();
  };
}
function addFaceMode(){
  addFaceNextClick = true;
  alert("Now click the centre of a face in the photo.");
}
function clearFaceSelection(){
  selectedFaceId = null; renderFaces(); renderFaceEditor();
}
function renderFaceEditor(){
  const f = data.faces.find(x=>x.id===selectedFaceId);
  const el = document.getElementById("faceEditor");
  if(!f){ el.innerHTML="<h2>Selected face</h2><p>Click a face box, or add one first.</p>"; return; }
  const currentPerson = f.person_id ? person(f.person_id) : null;
  el.innerHTML = `<h2>Selected face</h2>
    <div class="row"><label>Name</label><input id="faceName" value="${currentPerson?fullName(currentPerson):""}" placeholder="Full name"></div>
    <button class="primary" onclick="saveFaceName()">Save name</button>
    <button onclick="deleteFace()">Delete face</button>
    <p>This creates or links a person record, then the graph can use them.</p>`;
}
function saveFaceName(){
  const f = data.faces.find(x=>x.id===selectedFaceId);
  const name = document.getElementById("faceName").value.trim();
  if(!f || !name) return;
  let p = data.people.find(p=>fullName(p).toLowerCase()===name.toLowerCase());
  if(!p){
    const parts=name.split(" ");
    p={id:slug(name), first_name:parts[0]||"", last_name:parts.slice(1).join(" ")||"", birth_year:"", death_year:"", living:true, bio:"Created from photo."};
    data.people.push(p);
  }
  f.person_id = p.id;
  f.label = fullName(p);
  save(); renderFaces(); renderFaceEditor(); updatePhotoPanel(); renderGraph(); renderProfile();
}
function deleteFace(){
  data.faces = data.faces.filter(f=>f.id!==selectedFaceId);
  selectedFaceId=null; save(); renderFaces(); renderFaceEditor(); updatePhotoPanel();
}
function slug(name){
  return name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || uid("person");
}
function updatePhotoPanel(){
  document.getElementById("faceCount").textContent=data.faces.length;
  document.getElementById("namedFaceCount").textContent=data.faces.filter(f=>f.person_id).length;
  document.getElementById("relationshipCount").textContent=data.relationships.length;
  const peopleInPhoto = data.faces.filter(f=>f.person_id).map(f=>person(f.person_id)).filter(Boolean);
  document.getElementById("photoPeople").innerHTML = [...new Map(peopleInPhoto.map(p=>[p.id,p])).values()].map(p=>`<span class="pill">${fullName(p)}</span>`).join("") || "<p>No named people yet.</p>";
  refreshRelationshipSelects();
}
function refreshRelationshipSelects(){
  const opts = data.people.map(p=>`<option value="${p.id}">${fullName(p)}</option>`).join("");
  document.getElementById("relA").innerHTML=opts;
  document.getElementById("relB").innerHTML=opts;
}
function addRelationshipFromForm(){
  const a=document.getElementById("relA").value, b=document.getElementById("relB").value;
  let type=document.getElementById("relType").value;
  if(!a || !b || a===b) return alert("Choose two different people.");
  if(type==="mother" || type==="father") type="parent";
  if(type==="child"){
    data.relationships.push({id:uid("rel"), from:b, to:a, type:"parent", label:"Parent"});
  } else {
    data.relationships.push({id:uid("rel"), from:a, to:b, type:type, label:type==="partner"?"Partners":"Relationship"});
  }
  save(); updatePhotoPanel(); renderGraph(); renderProfile();
}
function loadPhoto(ev){
  const file = ev.target.files?.[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById("mainPhoto").src = e.target.result;
    data.faces = [];
    save(); renderFaces(); updatePhotoPanel();
  };
  reader.readAsDataURL(file);
}
function useSamplePhoto(){
  document.getElementById("mainPhoto").src = "birthday-photo.jpg";
  save(); renderFaces(); updatePhotoPanel();
}

/* People page */
function renderPeopleList(){
  const list = document.getElementById("peopleList");
  list.innerHTML = data.people.map(p=>`<div class="people-card"><strong>${fullName(p)}</strong><p class="note">${dateText(p)||"No dates yet"}</p><button onclick="selectedPersonId='${p.id}';showPage('graph')">Open in graph</button></div>`).join("");
}
function addPersonPrompt(){
  const name = prompt("Full name:");
  if(!name) return;
  const parts=name.trim().split(" ");
  const p={id:slug(name), first_name:parts[0]||"", last_name:parts.slice(1).join(" ")||"", birth_year:"", death_year:"", living:true, bio:""};
  if(data.people.some(x=>x.id===p.id)) return alert("That person already exists.");
  data.people.push(p); selectedPersonId=p.id; save(); renderGraph(); renderProfile(); showPage("graph");
}

/* Import / export */
function exportData(){
  save();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="family-graph-data.json";
  a.click();
}
function importData(ev){
  const file=ev.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      data=JSON.parse(e.target.result);
      save();
      selectedPersonId=data.people[0]?.id || "";
      alert("Imported.");
      showPage("graph");
    }catch(err){ alert("Could not import JSON."); }
  };
  reader.readAsText(file);
}
function resetDemo(){
  if(!confirm("Reset this browser to the starter demo?")) return;
  data=structuredClone(defaultData);
  selectedPersonId="julian";
  save();
  renderFaces(); updatePhotoPanel(); showPage("graph");
}

save();
autoLayout();
renderGraph();
renderProfile();
renderFaces();
updatePhotoPanel();
fitGraph();
