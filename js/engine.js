// Scheduling logic: rule checks, coverage gaps, suggestions, the auto-scheduler and capacity figures.
const Engine = (function () {
  'use strict';
  const D = Data, SLOT = 15, MIN_PIECE = 60;
  const sum = a => a.reduce((s, v) => s + v, 0);
  const onHoliday = (p, date) => p.holidays.some(h => h.from <= date && date <= h.to);
  // The hours a person can work on a given day of a given week, or null.
  const windowOf = (p, day, date) => p.days[day].on && !onHoliday(p, date) ? p.days[day] : null;
  const minutes = (shifts, id, day) => sum(shifts.filter(s => s.staffId === id && (day == null || s.day === day)).map(s => s.end - s.start));

  // Rule check for one shift. Returns a list of plain-language problems (empty when fine).
  function check(wk, shift) {
    const p = D.person(shift.staffId), out = [];
    if (!p) return ['No one is assigned'];
    const date = D.addDays(wk, shift.day), others = D.shifts(wk).filter(s => s.staffId === p.id && s.id !== shift.id), d = p.days[shift.day];
    if (!p.skills.includes(shift.role)) out.push(`Not trained for ${D.role(shift.role).name}`);
    if (onHoliday(p, date)) out.push('On holiday');
    else if (!d.on) out.push(`Does not usually work ${D.DAY_NAMES[shift.day]}s`);
    else if (shift.start < d.start || shift.end > d.end) out.push(`Outside usual hours (${D.hhmm(d.start)}–${D.hhmm(d.end)})`);
    if (others.some(s => s.day === shift.day && s.start < shift.end && shift.start < s.end)) out.push('Overlaps another shift');
    const total = minutes(others, p.id) + shift.end - shift.start, daily = minutes(others, p.id, shift.day) + shift.end - shift.start;
    if (total > p.hours * 60) out.push(`Over contracted hours (${D.hrs(total)} of ${p.hours} h)`);
    if (daily > D.state.settings.maxDay * 60) out.push(`More than ${D.state.settings.maxDay} h in one day`);
    return out;
  }

  // ---------- coverage ----------
  // Every stretch of time where fewer people are scheduled than needed, split at the boundaries of the needed blocks.
  function gaps(wk) {
    const shifts = D.shifts(wk), out = [];
    for (const r of D.ROLES) for (let day = 0; day < 7; day++) {
      const blocks = (D.state.needs[r.id] || [])[day] || [];
      if (!blocks.length) continue;
      const lo = Math.min(...blocks.map(b => b.start)), hi = Math.max(...blocks.map(b => b.end)), n = Math.ceil((hi - lo) / SLOT);
      const short = new Array(n).fill(0), cuts = new Set();
      blocks.forEach(b => { cuts.add(b.start); cuts.add(b.end); for (let s = b.start; s < b.end; s += SLOT) short[(s - lo) / SLOT] += b.count; });
      shifts.filter(s => s.role === r.id && s.day === day).forEach(s => { for (let m = Math.max(s.start, lo); m < Math.min(s.end, hi); m += SLOT) short[Math.floor((m - lo) / SLOT)]--; });
      for (let i = 0; i < n;) {
        if (short[i] <= 0) { i++; continue; }
        let j = i + 1;
        while (j < n && short[j] === short[i] && !cuts.has(lo + j * SLOT)) j++;
        out.push({ role: r.id, day, start: lo + i * SLOT, end: lo + j * SLOT, short: short[i] });
        i = j;
      }
    }
    return out;
  }

  // Who could cover a gap. "regular" options break no rules; "exceptions" need the owner's judgement.
  function options(wk, gap) {
    const shifts = D.shifts(wk), date = D.addDays(wk, gap.day), regular = [], exceptions = [], len = gap.end - gap.start;
    for (const p of D.state.staff) {
      if (!p.skills.includes(gap.role) || onHoliday(p, date)) continue;
      const mine = shifts.filter(s => s.staffId === p.id && s.day === gap.day), busy = (a, b) => mine.some(s => s.start < b && a < s.end);
      const left = p.hours * 60 - minutes(shifts, p.id), dayLeft = D.state.settings.maxDay * 60 - minutes(shifts, p.id, gap.day);
      const base = { staff: p, primary: p.primary === gap.role, left };
      const w = windowOf(p, gap.day, date);
      if (!w) { if (!busy(gap.start, gap.end)) exceptions.push(Object.assign({ start: gap.start, end: gap.end, why: `Not a usual working day for ${p.name.split(' ')[0]}` }, base)); continue; }
      // longest free stretch inside both the gap and the person's hours
      let best = null;
      for (let a = Math.max(gap.start, w.start); a < Math.min(gap.end, w.end);) {
        if (busy(a, a + SLOT)) { a += SLOT; continue; }
        let b = a;
        while (b < Math.min(gap.end, w.end) && !busy(b, b + SLOT)) b += SLOT;
        if (!best || b - a > best.end - best.start) best = { start: a, end: b };
        a = b;
      }
      const cap = Math.floor(Math.min(left, dayLeft) / SLOT) * SLOT;
      if (best && best.end - best.start > cap) {
        if (left < dayLeft) exceptions.push(Object.assign({ start: best.start, end: best.end, why: `Takes ${p.name.split(' ')[0]} ${D.hrs(best.end - best.start - left)} h over contracted hours` }, base));
        best = cap >= MIN_PIECE ? { start: best.start, end: best.start + cap } : null;
      }
      if (best && (best.end - best.start >= MIN_PIECE || best.end - best.start === len)) regular.push(Object.assign({ start: best.start, end: best.end, full: best.end - best.start === len }, base));
      else if (!best && !busy(gap.start, gap.end) && (gap.start < w.start || gap.end > w.end) && left >= len)
        exceptions.push(Object.assign({ start: gap.start, end: gap.end, why: `Outside usual hours (${D.hhmm(w.start)}–${D.hhmm(w.end)})` }, base));
      if (best && !regular.some(o => o.staff === p && o.full) && (gap.start < w.start || gap.end > w.end) && !busy(gap.start, gap.end) && left >= len && !exceptions.some(o => o.staff === p))
        exceptions.push(Object.assign({ start: gap.start, end: gap.end, why: `Whole gap is outside usual hours (${D.hhmm(w.start)}–${D.hhmm(w.end)})` }, base));
    }
    const rank = o => (o.full ? 1e6 : 0) + (o.end - o.start) * 100 + (o.primary ? 5000 : 0) + o.left / 10;
    regular.sort((a, b) => rank(b) - rank(a));
    exceptions.sort((a, b) => (b.primary - a.primary) || b.left - a.left);
    return { regular, exceptions };
  }

  // ---------- auto-scheduler ----------
  // Fills the hardest gaps first. Prefers people who can cover a whole block, specialists over
  // multi-skilled staff (to keep flexible people free), and people with the most unused hours.
  function score(wk, gap, o) {
    const p = o.staff, mine = D.shifts(wk).filter(s => s.staffId === p.id && s.day === gap.day);
    const adjacent = mine.some(s => s.end === o.start || s.start === o.end);
    return (o.full ? 1000 : 600 * (o.end - o.start) / (gap.end - gap.start)) + (o.primary ? 120 : 0) - 25 * (p.skills.length - 1)
      + 60 * o.left / Math.max(60, p.hours * 60) + (mine.length ? (adjacent ? 20 : -40) : 0);
  }
  const place = (wk, o, roleId, day) => D.shifts(wk).push({ id: D.newId(), staffId: o.staff.id, role: roleId, day, start: o.start, end: o.end, auto: true });

  function auto(wk, clear) {
    if (clear) D.state.weeks[wk] = [];
    const before = D.shifts(wk).length;
    for (let guard = 0; guard < 600; guard++) {
      const tasks = gaps(wk).map(g => ({ g, c: options(wk, g).regular })).filter(x => x.c.length);
      if (!tasks.length) break;
      tasks.sort((a, b) => a.c.length - b.c.length || a.g.day - b.g.day || a.g.start - b.g.start);
      const { g, c } = tasks[0];
      place(wk, c.reduce((best, o) => score(wk, g, o) > score(wk, g, best) ? o : best, c[0]), g.role, g.day);
    }
    // repair: move someone into a remaining gap if a colleague can take over the shift they leave
    for (let changed = true, guard = 0; changed && guard < 60; guard++) {
      changed = false;
      for (const g of gaps(wk)) {
        const list = D.shifts(wk);
        for (const s of list.filter(x => x.day === g.day && x.auto)) {
          const idx = list.indexOf(s), holder = s.staffId;
          list.splice(idx, 1);
          const mover = options(wk, g).regular.find(o => o.staff.id === holder && o.full);
          const cover = mover && options(wk, { role: s.role, day: s.day, start: s.start, end: s.end }).regular.find(o => o.staff.id !== holder && o.full);
          if (cover) {
            list.push(Object.assign({}, s, { staffId: cover.staff.id }));
            place(wk, mover, g.role, g.day);
            changed = true;
            break;
          }
          list.splice(idx, 0, s);
        }
        if (changed) break;
      }
    }
    tidy(wk);
    D.save();
    return { added: D.shifts(wk).length - before, gaps: gaps(wk) };
  }

  // Join back-to-back shifts for the same person and role.
  function tidy(wk) {
    const list = D.shifts(wk).sort((a, b) => a.staffId - b.staffId || a.day - b.day || a.start - b.start);
    for (let i = list.length - 1; i > 0; i--) {
      const a = list[i - 1], b = list[i];
      if (a.staffId === b.staffId && a.day === b.day && a.role === b.role && a.end === b.start) { a.end = b.end; list.splice(i, 1); }
    }
  }

  // ---------- capacity ----------
  function capacity(wk) {
    const shifts = D.shifts(wk), dates = D.weekDates(wk), gs = gaps(wk);
    const availMin = p => Math.min(p.hours * 60, sum(dates.map((date, day) => { const w = windowOf(p, day, date); return w ? w.end - w.start : 0; })));
    const people = D.state.staff.map(p => ({ staff: p, contract: p.hours * 60, available: availMin(p), scheduled: minutes(shifts, p.id),
      holidayDays: dates.filter((date, day) => p.days[day].on && onHoliday(p, date)).length }));
    const roles = D.ROLES.map(r => {
      const required = sum((D.state.needs[r.id] || []).map(day => sum(day.map(b => (b.end - b.start) * b.count))));
      const primary = sum(people.filter(x => x.staff.primary === r.id).map(x => x.available));
      const cross = sum(people.filter(x => x.staff.primary !== r.id && x.staff.skills.includes(r.id)).map(x => x.available));
      const scheduled = sum(shifts.filter(s => s.role === r.id).map(s => s.end - s.start));
      const unfilled = sum(gs.filter(g => g.role === r.id).map(g => (g.end - g.start) * g.short));
      const byDay = D.DAYS.map((_, day) => {
        const need = sum(((D.state.needs[r.id] || [])[day] || []).map(b => (b.end - b.start) * b.count));
        const miss = sum(gs.filter(g => g.role === r.id && g.day === day).map(g => (g.end - g.start) * g.short));
        return { need, miss };
      });
      return { role: r, required, primary, cross, scheduled, unfilled, byDay,
        people: people.filter(x => x.staff.skills.includes(r.id)).length, dedicated: people.filter(x => x.staff.primary === r.id).length };
    });
    return { roles, people, required: sum(roles.map(r => r.required)), available: sum(people.map(p => p.available)), scheduled: sum(people.map(p => p.scheduled)), unfilled: sum(roles.map(r => r.unfilled)) };
  }

  return { check, gaps, options, auto, tidy, capacity, onHoliday, minutes };
})();
