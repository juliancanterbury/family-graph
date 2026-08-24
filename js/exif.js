// Minimal, dependency-free EXIF date reader — pulls DateTimeOriginal (falling back to
// DateTimeDigitized, then the file's ModifyDate) straight out of a JPEG's APP1 segment.
// Works on both a freshly-picked File (upload) and a Blob fetched from storage (backfill).
export async function readExifDate(fileOrBlob) {
  if (!fileOrBlob) return null;
  try {
    const buf = await fileOrBlob.slice(0, 262144).arrayBuffer();
    return parseJpegExifDate(buf);
  } catch (e) { return null; }
}

function parseJpegExifDate(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue }
    const size = view.getUint16(offset + 2);
    if (size < 2) return null;
    if (marker === 0xe1 && offset + 10 <= view.byteLength &&
        view.getUint8(offset + 4) === 0x45 && view.getUint8(offset + 5) === 0x78 &&
        view.getUint8(offset + 6) === 0x69 && view.getUint8(offset + 7) === 0x66 &&
        view.getUint8(offset + 8) === 0 && view.getUint8(offset + 9) === 0) {
      const date = parseTiffForDate(view, offset + 10);
      if (date) return date;
    }
    offset += 2 + size;
  }
  return null;
}

function parseTiffForDate(view, tiffStart) {
  if (tiffStart + 8 > view.byteLength) return null;
  const byteOrder = view.getUint16(tiffStart);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return null;
  const get32 = o => view.getUint32(o, little);
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;
  const ifd0Offset = tiffStart + get32(tiffStart + 4);
  const modifyDate = readIfdDates(view, tiffStart, ifd0Offset, little);
  let exifIfdOffset = null;
  const numEntries = view.getUint16(ifd0Offset, little);
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifd0Offset + 2 + i * 12;
    if (view.getUint16(entryOffset, little) === 0x8769) exifIfdOffset = tiffStart + get32(entryOffset + 8);
  }
  const exifDate = exifIfdOffset ? readIfdDates(view, tiffStart, exifIfdOffset, little) : null;
  return exifDate || modifyDate;
}

// Looks for DateTimeOriginal (0x9003), then DateTimeDigitized (0x9004), then DateTime/ModifyDate (0x0132).
function readIfdDates(view, tiffStart, ifdOffset, little) {
  if (ifdOffset + 2 > view.byteLength) return null;
  const numEntries = view.getUint16(ifdOffset, little);
  const byTag = {};
  for (let i = 0; i < numEntries; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, little);
    if (tag !== 0x9003 && tag !== 0x9004 && tag !== 0x0132) continue;
    const valueOffset = tiffStart + view.getUint32(entryOffset + 8, little);
    byTag[tag] = formatExifDateString(readAscii(view, valueOffset, 19));
  }
  return byTag[0x9003] || byTag[0x9004] || byTag[0x0132] || null;
}

function readAscii(view, offset, len) {
  if (offset < 0 || offset + len > view.byteLength) return '';
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

function formatExifDateString(str) {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(str);
  if (!m) return null;
  const [, y, mo, d] = m;
  if (y === '0000' || mo === '00' || d === '00') return null;
  return `${y}-${mo}-${d}`;
}
