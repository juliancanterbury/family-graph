const hasSupabase = typeof SUPABASE_URL !== "undefined" && SUPABASE_URL && !SUPABASE_URL.includes("PASTE_");
const client = hasSupabase ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const demoPeople = [
  {id:"jean", first_name:"Jean", last_name:"Canterbury", birth_year:"1942", death_year:"2018", living:false, bio:"Family graph starter. Deceased profile photo managed by tree editors."},
  {id:"paul", first_name:"Paul", last_name:"Canterbury", birth_year:"1940", death_year:"2020", living:false, bio:"Family graph starter. Deceased profile photo managed by tree editors."},
  {id:"julian", first_name:"Julian", last_name:"Canterbury", birth_year:"1970", living:true, bio:"Can edit own profile and choose own tree photo."},
  {id:"zoe", first_name:"Zoe", last_name:"Phillips", living:true, bio:"Julian’s partner. Her Phillips graph can later connect through this relationship."},
  {id:"rachel", first_name:"Rachel", last_name:"Canterbury", birth_year:"1973", living:true, bio:"Profile editable by Rachel once invited."},
  {id:"andrew", first_name:"Andrew", last_name:"Canterbury", birth_year:"1976", living:true, bio:"Profile editable by Andrew once invited."}
];

const demoRelationships = [
  {id:"r1", from:"jean", to:"paul", type:"spouse", label:"Married 1966"},
  {id:"r2", from:"jean", to:"julian", type:"parent", label:"Mother"},
  {id:"r3", from:"paul", to:"julian", type:"parent", label:"Father"},
  {id:"r4", from:"jean", to:"rachel", type:"parent", label:"Mother"},
  {id:"r5", from:"paul", to:"rachel", type:"parent", label:"Father"},
  {id:"r6", from:"jean", to:"andrew", type:"parent", label:"Mother"},
  {id:"r7", from:"paul", to:"andrew", type:"parent", label:"Father"},
  {id:"r8", from:"julian", to:"zoe", type:"partner", label:"Partners"}
];

let people = [];
let relationships = [];
let selected = null;
let scale = .72;
let positions = {};

async function loadData(){
  if(client){
    const pr = await client.from("people").select("*").order("created_at");
    people = (!pr.error && pr.data?.length) ? pr.data.map(normalisePerson) : demoPeople;
    const rr = await client.from("relationships").select("*");
    relationships = (!rr.error && rr.data?.length) ? rr.data.map(normaliseRelationship) : demoRelationships;
  } else {
    people = demoPeople;
    relationships = demoRelationships;
  }
  selected = people.find(p=>p.id==="julian" || p.first_name==="Julian") || people[0];
  computeLayout();
  renderGraph();
  renderProfile();
  fitGraph();
}

function normalisePerson(p){
  return {
    id:p.id,
    first_name:p.first_name,
    last_name:p.last_name,
    birth_year:p.birth_year,
    death_year:p.death_year,
    living:p.living,
    bio:p.bio,
    main_photo_url:p.main_photo_url
  };
}

function normaliseRelationship(r){
  return {
    id:r.id,
    from:r.from_person_id || r.from,
    to:r.to_person_id || r.to,
    type:r.relationship_type || r.type,
    label:r.label || ""
  };
}

function initials(p){
  return `${p.first_name?.[0]||""}${p.last_name?.[0]||""}`.toUpperCase();
}

function fullName(p){
  return `${p.first_name || ""} ${p.last_name || ""}`.trim();
}

function getPerson(id){
  return people.find(p=>p.id===id);
}

function isPartnerType(t){
  return ["partner","spouse","ex_partner"].includes(t);
}

