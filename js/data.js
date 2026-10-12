// Data model, persistence and sample data.
// Times are minutes from midnight. Days are 0 (Monday) to 6 (Sunday). Weeks are keyed by their Monday (YYYY-MM-DD).
// A person's working pattern is either one week that repeats, or four weeks that rotate.
const Data = (function () {
  'use strict';
  const STORE = 'daha.rota.v1', ROTATION = 4;
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

  // ---------- defaults ----------
  const day = (start, end) => ({ on: true, start: t(start), end: t(end) });
  const off = () => ({ on: false, start: t('09:00'), end: t('17:00') });
  const offWeek = () => DAYS.map(() => off());
  const block = (start, end, count, treatment) => Object.assign({ start: t(start), end: t(end), count: count || 1 }, treatment ? { treatment } : {});
  const week = (wd, sat, sun) => [wd, wd, wd, wd, wd, sat, sun].map(list => list.map(b => Object.assign({}, b)));

  // Coverage needed, based on the published opening hours (Mon–Fri 8–20, Sat 8–18, Sun 9–16).
  function defaultNeeds() {
    return {
      foh: week([block('08:00', '14:00'), block('14:00', '20:00')], [block('08:00', '13:00'), block('13:00', '18:00')], [block('09:00', '16:00')]),
      cafe: week([block('08:00', '16:00')], [block('08:00', '17:00'), block('10:00', '14:00')], [block('09:00', '16:00')]),
      therapy: week([block('09:00', '14:00', 2), block('14:00', '20:00', 2)], [block('09:00', '18:00', 2)], [block('10:00', '16:00')]),
      studio: week([block('08:00', '12:00'), block('17:00', '20:00')], [block('09:00', '13:00')], [block('09:00', '13:00')])
    };
  }

  // Fictional team so the tool can be explored before real data is entered.
  function sampleStaff(wk) {
    const p = (name, primary, skills, hours, patterns, extra) => Object.assign({ name, primary, skills, hours, patterns }, extra);
    const D = (on, start, end) => [DAYS.map((_, i) => on.includes(i) ? day(start, end) : off())];
    const needs = defaultNeeds();
    needs.therapy[1].push(block('11:00', '14:00', 1, 'Acupuncture'));
    needs.therapy[5].push(block('10:00', '14:00', 1, 'Reflexology'));
    // Kasia alternates weekends: weeks 1 and 3 Thu–Sat, weeks 2 and 4 Fri–Sun
    const a = D([3, 4, 5], '09:00', '20:00')[0], b = D([4, 5, 6], '09:00', '20:00')[0];
    return { needs, staff: [
      p('Maeve (sample)', 'foh', ['foh'], 35, D([0, 1, 2, 3, 4], '08:00', '16:00')),
      p('Conor (sample)', 'foh', ['foh'], 30, D([1, 2, 3, 4, 5], '12:00', '20:00')),
      p('Sinéad (sample)', 'foh', ['foh', 'cafe'], 20, D([4, 5, 6], '08:00', '18:00')),
      p('Tomás (sample)', 'cafe', ['cafe'], 40, D([0, 1, 2, 3, 4], '08:00', '16:00'), { holidays: [{ from: addDays(wk, 2), to: addDays(wk, 4), note: 'Annual leave' }] }),
      p('Ella (sample)', 'cafe', ['cafe', 'foh'], 25, D([2, 3, 4, 5, 6], '08:00', '17:00')),
      p('Aisling (sample)', 'therapy', ['therapy'], 32, D([0, 1, 2, 3], '09:00', '20:00'), { treatments: ['Massage', 'Acupuncture'] }),
      p('Rory (sample)', 'therapy', ['therapy'], 35, D([1, 2, 3, 4, 5], '09:00', '18:00'), { treatments: ['Massage', 'Reflexology'] }),
      p('Niamh (sample)', 'therapy', ['therapy', 'studio'], 30, D([0, 2, 4, 5, 6], '09:00', '20:00'), { treatments: ['Massage', 'Energy Healing', 'Face & Body'] }),
      p('Kasia (sample)', 'therapy', ['therapy'], 24, [a, b, a, b], { treatments: ['Reflexology', 'Face & Body', 'Cancer Care'] }),
      p('Dev (sample)', 'therapy', ['therapy'], 20, D([0, 1, 2], '14:00', '20:00'), { treatments: ['Massage'] }),
      p('Orla (sample)', 'studio', ['studio', 'foh'], 30, D([0, 1, 2, 3, 4], '08:00', '20:00')),
      p('Luca (sample)', 'studio', ['studio'], 12, D([0, 5, 6], '09:00', '20:00'))
    ] };
  }

  // ---------- state ----------
  let state;
  const blank = () => ({ staff: [], needs: defaultNeeds(), weeks: {}, treatments: TREATMENTS.slice(),
    settings: { sheetUrl: '', scriptUrl: '', scriptKey: '', maxDay: 10, rotationStart: mondayOf(today()) }, nextId: 1 });
  const newId = () => state.nextId++;

  // Fill in anything missing on a person (also upgrades data saved by earlier versions).
  function normalise(p) {
    if (!p.patterns) p.patterns = [p.days || offWeek()];
    delete p.days;
    if (p.patterns.length !== 1 && p.patterns.length !== ROTATION) p.patterns = [p.patterns[0]];
    p.holidays = p.holidays || []; p.treatments = p.treatments || []; p.note = p.note || '';
    if (!p.skills || !p.skills.length) p.skills = [p.primary];
    if (!p.skills.includes(p.primary)) p.skills.unshift(p.primary);
    if (!p.skills.includes('therapy')) p.treatments = [];
    return p;
  }
  function addStaff(s) {
    const person = normalise(JSON.parse(JSON.stringify(Object.assign({ id: newId(), name: 'New team member', primary: 'foh', skills: ['foh'], hours: 20 }, s))));
    state.staff.push(person);
    return person;
  }
  function loadSample() {
    state = blank();
    const s = sampleStaff(mondayOf(today()));
    state.needs = s.needs;
    s.staff.forEach(addStaff);
    save();
  }
  function adopt(obj) {
    state = Object.assign(blank(), obj);
    state.settings = Object.assign(blank().settings, obj.settings);
    state.staff.forEach(normalise);
    ROLES.forEach(r => { if (!state.needs[r.id]) state.needs[r.id] = DAYS.map(() => []); });
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && Array.isArray(s.staff)) return adopt(s); } catch (e) { /* ignore */ }
    loadSample();
  }
  function restore(obj) {
    if (!obj || !Array.isArray(obj.staff) || typeof obj.needs !== 'object') throw new Error('That file is not a Dāha rota backup.');
    adopt(obj);
    save();
  }
  const shifts = wk => state.weeks[wk] || (state.weeks[wk] = []);

  // Which week of the four-week rotation a calendar week is (0 to 3).
  const rotationWeek = wk => { const n = Math.round((parse(wk) - parse(mondayOf(state.settings.rotationStart || wk))) / 6048e5); return ((n % ROTATION) + ROTATION) % ROTATION; };
  // The seven-day working pattern that applies to a person in a given calendar week.
  const daysOf = (p, wk) => p.patterns[p.patterns.length === 1 ? 0 : rotationWeek(wk)];

  return {
    DAYS, DAY_NAMES, ROLES, ROTATION, role, t, hhmm, hrs, addDays, mondayOf, today, weekDates, nice, defaultNeeds, offWeek,
    get state() { return state; }, load, save, loadSample, restore, addStaff, normalise, newId, shifts, rotationWeek, daysOf,
    clearAll() { state = blank(); save(); },
    person: id => state.staff.find(s => s.id === id)
  };
})();
