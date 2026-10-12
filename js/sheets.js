// Google Sheets: read the team and their skills from a sheet, and export a week's rota to one.
const Sheets = (function () {
  'use strict';
  const D = Data;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIASES = {
    foh: ['foh', 'frontofhouse', 'frontdesk', 'reception', 'receptionist'], cafe: ['cafe', 'barista', 'coffee', 'kitchen'],
    therapy: ['therapy', 'therapist', 'therapists', 'treatments', 'treatment', 'massage'], studio: ['studio', 'studiocoordinator', 'studiostaff', 'classes', 'instructor']
  };
  const roleOf = s => { const k = norm(s); return Object.keys(ALIASES).find(r => ALIASES[r].includes(k)) || null; };
  const truthy = s => /^(y|yes|true|1|x|✓|✔)$/i.test(String(s || '').trim());

  // ---------- CSV ----------
  function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ''));
  }
  const quote = v => /[",\n\t]/.test(v) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const toCsv = rows => rows.map(r => r.map(quote).join(',')).join('\r\n');
  const toTsv = rows => rows.map(r => r.map(quote).join('\t')).join('\n');

  // ---------- import ----------
  function sheetCsvUrls(url) {
    const id = (String(url).match(/\/spreadsheets\/d\/([\w-]+)/) || [])[1];
    if (!id) throw new Error('That does not look like a Google Sheets link. Copy the address from the browser while the sheet is open.');
    const gid = (String(url).match(/[#?&]gid=(\d+)/) || [])[1] || '0';
    return [`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`, `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`];
  }
  async function fetchSheet(url) {
    let lastError = 'no response';
    for (const u of sheetCsvUrls(url)) {
      try {
        const res = await fetch(u, { redirect: 'follow' });
        const text = await res.text();
        if (res.ok && !/^\s*<(!doctype|html)/i.test(text)) return text;
        lastError = 'the sheet is not shared';
      } catch (e) { lastError = e.message; }
    }
    throw new Error(`Could not read the sheet (${lastError}). In Google Sheets choose Share → General access → "Anyone with the link" (Viewer), then try again. Or download it as CSV and use "Import a CSV file".`);
  }

  const dayTimes = s => {
    const m = String(s || '').match(/(\d{1,2})[:.]?(\d{2})?\s*(?:-|–|to)\s*(\d{1,2})[:.]?(\d{2})?/i);
    if (!m) return null;
    const start = +m[1] * 60 + +(m[2] || 0), end = +m[3] * 60 + +(m[4] || 0);
    return end > start && end <= 24 * 60 ? { on: true, start, end } : null;
  };
  const holidays = s => String(s || '').split(/[;\n]/).map(part => {
    const d = part.match(/\d{4}-\d{2}-\d{2}/g);
    return d ? { from: d[0], to: d[1] || d[0], note: '' } : null;
  }).filter(Boolean);

  // Reads rows (first row = headers) into people. Only the columns that are present are used.
  function readPeople(rows) {
    if (rows.length < 2) throw new Error('The sheet needs a header row and at least one person.');
    const head = rows[0].map(norm), find = (...names) => head.findIndex(h => names.includes(h));
    const cName = find('name', 'teammember', 'staff', 'employee', 'staffname'), cPrimary = find('primaryrole', 'role', 'primary', 'area', 'mainrole', 'department');
    const cSkills = find('skills', 'skill', 'canwork', 'trainedfor', 'roles'), cHours = find('hours', 'weeklyhours', 'contractedhours', 'hoursperweek', 'contracthours'), cHol = find('holidays', 'holiday', 'leave', 'timeoff');
    const cDay = D.DAYS.map((d, i) => find(norm(d), norm(D.DAY_NAMES[i])));
    const cRole = {};
    head.forEach((h, i) => { const r = roleOf(h); if (r && i !== cPrimary && i !== cSkills) cRole[r] = i; });
    if (cName < 0) throw new Error('The sheet needs a column called "Name".');
    if (cSkills < 0 && !Object.keys(cRole).length && cPrimary < 0) throw new Error('The sheet needs a "Skills" column (for example "Café, Front of House") or one column per area.');
    const people = [], notes = [];
    rows.slice(1).forEach((r, n) => {
      const name = (r[cName] || '').trim();
      if (!name) return;
      const p = { name }, skills = new Set();
      if (cSkills >= 0) String(r[cSkills] || '').split(/[,;/&+]|\band\b/i).forEach(s => { if (!s.trim()) return; const id = roleOf(s); if (id) skills.add(id); else notes.push(`Row ${n + 2}: did not recognise the skill "${s.trim()}".`); });
      Object.keys(cRole).forEach(id => { if (truthy(r[cRole[id]])) skills.add(id); });
      if (cPrimary >= 0 && (r[cPrimary] || '').trim()) { const id = roleOf(r[cPrimary]); if (id) { p.primary = id; skills.add(id); } else notes.push(`Row ${n + 2}: did not recognise the role "${r[cPrimary].trim()}".`); }
      if (skills.size) p.skills = [...skills];
      if (cHours >= 0 && isFinite(parseFloat(r[cHours]))) p.hours = parseFloat(r[cHours]);
      if (cDay.some(c => c >= 0)) p.days = cDay.map(c => (c >= 0 && dayTimes(r[c])) || { on: false, start: 540, end: 1020 });
      if (cHol >= 0) p.holidays = holidays(r[cHol]);
      people.push(p);
    });
    if (!people.length) throw new Error('No rows with a name were found.');
    return { people, notes };
  }

  // Merge imported people into the team, matching on name. Fields missing from the sheet are left alone.
  function applyPeople(people) {
    let added = 0, updated = 0;
    people.forEach(p => {
      const cur = D.state.staff.find(s => norm(s.name) === norm(p.name));
      if (cur) {
        Object.assign(cur, p);
        if (p.skills && !p.primary && !cur.skills.includes(cur.primary)) cur.primary = cur.skills[0];
        if (!cur.skills.includes(cur.primary)) cur.skills.unshift(cur.primary);
        updated++;
      } else {
        const primary = p.primary || (p.skills && p.skills[0]) || 'foh';
        D.addStaff(Object.assign({}, p, { primary, skills: p.skills || [primary] }));
        added++;
      }
    });
    D.save();
    return { added, updated };
  }

  const TEMPLATE = [['Name', 'Primary role', 'Skills', 'Hours', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Holidays'],
    ['Example Person', 'Studio', 'Studio, Front of House', '30', '08:00-16:00', '08:00-16:00', '', '08:00-16:00', '08:00-16:00', '', '', '2026-12-24 to 2026-12-31'],
    ['Another Person', 'Café', 'Café', '20', '', '', '09:00-17:00', '09:00-17:00', '', '09:00-17:00', '', '']];

  // ---------- export ----------
  function build(wk) {
    const shifts = D.shifts(wk), dates = D.weekDates(wk), label = d => `${D.DAYS[d]} ${D.nice(dates[d])}`;
    const rota = [['Team member', 'Primary role'].concat(D.DAYS.map((_, d) => label(d)), ['Hours'])];
    D.ROLES.forEach(r => D.state.staff.filter(p => p.primary === r.id).forEach(p => {
      rota.push([p.name, r.name].concat(D.DAYS.map((_, d) => {
        const mine = shifts.filter(s => s.staffId === p.id && s.day === d).sort((a, b) => a.start - b.start);
        if (mine.length) return mine.map(s => `${D.hhmm(s.start)}–${D.hhmm(s.end)} ${D.role(s.role).short}`).join('\n');
        return Engine.onHoliday(p, dates[d]) ? 'Holiday' : '';
      }), [String(D.hrs(Engine.minutes(shifts, p.id)))]));
    }));
    const list = [['Date', 'Day', 'Team member', 'Area', 'Start', 'End', 'Hours']].concat(shifts.slice().sort((a, b) => a.day - b.day || a.start - b.start).map(s =>
      [dates[s.day], D.DAY_NAMES[s.day], (D.person(s.staffId) || { name: '?' }).name, D.role(s.role).name, D.hhmm(s.start), D.hhmm(s.end), String(D.hrs(s.end - s.start))]));
    const gaps = [['Day', 'Area', 'From', 'To', 'People short']].concat(Engine.gaps(wk).map(g => [label(g.day), D.role(g.role).name, D.hhmm(g.start), D.hhmm(g.end), String(g.short)]));
    return { week: wk, rota, shifts: list, gaps };
  }

  // Sends the rota to the owner's Apps Script web app, which writes it into their Google Sheet.
  async function send(wk) {
    const s = D.state.settings, body = JSON.stringify(Object.assign({ key: s.scriptKey || '' }, build(wk)));
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test((s.scriptUrl || '').trim())) throw new Error('Paste the web app URL from Apps Script first. It starts with https://script.google.com/ and ends with /exec.');
    const post = mode => fetch(s.scriptUrl.trim(), { method: 'POST', mode, redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    try {
      const res = await post('cors'), out = JSON.parse(await res.text());
      if (!out.ok) throw new Error(out.error || 'The sheet rejected the export.');
      return { confirmed: true, url: out.url };
    } catch (e) {
      if (!(e instanceof TypeError) && !(e instanceof SyntaxError)) throw e;
      await post('no-cors');   // the browser hid the reply; the request itself was still delivered
      return { confirmed: false };
    }
  }

  const SCRIPT = `// Dāha rota export. Paste into Extensions → Apps Script of the Google Sheet that should receive the rota,
// then Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone. Copy the web app URL into the rota tool.
var KEY = '';   // optional: set a password here and enter the same one in the rota tool

function doPost(e) {
  var out;
  try {
    var data = JSON.parse(e.postData.contents);
    if (KEY && data.key !== KEY) throw new Error('Wrong export key.');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    write(ss, 'Rota ' + data.week, data.rota, true);
    write(ss, 'Shifts ' + data.week, data.shifts, false);
    write(ss, 'Gaps ' + data.week, data.gaps, false);
    out = { ok: true, url: ss.getUrl() };
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function write(ss, name, rows, wrap) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  if (!rows || !rows.length) return;
  var width = rows[0].length;
  rows = rows.map(function (r) { r = r.slice(0, width); while (r.length < width) r.push(''); return r; });
  var range = sheet.getRange(1, 1, rows.length, width);
  range.setNumberFormat('@').setValues(rows).setVerticalAlignment('top').setWrap(wrap);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#304441').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
}
`;

  return { parseCsv, toCsv, toTsv, fetchSheet, readPeople, applyPeople, build, send, TEMPLATE, SCRIPT };
})();
