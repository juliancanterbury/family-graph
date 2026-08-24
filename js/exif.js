// Minimal, dependency-free EXIF date reader — pulls DateTimeOriginal (falling back to
// DateTimeDigitized, then the file's ModifyDate) straight out of a JPEG's APP1 segment,
// or a HEIC/HEIF's 'Exif' item (the default format on recent iPhones).
// Works on both a freshly-picked File (upload) and a Blob fetched from storage (backfill).
export async function readExifDate(fileOrBlob) {
  if (!fileOrBlob) return null;
  try {
    const head = await fileOrBlob.slice(0, 12).arrayBuffer();
    const hv = new DataView(head);
    if (hv.byteLength >= 4 && hv.getUint16(0) === 0xffd8) {
      const buf = await fileOrBlob.slice(0, 262144).arrayBuffer();
      return parseJpegExifDate(buf);
    }
    if (hv.byteLength >= 8 && readAscii(hv, 4, 4) === 'ftyp') {
      return await readHeicExifDate(fileOrBlob);
    }
    return null;
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

// --- HEIC/HEIF: EXIF lives in an 'Exif' item inside the ISO-BMFF 'meta' box (iinf names it,
// iloc locates its bytes), rather than a fixed spot near the file start like JPEG's APP1. ---
async function readHeicExifDate(fileOrBlob) {
  const headBuf = await fileOrBlob.slice(0, 1048576).arrayBuffer(); // meta/iinf/iloc are always near the front
  const view = new DataView(headBuf);
  const metaBox = findTopBox(view, 0, view.byteLength, 'meta');
  if (!metaBox) return null;
  const childrenStart = metaBox.contentStart + 4; // meta is a FullBox — skip version+flags
  const iinfBox = findTopBox(view, childrenStart, metaBox.end, 'iinf');
  const ilocBox = findTopBox(view, childrenStart, metaBox.end, 'iloc');
  if (!iinfBox || !ilocBox) return null;
  const exifItemId = findExifItemId(view, iinfBox);
  if (exifItemId == null) return null;
  const loc = findItemLocation(view, ilocBox, exifItemId);
  if (!loc || !loc.length) return null;
  // The item's actual bytes can sit anywhere in the file (often after the pixel data references) — refetch that range.
  const exifBuf = await fileOrBlob.slice(loc.offset, loc.offset + loc.length).arrayBuffer();
  const exifView = new DataView(exifBuf);
  if (exifView.byteLength < 8) return null;
  const tiffHeaderOffset = exifView.getUint32(0, false); // ISO/IEC 23008-12: 4-byte offset to the TIFF header
  return parseTiffForDate(exifView, 4 + tiffHeaderOffset);
}

function findTopBox(view, start, end, type) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = view.getUint32(pos, false);
    const boxType = readAscii(view, pos + 4, 4);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > end) return null;
      size = view.getUint32(pos + 8, false) * 4294967296 + view.getUint32(pos + 12, false);
      headerSize = 16;
    } else if (size === 0) size = end - pos;
    if (size < headerSize || pos + size > end) return null;
    if (boxType === type) return { start: pos, end: pos + size, contentStart: pos + headerSize };
    pos += size;
  }
  return null;
}

// Item Information Box — scans 'infe' children for the one whose item_type is 'Exif', returns its item_ID.
function findExifItemId(view, iinfBox) {
  const version = view.getUint8(iinfBox.contentStart);
  let pos = version === 0 ? iinfBox.contentStart + 6 : iinfBox.contentStart + 8;
  while (pos + 8 <= iinfBox.end) {
    const size = view.getUint32(pos, false);
    const boxType = readAscii(view, pos + 4, 4);
    if (size < 8 || pos + size > iinfBox.end) break;
    if (boxType === 'infe') {
      const infeVersion = view.getUint8(pos + 8);
      if (infeVersion === 2 && readAscii(view, pos + 16, 4) === 'Exif') return view.getUint16(pos + 12, false);
      if (infeVersion === 3 && readAscii(view, pos + 18, 4) === 'Exif') return view.getUint32(pos + 12, false);
    }
    pos += size;
  }
  return null;
}

// Item Location Box — finds the absolute file {offset,length} of the given item's (first extent of) data.
function findItemLocation(view, ilocBox, targetItemId) {
  const version = view.getUint8(ilocBox.contentStart);
  const sizes = view.getUint8(ilocBox.contentStart + 4);
  const offsetSize = sizes >> 4, lengthSize = sizes & 0xf;
  const sizes2 = view.getUint8(ilocBox.contentStart + 5);
  const baseOffsetSize = sizes2 >> 4, indexSize = sizes2 & 0xf;
  let pos = ilocBox.contentStart + 6, itemCount;
  if (version < 2) { itemCount = view.getUint16(pos, false); pos += 2 }
  else { itemCount = view.getUint32(pos, false); pos += 4 }
  for (let i = 0; i < itemCount; i++) {
    let itemId;
    if (version < 2) { itemId = view.getUint16(pos, false); pos += 2 }
    else { itemId = view.getUint32(pos, false); pos += 4 }
    if (version === 1 || version === 2) pos += 2; // construction_method
    pos += 2; // data_reference_index
    const baseOffset = readUintBE(view, pos, baseOffsetSize); pos += baseOffsetSize;
    const extentCount = view.getUint16(pos, false); pos += 2;
    let firstOffset = 0, firstLength = 0;
    for (let e = 0; e < extentCount; e++) {
      if ((version === 1 || version === 2) && indexSize > 0) pos += indexSize;
      const extentOffset = readUintBE(view, pos, offsetSize); pos += offsetSize;
      const extentLength = readUintBE(view, pos, lengthSize); pos += lengthSize;
      if (e === 0) { firstOffset = extentOffset; firstLength = extentLength }
    }
    if (itemId === targetItemId) return { offset: baseOffset + firstOffset, length: firstLength };
  }
  return null;
}

function readUintBE(view, pos, size) {
  if (size === 0) return 0;
  let v = 0;
  for (let i = 0; i < size; i++) v = v * 256 + view.getUint8(pos + i);
  return v;
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
