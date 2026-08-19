import { S, $ } from './state.js';

let cvPromise=null, scanCandidates=[];

function loadOpenCV(){
  if(cvPromise)return cvPromise;
  cvPromise=new Promise((resolve,reject)=>{
    if(window.cv&&window.cv.Mat){resolve(window.cv);return}
    const script=document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
    script.onload=()=>{
      const check=()=>{if(window.cv&&window.cv.Mat)resolve(window.cv); else setTimeout(check,150)};
      check();
    };
    script.onerror=()=>reject(new Error('Could not load the photo-scanning library — check your internet connection and try again.'));
    document.head.appendChild(script);
  });
  return cvPromise;
}
function loadImageEl(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(); const url=URL.createObjectURL(file);
    img.onload=()=>resolve(img); img.onerror=()=>reject(new Error('Could not read that image file.'));
    img.src=url;
  });
}
function orderCorners(pts){
  const sums=pts.map(p=>p.x+p.y), diffs=pts.map(p=>p.x-p.y);
  const tl=pts[sums.indexOf(Math.min(...sums))], br=pts[sums.indexOf(Math.max(...sums))];
  const tr=pts[diffs.indexOf(Math.max(...diffs))], bl=pts[diffs.indexOf(Math.min(...diffs))];
  return [tl,tr,br,bl];
}
function findPhotoRects(cv,srcMat){
  const gray=new cv.Mat(); cv.cvtColor(srcMat,gray,cv.COLOR_RGBA2GRAY);
  const blurred=new cv.Mat(); cv.GaussianBlur(gray,blurred,new cv.Size(5,5),0);
  const edged=new cv.Mat(); cv.Canny(blurred,edged,50,150);
  const kernel=cv.Mat.ones(5,5,cv.CV_8U); const dilated=new cv.Mat(); cv.dilate(edged,dilated,kernel);
  const contours=new cv.MatVector(), hierarchy=new cv.Mat();
  cv.findContours(dilated,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
  const imgArea=srcMat.rows*srcMat.cols, rects=[];
  for(let i=0;i<contours.size();i++){
    const cnt=contours.get(i), area=cv.contourArea(cnt);
    if(area<imgArea*0.02){cnt.delete();continue}
    const peri=cv.arcLength(cnt,true), approx=new cv.Mat();
    cv.approxPolyDP(cnt,approx,0.02*peri,true);
    if(approx.rows===4){const pts=[]; for(let j=0;j<4;j++)pts.push({x:approx.data32S[j*2],y:approx.data32S[j*2+1]}); rects.push(pts)}
    approx.delete(); cnt.delete();
  }
  gray.delete(); blurred.delete(); edged.delete(); kernel.delete(); dilated.delete(); contours.delete(); hierarchy.delete();
  return rects;
}
function warpToRect(cv,srcMat,corners){
  const [tl,tr,br,bl]=orderCorners(corners);
  const wA=Math.hypot(br.x-bl.x,br.y-bl.y), wB=Math.hypot(tr.x-tl.x,tr.y-tl.y);
  const hA=Math.hypot(tr.x-br.x,tr.y-br.y), hB=Math.hypot(tl.x-bl.x,tl.y-bl.y);
  const maxW=Math.max(wA,wB), maxH=Math.max(hA,hB);
  const srcTri=cv.matFromArray(4,1,cv.CV_32FC2,[tl.x,tl.y,tr.x,tr.y,br.x,br.y,bl.x,bl.y]);
  const dstTri=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,maxW,0,maxW,maxH,0,maxH]);
  const M=cv.getPerspectiveTransform(srcTri,dstTri), dst=new cv.Mat();
  cv.warpPerspective(srcMat,dst,M,new cv.Size(maxW,maxH));
  srcTri.delete(); dstTri.delete(); M.delete();
  return dst;
}
function matToBlob(cv,mat){const canvas=document.createElement('canvas'); cv.imshow(canvas,mat); return new Promise(res=>canvas.toBlob(res,'image/jpeg',0.92))}

async function processScanImage(file){
  const cv=await loadOpenCV();
  const img=await loadImageEl(file);
  const canvas=document.createElement('canvas'); canvas.width=img.naturalWidth; canvas.height=img.naturalHeight;
  canvas.getContext('2d').drawImage(img,0,0);
  const srcMat=cv.imread(canvas);
  const rects=findPhotoRects(cv,srcMat);
  const results=[];
  for(const r of rects){
    const warped=warpToRect(cv,srcMat,r);
    const blob=await matToBlob(cv,warped);
    results.push({blob,url:URL.createObjectURL(blob)});
    warped.delete();
  }
  srcMat.delete();
  return results;
}

