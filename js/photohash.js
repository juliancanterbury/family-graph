// Photo fingerprints used to stop duplicate uploads and to find existing duplicates.
// - contentHash: SHA-256 of the file bytes. Catches the exact same file uploaded twice.
// - visualHash: 64-bit difference hash (dHash) of a 9x8 greyscale thumbnail, as 16 hex chars.
//   Survives resizing and re-compression (a WhatsApp/iCloud copy of the same photo), but not
//   rotation or cropping. Two photos are "visually the same" when few of the 64 bits differ.

export async function contentHash(blob){
  const buf=await blob.arrayBuffer();
  const digest=await crypto.subtle.digest('SHA-256',buf);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function decode(src){
  if(src instanceof HTMLImageElement){if(!src.complete)await new Promise((res,rej)=>{src.onload=res;src.onerror=rej}); return src}
  if(typeof createImageBitmap==='function'){try{return await createImageBitmap(src)}catch{}}
  return await new Promise((res,rej)=>{const img=new Image(); const url=URL.createObjectURL(src); img.onload=()=>{URL.revokeObjectURL(url); res(img)}; img.onerror=()=>{URL.revokeObjectURL(url); rej(new Error('Could not read image'))}; img.src=url});
}

// Returns {hash, width, height} or null when the image can't be decoded (e.g. HEIC on Chrome).
export async function visualHash(src){
  let img; try{img=await decode(src)}catch{return null}
  const width=img.naturalWidth||img.width, height=img.naturalHeight||img.height;
  if(!width||!height)return null;
  // Halve step by step down to ~72x64 so every pixel is averaged in (one big jump straight to
  // 9x8 samples a few pixels and makes the hash sensitive to JPEG noise), then take 9x8.
  let cur=img, sw=width, sh=height;
  while(sw>=144*2&&sh>=128*2){
    const nw=Math.round(sw/2), nh=Math.round(sh/2);
    const t=document.createElement('canvas'); t.width=nw; t.height=nh;
    const tc=t.getContext('2d'); tc.imageSmoothingQuality='high'; tc.drawImage(cur,0,0,nw,nh); cur=t; sw=nw; sh=nh;
  }
  // last step to exactly 144x128, then average 16x16 blocks by hand into the 9x8 grid
  const c=document.createElement('canvas'); c.width=144; c.height=128;
  const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.imageSmoothingQuality='high'; ctx.drawImage(cur,0,0,144,128);
  let px; try{px=ctx.getImageData(0,0,144,128).data}catch{return null} // tainted canvas (no CORS)
  const g=new Array(72).fill(0);
  for(let y=0;y<128;y++)for(let x=0;x<144;x++){const i=(y*144+x)*4; g[(y>>4)*9+(x>>4)]+=px[i]*.299+px[i+1]*.587+px[i+2]*.114}
  for(let i=0;i<72;i++)g[i]/=256;
  // A bit is set only when the left cell is clearly brighter; near-equal neighbours (sky, walls)
  // stay 0 instead of flipping on compression noise.
  let hex='', nib=0, n=0;
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){nib=(nib<<1)|(g[y*9+x]>g[y*9+x+1]+1.5?1:0); if(++n===4){hex+=nib.toString(16); nib=0; n=0}}
  if(img.close)img.close();
  return {hash:hex,width,height};
}

export function hamming(a,b){
  if(!a||!b||a.length!==b.length)return 64;
  let d=0; for(let i=0;i<a.length;i++){let x=parseInt(a[i],16)^parseInt(b[i],16); while(x){d+=x&1; x>>=1}} return d;
}
const aspect=(w,h)=>(w&&h)?w/h:null;
// Same picture if the visual hashes are within `maxBits` and the shapes match (a resized copy keeps
// its aspect ratio; a crop or rotation doesn't, and is treated as a different photo).
export function looksSame(a,b,maxBits=6){
  if(a.content_hash&&b.content_hash&&a.content_hash===b.content_hash)return true;
  if(!a.phash||!b.phash)return false;
  const ra=aspect(a.width,a.height), rb=aspect(b.width,b.height);
  if(ra&&rb&&Math.abs(ra-rb)/Math.max(ra,rb)>0.03)return false;
  return hamming(a.phash,b.phash)<=maxBits;
}