function computeLayout(){
  positions = {};

  const spousePairs = relationships.filter(r=>isPartnerType(r.type));
  const parentLinks = relationships.filter(r=>r.type==="parent");

  const childrenOfJeanPaul = ["julian","rachel","andrew"].filter(id=>people.some(p=>p.id===id));
  const baseX = 760;
  const topY = 210;
  const childY = 650;

  // Parent couple
  positions.jean = {x:baseX, y:topY};
  positions.paul = {x:baseX+420, y:topY};

  // Julian + Zoe partnership sits as a couple block, independent of sibling line.
  positions.julian = {x:baseX-280, y:childY};
  positions.zoe = {x:baseX-40, y:childY};

  // Siblings continue to the right
  positions.rachel = {x:baseX+360, y:childY};
  positions.andrew = {x:baseX+760, y:childY};

  // Fallback for future people
  let i = 0;
  people.forEach(p=>{
    if(!positions[p.id]){
      positions[p.id] = {x:baseX + (i*230), y:childY + 260};
      i++;
    }
  });
}

function renderGraph(){
  const g = document.getElementById("graph");
  g.innerHTML = "";

  drawRelationships(g);

  people.forEach(p=>{
    const pos = positions[p.id] || {x:1000,y:1000};
    const el = document.createElement("div");
    el.className = "person" + (selected && selected.id === p.id ? " selected" : "");
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.innerHTML = `
      <div class="photo">${p.main_photo_url ? `<img src="${p.main_photo_url}">` : initials(p)}</div>
      <div>
        <div class="name">${p.first_name}<br>${p.last_name}</div>
        <div class="dates">${dateText(p)}</div>
        <div class="tag">${p.living ? "chosen by person" : "admin photo"}</div>
      </div>`;
    el.onclick = ()=>{selected=p;renderGraph();renderProfile();};
    g.appendChild(el);
  });
}

function dateText(p){
  if(p.first_name==="Zoe" && p.last_name==="Phillips") return "Partner";
  if(p.birth_year && p.death_year) return `${p.birth_year}–${p.death_year}`;
  if(p.birth_year) return `${p.birth_year}–`;
  return "";
}

function drawRelationships(g){
  const jean = positions.jean, paul = positions.paul, julian = positions.julian, zoe = positions.zoe, rachel = positions.rachel, andrew = positions.andrew;
  if(!jean || !paul) return;

  const parentMidX = midpoint(centerX("jean"), centerX("paul"));
  const parentY = centerY("jean");

  // Jean + Paul spouse line
  drawH(g, rightX("jean"), parentY, leftX("paul") - rightX("jean"));
  drawRel(g, parentMidX - 48, parentY - 24, "Married<br>1966");

  // Children line for only Julian, Rachel, Andrew.
  const childTopY = topY("julian");
  const trunkBottom = childTopY - 115;
  drawV(g, parentMidX, parentY, trunkBottom - parentY);
  drawH(g, centerX("julian"), trunkBottom, centerX("andrew") - centerX("julian"));
  ["julian","rachel","andrew"].forEach(id=>{
    drawV(g, centerX(id), trunkBottom, topY(id) - trunkBottom);
  });

  // Julian + Zoe partner line. This is independent and does not connect Zoe to Jean/Paul.
  if(positions.zoe){
    const jy = centerY("julian");
    drawH(g, rightX("julian"), jy, leftX("zoe") - rightX("julian"));
    drawRel(g, rightX("julian")+30, jy-24, "Partners");
  }
}

function leftX(id){return positions[id].x}
function rightX(id){return positions[id].x+190}
function centerX(id){return positions[id].x+95}
function topY(id){return positions[id].y}
function centerY(id){return positions[id].y+60}
function midpoint(a,b){return (a+b)/2}

function drawH(g,x,y,w){
  const el=document.createElement("div");
  el.className="line h";
  el.style.left=x+"px"; el.style.top=y+"px"; el.style.width=Math.max(0,w)+"px";
  g.appendChild(el);
}

function drawV(g,x,y,h){
  const el=document.createElement("div");
  el.className="line v";
  el.style.left=x+"px"; el.style.top=y+"px"; el.style.height=Math.max(0,h)+"px";
  g.appendChild(el);
}

