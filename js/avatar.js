import { S, $ } from './state.js';

let img=null, eyeY=0.38, chinY=0.62, dragging=null, personId=null;

function overlayEl(){return $('avatarCaptureOverlay')}

export function openAvatarCapture(id){
  personId=id;
  const ov=overlayEl(); if(!ov)return;
  ov.classList.remove('hidden');
  ov.innerHTML=`
    <div class="avatar-capture-box">
      <h2>Set your photo</h2>
      <p class="small">Choose a clear, current photo of just your face — a selfie works well.</p>
      <input id="avatarFileInput" type="file" accept="image/*" capture="user">
      <div id="avatarAlignStage" class="avatar-align-stage hidden">
        <div class="avatar-align-image-wrap">
          <img id="avatarAlignImg" alt="">
          <div class="avatar-guide" id="avatarEyeGuide" data-guide="eye"><span>Eye line — drag to your eyes</span></div>
          <div class="avatar-guide" id="avatarChinGuide" data-guide="chin"><span>Chin line — drag to your chin</span></div>
        </div>
        <p class="small">Drag each line onto your eyes and chin, then confirm.</p>
        <div class="avatar-align-actions">
          <button id="avatarCancelBtn">Cancel</button>
          <button class="primary" id="avatarConfirmBtn">Use this photo</button>
        </div>
      </div>
    </div>`;
  eyeY=0.38; chinY=0.62;
  $('avatarFileInput')?.addEventListener('change',onFileChosen);
  ov.addEventListener('click',e=>{if(e.target===ov)closeAvatarCapture()});
}
export function closeAvatarCapture(){const ov=overlayEl(); if(ov){ov.classList.add('hidden'); ov.innerHTML=''} img=null}

function onFileChosen(ev){
  const file=ev.target.files?.[0]; if(!file)return;
  const url=URL.createObjectURL(file);
  img=$('avatarAlignImg'); img.src=url;
  img.onload=()=>{
    $('avatarAlignStage')?.classList.remove('hidden');
    positionGuides();
    $('avatarCancelBtn')?.addEventListener('click',closeAvatarCapture);
    $('avatarConfirmBtn')?.addEventListener('click',confirmAvatar);
    $('avatarEyeGuide')?.addEventListener('pointerdown',e=>startGuideDrag(e,'eye'));
    $('avatarChinGuide')?.addEventListener('pointerdown',e=>startGuideDrag(e,'chin'));
  };
}
function positionGuides(){
  const wrap=img?.parentElement; if(!wrap)return; const h=wrap.clientHeight;
  const eyeEl=$('avatarEyeGuide'), chinEl=$('avatarChinGuide');
  if(eyeEl)eyeEl.style.top=(eyeY*h)+'px';
  if(chinEl)chinEl.style.top=(chinY*h)+'px';
}
function startGuideDrag(ev,which){ev.preventDefault(); dragging=which; window.addEventListener('pointermove',onGuideMove); window.addEventListener('pointerup',endGuideDrag)}
function onGuideMove(ev){
  if(!dragging||!img)return; const wrap=img.parentElement; const rect=wrap.getBoundingClientRect();
  const frac=Math.min(1,Math.max(0,(ev.clientY-rect.top)/rect.height));
  if(dragging==='eye')eyeY=frac; else chinY=frac;
  positionGuides();
}
function endGuideDrag(){dragging=null; window.removeEventListener('pointermove',onGuideMove); window.removeEventListener('pointerup',endGuideDrag)}

async function confirmAvatar(){
  if(!img||!personId)return;
  const btn=$('avatarConfirmBtn'); if(btn){btn.disabled=true; btn.textContent='Saving…'}
  try{
    const wrap=img.parentElement, dispW=wrap.clientWidth, dispH=wrap.clientHeight;
    const scaleX=img.naturalWidth/dispW, scaleY=img.naturalHeight/dispH;
    const eyeNat=eyeY*dispH*scaleY, chinNat=chinY*dispH*scaleY, faceH=Math.max(10,chinNat-eyeNat);
    const cropSize=faceH*3.2;
    const midY=(eyeNat+chinNat)/2;
    let top=midY-cropSize*0.42, left=(img.naturalWidth/2)-cropSize/2;
    top=Math.max(0,Math.min(top,img.naturalHeight-cropSize));
    left=Math.max(0,Math.min(left,img.naturalWidth-cropSize));
    const size=Math.min(cropSize,img.naturalWidth,img.naturalHeight);

    const canvas=document.createElement('canvas'); canvas.width=480; canvas.height=480;
    const ctx=canvas.getContext('2d');
    ctx.drawImage(img,left,top,size,size,0,0,480,480);
    const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',0.9));
    const bucketName=typeof FAMILY_MEDIA_BUCKET!=='undefined'?FAMILY_MEDIA_BUCKET:'family-media';
    const path=`avatars/${personId}-${Date.now()}.jpg`;
    const up=await S.sb.storage.from(bucketName).upload(path,blob,{upsert:true,contentType:'image/jpeg'});
    if(up.error){alert(up.error.message); if(btn){btn.disabled=false;btn.textContent='Use this photo'} return}
    const upd=await S.sb.from('people').update({avatar_path:path}).eq('id',personId).select().single();
    if(upd.error){alert(upd.error.message); return}
    const idx=S.people.findIndex(p=>p.id===personId); if(idx>-1)S.people[idx]=upd.data;
    closeAvatarCapture();
    const {renderAll}=await import('./render.js'); await renderAll();
  }catch(e){console.error(e); alert('Could not save photo: '+e.message); if(btn){btn.disabled=false;btn.textContent='Use this photo'}}
}

export function bindAvatarCapture(){
  document.body.addEventListener('click',e=>{const b=e.target.closest('[data-set-avatar]'); if(b)openAvatarCapture(b.dataset.setAvatar)});
}
