const hasSupabase = SUPABASE_URL && !SUPABASE_URL.includes("PASTE_");
const client = hasSupabase ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const demoPeople = [
  {id:"00000000-0000-0000-0000-000000000001", first_name:"Jean", last_name:"Canterbury", birth_year:"1942", death_year:"2018", living:false, bio:"Family tree starter.", x:760, y:210},
  {id:"00000000-0000-0000-0000-000000000002", first_name:"Paul", last_name:"Canterbury", birth_year:"1940", death_year:"2020", living:false, bio:"Family tree starter.", x:1180, y:210},
  {id:"00000000-0000-0000-0000-000000000003", first_name:"Julian", last_name:"Canterbury", birth_year:"1970", living:true, bio:"Architect.", x:480, y:650},
  {id:"00000000-0000-0000-0000-000000000006", first_name:"Zoe", last_name:"Phillips", living:true, bio:"Julian’s partner.", x:900, y:650},
  {id:"00000000-0000-0000-0000-000000000004", first_name:"Rachel", last_name:"Canterbury", birth_year:"1973", living:true, bio:"Profile editable by Rachel once invited.", x:1260, y:650},
  {id:"00000000-0000-0000-0000-000000000005", first_name:"Andrew", last_name:"Canterbury", birth_year:"1976", living:true, bio:"Profile editable by Andrew once invited.", x:1680, y:650}
];

let people=[], photos=[], selected=null, scale=.75;

async function loadData(){
  if(client){
    const pr = await client.from("people").select("*").order("created_at");
    people = (!pr.error && pr.data?.length) ? pr.data : demoPeople;
    const phr = await client.from("photos").select("*, photo_derivatives(*)").order("created_at",{ascending:false}).limit(12);
    photos = (!phr.error && phr.data) ? phr.data : [];
  } else people = demoPeople;
  selected = people.find(p=>p.first_name==="Julian") || people[0];
  renderGraph(); renderProfile(); fitGraph();
}
function initials(p){return `${p.first_name?.[0]||""}${p.last_name?.[0]||""}`.toUpperCase();}
function renderGraph(){
  const g=document.getElementById("graph"); g.innerHTML="";
  addLine("h",950,270,230); addRel(1040,248,"Married<br>1966"); addLine("v",1065,270,260);
  addLine("h",575,530,1200); addLine("v",575,530,120); addLine("v",1065,530,120); addLine("v",1360,530,120); addLine("v",1775,530,120);
  addLine("h",670,710,420); addRel(810,688,"Partners");
  people.forEach(p=>{
    const el=document.createElement("div");
    el.className="person"+(selected&&selected.id===p.id?" selected":"");
    el.style.left=(p.x||1000)+"px"; el.style.top=(p.y||1000)+"px";
    el.innerHTML=`<div class="photo">${p.main_photo_url?`<img src="${p.main_photo_url}">`:initials(p)}</div><div><div class="name">${p.first_name}<br>${p.last_name}</div><div class="dates">${p.birth_year||""}${p.death_year?"–"+p.death_year:p.birth_year?"–":p.first_name==="Zoe"?"Partner":""}</div><div class="tag">${p.living?"chosen by person":"admin photo"}</div></div>`;
    el.onclick=()=>{selected=p;renderGraph();renderProfile();};
    g.appendChild(el);
  });
}
function addLine(k,x,y,l){const e=document.createElement("div");e.className=`line ${k}`;e.style.left=x+"px";e.style.top=y+"px";if(k==="h")e.style.width=l+"px";else e.style.height=l+"px";document.getElementById("graph").appendChild(e);}
function addRel(x,y,h){const e=document.createElement("div");e.className="rel";e.style.left=x+"px";e.style.top=y+"px";e.innerHTML=h;document.getElementById("graph").appendChild(e);}
function renderProfile(){
  const p=selected;
  document.getElementById("profile").innerHTML=`<div class="card"><h2>${p.first_name} ${p.last_name}</h2><p class="note">${p.living?"Living":"Deceased"}</p><div class="row"><label>First</label><input value="${p.first_name||""}" oninput="editSelected('first_name',this.value)"></div><div class="row"><label>Last</label><input value="${p.last_name||""}" oninput="editSelected('last_name',this.value)"></div><div class="row"><label>Birth</label><input value="${p.birth_year||""}" oninput="editSelected('birth_year',this.value)"></div><div class="row"><label>Death</label><input value="${p.death_year||""}" oninput="editSelected('death_year',this.value)"></div><div class="row"><label>Bio</label><textarea oninput="editSelected('bio',this.value)">${p.bio||""}</textarea></div><button class="primary" onclick="savePerson()">Save person</button></div><div class="card"><h2>Photos of ${p.first_name}</h2><div class="thumbgrid"><div class="thumb"></div><div class="thumb"></div><div class="thumb"></div></div><p class="note">Later this filters from confirmed face tags.</p></div>`;
}
function editSelected(f,v){selected[f]=v||null;people[people.findIndex(p=>p.id===selected.id)]=selected;renderGraph();}
async function savePerson(){if(!client)return alert("Demo mode: add Supabase keys in config.js to save.");const {error}=await client.from("people").upsert(selected);alert(error?error.message:"Saved.");}
async function uploadOriginal(file){
  if(!client)return alert("Demo mode: add Supabase keys before uploading.");
  const photoId=crypto.randomUUID(), ext=file.name.split(".").pop().toLowerCase(), originalPath=`originals/${photoId}/original.${ext}`;
  const up=await client.storage.from(FAMILY_MEDIA_BUCKET).upload(originalPath,file,{upsert:false});
  if(up.error)return alert(up.error.message);
  const ins=await client.from("photos").insert({id:photoId,original_filename:file.name,original_storage_path:originalPath,original_mime_type:file.type,original_size_bytes:file.size,processing_status:"uploaded"});
  if(ins.error)return alert(ins.error.message);
  await client.from("photo_derivatives").insert({photo_id:photoId,kind:"original",storage_path:originalPath,mime_type:file.type,size_bytes:file.size});
  alert("Original uploaded. Next step: automatic large/medium/thumb/tiny/faces.");
  loadData();
}
function fitGraph(){const w=document.getElementById("graphWrap");scale=Math.min(w.clientWidth/2200,w.clientHeight/900,.75);document.getElementById("graph").style.transform=`scale(${scale})`;w.scrollLeft=350*scale;w.scrollTop=120*scale;}
function centreOn(id){const p=people.find(x=>x.id===id);const w=document.getElementById("graphWrap");w.scrollLeft=(p.x*scale)-(w.clientWidth/2)+(95*scale);w.scrollTop=(p.y*scale)-(w.clientHeight/2)+(60*scale);}
document.getElementById("fitBtn").onclick=fitGraph;
document.getElementById("meBtn").onclick=()=>centreOn("00000000-0000-0000-0000-000000000003");
document.getElementById("uploadBtn").onclick=()=>document.getElementById("fileInput").click();
document.getElementById("fileInput").onchange=e=>{const f=e.target.files?.[0]; if(f)uploadOriginal(f);};
document.getElementById("search").oninput=e=>{const q=e.target.value.toLowerCase();const p=people.find(x=>`${x.first_name} ${x.last_name}`.toLowerCase().includes(q));if(p){selected=p;renderGraph();renderProfile();centreOn(p.id);}};
window.addEventListener("resize",fitGraph);
loadData();
