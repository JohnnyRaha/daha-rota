// Google Sheets: read the team from a sheet or workbook, and export a week's rota to one.
const Sheets = (function () {
  'use strict';
  const D = Data;
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIASES = {
    foh: ['foh', 'frontofhouse', 'frontdesk', 'reception', 'receptionist'], cafe: ['cafe', 'barista', 'baristas', 'baristasattendants', 'attendants', 'coffee', 'kitchen'],
    therapy: ['therapy', 'therapist', 'therapists', 'treatments', 'treatment', 'massage', 'acupuncturists', 'acupuncturist'],
    studio: ['studio', 'studiocoordinator', 'studiostaff', 'classes', 'instructor', 'instructors']
  };
  const roleOf = s => { const k = norm(s); return Object.keys(ALIASES).find(r => ALIASES[r].includes(k)) || null; };
  const truthy = s => /^(y|yes|true|1|x|✓|✔)$/i.test(String(s == null ? '' : s).trim());
  const treatmentOf = s => D.state.treatments.find(t => norm(t) === norm(s)) || null;

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

  // ---------- Excel workbook (.xlsx) ----------
  // An .xlsx file is a zip of XML files. The browser can unzip and parse it without any library.
  async function readXlsx(buffer) {
    const view = new DataView(buffer), bytes = new Uint8Array(buffer), files = {}, dec = new TextDecoder();
    let eocd = buffer.byteLength - 22;
    while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
    if (eocd < 0) throw new Error('That file is not an Excel workbook (.xlsx).');
    let at = view.getUint32(eocd + 16, true);
    for (let n = view.getUint16(eocd + 10, true); n > 0; n--) {
      const method = view.getUint16(at + 10, true), size = view.getUint32(at + 20, true), nameLen = view.getUint16(at + 28, true);
      const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen)), local = view.getUint32(at + 42, true);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      files[name] = { method, data: bytes.subarray(start, start + size) };
      at += 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    const text = async name => {
      const f = files[name];
      if (!f) return '';
      if (f.method === 0) return dec.decode(f.data);
      return new Response(new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    };
    const xml = async name => new DOMParser().parseFromString(await text(name), 'application/xml');
    const tags = (node, name) => [...node.getElementsByTagName(name)];
    const strings = tags(await xml('xl/sharedStrings.xml'), 'si').map(si => tags(si, 't').filter(t => t.parentNode.nodeName !== 'rPh').map(t => t.textContent).join(''));
    const rels = {};
    tags(await xml('xl/_rels/workbook.xml.rels'), 'Relationship').forEach(r => { rels[r.getAttribute('Id')] = r.getAttribute('Target').replace(/^\/?(xl\/)?/, 'xl/'); });
    const out = {};
    for (const sh of tags(await xml('xl/workbook.xml'), 'sheet')) {
      const rows = [];
      tags(await xml(rels[sh.getAttribute('r:id')]), 'c').forEach(c => {
        const ref = c.getAttribute('r').match(/^([A-Z]+)(\d+)$/), type = c.getAttribute('t'), v = tags(c, 'v')[0];
        const value = type === 's' ? strings[+v.textContent] : type === 'inlineStr' ? tags(c, 't').map(t => t.textContent).join('') : v ? v.textContent : '';
        if (value === '' || value == null) return;
        const col = [...ref[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1, row = +ref[2] - 1;
        (rows[row] = rows[row] || [])[col] = String(value);
      });
      out[sh.getAttribute('name')] = Array.from(rows, r => Array.from(r || [], v => v || ''));
    }
    return out;
  }

  // ---------- free-text times ----------
  // Reads cells such as "7:30AM - 03:30PM (8hrs)", "9-4:30pm" or "11:30PM - 07:30PM (8hrs)" (a typo for AM).
  // When the AM/PM written cannot be right, the reading that fits a working day and any "(8hrs)" hint is used.
  const RANGE = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?\s*-?\s*(?:-|–|to)\s*-?\s*(\d{1,2})(?:[:.](\d{2}))?\s*-?\s*(am|pm)?/g;
  function parseTimes(raw) {
    const text = String(raw == null ? '' : raw).toLowerCase(), hint = (text.match(/\((\d+(?:\.\d+)?)\s*hr/) || [])[1];
    const found = [];
    for (const m of text.replace(/\(.*?(\)|$)/g, ' ').matchAll(RANGE)) {
      const mins = (h, mm, mer) => (+h > 12 ? +h : (+h % 12) + (mer === 'pm' ? 12 : 0)) * 60 + +(mm || 0);
      let best = null;
      for (const a of ['am', 'pm']) for (const b of ['am', 'pm']) {
        const start = mins(m[1], m[2], a), end = mins(m[4], m[5], b), dur = (end - start) / 60;
        if (dur <= 0 || dur > 14) continue;
        const score = (m[3] === a ? 4 : 0) + (m[6] === b ? 4 : 0) + (!m[3] && a === b ? 0.5 : 0) - (start < 360 || end > 1320 ? 6 : 0) - (hint ? Math.abs(dur - hint) : dur / 100);
        if (!best || score > best.score) best = { start, end, score, changed: (m[3] && m[3] !== a && +m[1] <= 12) || (m[6] && m[6] !== b && +m[4] <= 12) };
      }
      if (best) found.push(best);
    }
    if (!found.length) return null;
    const pick = found.reduce((x, y) => y.end - y.start > x.end - x.start ? y : x);
    return { on: true, start: pick.start, end: pick.end, changed: !!pick.changed, several: found.length > 1 };
  }
  const NOT_WORKING = ['', 'na', 'off', 'notavailable', 'x'];

  // ---------- the "Available Working Hours" workbook layout ----------
  // One tab per team. Each person is a block: a row with their name and the day names, then one row
  // per rotation week ("WEEK 1", "WEEK 2 & 4", "Weekly"). A "Weekly Shifts" tab lists the cover needed.
  const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayIndex = v => DAY_KEYS.findIndex(d => norm(v).startsWith(d));
  const dayCols = row => { const cols = {}; (row || []).forEach((v, i) => { const d = dayIndex(v); if (d >= 0 && String(v).trim().length < 16 && !(d in cols)) cols[d] = i; }); return Object.keys(cols).length >= 5 ? cols : null; };
  const tidyName = s => { const n = String(s).replace(/\(.*?\)/g, ' ').replace(/\bp\/t\b/ig, ' ').replace(/\s+/g, ' ').trim(); return n === n.toUpperCase() ? n.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : n; };
  const weeksOf = label => {
    const l = String(label).toLowerCase();
    if (/^\s*weekly|\bweek\s*1\s*-\s*4/.test(l)) return [0, 1, 2, 3];
    const m = l.match(/\bweek\s*([1-4](?:\s*(?:&|,|and)\s*[1-4])*)/);
    return m ? [...new Set(m[1].match(/[1-4]/g).map(n => n - 1))] : null;
  };

  function readWorkbook(book) {
    const people = new Map(), notes = [], skipped = [], needs = {}, cellNotes = new Map();
    const cellNote = (name, label, d, c, text) => { const k = [name, d, c, text].join('|'); if (!cellNotes.has(k)) cellNotes.set(k, { name, d, c, text, labels: [] }); cellNotes.get(k).labels.push(label); };
    for (const [tab, rows] of Object.entries(book)) {
      if (/shift/i.test(tab)) { readNeeds(rows, needs); continue; }
      const key = norm(tab), role = roleOf(tab), treatment = /acupunct/.test(key) ? treatmentOf('Acupuncture') : null;
      if (!role) { if (rows.some(r => dayCols(r))) skipped.push(tab.trim()); continue; }
      for (let i = 0; i < rows.length; i++) {
        const cols = dayCols(rows[i]), name = cols && tidyName(rows[i][0] || '');
        if (!cols || !name || roleOf(name) || /barista|attendant|shift|^week/i.test(name)) continue;
        const lastDay = Math.max(...Object.values(cols)), weeks = [null, null, null, null], extra = [], said = [], labelled = new Set();
        const weeksRows = [];
        const remember = r => r.slice(lastDay + 1).forEach(v => { if (String(v).trim() && !said.includes(String(v).trim())) said.push(String(v).trim()); });
        remember(rows[i]);
        let j = i + 1;
        for (; j < rows.length && !dayCols(rows[j]); j++) {
          const r = rows[j] || [], label = String(r[0] || '').trim(), wks = weeksOf(label), cells = DAY_KEYS.map((_, d) => String(r[cols[d]] == null ? '' : r[cols[d]]).trim());
          remember(r);
          if (!wks) { if (cells.some(c => c) || label) extra.push({ label: label || 'a row with no label', cells }); continue; }
          weeksRows.push({ label, wks, cells });
        }
        // a block with no "WEEK" rows at all: take its first row of times as the pattern for every week
        if (!weeksRows.length) {
          const k = extra.findIndex(e => e.cells.some(c => parseTimes(c)));
          if (k >= 0) { const e = extra.splice(k, 1)[0]; weeksRows.push({ label: 'every week', wks: [0, 1, 2, 3], cells: e.cells }); notes.push(`${name} (${tab.trim()}): the row of times had no week label, so it was read as the same every week.`); }
        }
        weeksRows.forEach(({ label, wks, cells }) => {
          const pattern = cells.map((c, d) => {
            const tm = parseTimes(c);
            if (!tm) { if (!NOT_WORKING.includes(norm(c))) cellNote(name, label, d, c, 'was not understood, so it was left as not working'); return { on: false, start: 540, end: 1020 }; }
            if (tm.changed) cellNote(name, label, d, c, `was read as ${D.hhmm(tm.start)}–${D.hhmm(tm.end)}`);
            if (tm.several) cellNote(name, label, d, c, `has more than one time range; the longest (${D.hhmm(tm.start)}–${D.hhmm(tm.end)}) was used`);
            return { on: true, start: tm.start, end: tm.end };
          });
          wks.forEach(w => { weeks[w] = pattern; labelled.add(w); });
        });
        if (extra.length) notes.push(`${name} (${tab.trim()}): ${extra.length} row${extra.length > 1 ? 's' : ''} under this name ${extra.length > 1 ? 'were' : 'was'} not read because ${extra.length > 1 ? 'they are' : 'it is'} not labelled as a week: ${extra.map(e => `“${e.label}”`).join(', ')}. Check by hand; a note just above the next person may belong to them.`);
        // one labelled week means the same every week; otherwise unlisted weeks are weeks off
        const patterns = labelled.size <= 1 ? [weeks.find(Boolean) || D.offWeek()] : weeks.map(w => w || D.offWeek());
        const single = patterns.every(p => JSON.stringify(p) === JSON.stringify(patterns[0])) ? [patterns[0]] : patterns;
        const weekly = single.map(p => p.reduce((s, d) => s + (d.on ? d.end - d.start : 0), 0) / 60);
        const stated = said.map(s => (s.match(/(\d+(?:\.\d+)?)\s*(?:hours|hrs|hr)\b(?!\s*(?:\/|per)\s*day)/i) || [])[1] || (/^\d+(\.0)?$/.test(s) && +s >= 4 && +s <= 60 ? s : null)).find(Boolean);
        const hours = stated ? +stated : Math.min(48, Math.round(Math.max(...weekly)));
        if (!stated && Math.max(...weekly) > 0) notes.push(`${name}: no weekly hours were stated, so ${hours} h was taken from the availability listed.`);
        if (Math.max(...weekly) === 0) notes.push(`${name} (${tab.trim()}) has no availability listed, so cannot be scheduled until hours are added on the Team tab.`);
        const p = { name, primary: role, skills: [role], hours, patterns: single, treatments: treatment ? [treatment] : [], note: said.filter(s => !/^\d+(\.0)?$/.test(s)).join(' · ') };
        const id = norm(name), prev = people.get(id);
        if (!prev) people.set(id, p);
        else {
          // the same name on two tabs: one person trained in both areas
          notes.push(`${name} is on more than one tab, so was treated as one person trained for ${D.role(prev.primary).name} and ${D.role(role).name}. Split them on the Team tab if they are different people.`);
          if (!prev.skills.includes(role)) prev.skills.push(role);
          prev.treatments = [...new Set(prev.treatments.concat(p.treatments))];
          prev.hours = Math.max(prev.hours, p.hours);
          prev.note = [prev.note, p.note].filter(Boolean).join(' · ');
          const four = x => x.patterns.length === 1 ? [0, 1, 2, 3].map(() => x.patterns[0]) : x.patterns;
          const merged = four(prev).map((wkA, w) => wkA.map((a, d) => { const b = four(p)[w][d]; return !a.on ? b : !b.on ? a : { on: true, start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) }; }));
          prev.patterns = merged.every(m => JSON.stringify(m) === JSON.stringify(merged[0])) ? [merged[0]] : merged;
        }
        i = j - 1;
      }
    }
    for (const n of cellNotes.values()) notes.unshift(`${n.name}, ${D.DAYS[n.d]} (${[...new Set(n.labels)].join(', ').toLowerCase()}): “${n.c}” ${n.text}.`);
    if (Object.keys(needs).length && !needs.studio) { needs.studio = D.DAYS.map(() => []); notes.push('The Weekly Shifts tab lists no cover for the Studio, so Studio cover was set to none. Add it on the Coverage needs tab if the studio needs staffing.'); }
    if (skipped.length) notes.push(`These tabs were not imported because they are not one of the four teams: ${skipped.join(', ')}.`);
    return { people: [...people.values()], notes, needs };
  }

  // Cover needed, from rows such as "FOH (OPEN)", "THERAPIST 2" or "BARISTA/ATTENDANT 1".
  function readNeeds(rows, needs) {
    const head = rows.findIndex(r => dayCols(r));
    if (head < 0) return;
    const cols = dayCols(rows[head]), first = Math.min(...Object.values(cols));
    rows.slice(head + 1).forEach(r => {
      const label = (r || []).slice(0, first).join(' ');
      const role = /foh|front/i.test(label) ? 'foh' : /therap/i.test(label) ? 'therapy' : /barista|attendant|caf/i.test(label) ? 'cafe' : /studio|instructor/i.test(label) ? 'studio' : null;
      if (!role) return;
      needs[role] = needs[role] || D.DAYS.map(() => []);
      DAY_KEYS.forEach((_, d) => {
        const tm = parseTimes(r[cols[d]]);
        if (!tm) return;
        const same = needs[role][d].find(b => b.start === tm.start && b.end === tm.end);
        if (same) same.count++; else needs[role][d].push({ start: tm.start, end: tm.end, count: 1 });
      });
    });
    Object.values(needs).forEach(days => days.forEach(list => list.sort((a, b) => a.start - b.start)));
  }

  // ---------- the simple one-row-per-person layout ----------
  const holidays = s => String(s || '').split(/[;\n]/).map(part => { const d = part.match(/\d{4}-\d{2}-\d{2}/g); return d ? { from: d[0], to: d[1] || d[0], note: '' } : null; }).filter(Boolean);
  function readPeople(rows) {
    if (rows.length < 2) throw new Error('The sheet needs a header row and at least one person.');
    const head = rows[0].map(norm), find = (...names) => head.findIndex(h => names.includes(h));
    const cName = find('name', 'teammember', 'staff', 'employee', 'staffname'), cPrimary = find('primaryrole', 'role', 'primary', 'area', 'mainrole', 'mainarea', 'department');
    const cSkills = find('skills', 'skill', 'canwork', 'trainedfor', 'roles', 'areas'), cHours = find('hours', 'weeklyhours', 'contractedhours', 'hoursperweek', 'contracthours');
    const cHol = find('holidays', 'holiday', 'leave', 'timeoff'), cTreat = find('treatments', 'treatment', 'treatmenttypes', 'therapies');
    const cDay = D.DAYS.map((d, i) => head.findIndex(h => h === norm(D.DAY_NAMES[i]) || (h.length <= 5 && h.startsWith(DAY_KEYS[i]))));
    const cRole = {};
    head.forEach((h, i) => { const r = roleOf(h); if (r && i !== cPrimary && i !== cSkills && i !== cTreat) cRole[r] = i; });
    if (cName < 0) throw new Error('The sheet needs a column called “Name”, or the tab-per-team layout with a block for each person.');
    if (cSkills < 0 && !Object.keys(cRole).length && cPrimary < 0) throw new Error('The sheet needs a “Skills” column (for example “Café, Front of House”) or one column per area.');
    const people = [], notes = [];
    rows.slice(1).forEach((r, n) => {
      const name = (r[cName] || '').trim();
      if (!name) return;
      const p = { name }, skills = new Set();
      if (cSkills >= 0) String(r[cSkills] || '').split(/[,;/+]|\band\b/i).forEach(s => { if (!s.trim()) return; const id = roleOf(s); if (id) skills.add(id); else notes.push(`Row ${n + 2}: the skill “${s.trim()}” was not recognised.`); });
      Object.keys(cRole).forEach(id => { if (truthy(r[cRole[id]])) skills.add(id); });
      if (cPrimary >= 0 && (r[cPrimary] || '').trim()) { const id = roleOf(r[cPrimary]); if (id) { p.primary = id; skills.add(id); } else notes.push(`Row ${n + 2}: the role “${r[cPrimary].trim()}” was not recognised.`); }
      if (skills.size) p.skills = [...skills];
      if (cTreat >= 0) p.treatments = String(r[cTreat] || '').split(/[,;]/).map(s => s.trim()).filter(Boolean).map(s => { const t = treatmentOf(s); if (!t) notes.push(`Row ${n + 2}: the treatment “${s}” is not on the treatment list (Coverage needs tab).`); return t; }).filter(Boolean);
      if (cHours >= 0 && isFinite(parseFloat(r[cHours]))) p.hours = parseFloat(r[cHours]);
      if (cDay.some(c => c >= 0)) p.patterns = [cDay.map(c => { const tm = c >= 0 && parseTimes(r[c]); return tm ? { on: true, start: tm.start, end: tm.end } : { on: false, start: 540, end: 1020 }; })];
      if (cHol >= 0) p.holidays = holidays(r[cHol]);
      people.push(p);
    });
    if (!people.length) throw new Error('No rows with a name were found.');
    return { people, notes, needs: {} };
  }

  // Works out which layout a file uses and reads it.
  function readAny(book) {
    const tabs = Object.values(book);
    const flat = tabs.find(rows => rows[0] && rows[0].some(v => ['name', 'teammember', 'staff', 'employee', 'staffname'].includes(norm(v))));
    if (flat) return readPeople(flat);
    const result = readWorkbook(book);
    if (!result.people.length) throw new Error('No team members were found. The sheet needs either a “Name” column, or a tab per team with a block for each person (name, then the days of the week across the top).');
    return result;
  }

  // ---------- import ----------
  async function fetchSheet(url) {
    const id = (String(url).match(/\/spreadsheets\/d\/([\w-]+)/) || [])[1];
    if (!id) throw new Error('That does not look like a Google Sheets link. Copy the address from the browser while the sheet is open.');
    try {
      const res = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`), buf = await res.arrayBuffer();
      if (res.ok && new Uint8Array(buf)[0] === 0x50) return readXlsx(buf);
    } catch (e) { /* fall through to the message below */ }
    throw new Error('Could not read the sheet. In Google Sheets choose Share → General access → “Anyone with the link” (Viewer) and try again. Or choose File → Download → Microsoft Excel and use “Import a file”, which keeps the sheet private.');
  }
  async function readFile(file) {
    if (/\.csv$/i.test(file.name)) return { [file.name]: parseCsv(await file.text()) };
    return readXlsx(await file.arrayBuffer());
  }

  // Merge imported people into the team, matching on name. Fields missing from the sheet are left alone.
  // A sample-only team is replaced rather than merged into.
  function apply(result) {
    let added = 0, updated = 0;
    const replaced = D.state.staff.length > 0 && D.state.staff.every(s => /\(sample\)/.test(s.name));
    if (replaced) { D.state.staff = []; D.state.weeks = {}; }
    result.people.forEach(p => {
      const cur = D.state.staff.find(s => norm(s.name) === norm(p.name));
      if (cur) {
        Object.assign(cur, p);
        if (!cur.skills.includes(cur.primary)) cur.primary = cur.skills[0];
        D.normalise(cur);
        updated++;
      } else {
        const primary = p.primary || (p.skills && p.skills[0]) || 'foh';
        D.addStaff(Object.assign({}, p, { primary, skills: p.skills || [primary] }));
        added++;
      }
    });
    const areas = Object.keys(result.needs || {});
    areas.forEach(r => { D.state.needs[r] = result.needs[r]; });
    D.save();
    return { added, updated, replaced, areas };
  }

  const TEMPLATE = [['Name', 'Primary role', 'Skills', 'Treatments', 'Hours', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Holidays'],
    ['Example Person', 'Studio', 'Studio, Front of House', '', '30', '08:00-16:00', '08:00-16:00', '', '08:00-16:00', '08:00-16:00', '', '', '2026-12-24 to 2026-12-31'],
    ['Another Person', 'Therapist', 'Therapist', 'Massage, Reflexology', '20', '', '', '09:00-17:00', '09:00-17:00', '', '09:00-17:00', '', '']];

  // ---------- export ----------
  const shiftLabel = s => `${D.hhmm(s.start)}–${D.hhmm(s.end)} ${s.treatment || D.role(s.role).short}`;
  function build(wk) {
    const shifts = D.shifts(wk), dates = D.weekDates(wk), label = d => `${D.DAYS[d]} ${D.nice(dates[d])}`;
    const rota = [['Team member', 'Primary role'].concat(D.DAYS.map((_, d) => label(d)), ['Hours'])];
    D.ROLES.forEach(r => D.state.staff.filter(p => p.primary === r.id).forEach(p => {
      rota.push([p.name, r.name].concat(D.DAYS.map((_, d) => {
        const mine = shifts.filter(s => s.staffId === p.id && s.day === d).sort((a, b) => a.start - b.start);
        if (mine.length) return mine.map(shiftLabel).join('\n');
        return Engine.onHoliday(p, dates[d]) ? 'Holiday' : '';
      }), [String(D.hrs(Engine.minutes(shifts, p.id)))]));
    }));
    const list = [['Date', 'Day', 'Team member', 'Area', 'Treatment', 'Start', 'End', 'Hours']].concat(shifts.slice().sort((a, b) => a.day - b.day || a.start - b.start).map(s =>
      [dates[s.day], D.DAY_NAMES[s.day], (D.person(s.staffId) || { name: '?' }).name, D.role(s.role).name, s.treatment || '', D.hhmm(s.start), D.hhmm(s.end), String(D.hrs(s.end - s.start))]));
    const gaps = [['Day', 'Area', 'Treatment', 'From', 'To', 'People short']].concat(Engine.gaps(wk).map(g => [label(g.day), D.role(g.role).name, g.treatment || '', D.hhmm(g.start), D.hhmm(g.end), String(g.short)]));
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

  // ---------- Trybe ----------
  // Trybe (try.be) has no file import for rotas; rotas are created through its API. A practitioner's rota there is
  // a repeating cycle of N weeks made of rules { week_num, weekday, time_from, time_to }, and dated exceptions
  // ("custom availability") cover leave. This builds exactly those request bodies from four scheduled weeks.
  // Field names follow the public specification at https://docs.try.be (PractitionerRota, PractitionerCustomAvailability).
  const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  function trybe(wk, roles) {
    const weeks = [0, 1, 2, 3].map(i => D.addDays(wk, 7 * i)), last = D.addDays(wk, 27);
    const practitioners = [], notScheduled = [];
    D.state.staff.filter(p => p.skills.some(s => roles.includes(s))).forEach(p => {
      // bookable windows per week: this person's shifts in the chosen areas, with back-to-back shifts joined
      const perWeek = weeks.map(w => {
        const out = [];
        (D.state.weeks[w] || []).filter(s => s.staffId === p.id && roles.includes(s.role)).sort((a, b) => a.day - b.day || a.start - b.start).forEach(s => {
          const prev = out[out.length - 1];
          if (prev && prev.day === s.day && s.start <= prev.end) prev.end = Math.max(prev.end, s.end); else out.push({ day: s.day, start: s.start, end: s.end });
        });
        return out;
      });
      if (!perWeek.some(w => w.length)) { notScheduled.push(p.name); return; }
      const key = perWeek.map(w => JSON.stringify(w)), cycle = key.every(k => k === key[0]) ? 1 : key[0] === key[2] && key[1] === key[3] ? 2 : 4;
      const rules = [];
      for (let i = 0; i < cycle; i++) perWeek[i].forEach(r => rules.push({ week_num: i + 1, weekday: WEEKDAYS[r.day], time_from: D.hhmm(r.start), time_to: D.hhmm(r.end), offerings: [] }));
      const treatments = [];
      weeks.forEach((w, i) => (D.state.weeks[w] || []).filter(s => s.staffId === p.id && s.treatment && i < cycle).forEach(s =>
        treatments.push({ week_num: i + 1, weekday: WEEKDAYS[s.day], time_from: D.hhmm(s.start), time_to: D.hhmm(s.end), treatment: s.treatment })));
      practitioners.push({
        name: p.name, practitioner_id: '',
        rota: { practitioner_id: '', start_date: wk, end_date: null, scheduling_week_interval: cycle, availability_rules: rules },
        custom_availability: p.holidays.filter(h => h.to >= wk).map(h => ({ date_time_from: h.from + 'T00:00:00', date_time_to: D.addDays(h.to, 1) + 'T00:00:00', is_available: false })),
        treatment_specific_windows: treatments
      });
    });
    return {
      format: 'Trybe practitioner rotas', specification: 'https://docs.try.be', cycle_start: wk, cycle_end: last,
      how_to_load: [
        'Fill in practitioner_id (twice per person) with the ID from GET /shop/practitioners.',
        'POST each "rota" object to /shop/practitioner-rotas.',
        'POST each "custom_availability" object to /shop/practitioners/{practitionerId}/custom-availability.',
        'treatment_specific_windows is for reference only: to restrict a window to a treatment in Trybe, add that offering to the matching rule\'s "offerings" list.'
      ],
      weeks_without_a_rota: weeks.filter(w => !(D.state.weeks[w] || []).length), not_scheduled: notScheduled, practitioners
    };
  }
  // The same rotas as a flat list, for keying into Trybe's schedule screen by hand.
  function trybeRows(t) {
    return [['Practitioner', 'Rota starts', 'Cycle (weeks)', 'Week', 'Weekday', 'From', 'To', 'Treatment']].concat(...t.practitioners.map(p => p.rota.availability_rules.map(r =>
      [p.name, t.cycle_start, String(p.rota.scheduling_week_interval), String(r.week_num), r.weekday, r.time_from, r.time_to,
        p.treatment_specific_windows.filter(x => x.week_num === r.week_num && x.weekday === r.weekday && x.time_from >= r.time_from && x.time_to <= r.time_to).map(x => `${x.treatment} ${x.time_from}-${x.time_to}`).join('; ')])),
      ...t.practitioners.map(p => p.custom_availability.map(c => [p.name, '', '', 'time off', c.date_time_from.slice(0, 10), '', D.addDays(c.date_time_to.slice(0, 10), -1), ''])));
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

  return { parseCsv, toCsv, toTsv, readXlsx, parseTimes, readWorkbook, readPeople, readAny, fetchSheet, readFile, apply, build, send, trybe, trybeRows, shiftLabel, TEMPLATE, SCRIPT };
})();