export function openScanCapture(){
  const ov=$('avatarCaptureOverlay'); if(!ov)return;
  ov.classList.remove('hidden');
  ov.innerHTML=`
    <div class="avatar-capture-box scan-box">
      <h2>Scan multiple photos at once</h2>
      <p class="small">Lay several photos on a plain, contrasting surface (or use a scanner), photograph or scan the whole spread, then upload that one image here. Works best with good lighting, photos that aren't overlapping or touching, and a background clearly different from the photos themselves.</p>
      <input id="scanFileInput" type="file" accept="image/*" capture="environment">
      <div id="scanProgress" class="hidden"><p class="small">Finding photos… this can take a few seconds.</p></div>
      <div id="scanResults" class="scan-results hidden"></div>
      <div class="avatar-align-actions">
        <button id="scanCloseBtn">Close</button>
        <button class="primary hidden" id="scanUploadAllBtn">Upload selected</button>
      </div>
    </div>`;
  $('scanFileInput')?.addEventListener('change',onScanFileChosen);
  $('scanCloseBtn')?.addEventListener('click',closeScanCapture);
  ov.addEventListener('click',e=>{if(e.target===ov)closeScanCapture()});
}
export function closeScanCapture(){const ov=$('avatarCaptureOverlay'); if(ov){ov.classList.add('hidden'); ov.innerHTML=''} scanCandidates=[]}

async function onScanFileChosen(ev){
  const file=ev.target.files?.[0]; if(!file)return;
  $('scanProgress')?.classList.remove('hidden');
  $('scanResults')?.classList.add('hidden');
  try{
    const results=await processScanImage(file);
    $('scanProgress')?.classList.add('hidden');
    if(!results.length){
      const box=$('scanResults'); if(box){box.innerHTML='<p class="small">Couldn\'t find any clear rectangular photos in that image. Try better lighting, a plainer background, or spacing the photos apart so they don\'t touch.</p>'; box.classList.remove('hidden')}
      return;
    }
    scanCandidates=results.map((r,i)=>({...r,include:true,id:i}));
    renderScanResults();
  }catch(e){
    console.error(e);
    $('scanProgress')?.classList.add('hidden');
    const box=$('scanResults'); if(box){box.innerHTML=`<p class="small">Something went wrong: ${e.message}</p>`; box.classList.remove('hidden')}
  }
}
function renderScanResults(){
  const box=$('scanResults'); if(!box)return;
  box.classList.remove('hidden');
  box.innerHTML=`<p class="small">Found ${scanCandidates.length} photo${scanCandidates.length===1?'':'s'}. Untick any that aren't right.</p><div class="scan-grid">${scanCandidates.map(c=>`<label class="scan-item"><input type="checkbox" data-scan-toggle="${c.id}" ${c.include?'checked':''}><img src="${c.url}"></label>`).join('')}</div>`;
  $('scanUploadAllBtn')?.classList.remove('hidden');
}
export function bindScanCapture(){
  document.body.addEventListener('click',e=>{const b=e.target.closest('[data-open-scan]'); if(b)openScanCapture()});
  document.body.addEventListener('change',e=>{const t=e.target.closest('[data-scan-toggle]'); if(t){const c=scanCandidates.find(x=>String(x.id)===t.dataset.scanToggle); if(c)c.include=t.checked}});
  document.body.addEventListener('click',async e=>{
    if(e.target.id!=='scanUploadAllBtn')return;
    const btn=e.target; const toUpload=scanCandidates.filter(c=>c.include);
    if(!toUpload.length)return alert('Nothing selected to upload.');
    btn.disabled=true; btn.textContent=`Uploading 0 of ${toUpload.length}…`;
    const {uploadPhotoFile}=await import('./photos.js');
    let done=0;
    for(const c of toUpload){
      const file=new File([c.blob],`scanned-photo-${c.id}.jpg`,{type:'image/jpeg'});
      await uploadPhotoFile(file);
      done++; btn.textContent=`Uploading ${done} of ${toUpload.length}…`;
    }
    closeScanCapture();
    const {renderAll}=await import('./render.js'); await renderAll();
  });
}
