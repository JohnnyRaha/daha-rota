// Data model, persistence, automatic copies and sample data.
// Times are minutes from midnight. Days are 0 (Monday) to 6 (Sunday). Weeks are keyed by their Monday (YYYY-MM-DD).
// A person's working pattern is one week that repeats, or a 2- or 4-week rotation. Each working day holds one or
// more blocks of time (more than one is a split shift), and a block can name the area it is for.
const Data = (function () {
  'use strict';
  const STORE = 'daha.rota.v1', VERSION_KEY = 'daha.rota.version', BACKED_UP = 'daha.rota.backedUp', BEFORE_UPDATE = 'daha.rota.beforeUpdate';
  const APP_VERSION = '2026-11-02';
  const CYCLE = 4, ROTATIONS = [1, 2, 4];
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const ROLES = [
    { id: 'foh', name: 'Front of House', short: 'FOH', color: '#304441' },
    { id: 'cafe', name: 'Café', short: 'Café', color: '#9a7b4f' },
    { id: 'therapy', name: 'Therapists', short: 'Therapy', color: '#5f8a84' },
    { id: 'studio', name: 'Studio', short: 'Studio', color: '#6b6f9c' }
  ];
  // Treatment categories as listed on dahawellness.com; editable on the Coverage needs tab.
  const TREATMENTS = ['Massage', 'Reflexology', 'Acupuncture', 'Energy Healing', 'Face & Body', 'Cancer Care'];
  // Break rules: a shift gets the longest break whose rule it meets. "min" is in minutes; inclusive means "at least".
  // Defaults: under 4 h none; 4 to 4.5 h 15 min; over 4.5 and under 6 h 30 min; exactly 6 h 45 min; over 6 h 1 hour.
  const BREAKS = [{ min: 240, inclusive: true, minutes: 15 }, { min: 270, inclusive: false, minutes: 30 }, { min: 360, inclusive: true, minutes: 45 }, { min: 360, inclusive: false, minutes: 60 }];
  const role = id => ROLES.find(r => r.id === id);

  // ---------- time and date helpers ----------
  const t = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
  const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const hrs = m => +(m / 60).toFixed(2);
  const iso = d => d.toISOString().slice(0, 10);
  const parse = s => new Date(s + 'T12:00:00Z');
  const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const mondayOf = s => { const d = parse(s); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const weekDates = wk => DAYS.map((_, i) => addDays(wk, i));
  const nice = s => parse(s).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  // ---------- days and patterns ----------
  const block = (start, end, roleId) => Object.assign({ start: t(start), end: t(end) }, roleId ? { role: roleId } : {});
  const workDay = (...blocks) => ({ on: true, blocks });
  const off = () => ({ on: false, blocks: [{ start: t('09:00'), end: t('17:00') }] });
  const offWeek = () => DAYS.map(() => off());
  // The blocks someone works on a day (none when the day is off). Blocks are kept sorted.
  const blocksOf = d => d && d.on ? d.blocks : [];
  // Upgrades a day saved by an earlier version ({ on, start, end }) to the block form.
  function fixDay(d) {
    if (!d) return off();
    if (!Array.isArray(d.blocks)) d.blocks = [{ start: d.start == null ? 540 : d.start, end: d.end == null ? 1020 : d.end }];
    delete d.start; delete d.end;
    d.blocks = d.blocks.filter(b => b.end > b.start).sort((a, b) => a.start - b.start);
    if (!d.blocks.length) { d.blocks = [{ start: 540, end: 1020 }]; d.on = false; }
    d.on = !!d.on;
    return d;
  }

  // ---------- coverage defaults ----------
  const need = (start, end, count, treatment) => Object.assign({ start: t(start), end: t(end), count: count || 1 }, treatment ? { treatment } : {});
  const week = (wd, sat, sun) => [wd, wd, wd, wd, wd, sat, sun].map(list => list.map(b => Object.assign({}, b)));
  // Coverage needed, based on the published opening hours (Mon–Fri 8–20, Sat 8–18, Sun 9–16).
  function defaultNeeds() {
    return {
      foh: week([need('08:00', '14:00'), need('14:00', '20:00')], [need('08:00', '13:00'), need('13:00', '18:00')], [need('09:00', '16:00')]),
      cafe: week([need('08:00', '16:00')], [need('08:00', '17:00'), need('10:00', '14:00')], [need('09:00', '16:00')]),
      therapy: week([need('09:00', '14:00', 2), need('14:00', '20:00', 2)], [need('09:00', '18:00', 2)], [need('10:00', '16:00')]),
      studio: week([need('08:00', '12:00'), need('17:00', '20:00')], [need('09:00', '13:00')], [need('09:00', '13:00')])
    };
  }

  // Fictional team so the tool can be explored before real data is entered.
  function sampleStaff(wk) {
    const p = (name, primary, skills, hours, patterns, extra) => Object.assign({ name, primary, skills, hours, patterns }, extra);
    const W = (on, ...blocks) => DAYS.map((_, i) => on.includes(i) ? workDay(...blocks.map(b => Object.assign({}, b))) : off());
    const D = (on, start, end) => [W(on, block(start, end))];
    const needs = defaultNeeds();
    needs.therapy[1].push(need('11:00', '14:00', 1, 'Acupuncture'));
    needs.therapy[5].push(need('10:00', '14:00', 1, 'Reflexology'));
    return { needs, staff: [
      p('Maeve (sample)', 'foh', ['foh'], 35, D([0, 1, 2, 3, 4], '08:00', '15:00')),
      p('Conor (sample)', 'foh', ['foh'], 30, D([1, 2, 3, 4, 5], '13:00', '20:00')),
      p('Sinéad (sample)', 'foh', ['foh', 'cafe'], 21, D([4, 5, 6], '08:00', '16:00')),
      p('Tomás (sample)', 'cafe', ['cafe'], 40, D([0, 1, 2, 3, 4], '08:00', '16:00'), { holidays: [{ from: addDays(wk, 2), to: addDays(wk, 4), note: 'Annual leave' }] }),
      p('Ella (sample)', 'cafe', ['cafe', 'foh'], 35, D([2, 3, 4, 5, 6], '08:00', '16:00')),
      p('Aisling (sample)', 'therapy', ['therapy'], 32, D([0, 1, 2, 3], '09:00', '17:00'), { treatments: ['Massage', 'Acupuncture'] }),
      p('Rory (sample)', 'therapy', ['therapy'], 35, D([1, 2, 3, 4, 5], '12:00', '20:00'), { treatments: ['Massage', 'Reflexology'] }),
      p('Niamh (sample)', 'therapy', ['therapy', 'studio'], 30, D([0, 2, 4, 5, 6], '09:00', '15:00'), { treatments: ['Massage', 'Energy Healing', 'Face & Body'] }),
      // two-week rotation: Thursday to Saturday one week, Friday to Sunday the next
      p('Kasia (sample)', 'therapy', ['therapy'], 24, [W([3, 4, 5], block('10:00', '18:00')), W([4, 5, 6], block('10:00', '18:00'))], { treatments: ['Reflexology', 'Face & Body', 'Cancer Care'] }),
      p('Dev (sample)', 'therapy', ['therapy'], 20, D([0, 1, 2], '14:00', '20:00'), { treatments: ['Massage'] }),
      // studio in the morning, front of house after
      p('Orla (sample)', 'studio', ['studio', 'foh'], 30, [W([0, 1, 2, 3, 4], block('08:00', '12:00', 'studio'), block('12:00', '14:00', 'foh'))]),
      // a split shift: early classes, then evening classes
      p('Luca (sample)', 'studio', ['studio'], 20, [W([0, 2], block('07:00', '10:00'), block('17:00', '20:00')).map((d, i) => i >= 5 ? workDay(block('09:00', '13:00')) : d)])
    ] };
  }

  // ---------- state ----------
  let state;
  const blank = () => ({ staff: [], needs: defaultNeeds(), weeks: {}, treatments: TREATMENTS.slice(), savedAt: 0,
    settings: { sheetUrl: '', scriptUrl: '', scriptKey: '', maxDay: 10, rotationStart: mondayOf(today()), trybeRoles: 'therapy,studio', breaks: BREAKS.map(b => Object.assign({}, b)) }, nextId: 1 });
  const newId = () => state.nextId++;

  // Fill in anything missing on a person (also upgrades data saved by earlier versions).
  function normalise(p) {
    if (!p.patterns) p.patterns = [p.days || offWeek()];
    delete p.days;
    if (!ROTATIONS.includes(p.patterns.length)) p.patterns = [p.patterns[0]];
    // a four-week pattern whose weeks 1 and 3, and 2 and 4, match is really a two-week rotation
    const key = p.patterns.map(w => JSON.stringify(w));
    if (p.patterns.length === 4 && key[0] === key[2] && key[1] === key[3]) p.patterns = p.patterns.slice(0, 2);
    p.patterns = p.patterns.map(w => DAYS.map((_, i) => fixDay(w[i])));
    p.holidays = p.holidays || []; p.treatments = p.treatments || []; p.note = p.note || '';
    if (!p.skills || !p.skills.length) p.skills = [p.primary];
    if (!p.skills.includes(p.primary)) p.skills.unshift(p.primary);
    if (!p.skills.includes('therapy')) p.treatments = [];
    p.patterns.forEach(w => w.forEach(d => d.blocks.forEach(b => { if (b.role && !p.skills.includes(b.role)) delete b.role; })));
    return p;
  }
  function addStaff(s) {
    const person = normalise(JSON.parse(JSON.stringify(Object.assign({ id: newId(), name: 'New team member', primary: 'foh', skills: ['foh'], hours: 20 }, s))));
    state.staff.push(person);
    return person;
  }
  function adopt(obj) {
    state = Object.assign(blank(), obj);
    state.settings = Object.assign(blank().settings, obj.settings);
    if (!Array.isArray(state.settings.breaks)) state.settings.breaks = BREAKS.map(b => Object.assign({}, b));
    state.staff.forEach(normalise);
    ROLES.forEach(r => { if (!state.needs[r.id]) state.needs[r.id] = DAYS.map(() => []); });
  }

  // ---------- saving ----------
  let snapTimer = null;
  function save() {
    state.savedAt = Date.now();
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    // keep a dated copy in this browser at most once a day
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => Snapshots.latest().then(s => { if (!s || Date.now() - s.at > 864e5) Snapshots.take('Daily copy'); }), 2000);
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(STORE); } catch (e) { /* storage unavailable */ }
    let previous = null;
    try { previous = localStorage.getItem(VERSION_KEY); localStorage.setItem(VERSION_KEY, APP_VERSION); } catch (e) { /* ignore */ }
    // keep the data exactly as the previous version left it, before this version upgrades it
    // (also in the main storage, in case the browser's database is unavailable)
    if (raw && previous !== APP_VERSION) {
      Snapshots.take(`Before updating to the ${APP_VERSION} version`, raw);
      try { localStorage.setItem(BEFORE_UPDATE, JSON.stringify({ at: Date.now(), from: previous || 'an earlier version', data: raw })); } catch (e) { /* no room; the database copy remains */ }
    }
    try { const s = JSON.parse(raw); if (s && Array.isArray(s.staff)) return adopt(s); } catch (e) { /* ignore */ }
    loadSample();
  }
  function loadSample() {
    state = blank();
    const s = sampleStaff(mondayOf(today()));
    state.needs = s.needs;
    s.staff.forEach(addStaff);
    save();
  }
  function restore(obj) {
    if (!obj || !Array.isArray(obj.staff) || typeof obj.needs !== 'object') throw new Error('That file is not a Dāha rota backup.');
    ['app', 'version', 'exportedAt'].forEach(k => delete obj[k]);
    adopt(obj);
    save();
  }
  const exportText = () => JSON.stringify(Object.assign({ app: 'Dāha rota', version: APP_VERSION, exportedAt: new Date().toISOString() }, state));
  const backedUp = {
    get at() { try { return +localStorage.getItem(BACKED_UP) || 0; } catch (e) { return 0; } },
    mark() { try { localStorage.setItem(BACKED_UP, String(Date.now())); } catch (e) { /* ignore */ } }
  };

  // ---------- automatic copies in this browser (IndexedDB, so they do not crowd the main storage) ----------
  const Snapshots = (function () {
    const KEEP = 20;
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      const r = indexedDB.open('daha-rota', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('snapshots', { keyPath: 'at' });
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
    const store = mode => db().then(d => d.transaction('snapshots', mode).objectStore('snapshots'));
    const all = () => store('readonly').then(s => new Promise(res => { const r = s.getAll(); r.onsuccess = () => res(r.result.sort((a, b) => b.at - a.at)); r.onerror = () => res([]); })).catch(() => []);
    async function take(reason, raw, retried) {
      try {
        const data = raw || JSON.stringify(state), s = await store('readwrite');
        s.put({ at: Date.now(), reason, version: APP_VERSION, data, people: (JSON.parse(data).staff || []).length });
        const list = await all();
        if (list.length > KEEP) { const w = await store('readwrite'); list.slice(KEEP).forEach(x => w.delete(x.at)); }
      } catch (e) { if (!retried) { dbp = null; await new Promise(r => setTimeout(r, 800)); return take(reason, raw, true); } /* copies are a convenience; never block the app */ }
    }
    // the copy made before the last update, from the main storage
    const beforeUpdate = () => { try { const b = JSON.parse(localStorage.getItem(BEFORE_UPDATE)); return b ? { at: b.at, reason: `As it was before the last update (kept separately)`, data: b.data, people: (JSON.parse(b.data).staff || []).length, local: true } : null; } catch (e) { return null; } };
    const withBefore = l => { const b = beforeUpdate(); return b && !l.some(x => x.data === b.data) ? l.concat(b) : l; };
    return { take, all: () => all().then(withBefore), latest: () => all().then(l => l[0] || null), get: at => all().then(l => withBefore(l).find(x => x.at === at)) };
  })();

  const shifts = wk => state.weeks[wk] || (state.weeks[wk] = []);

  // Which week of the four-week cycle a calendar week is (0 to 3), counted from the rotation start.
  const rotationWeek = wk => { const n = Math.round((parse(wk) - parse(mondayOf(state.settings.rotationStart || wk))) / 6048e5); return ((n % CYCLE) + CYCLE) % CYCLE; };
  // The seven-day working pattern that applies to a person in a given calendar week.
  const daysOf = (p, wk) => p.patterns[rotationWeek(wk) % p.patterns.length];

  return {
    DAYS, DAY_NAMES, ROLES, ROTATIONS, APP_VERSION, BREAKS, role, t, hhmm, hrs, addDays, mondayOf, today, weekDates, nice, defaultNeeds, offWeek, off, fixDay, blocksOf,
    get state() { return state; }, load, save, loadSample, restore, addStaff, normalise, newId, shifts, rotationWeek, daysOf, exportText, backedUp, Snapshots,
    clearAll() { state = blank(); save(); },
    person: id => state.staff.find(s => s.id === id)
  };
})();
