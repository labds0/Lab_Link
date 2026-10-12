// سيريال الجهاز مشتق من الهاردوير نفسه: اللوحة الأم (Motherboard) + هارد النظام.
// بيفضل ثابت حتى لو الويندوز اتفرمت أو البرنامج اتثبّت من جديد، وبيتغير بس لو اتغيّرت اللوحة الأم أو الهارد.
const crypto = require('crypto');
const path = require('path');

const JUNK = new Set([
  'NONE', 'NULL', 'NA', 'UNKNOWN', 'OEM', 'DEFAULTSTRING', 'TOBEFILLEDBYOEM', 'TOBEFILLED', 'NOTAPPLICABLE',
  'NOTSPECIFIED', 'SYSTEMSERIALNUMBER', 'BASEBOARDSERIALNUMBER', 'SERIALNUMBER', '123456789', '1234567890', '0123456789',
]);
const norm = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// بعض اللوحات بتكتب قيم وهمية في السيريال، فنتجاهلها
const isJunk = (v) => {
  const n = norm(v);
  return n.length < 4 || /^(.)\1+$/.test(n) || JUNK.has(n);
};
const pick = (...vals) => vals.map(norm).find((n, i) => !isJunk(vals[i])) || '';

// b = سيريال اللوحة الأم، u = UUID الجهاز من الـ BIOS (احتياطي لو سيريال اللوحة وهمي)، d = سيريال هارد النظام
function parseHardware({ b, u, d } = {}) {
  return { board: pick(b, u), disk: isJunk(d) ? '' : norm(d) };
}
function serialFromParts({ board, disk }) {
  const parts = [board, disk].filter(Boolean);
  if (!parts.length) return null;
  const hex = crypto.createHash('sha256').update('labresults2|' + parts.join('|')).digest('hex').slice(0, 16).toUpperCase();
  return { serial: hex.match(/.{4}/g).join('-'), parts: parts.length };
}
// لو القراءة الحالية ناقصة (مثلًا PowerShell فشل مرة) نستخدم آخر سيريال كامل متخزن بدل ما يتغير السيريال فجأة
function resolveSerial(fresh, cached) {
  if (fresh && (!cached || fresh.parts >= cached.parts)) return { ...fresh, save: true };
  if (cached) return { ...cached, save: false };
  return null;
}

const PS_SCRIPT = [
  "$ErrorActionPreference='SilentlyContinue'",
  '$b=(Get-CimInstance Win32_BaseBoard | Select-Object -First 1).SerialNumber',
  '$u=(Get-CimInstance Win32_ComputerSystemProduct | Select-Object -First 1).UUID',
  '$n=(Get-Partition -DriveLetter C | Get-Disk | Select-Object -First 1).Number',
  '$d=$null',
  'if($n -ne $null){ $d=(Get-PhysicalDisk | Where-Object { $_.DeviceId -eq "$n" } | Select-Object -First 1).SerialNumber }',
  'if(-not $d){ $d=(Get-CimInstance Win32_DiskDrive | Sort-Object Index | Select-Object -First 1).SerialNumber }',
  '@{b="$b";u="$u";d="$d"} | ConvertTo-Json -Compress',
].join('; ');

function readWindowsHardware(execFileSync) {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const out = execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  return parseHardware(JSON.parse(out.trim()));
}

module.exports = { isJunk, norm, pick, parseHardware, serialFromParts, resolveSerial, readWindowsHardware, PS_SCRIPT };
