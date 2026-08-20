// Runs the OpenCV photo-rectangle detection off the main thread so the
// scan UI stays responsive while it works. Talks to scan.js in ImageBitmap
// in, Blob[] out — no DOM canvas elements are available here, so
// everything goes through matFromImageData / OffscreenCanvas instead of
// cv.imread/cv.imshow.
//
// This file is loaded by scan.js as a Blob URL, not a direct file URL —
// a dedicated worker created straight from a network file URL was observed
// to hang permanently right as OpenCV's WASM runtime finished initializing
// (no error, no further timers, nothing) in testing, while the exact same
// code loaded via a Blob URL worked instantly every time. Loading it as a
// Blob URL sidesteps that entirely.

let cvLoadError = null;
try {
  importScripts('https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js');
} catch (e) { cvLoadError = e }
const cvReady = new Promise((resolve, reject) => {
  if (cvLoadError) { reject(cvLoadError); return }
  if (self.cv && self.cv.Mat) { resolve(self.cv); return }
  self.cv.onRuntimeInitialized = () => resolve(self.cv);
  const check = () => { if (self.cv && self.cv.Mat) resolve(self.cv); else setTimeout(check, 100) };
  check();
});
function loadCV() { return cvReady }

function orderCorners(pts) {
  const sums = pts.map(p => p.x + p.y), diffs = pts.map(p => p.x - p.y);
  const tl = pts[sums.indexOf(Math.min(...sums))], br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.max(...diffs))], bl = pts[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}
function findPhotoRects(cv, srcMat) {
  const gray = new cv.Mat(); cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
  const blurred = new cv.Mat(); cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  const edged = new cv.Mat(); cv.Canny(blurred, edged, 50, 150);
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U); const dilated = new cv.Mat(); cv.dilate(edged, dilated, kernel);
  const contours = new cv.MatVector(), hierarchy = new cv.Mat();
  cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  const imgArea = srcMat.rows * srcMat.cols, rects = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i), area = cv.contourArea(cnt);
    if (area < imgArea * 0.02) { cnt.delete(); continue }
    const peri = cv.arcLength(cnt, true), approx = new cv.Mat();
    cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
    if (approx.rows === 4) { const pts = []; for (let j = 0; j < 4; j++)pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] }); rects.push(pts) }
    approx.delete(); cnt.delete();
  }
  gray.delete(); blurred.delete(); edged.delete(); kernel.delete(); dilated.delete(); contours.delete(); hierarchy.delete();
  return rects;
}
function warpToRect(cv, srcMat, corners) {
  const [tl, tr, br, bl] = orderCorners(corners);
  const wA = Math.hypot(br.x - bl.x, br.y - bl.y), wB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const hA = Math.hypot(tr.x - br.x, tr.y - br.y), hB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
  const maxW = Math.max(wA, wB), maxH = Math.max(hA, hB);
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxW, 0, maxW, maxH, 0, maxH]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri), dst = new cv.Mat();
  cv.warpPerspective(srcMat, dst, M, new cv.Size(maxW, maxH));
  srcTri.delete(); dstTri.delete(); M.delete();
  return dst;
}
function imageBitmapToMat(cv, bitmap) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return cv.matFromImageData(imgData);
}
async function matToBlob(cv, mat) {
  let rgba = mat, temp = null;
  if (mat.channels() !== 4) {
    temp = new cv.Mat();
    cv.cvtColor(mat, temp, mat.channels() === 3 ? cv.COLOR_RGB2RGBA : cv.COLOR_GRAY2RGBA);
    rgba = temp;
  }
  const clamped = new Uint8ClampedArray(rgba.data); // copies out of the Mat's buffer before we delete it
  const imgData = new ImageData(clamped, rgba.cols, rgba.rows);
  if (temp) temp.delete();
  const canvas = new OffscreenCanvas(imgData.width, imgData.height);
  canvas.getContext('2d').putImageData(imgData, 0, 0);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
}

self.onmessage = async (e) => {
  const { id, bitmap } = e.data;
  try {
    const cv = await loadCV();
    const srcMat = imageBitmapToMat(cv, bitmap);
    bitmap.close();
    const rects = findPhotoRects(cv, srcMat);
    const results = [];
    for (const r of rects) {
      const warped = warpToRect(cv, srcMat, r);
      const blob = await matToBlob(cv, warped);
      results.push(blob);
      warped.delete();
    }
    srcMat.delete();
    self.postMessage({ id, ok: true, results });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};