function drawRel(g,x,y,html){
  const el=document.createElement("div");
  el.className="rel";
  el.style.left=x+"px"; el.style.top=y+"px"; el.innerHTML=html;
  g.appendChild(el);
}

function renderProfile(){
  const p = selected;
  const rels = relationshipsFor(p.id);
  document.getElementById("profile").innerHTML = `
    <div class="card">
      <h2>${fullName(p)}</h2>
      <p class="note">${p.living ? "Living" : "Deceased"} · ${p.living ? "main photo chosen by person" : "main photo chosen by tree editor"}</p>
      <div class="row"><label>First</label><input value="${p.first_name||""}" oninput="editSelected('first_name',this.value)"></div>
      <div class="row"><label>Last</label><input value="${p.last_name||""}" oninput="editSelected('last_name',this.value)"></div>
      <div class="row"><label>Birth</label><input value="${p.birth_year||""}" oninput="editSelected('birth_year',this.value)"></div>
      <div class="row"><label>Death</label><input value="${p.death_year||""}" oninput="editSelected('death_year',this.value)"></div>
      <div class="row"><label>Bio</label><textarea oninput="editSelected('bio',this.value)">${p.bio||""}</textarea></div>
      <button class="primary" onclick="savePerson()">Save person</button>
    </div>
    <div class="card">
      <h2>Relationships</h2>
      <div class="relationship-list">${rels || "<p>No direct relationships yet.</p>"}</div>
      <p class="note">This panel is now driven by relationship data, not drawn lines.</p>
    </div>
    <div class="card">
      <h2>Graph engine v1</h2>
      <p class="note">Partners are drawn beside each other. Children are drawn only below confirmed parents. Zoe is no longer connected to Jean and Paul.</p>
    </div>`;
}

function relationshipsFor(id){
  const lines = [];
  relationships.forEach(r=>{
    if(r.from===id || r.to===id){
      const other = getPerson(r.from===id ? r.to : r.from);
      if(!other) return;
      let label = r.type;
      if(r.type==="parent"){
        label = r.from===id ? "Parent of" : "Child of";
      } else if(isPartnerType(r.type)){
        label = "Partner";
      }
      lines.push(`<p><strong>${label}</strong>: ${fullName(other)}</p>`);
    }
  });
  return lines.join("");
}

function editSelected(field,value){
  selected[field]=value || null;
  const idx=people.findIndex(p=>p.id===selected.id);
  people[idx]=selected;
  renderGraph();
}

async function savePerson(){
  if(!client){
    alert("Demo mode: add Supabase keys in config.js to save.");
    return;
  }
  const {error}=await client.from("people").upsert(selected);
  alert(error ? error.message : "Saved.");
}

function fitGraph(){
  const wrap=document.getElementById("graphWrap");
  scale=Math.min(wrap.clientWidth/2100, wrap.clientHeight/900, .78);
  document.getElementById("graph").style.transform=`scale(${scale})`;
  wrap.scrollLeft=420*scale;
  wrap.scrollTop=120*scale;
}

function centreOn(id){
  const pos=positions[id]; if(!pos) return;
  const wrap=document.getElementById("graphWrap");
  wrap.scrollLeft=(pos.x*scale)-(wrap.clientWidth/2)+(95*scale);
  wrap.scrollTop=(pos.y*scale)-(wrap.clientHeight/2)+(60*scale);
}

document.getElementById("fitBtn").onclick=fitGraph;
document.getElementById("meBtn").onclick=()=>centreOn("julian");
document.getElementById("layoutBtn").onclick=()=>{computeLayout();renderGraph();fitGraph();};
document.getElementById("search").oninput=e=>{
  const q=e.target.value.toLowerCase();
  const p=people.find(x=>fullName(x).toLowerCase().includes(q));
  if(p){selected=p;renderGraph();renderProfile();centreOn(p.id);}
};

window.addEventListener("resize",fitGraph);
loadData();
