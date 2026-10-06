import { Customer } from '../types/models';
import { storage } from './storage';

/**
 * Formats an ISO registration timestamp into DD/MM/YYYY (e.g., 06/10/2026) in Indian Standard Time.
 */
export function formatCustomerRegistrationDate(isoString: string | undefined | null): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';

  try {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date);

    const dd = parts.find((p) => p.type === 'day')?.value || '01';
    const mm = parts.find((p) => p.type === 'month')?.value || '01';
    const yyyy = parts.find((p) => p.type === 'year')?.value || '2026';
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
}

/**
 * Formats an ISO registration timestamp into DD/MM/YYYY hh:mm AM/PM (e.g., 06/10/2026 08:42 PM) in Indian Standard Time.
 */
export function formatCustomerRegistrationDateTime(isoString: string | undefined | null): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';

  try {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(date);

    const dd = parts.find((p) => p.type === 'day')?.value || '01';
    const mm = parts.find((p) => p.type === 'month')?.value || '01';
    const yyyy = parts.find((p) => p.type === 'year')?.value || '2026';
    const hh = parts.find((p) => p.type === 'hour')?.value || '12';
    const min = parts.find((p) => p.type === 'minute')?.value || '00';
    const dayPeriod = (parts.find((p) => p.type === 'dayPeriod')?.value || 'AM').toUpperCase();
    return `${dd}/${mm}/${yyyy} ${hh.padStart(2, '0')}:${min} ${dayPeriod}`;
  } catch {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    let hours = date.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const hh = String(hours).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min} ${ampm}`;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Precomputed CRC32 table for standard ZIP container generation (.xlsx)
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function buildUncompressedZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const localFileParts: Uint8Array[] = [];
  const centralDirParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = entry.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local file header (30 bytes + file name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true); // Local file header signature
    localView.setUint16(4, 20, true); // Version needed to extract (2.0)
    localView.setUint16(6, 0, true); // General purpose bit flag
    localView.setUint16(8, 0, true); // Compression method (0 = STORE)
    localView.setUint16(10, 0, true); // File last mod time
    localView.setUint16(12, 0x21, true); // File last mod date
    localView.setUint32(14, crc, true); // CRC-32
    localView.setUint32(18, size, true); // Compressed size
    localView.setUint32(22, size, true); // Uncompressed size
    localView.setUint16(26, nameBytes.length, true); // File name length
    localView.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localFileParts.push(localHeader, dataBytes);

    // Central directory file header (46 bytes + file name)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true); // Central file header signature
    centralView.setUint16(4, 20, true); // Version made by
    centralView.setUint16(6, 20, true); // Version needed to extract
    centralView.setUint16(8, 0, true); // General purpose bit flag
    centralView.setUint16(10, 0, true); // Compression method (0 = STORE)
    centralView.setUint16(12, 0, true); // Last mod time
    centralView.setUint16(14, 0x21, true); // Last mod date
    centralView.setUint32(16, crc, true); // CRC-32
    centralView.setUint32(20, size, true); // Compressed size
    centralView.setUint32(24, size, true); // Uncompressed size
    centralView.setUint16(28, nameBytes.length, true); // File name length
    centralView.setUint16(30, 0, true); // Extra field length
    centralView.setUint16(32, 0, true); // File comment length
    centralView.setUint16(34, 0, true); // Disk number start
    centralView.setUint16(36, 0, true); // Internal file attributes
    centralView.setUint32(38, 0, true); // External file attributes
    centralView.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralDirParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  let centralDirSize = 0;
  for (const part of centralDirParts) {
    centralDirSize += part.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true); // EOCD signature
  eocdView.setUint16(4, 0, true); // Number of this disk
  eocdView.setUint16(6, 0, true); // Disk where central directory starts
  eocdView.setUint16(8, entries.length, true); // Number of central directory records on this disk
  eocdView.setUint16(10, entries.length, true); // Total number of central directory records
  eocdView.setUint32(12, centralDirSize, true); // Size of central directory
  eocdView.setUint32(16, offset, true); // Offset of start of central directory
  eocdView.setUint16(20, 0, true); // Comment length

  const totalSize = offset + centralDirSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;

  for (const part of localFileParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralDirParts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  output.set(eocd, cursor);

  return output;
}

/**
 * Generates and downloads an Admin-only Excel (.xlsx) file containing the registered customer list.
 *
 * Columns included:
 * 1. S.No.
 * 2. Customer Name
 * 3. Mobile Number
 * 4. Email ID
 * 5. Registered Date
 * 6. Registered Date & Time
 *
 * Strictly excludes Customer PINs, passwords, tokens, payment info, Shopkeeper data, or Admin data.
 */
export function downloadAdminCustomersExcel(customers: Customer[]): void {
  const activeAdmin = storage.getActiveAdminSession();
  if (!activeAdmin || !activeAdmin.pinVerified) {
    throw new Error('Access denied. Only the authorized Admin can export the customer register.');
  }

  const encoder = new TextEncoder();

  const headers = [
    'S.No.',
    'Customer Name',
    'Mobile Number',
    'Email ID',
    'Registered Date',
    'Registered Date & Time',
  ];

  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

  const headerCellsXml = headers
    .map(
      (header, idx) =>
        `<c r="${colLetters[idx]}1" s="1" t="inlineStr"><is><t>${escapeXml(header)}</t></is></c>`
    )
    .join('');

  let rowsXml = `<row r="1">${headerCellsXml}</row>`;

  customers.forEach((cust, index) => {
    const rowNum = index + 2;
    const serialNo = index + 1;
    const customerName = (cust.name || '').trim();
    const mobileNumber = (cust.mobile || '').trim();
    const emailId = (cust.email || '').trim();
    const regDate = formatCustomerRegistrationDate(cust.createdAt);
    const regDateTime = formatCustomerRegistrationDateTime(cust.createdAt);

    const rowCells = [
      `<c r="A${rowNum}" t="n"><v>${serialNo}</v></c>`,
      `<c r="B${rowNum}" t="inlineStr"><is><t>${escapeXml(customerName)}</t></is></c>`,
      `<c r="C${rowNum}" t="inlineStr"><is><t>${escapeXml(mobileNumber)}</t></is></c>`,
      `<c r="D${rowNum}" t="inlineStr"><is><t>${escapeXml(emailId)}</t></is></c>`,
      `<c r="E${rowNum}" t="inlineStr"><is><t>${escapeXml(regDate)}</t></is></c>`,
      `<c r="F${rowNum}" t="inlineStr"><is><t>${escapeXml(regDateTime)}</t></is></c>`,
    ].join('');

    rowsXml += `<row r="${rowNum}">${rowCells}</row>`;
  });

  const worksheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="10" customWidth="1"/>
    <col min="2" max="2" width="28" customWidth="1"/>
    <col min="3" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="32" customWidth="1"/>
    <col min="5" max="5" width="18" customWidth="1"/>
    <col min="6" max="6" width="26" customWidth="1"/>
  </cols>
  <sheetData>${rowsXml}</sheetData>
</worksheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Customers" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1">
    <border><left/><right/><top/><bottom/><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
</styleSheet>`;

  const xlsxBytes = buildUncompressedZip([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'xl/workbook.xml', data: encoder.encode(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: encoder.encode(workbookRelsXml) },
    { name: 'xl/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'xl/worksheets/sheet1.xml', data: encoder.encode(worksheetXml) },
  ]);

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const filename = `Desi_Wardrobe_Customers_${yyyy}-${mm}-${dd}.xlsx`;

  const blob = new Blob([xlsxBytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
