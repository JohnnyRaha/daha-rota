// Data model, persistence and sample data.
// Times are minutes from midnight. Days are 0 (Monday) to 6 (Sunday). Weeks are keyed by their Monday (YYYY-MM-DD).
const Data = (function () {
  'use strict';
  const STORE = 'daha.rota.v1';
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const ROLES = [
    { id: 'foh', name: 'Front of House', short: 'FOH', color: '#304441' },
    { id: 'cafe', name: 'Café', short: 'Café', color: '#9a7b4f' },
    { id: 'therapy', name: 'Therapists', short: 'Therapy', color: '#5f8a84' },
    { id: 'studio', name: 'Studio', short: 'Studio', color: '#6b6f9c' }
  ];
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
  const block = (start, end, count) => ({ start: t(start), end: t(end), count: count || 1 });
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
    const p = (name, primary, skills, hours, days, holidays) => ({ name, primary, skills, hours, days, holidays: holidays || [] });
    const D = (on, start, end) => DAYS.map((_, i) => on.includes(i) ? day(start, end) : off());
    return [
      p('Maeve (sample)', 'foh', ['foh'], 35, D([0, 1, 2, 3, 4], '08:00', '16:00')),
      p('Conor (sample)', 'foh', ['foh'], 30, D([1, 2, 3, 4, 5], '12:00', '20:00')),
      p('Sinéad (sample)', 'foh', ['foh', 'cafe'], 20, D([4, 5, 6], '08:00', '18:00')),
      p('Tomás (sample)', 'cafe', ['cafe'], 40, D([0, 1, 2, 3, 4], '08:00', '16:00'), [{ from: addDays(wk, 2), to: addDays(wk, 4), note: 'Annual leave' }]),
      p('Ella (sample)', 'cafe', ['cafe', 'foh'], 25, D([2, 3, 4, 5, 6], '08:00', '17:00')),
      p('Aisling (sample)', 'therapy', ['therapy'], 32, D([0, 1, 2, 3], '09:00', '20:00')),
      p('Rory (sample)', 'therapy', ['therapy'], 35, D([1, 2, 3, 4, 5], '09:00', '18:00')),
      p('Niamh (sample)', 'therapy', ['therapy', 'studio'], 30, D([0, 2, 4, 5, 6], '09:00', '20:00')),
      p('Kasia (sample)', 'therapy', ['therapy'], 24, D([3, 4, 5, 6], '09:00', '20:00')),
      p('Dev (sample)', 'therapy', ['therapy'], 20, D([0, 1, 2], '14:00', '20:00')),
      p('Orla (sample)', 'studio', ['studio', 'foh'], 30, D([0, 1, 2, 3, 4], '08:00', '20:00')),
      p('Luca (sample)', 'studio', ['studio'], 12, D([0, 5, 6], '09:00', '20:00'))
    ];
  }

  // ---------- state ----------
  let state;
  const blank = () => ({ staff: [], needs: defaultNeeds(), weeks: {}, settings: { sheetUrl: '', scriptUrl: '', maxDay: 10 }, nextId: 1 });
  const newId = () => state.nextId++;

  function addStaff(s) {
    const person = Object.assign({ id: newId(), name: 'New team member', primary: 'foh', skills: ['foh'], hours: 20, days: DAYS.map(() => off()), holidays: [] }, s);
    if (!person.skills.includes(person.primary)) person.skills.unshift(person.primary);
    state.staff.push(person);
    return person;
  }
  function loadSample() {
    state = blank();
    sampleStaff(mondayOf(today())).forEach(addStaff);
    save();
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* storage unavailable */ } }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && Array.isArray(s.staff)) { state = Object.assign(blank(), s); state.settings = Object.assign(blank().settings, s.settings); return; } } catch (e) { /* ignore */ }
    loadSample();
  }
  function restore(obj) {
    if (!obj || !Array.isArray(obj.staff) || typeof obj.needs !== 'object') throw new Error('That file is not a Dāha rota backup.');
    state = Object.assign(blank(), obj);
    save();
  }
  const shifts = wk => state.weeks[wk] || (state.weeks[wk] = []);

  return {
    DAYS, DAY_NAMES, ROLES, role, t, hhmm, hrs, addDays, mondayOf, today, weekDates, nice, defaultNeeds,
    get state() { return state; }, load, save, loadSample, restore, addStaff, newId, shifts,
    clearAll() { state = blank(); save(); },
    person: id => state.staff.find(s => s.id === id)
  };
})();
