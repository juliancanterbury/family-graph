const KEY="familyGraphCleanPhotoMvp";
let data = load();
let selectedFaceId = null;
let currentRel = "mother";

function load(){
  try { return JSON.parse(localStorage.getItem(KEY)) || blank(); }
  catch { return blank(); }
}
function blank(){
  return {people:[], relationships:[], faces:[], photoSrc:""};
}
function save(){ localStorage.setItem(KEY, JSON.stringify(data)); }
function uid(p="id"){ return p+"_"+Math.random().toString(36).slice(2,10); }
function slug(name){ return name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || uid("person"); }
function fullName(p){ return `${p.first_name||""} ${p.last_name||""}`.trim(); }
function person(id){ return data.people.find(p=>p.id===id); }

function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));
  document.getElementById(page+"Page").classList.remove("hidden");
  if(page==="photo"){ renderPhoto(); updateSide(); }
  if(page==="graph"){ renderGraph(); setTimeout(fitGraph,0); }
  if(page==="people"){ renderPeople(); }
}

function loadPhoto(ev){
  const file=ev.target.files?.[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=e=>{
    data.photoSrc=e.target.result;
    data.faces=[];
    selectedFaceId=null;
    save(); renderPhoto(); updateSide();
  };
  reader.readAsDataURL(file);
}
function useSample(){
  data.photoSrc="sample-photo.jpg";
  data.faces=[];
  selectedFaceId=null;
  save(); renderPhoto(); updateSide();
}
function renderPhoto(){
  const img=document.getElementById("mainPhoto");
  img.src=data.photoSrc || "";
  const canvas=document.getElementById("photoCanvas");
  canvas.querySelectorAll(".face").forEach(e=>e.remove());
  data.faces.forEach(f=>canvas.appendChild(faceElement(f)));
}
function addFaceBox(){
  if(!data.photoSrc) return alert("Choose a photo first.");
  const f={id:uid("face"),x:200,y:160,w:70,h:90,label:"Unnamed",person_id:null};
  data.faces.push(f);
  selectedFaceId=f.id;
  save(); renderPhoto(); renderFaceEditor(); updateSide();
}
function faceElement(f){
  const el=document.createElement("div");
  el.className="face"+(f.person_id?" named":"")+(f.id===selectedFaceId?" selected":"");
  el.style.left=f.x+"px"; el.style.top=f.y+"px"; el.style.width=f.w+"px"; el.style.height=f.h+"px";
  el.innerHTML=`<span>${f.label||"Unnamed"}</span><div class="handle"></div>`;
  el.addEventListener("pointerdown",ev=>startDrag(ev,f.id));
  el.querySelector(".handle").addEventListener("pointerdown",ev=>startResize(ev,f.id));
  el.addEventListener("click",ev=>{ev.stopPropagation();selectedFaceId=f.id;renderPhoto();renderFaceEditor();});
  return el;
}
let dragState=null;
function startDrag(ev,id){
  if(ev.target.classList.contains("handle")) return;
  ev.preventDefault(); ev.stopPropagation();
  selectedFaceId=id;
  const f=data.faces.find(x=>x.id===id);
  dragState={mode:"drag",id,startX:ev.clientX,startY:ev.clientY,x:f.x,y:f.y};
  ev.currentTarget.setPointerCapture(ev.pointerId);
  window.addEventListener("pointermove",onPointerMove);
  window.addEventListener("pointerup",endPointer);
  renderPhoto(); renderFaceEditor();
}
function startResize(ev,id){
  ev.preventDefault(); ev.stopPropagation();
  selectedFaceId=id;
  const f=data.faces.find(x=>x.id===id);
  dragState={mode:"resize",id,startX:ev.clientX,startY:ev.clientY,w:f.w,h:f.h};
  ev.currentTarget.parentElement.setPointerCapture(ev.pointerId);
  window.addEventListener("pointermove",onPointerMove);
  window.addEventListener("pointerup",endPointer);
}
function onPointerMove(ev){
  if(!dragState) return;
  const f=data.faces.find(x=>x.id===dragState.id); if(!f) return;
  if(dragState.mode==="drag"){
    f.x=Math.max(0, dragState.x + ev.clientX-dragState.startX);
    f.y=Math.max(0, dragState.y + ev.clientY-dragState.startY);
  }else{
    f.w=Math.max(30, dragState.w + ev.clientX-dragState.startX);
    f.h=Math.max(30, dragState.h + ev.clientY-dragState.startY);
  }
  const el=document.querySelector(".face.selected");
  if(el){ el.style.left=f.x+"px"; el.style.top=f.y+"px"; el.style.width=f.w+"px"; el.style.height=f.h+"px"; }
}
function endPointer(){
  dragState=null; save();
  window.removeEventListener("pointermove",onPointerMove);
  window.removeEventListener("pointerup",endPointer);
}
function deleteSelectedFace(){
  if(!selectedFaceId) return;
  data.faces=data.faces.filter(f=>f.id!==selectedFaceId);
  selectedFaceId=null; save(); renderPhoto(); renderFaceEditor(); updateSide();
}
function renderFaceEditor(){
  const wrap=document.getElementById("faceEditor");
  const f=data.faces.find(x=>x.id===selectedFaceId);
  if(!f){ wrap.innerHTML="<p>Select or add a face box.</p>"; return; }
  const p=f.person_id ? person(f.person_id) : null;
  wrap.innerHTML=`<div class="row"><label>Name</label><input id="faceName" value="${p?fullName(p):""}" placeholder="Full name"></div>
  <button class="primary" onclick="saveFaceName()">Save name</button>
  <p class="small">Move/resize the box first, then save the name.</p>`;
}
function saveFaceName(){
  const f=data.faces.find(x=>x.id===selectedFaceId);
  const name=document.getElementById("faceName").value.trim();
  if(!f || !name) return;
  let p=data.people.find(p=>fullName(p).toLowerCase()===name.toLowerCase());
  if(!p){
    const parts=name.split(" ");
    p={id:slug(name),first_name:parts[0]||"",last_name:parts.slice(1).join(" ")||"",birth_year:"",death_year:""};
    data.people.push(p);
  }
  f.person_id=p.id; f.label=fullName(p);
  save(); renderPhoto(); renderFaceEditor(); updateSide(); renderPeople();
}
function setRel(type,btn){
  currentRel=type; document.getElementById("relType").value=type;
  document.querySelectorAll(".relationship-buttons button").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
}
function saveRelationship(){
  const a=document.getElementById("relA").value, b=document.getElementById("relB").value;
  if(!a||!b||a===b) return alert("Choose two different people.");
  let rel;
  if(currentRel==="mother"||currentRel==="father"||currentRel==="parent"){
    rel={id:uid("rel"),from:a,to:b,type:"parent",label:currentRel};
  }else if(currentRel==="child"){
    rel={id:uid("rel"),from:b,to:a,type:"parent",label:"parent"};
  }else{
    rel={id:uid("rel"),from:a,to:b,type:"partner",label:"partner"};
  }
  data.relationships.push(rel);
  save(); updateSide(); alert("Relationship saved.");
}
function updateSide(){
  document.getElementById("faceCount").textContent=data.faces.length;
  document.getElementById("peopleCount").textContent=data.people.length;
  document.getElementById("relCount").textContent=data.relationships.length;
  document.getElementById("peoplePills").innerHTML=data.people.map(p=>`<span class="pill">${fullName(p)}</span>`).join("") || "<p class='small'>No people yet.</p>";
  const opts=data.people.map(p=>`<option value="${p.id}">${fullName(p)}</option>`).join("");
  document.getElementById("relA").innerHTML=opts;
  document.getElementById("relB").innerHTML=opts;
  renderFaceEditor();
}

/* graph - simple first-pass layout */
function renderGraph(){
  const g=document.getElementById("graph"); g.innerHTML="";
  const pos={};
  let topX=500, childX=350, lowerX=350;
  data.people.forEach(p=>{
    const hasParents=data.relationships.some(r=>r.type==="parent"&&r.to===p.id);
    const isParent=data.relationships.some(r=>r.type==="parent"&&r.from===p.id);
    if(isParent && !hasParents){ pos[p.id]={x:topX,y:180}; topX+=280; }
  });
  data.people.forEach(p=>{
    if(!pos[p.id]){
      const hasParents=data.relationships.some(r=>r.type==="parent"&&r.to===p.id);
      pos[p.id]={x:hasParents?childX:lowerX,y:hasParents?560:900};
      if(hasParents) childX+=280; else lowerX+=280;
    }
  });
  data.relationships.forEach(r=>{
    if(r.type==="parent" && pos[r.from]&&pos[r.to]){
      drawV(g,pos[r.from].x+90,pos[r.from].y+90,pos[r.to].y-pos[r.from].y-90);
      drawH(g,pos[r.from].x+90,pos[r.to].y-30,pos[r.to].x+90-(pos[r.from].x+90));
      drawV(g,pos[r.to].x+90,pos[r.to].y-30,30);
    }
    if(r.type==="partner" && pos[r.from]&&pos[r.to]){
      drawH(g,pos[r.from].x+180,pos[r.from].y+45,pos[r.to].x-(pos[r.from].x+180));
    }
  });
  data.people.forEach(p=>{
    const e=document.createElement("div"); e.className="node"; e.style.left=pos[p.id].x+"px"; e.style.top=pos[p.id].y+"px";
    e.innerHTML=`<strong>${fullName(p)}</strong>${p.birth_year||""}`;
    g.appendChild(e);
  });
}
function drawH(g,x,y,w){const e=document.createElement("div");e.className="line h";e.style.left=x+"px";e.style.top=y+"px";e.style.width=Math.abs(w)+"px";if(w<0)e.style.left=(x+w)+"px";g.appendChild(e);}
function drawV(g,x,y,h){const e=document.createElement("div");e.className="line v";e.style.left=x+"px";e.style.top=y+"px";e.style.height=Math.max(0,h)+"px";g.appendChild(e);}
function fitGraph(){const wrap=document.getElementById("graphWrap");wrap.scrollLeft=300;wrap.scrollTop=100;}
function renderPeople(){
  const list=document.getElementById("peopleList");
  list.innerHTML=data.people.map(p=>`<div class="people-card"><strong>${fullName(p)}</strong><p>${p.birth_year||"No dates yet"}</p></div>`).join("") || "<p>No people yet.</p>";
}
function clearAll(){
  if(!confirm("Clear all test data?")) return;
  data=blank(); selectedFaceId=null; save(); renderPhoto(); updateSide(); renderGraph(); renderPeople(); showPage("photo");
}
renderPhoto(); updateSide(); renderPeople();
if(!data.photoSrc) showPage("photo");
