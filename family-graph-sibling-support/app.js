const KEY="familyGraphMemoryFix";
let data=load(), selectedFaceId=null, currentRel="mother", graphScale=1;
function blank(){return{people:[],relationships:[],faces:[],photoSrc:""}}
function load(){try{const v=localStorage.getItem(KEY)||localStorage.getItem("familyGraphPhotoCardsZoom")||localStorage.getItem("familyGraphValidationMvp")||localStorage.getItem("familyGraphCleanPhotoMvp");return JSON.parse(v)||blank()}catch{return blank()}}
function save(){localStorage.setItem(KEY,JSON.stringify(data));markSaved()}
function markSaved(){const el=document.getElementById("saveStatus");if(el){const now=new Date();el.textContent="Saved "+now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}}
function uid(p="id"){return p+"_"+Math.random().toString(36).slice(2,10)}
function slug(n){return n.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")||uid("person")}
function fullName(p){return `${p.first_name||""} ${p.last_name||""}`.trim()}
function person(id){return data.people.find(p=>p.id===id)}
function initials(p){return `${p.first_name?.[0]||""}${p.last_name?.[0]||""}`.toUpperCase()}
function showPage(page){document.querySelectorAll(".page").forEach(p=>p.classList.add("hidden"));document.getElementById(page+"Page").classList.remove("hidden");if(page==="photo"){renderPhoto();updateSide()} if(page==="graph"){renderGraph();setTimeout(fitGraph,0)} if(page==="people"){renderPeople()}}
function loadPhoto(ev){const file=ev.target.files?.[0];if(!file)return;const r=new FileReader();r.onload=e=>{if(data.faces.length&&!confirm("Changing to a different photo will clear the existing face boxes for this photo. Continue?")){ev.target.value="";return}data.photoSrc=e.target.result;data.photoKind="uploaded";data.faces=[];selectedFaceId=null;save();renderPhoto();updateSide()};r.readAsDataURL(file)}
function useSample(){data.photoSrc="sample-photo.jpg";data.photoKind="sample";save();renderPhoto();updateSide()}
function renderPhoto(){markSaved();document.getElementById("mainPhoto").src=data.photoSrc||"";const canvas=document.getElementById("photoCanvas");canvas.querySelectorAll(".face").forEach(e=>e.remove());data.faces.forEach(f=>canvas.appendChild(faceElement(f)))}
function addFaceBox(){if(!data.photoSrc)return alert("Choose a photo first.");const f={id:uid("face"),x:200,y:160,w:70,h:90,label:"Unnamed",person_id:null};data.faces.push(f);selectedFaceId=f.id;save();renderPhoto();renderFaceEditor();updateSide()}
function faceElement(f){const el=document.createElement("div");el.className="face"+(f.person_id?" named":"")+(f.id===selectedFaceId?" selected":"");el.style.left=f.x+"px";el.style.top=f.y+"px";el.style.width=f.w+"px";el.style.height=f.h+"px";el.innerHTML=`<span>${f.label||"Unnamed"}</span><div class="handle"></div>`;el.addEventListener("pointerdown",ev=>startDrag(ev,f.id));el.querySelector(".handle").addEventListener("pointerdown",ev=>startResize(ev,f.id));el.addEventListener("click",ev=>{ev.stopPropagation();selectedFaceId=f.id;renderPhoto();renderFaceEditor()});return el}
let dragState=null;
function startDrag(ev,id){if(ev.target.classList.contains("handle"))return;ev.preventDefault();ev.stopPropagation();selectedFaceId=id;const f=data.faces.find(x=>x.id===id);dragState={mode:"drag",id,startX:ev.clientX,startY:ev.clientY,x:f.x,y:f.y};ev.currentTarget.setPointerCapture(ev.pointerId);window.addEventListener("pointermove",onPointerMove);window.addEventListener("pointerup",endPointer);renderPhoto();renderFaceEditor()}
function startResize(ev,id){ev.preventDefault();ev.stopPropagation();selectedFaceId=id;const f=data.faces.find(x=>x.id===id);dragState={mode:"resize",id,startX:ev.clientX,startY:ev.clientY,w:f.w,h:f.h};ev.currentTarget.parentElement.setPointerCapture(ev.pointerId);window.addEventListener("pointermove",onPointerMove);window.addEventListener("pointerup",endPointer)}
function onPointerMove(ev){if(!dragState)return;const f=data.faces.find(x=>x.id===dragState.id);if(!f)return;if(dragState.mode==="drag"){f.x=Math.max(0,dragState.x+ev.clientX-dragState.startX);f.y=Math.max(0,dragState.y+ev.clientY-dragState.startY)}else{f.w=Math.max(30,dragState.w+ev.clientX-dragState.startX);f.h=Math.max(30,dragState.h+ev.clientY-dragState.startY)}const el=document.querySelector(".face.selected");if(el){el.style.left=f.x+"px";el.style.top=f.y+"px";el.style.width=f.w+"px";el.style.height=f.h+"px"}}
function endPointer(){dragState=null;save();window.removeEventListener("pointermove",onPointerMove);window.removeEventListener("pointerup",endPointer)}
function deleteSelectedFace(){if(!selectedFaceId)return;data.faces=data.faces.filter(f=>f.id!==selectedFaceId);selectedFaceId=null;save();renderPhoto();renderFaceEditor();updateSide()}
function renderFaceEditor(){const wrap=document.getElementById("faceEditor"),f=data.faces.find(x=>x.id===selectedFaceId);if(!f){wrap.innerHTML="<p>Select or add a face box.</p>";return}const p=f.person_id?person(f.person_id):null;wrap.innerHTML=`<div class="row"><label>Name</label><input id="faceName" value="${p?fullName(p):""}" placeholder="Full name"></div><button class="primary" onclick="saveFaceName()">Save name</button><p class="small">This face crop becomes the temporary profile image.</p>`}
function saveFaceName(){const f=data.faces.find(x=>x.id===selectedFaceId),name=document.getElementById("faceName").value.trim();if(!f||!name)return;let p=data.people.find(p=>fullName(p).toLowerCase()===name.toLowerCase());if(!p){const parts=name.split(" ");p={id:slug(name),first_name:parts[0]||"",last_name:parts.slice(1).join(" ")||"",birth_year:"",death_year:""};data.people.push(p)}f.person_id=p.id;f.label=fullName(p);save();renderPhoto();renderFaceEditor();updateSide();renderPeople()}
function faceForPerson(id){return data.faces.find(f=>f.person_id===id)}
function cropStyle(f,size=92){if(!f||!data.photoSrc)return "";const scale=size/Math.max(f.w,f.h);const x=-(f.x*scale)+(size-f.w*scale)/2;const y=-(f.y*scale)+(size-f.h*scale)/2;return `background-image:url('${data.photoSrc}');background-size:${1200*scale}px auto;background-position:${x}px ${y}px;background-repeat:no-repeat;`}
function photoHtml(p){const f=faceForPerson(p.id);if(f&&data.photoSrc)return `<div class="node-photo" style="${cropStyle(f)}"></div>`;return `<div class="node-photo">${initials(p)}</div>`}
function setRel(type,btn){currentRel=type;document.getElementById("relType").value=type;document.querySelectorAll(".relationship-buttons button").forEach(b=>b.classList.remove("active"));btn.classList.add("active");previewRelationship()}
function relationshipCandidate(){const a=document.getElementById("relA").value,b=document.getElementById("relB").value;let type=currentRel,from=a,to=b,label=type;if(["mother","father","parent"].includes(type)){type="parent";label=currentRel}else if(type==="child"){type="parent";from=b;to=a;label="parent"}else if(type==="partner"){type="partner";label="partner"}
else if(type==="sibling"){type="sibling";label="sibling"}
return{from,to,type,label,raw:currentRel}}
function parentsOf(id){return data.relationships.filter(r=>r.type==="parent"&&r.to===id).map(r=>r.from)}
function isAncestor(ancestor,desc,seen=new Set()){if(seen.has(desc))return false;seen.add(desc);const ps=parentsOf(desc);if(ps.includes(ancestor))return true;return ps.some(p=>isAncestor(ancestor,p,seen))}
function hasPartner(a,b){return data.relationships.some(r=>r.type==="partner"&&((r.from===a&&r.to===b)||(r.from===b&&r.to===a)))}
function validationFor(c){const issues=[],fatal=[];if(!c.from||!c.to)fatal.push("Choose two people.");if(c.from===c.to)fatal.push("A person cannot be related to themselves.");const dup=data.relationships.some(r=>r.from===c.from&&r.to===c.to&&r.type===c.type),rev=data.relationships.some(r=>r.type==="partner"&&c.type==="partner"&&r.from===c.to&&r.to===c.from);if(dup||rev)fatal.push("This relationship already exists.");if(c.type==="parent"){if(isAncestor(c.to,c.from))fatal.push("This would create a loop: someone would become their own ancestor.");const ps=data.relationships.filter(r=>r.type==="parent"&&r.to===c.to);if(ps.length>=2&&!ps.some(r=>r.from===c.from))issues.push("This person already has two parents recorded. Check carefully.");if(hasPartner(c.from,c.to))fatal.push("A partner cannot also be recorded as a parent of the same person.")}if(c.type==="partner"&&(isAncestor(c.from,c.to)||isAncestor(c.to,c.from)))fatal.push("A direct ancestor/descendant should not also be a partner.");
if(c.type==="sibling"){
  const reverse=data.relationships.some(r=>r.type==="sibling"&&r.from===c.to&&r.to===c.from);
  if(reverse) fatal.push("This sibling relationship already exists.");
  if(isAncestor(c.from,c.to)||isAncestor(c.to,c.from)) fatal.push("A direct ancestor/descendant should not also be a sibling.");
}
return{fatal,issues}}
function previewRelationship(){const box=document.getElementById("relationshipWarning"),v=validationFor(relationshipCandidate());if(!v.fatal.length&&!v.issues.length){box.classList.add("hidden");return}box.classList.remove("hidden");box.classList.toggle("bad",v.fatal.length>0);box.innerHTML=[...v.fatal,...v.issues].join("<br>")}
function saveRelationship(){const c=relationshipCandidate(),v=validationFor(c);if(v.fatal.length){previewRelationship();return}if(v.issues.length&&!confirm(v.issues.join("\\n")+"\\n\\nSave anyway?"))return;data.relationships.push({id:uid("rel"),from:c.from,to:c.to,type:c.type,label:c.label});save();updateSide();alert("Relationship saved.")}
function relationshipIssues(){const out=[];data.relationships.forEach(r=>{const v=validationFor({...r,raw:r.label});const msgs=[...v.fatal,...v.issues].filter(m=>!m.includes("already exists"));if(msgs.length)out.push({id:r.id,msgs})});return out}
function relationshipSentence(r){const a=person(r.from),b=person(r.to);if(!a||!b)return"Missing person";if(r.type==="parent")return`${fullName(a)} is ${r.label||"parent"} of ${fullName(b)}`;if(r.type==="partner")return`${fullName(a)} is partner of ${fullName(b)}`;
if(r.type==="sibling")return`${fullName(a)} is sibling of ${fullName(b)}`;
return`${fullName(a)} → ${fullName(b)}`}
function deleteRelationship(id){data.relationships=data.relationships.filter(r=>r.id!==id);save();updateSide();renderGraph()}
function updateRelationshipList(){const issues=relationshipIssues();document.getElementById("issueCount").textContent=issues.length;document.getElementById("relationshipList").innerHTML=data.relationships.map(r=>{const issue=issues.find(i=>i.id===r.id);return`<div class="rel-row ${issue?'issue':''}"><div><strong>${relationshipSentence(r)}</strong>${issue?`<div class="meta">⚠ ${issue.msgs.join("; ")}</div>`:""}</div><button class="danger" onclick="deleteRelationship('${r.id}')">Delete</button></div>`}).join("")||"<p class='small'>No relationships yet.</p>"}
function updateSide(){document.getElementById("faceCount").textContent=data.faces.length;document.getElementById("peopleCount").textContent=data.people.length;document.getElementById("relCount").textContent=data.relationships.length;document.getElementById("peoplePills").innerHTML=data.people.map(p=>`<span class="pill">${fullName(p)}</span>`).join("")||"<p class='small'>No people yet.</p>";const opts=data.people.map(p=>`<option value="${p.id}">${fullName(p)}</option>`).join("");document.getElementById("relA").innerHTML=opts;document.getElementById("relB").innerHTML=opts;renderFaceEditor();updateRelationshipList();previewRelationship()}



function partnerOf(id){
  const r=data.relationships.find(r=>r.type==="partner"&&(r.from===id||r.to===id));
  if(!r) return null;
  return r.from===id ? r.to : r.from;
}
function parentPairs(){
  const byChild={};
  data.relationships.filter(r=>r.type==="parent").forEach(r=>{
    (byChild[r.to] ||= []).push(r.from);
  });
  const groups={};
  Object.entries(byChild).forEach(([child,parents])=>{
    const key=parents.slice().sort().join("|");
    if(!groups[key]) groups[key]={parents:parents.slice().sort(),children:[]};
    groups[key].children.push(child);
  });
  return Object.values(groups);
}

function siblingLinks(){
  return data.relationships.filter(r=>r.type==="sibling");
}
function siblingGroupFor(id){
  const set=new Set([id]);
  let changed=true;
  while(changed){
    changed=false;
    siblingLinks().forEach(r=>{
      if(set.has(r.from)&&!set.has(r.to)){set.add(r.to);changed=true;}
      if(set.has(r.to)&&!set.has(r.from)){set.add(r.from);changed=true;}
    });
  }
  return [...set];
}

function layoutPositions(){
  const pos={};
  const placed=new Set();
  const pairs=parentPairs();

  let familyX=360;

  // Parent/child family units
  pairs.forEach(group=>{
    const parents=group.parents;
    const children=group.children;
    const yParents=180;
    const yChildren=610;

    parents.forEach((p,i)=>{
      if(!pos[p]) pos[p]={x:familyX+i*245,y:yParents};
      placed.add(p);
    });

    const centre = parents.length
      ? parents.reduce((s,p)=>s+(pos[p]?.x||familyX),0)/parents.length
      : familyX;

    const startX = centre - ((children.length-1)*330)/2;
    children.forEach((child,i)=>{
      if(!pos[child]) pos[child]={x:startX+i*330,y:yChildren};
      placed.add(child);
    });

    familyX += Math.max(680, children.length*330 + 260);
  });

  // Siblings: place unplaced siblings beside the known sibling, same generation.
  siblingLinks().forEach(r=>{
    if(pos[r.from] && !pos[r.to]) pos[r.to]={x:pos[r.from].x+245,y:pos[r.from].y};
    if(pos[r.to] && !pos[r.from]) pos[r.from]={x:pos[r.to].x+245,y:pos[r.to].y};
  });

  // Partners: place beside partner, but do not treat as children.
  data.relationships.filter(r=>r.type==="partner").forEach(r=>{
    const a=r.from,b=r.to;
    if(pos[a] && !pos[b]) pos[b]={x:pos[a].x+245,y:pos[a].y};
    if(pos[b] && !pos[a]) pos[a]={x:pos[b].x-245,y:pos[b].y};
    if(pos[a] && pos[b]){
      pos[b].y=pos[a].y;
      if(Math.abs(pos[b].x-pos[a].x)<220) pos[b].x=pos[a].x+245;
    }
  });

  // Space sibling clusters
  const usedRows={};
  Object.entries(pos).forEach(([id,xy])=>{
    const key=xy.y;
    (usedRows[key] ||= []).push(id);
  });
  Object.values(usedRows).forEach(ids=>{
    ids.sort((a,b)=>pos[a].x-pos[b].x);
    for(let i=1;i<ids.length;i++){
      if(pos[ids[i]].x - pos[ids[i-1]].x < 220){
        pos[ids[i]].x = pos[ids[i-1]].x + 245;
      }
    }
  });

  // Unconnected people
  let x=360;
  data.people.forEach(p=>{
    if(!pos[p.id]){
      pos[p.id]={x:x,y:1040};
      x+=330;
    }
  });

  return pos;
}

function graphIssues(){
  const issues=[];
  data.relationships.forEach(r=>{
    const a=person(r.from), b=person(r.to);
    if(!a||!b) return;
    if(r.type==="partner" && (isAncestor(r.from,r.to)||isAncestor(r.to,r.from))){
      issues.push(`${fullName(a)} is both partner and direct ancestor/descendant of ${fullName(b)}.`);
    }
    if(r.type==="parent" && hasPartner(r.from,r.to)){
      issues.push(`${fullName(a)} is both partner and parent of ${fullName(b)}.`);
    }
  });

  // Specific visual confusion detector: a spouse/partner should not also appear in same parent-child chain.
  data.relationships.filter(r=>r.type==="partner").forEach(r=>{
    if(isAncestor(r.from,r.to)||isAncestor(r.to,r.from)){
      const a=person(r.from), b=person(r.to);
      if(a&&b) issues.push(`Check ${fullName(a)} ↔ ${fullName(b)}: partner relationship conflicts with parent/child chain.`);
    }
  });
  return [...new Set(issues)];
}

function renderGraph(){
  const g=document.getElementById("graph");
  g.innerHTML='<div class="graph-inner" id="graphInner"></div>';
  const inner=document.getElementById("graphInner");
  const issues=[...relationshipIssues().map(i=>i.msgs.join("; ")),...graphIssues()];
  document.getElementById("graphNotice").textContent=issues.length?`${issues.length} relationship issue(s) need review`:"";
  const pos=layoutPositions();

  // Draw partner lines first
  data.relationships.filter(r=>r.type==="partner").forEach(r=>{
    if(!pos[r.from]||!pos[r.to])return;
    const y=pos[r.from].y+78;
    drawH(inner,pos[r.from].x+178,y,pos[r.to].x-(pos[r.from].x+178));
    label(inner,pos[r.from].x+188,y-25,"partner");
  });

  // Draw sibling lines
  data.relationships.filter(r=>r.type==="sibling").forEach(r=>{
    if(!pos[r.from]||!pos[r.to])return;
    const y=pos[r.from].y+78;
    drawH(inner,pos[r.from].x+178,y,pos[r.to].x-(pos[r.from].x+178));
    label(inner,pos[r.from].x+188,y-25,"sibling");
  });

  // Draw parent groups as one family bus per parent set
  parentPairs().forEach(group=>{
    const parents=group.parents.filter(id=>pos[id]);
    const children=group.children.filter(id=>pos[id]);
    if(!parents.length||!children.length)return;

    const parentCentre=parents.reduce((s,id)=>s+pos[id].x+89,0)/parents.length;
    const parentBottom=Math.max(...parents.map(id=>pos[id].y+156));
    const childTop=Math.min(...children.map(id=>pos[id].y));
    const busY=(parentBottom+childTop)/2;

    // parent couple to bus
    drawV(inner,parentCentre,parentBottom,busY-parentBottom);

    // child bus
    const left=Math.min(...children.map(id=>pos[id].x+89));
    const right=Math.max(...children.map(id=>pos[id].x+89));
    drawH(inner,left,busY,right-left);

    children.forEach(id=>drawV(inner,pos[id].x+89,busY,pos[id].y-busY));
  });

  data.people.forEach(p=>{
    const xy=pos[p.id]||{x:100,y:100};
    const e=document.createElement("div");
    e.className="node";
    e.style.left=xy.x+"px";
    e.style.top=xy.y+"px";
    e.innerHTML=`${photoHtml(p)}<strong>${fullName(p)}</strong><span class="small">${p.birth_year||""}</span>`;
    inner.appendChild(e);
  });
  applyGraphZoom();
}

function drawH(g,x,y,w){const e=document.createElement("div");e.className="line h";if(w<0){e.style.left=x+w+"px";e.style.width=-w+"px"}else{e.style.left=x+"px";e.style.width=w+"px"}e.style.top=y+"px";g.appendChild(e)}
function drawV(g,x,y,h){const e=document.createElement("div");e.className="line v";e.style.left=x+"px";e.style.top=y+"px";e.style.height=Math.max(0,h)+"px";g.appendChild(e)}
function label(g,x,y,text){const e=document.createElement("div");e.className="rel-label";e.style.left=x+"px";e.style.top=y+"px";e.textContent=text;g.appendChild(e)}
function applyGraphZoom(){const inner=document.getElementById("graphInner");if(inner)inner.style.transform=`scale(${graphScale})`;const zl=document.getElementById("zoomLabel");if(zl)zl.textContent=Math.round(graphScale*100)+"%"}
function zoomGraph(delta){const wrap=document.getElementById("graphWrap");const old=graphScale;const cx=wrap.scrollLeft+wrap.clientWidth/2,cy=wrap.scrollTop+wrap.clientHeight/2;graphScale=Math.max(.25,Math.min(2.2,graphScale+delta));applyGraphZoom();wrap.scrollLeft=(cx/old)*graphScale-wrap.clientWidth/2;wrap.scrollTop=(cy/old)*graphScale-wrap.clientHeight/2}
function resetGraphZoom(){graphScale=1;applyGraphZoom()}
function fitGraph(){const wrap=document.getElementById("graphWrap");graphScale=.72;applyGraphZoom();wrap.scrollLeft=170;wrap.scrollTop=80}
function renderPeople(){document.getElementById("peopleList").innerHTML=data.people.map(p=>`<div class="people-card">${photoHtml(p)}<strong>${fullName(p)}</strong><p>${p.birth_year||"No dates yet"}</p></div>`).join("")||"<p>No people yet.</p>"}
function clearAll(){if(!confirm("Clear all test data?"))return;data=blank();selectedFaceId=null;save();renderPhoto();updateSide();renderGraph();renderPeople();showPage("photo")}
renderPhoto();updateSide();renderPeople();showPage("photo");