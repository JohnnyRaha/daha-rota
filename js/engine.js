// Scheduling logic: breaks, rule checks, coverage gaps, suggestions and capacity figures.
const Engine = (function () {
  'use strict';
  const D = Data, SLOT = 15, MIN_PIECE = 60;
  const sum = a => a.reduce((s, v) => s + v, 0);
  const onHoliday = (p, date) => p.holidays.some(h => h.from <= date && date <= h.to);
  const spans = blocks => blocks.map(b => `${D.hhmm(b.start)}–${D.hhmm(b.end)}`).join(', ');
  // The blocks a person can work on a day of a given week ([] when off or on holiday).
  const blocksOn = (p, wk, day) => onHoliday(p, D.addDays(wk, day)) ? [] : D.blocksOf(D.daysOf(p, wk)[day]);
  // Can this person do the work? A treatment, when given, must be one of theirs.
  const qualified = (p, roleId, treatment) => p.skills.includes(roleId) && (!treatment || p.treatments.includes(treatment));

  // ---------- breaks ----------
  // Break length for a continuous stretch of work: the longest break whose rule the length meets.
  function breakLength(len) {
    let m = 0;
    (D.state.settings.breaks || []).forEach(r => { if (r.inclusive ? len >= r.min : len > r.min) m = Math.max(m, r.minutes); });
    return Math.min(m, Math.max(0, len - SLOT));
  }
  // Back-to-back shifts by the same person count as one stretch of work.
  function stretches(list) {
    const out = [];
    list.slice().sort((a, b) => a.start - b.start).forEach(s => {
      const cur = out[out.length - 1];
      if (cur && s.start <= cur.end) { cur.end = Math.max(cur.end, s.end); cur.shifts.push(s); } else out.push({ start: s.start, end: s.end, shifts: [s] });
    });
    return out;
  }
  // Breaks for every person and day: "staffId|day" -> [{ start, end }]. The break sits in the middle of the
  // stretch (rounded to the quarter hour) unless a shift in it has been given a break start.
  function breakIndex(list) {
    const groups = new Map(), idx = new Map();
    list.forEach(s => { const k = s.staffId + '|' + s.day; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    for (const [k, g] of groups) {
      const out = [];
      stretches(g).forEach(st => {
        const len = st.end - st.start, b = breakLength(len);
        if (!b) return;
        const chosen = st.shifts.map(s => s.breakStart).find(x => x != null && x >= st.start && x + b <= st.end);
        const start = chosen != null ? chosen : st.start + Math.round((len - b) / 2 / SLOT) * SLOT;
        out.push({ start, end: start + b });
      });
      if (out.length) idx.set(k, out);
    }
    return idx;
  }
  const breaksOf = (idx, s) => idx.get(s.staffId + '|' + s.day) || [];
  // The parts of a shift when the person is actually working (the shift minus any break inside it).
  function pieces(s, idx) {
    let out = [{ start: s.start, end: s.end }];
    breaksOf(idx, s).forEach(b => { out = [].concat(...out.map(p => b.end <= p.start || b.start >= p.end ? [p] : [{ start: p.start, end: b.start }, { start: b.end, end: p.end }].filter(x => x.end > x.start))); });
    return out;
  }
  // The break that falls inside one shift, if any (for display).
  const breakIn = (s, idx) => breaksOf(idx, s).find(b => b.start >= s.start && b.start < s.end) || null;
  // Minutes worked after breaks, for one person (optionally one day).
  const minutes = (list, id, day) => { const mine = list.filter(s => s.staffId === id && (day == null || s.day === day)), idx = breakIndex(mine); return sum(mine.map(s => sum(pieces(s, idx).map(p => p.end - p.start)))); };
  // The break a draft shift would get, worked out with the rest of that person's day.
  function breakFor(wk, shift) {
    const list = D.shifts(wk).filter(s => s.staffId === shift.staffId && s.day === shift.day && s.id !== shift.id).concat(shift);
    return breakIn(shift, breakIndex(list)) || breaksOf(breakIndex(list), shift).find(b => b.start < shift.end && b.end > shift.start) || null;
  }
  // Net hours a block of availability gives after its break.
  const netOf = blocks => sum(stretches(blocks.map(b => ({ start: b.start, end: b.end }))).map(st => st.end - st.start - breakLength(st.end - st.start)));

  // Rule check for one shift. Returns a list of plain-language problems (empty when fine).
  function check(wk, shift) {
    const p = D.person(shift.staffId), out = [];
    if (!p) return ['No one is assigned'];
    const date = D.addDays(wk, shift.day), others = D.shifts(wk).filter(s => s.staffId === p.id && s.id !== shift.id), d = D.daysOf(p, wk)[shift.day];
    if (!p.skills.includes(shift.role)) out.push(`Not trained for ${D.role(shift.role).name}`);
    else if (shift.treatment && !p.treatments.includes(shift.treatment)) out.push(`Does not do ${shift.treatment}`);
    if (onHoliday(p, date)) out.push('On holiday');
    else if (!d.on) out.push(`Not working this ${D.DAY_NAMES[shift.day]}`);
    else {
      const avail = stretches(d.blocks.map(b => ({ start: b.start, end: b.end })));
      if (!avail.some(b => shift.start >= b.start && shift.end <= b.end)) out.push(`Outside usual hours (${spans(d.blocks)})`);
    }
    if (others.some(s => s.day === shift.day && s.start < shift.end && shift.start < s.end)) out.push('Overlaps another shift');
    const all = others.concat(shift), total = minutes(all, p.id), daily = minutes(all, p.id, shift.day);
    if (total > p.hours * 60) out.push(`Over contracted hours (${D.hrs(total)} of ${p.hours} h after breaks)`);
    if (daily > D.state.settings.maxDay * 60) out.push(`More than ${D.state.settings.maxDay} h in one day`);
    return out;
  }

  // ---------- coverage ----------
  // Every stretch of time where fewer people are working than needed, split at the boundaries of the needed blocks.
  // People on a break do not count. Cover that asks for a specific treatment is counted separately.
  function gaps(wk) {
    const shifts = D.shifts(wk), idx = breakIndex(shifts), out = [];
    for (const r of D.ROLES) for (let day = 0; day < 7; day++) {
      const all = (D.state.needs[r.id] || [])[day] || [];
      for (const lane of [...new Set(all.map(b => b.treatment || ''))]) {
        const blocks = all.filter(b => (b.treatment || '') === lane);
        const lo = Math.min(...blocks.map(b => b.start)), hi = Math.max(...blocks.map(b => b.end)), n = Math.ceil((hi - lo) / SLOT);
        const short = new Array(n).fill(0), cuts = new Set();
        blocks.forEach(b => { cuts.add(b.start); cuts.add(b.end); for (let s = b.start; s < b.end; s += SLOT) short[Math.floor((s - lo) / SLOT)] += b.count; });
        shifts.filter(s => s.role === r.id && s.day === day && (s.treatment || '') === lane).forEach(s => pieces(s, idx).forEach(p => {
          for (let m = Math.max(p.start, lo); m < Math.min(p.end, hi); m += SLOT) short[Math.floor((m - lo) / SLOT)]--;
        }));
        for (let i = 0; i < n;) {
          if (short[i] <= 0) { i++; continue; }
          let j = i + 1;
          while (j < n && short[j] === short[i] && !cuts.has(lo + j * SLOT)) j++;
          out.push({ role: r.id, day, start: lo + i * SLOT, end: lo + j * SLOT, short: short[i], treatment: lane || undefined });
          i = j;
        }
      }
    }
    return out;
  }

  // Who could cover a gap. "regular" options break no rules; "exceptions" need the owner's judgement.
  function options(wk, gap) {
    const shifts = D.shifts(wk), date = D.addDays(wk, gap.day), regular = [], exceptions = [], len = gap.end - gap.start;
    for (const p of D.state.staff) {
      if (!qualified(p, gap.role, gap.treatment) || onHoliday(p, date)) continue;
      const mine = shifts.filter(s => s.staffId === p.id && s.day === gap.day), busy = (a, b) => mine.some(s => s.start < b && a < s.end);
      const left = p.hours * 60 - minutes(shifts, p.id), dayLeft = D.state.settings.maxDay * 60 - minutes(shifts, p.id, gap.day);
      const base = { staff: p, primary: p.primary === gap.role, left };
      const blocks = blocksOn(p, wk, gap.day);
      if (!blocks.length) { if (!busy(gap.start, gap.end)) exceptions.push(Object.assign({ start: gap.start, end: gap.end, why: `Not a working day for ${p.name.split(' ')[0]} this week` }, base)); continue; }
      // longest free stretch inside both the gap and one of the person's blocks of hours
      let best = null;
      stretches(blocks.map(b => ({ start: b.start, end: b.end }))).forEach(w => {
        for (let a = Math.max(gap.start, w.start); a < Math.min(gap.end, w.end);) {
          if (busy(a, a + SLOT)) { a += SLOT; continue; }
          let b = a;
          while (b < Math.min(gap.end, w.end) && !busy(b, b + SLOT)) b += SLOT;
          if (!best || b - a > best.end - best.start) best = { start: a, end: b };
          a = b;
        }
      });
      const cap = Math.floor(Math.min(left, dayLeft) / SLOT) * SLOT;
      if (best && best.end - best.start > cap) {
        if (left < dayLeft) exceptions.push(Object.assign({ start: best.start, end: best.end, why: `Takes ${p.name.split(' ')[0]} ${D.hrs(best.end - best.start - left)} h over contracted hours` }, base));
        best = cap >= MIN_PIECE ? { start: best.start, end: best.start + cap } : null;
      }
      const whole = best && best.end - best.start === len;
      if (best && (best.end - best.start >= MIN_PIECE || whole)) regular.push(Object.assign({ start: best.start, end: best.end, full: whole }, base));
      const inside = stretches(blocks.map(b => ({ start: b.start, end: b.end }))).some(w => gap.start >= w.start && gap.end <= w.end);
      if (!whole && !inside && !busy(gap.start, gap.end) && left >= len && !exceptions.some(o => o.staff === p))
        exceptions.push(Object.assign({ start: gap.start, end: gap.end, why: `Partly outside usual hours (${spans(blocks)})` }, base));
    }
    const rank = o => (o.full ? 1e6 : 0) + (o.end - o.start) * 100 + (o.primary ? 5000 : 0) + o.left / 10;
    regular.sort((a, b) => rank(b) - rank(a));
    exceptions.sort((a, b) => (b.primary - a.primary) || b.left - a.left);
    return { regular, exceptions };
  }

  // Join back-to-back shifts for the same person, area and treatment.
  function tidy(wk) {
    const list = D.shifts(wk).sort((a, b) => a.staffId - b.staffId || a.day - b.day || a.start - b.start);
    for (let i = list.length - 1; i > 0; i--) {
      const a = list[i - 1], b = list[i];
      if (a.staffId === b.staffId && a.day === b.day && a.role === b.role && (a.treatment || '') === (b.treatment || '') && a.end === b.start) { a.end = b.end; list.splice(i, 1); }
    }
  }

  // ---------- working hours to rota ----------
  // Puts people's usual working hours for this week onto the rota as shifts: one shift per block, in the
  // block's area (or the person's main area). Days that already have a shift, holidays and days off are left alone.
  function fromHours(wk, ids) {
    let added = 0, kept = 0;
    D.state.staff.filter(p => !ids || ids.includes(p.id)).forEach(p => D.DAYS.forEach((_, day) => {
      const blocks = blocksOn(p, wk, day);
      if (!blocks.length) return;
      if (D.shifts(wk).some(s => s.staffId === p.id && s.day === day)) { kept++; return; }
      blocks.forEach(b => { D.shifts(wk).push({ id: D.newId(), staffId: p.id, role: b.role && p.skills.includes(b.role) ? b.role : p.primary, day, start: b.start, end: b.end }); added++; });
    }));
    D.save();
    return { added, kept };
  }

  // ---------- capacity ----------
  function capacity(wk) {
    const shifts = D.shifts(wk), dates = D.weekDates(wk), gs = gaps(wk);
    const availMin = p => Math.min(p.hours * 60, sum(D.DAYS.map((_, day) => netOf(blocksOn(p, wk, day)))));
    const people = D.state.staff.map(p => ({ staff: p, contract: p.hours * 60, available: availMin(p), scheduled: minutes(shifts, p.id),
      holidayDays: dates.filter((date, day) => D.daysOf(p, wk)[day].on && onHoliday(p, date)).length }));
    const need = (list, f) => sum(list.filter(f || (() => true)).map(b => (b.end - b.start) * b.count));
    const idx = breakIndex(shifts), worked = s => sum(pieces(s, idx).map(p => p.end - p.start));
    const roles = D.ROLES.map(r => {
      const days = D.state.needs[r.id] || [];
      const required = sum(days.map(d => need(d)));
      const primary = sum(people.filter(x => x.staff.primary === r.id).map(x => x.available));
      const cross = sum(people.filter(x => x.staff.primary !== r.id && x.staff.skills.includes(r.id)).map(x => x.available));
      const scheduled = sum(shifts.filter(s => s.role === r.id).map(worked));
      const unfilled = sum(gs.filter(g => g.role === r.id).map(g => (g.end - g.start) * g.short));
      const byDay = D.DAYS.map((_, day) => ({ need: need(days[day] || []), gaps: gs.filter(g => g.role === r.id && g.day === day), miss: sum(gs.filter(g => g.role === r.id && g.day === day).map(g => (g.end - g.start) * g.short)) }));
      return { role: r, required, primary, cross, scheduled, unfilled, byDay,
        people: people.filter(x => x.staff.skills.includes(r.id)).length, dedicated: people.filter(x => x.staff.primary === r.id).length };
    });
    const treatments = D.state.treatments.map(name => {
      const who = people.filter(x => qualified(x.staff, 'therapy', name));
      return { name, who: who.map(x => x.staff), available: sum(who.map(x => x.available)),
        required: sum((D.state.needs.therapy || []).map(d => need(d, b => b.treatment === name))),
        unfilled: sum(gs.filter(g => g.treatment === name).map(g => (g.end - g.start) * g.short)) };
    });
    return { roles, people, treatments, required: sum(roles.map(r => r.required)), available: sum(people.map(p => p.available)), scheduled: sum(people.map(p => p.scheduled)), unfilled: sum(roles.map(r => r.unfilled)) };
  }

  return { check, gaps, options, tidy, fromHours, capacity, onHoliday, minutes, qualified, breakLength, breakIndex, breakIn, breakFor, pieces, netOf, blocksOn, spans };
})();
