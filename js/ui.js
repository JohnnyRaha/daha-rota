// Interface: rota grid, coverage gaps, team editor, coverage needs, capacity and Google Sheets.
(function () {
  'use strict';
  const D = Data, E = Engine, $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = m => { const v = D.hrs(m); return (Number.isInteger(v) ? v : v.toFixed(1)) + ' h'; };
  const span = (a, b) => `${D.hhmm(a)}–${D.hhmm(b)}`;
  const first = p => p.name.split(' ')[0];
  const trybeRoles = () => (D.state.settings.trybeRoles || 'therapy,studio').split(',');
  let wk, tab = 'rota', selected = null, sheetLog = '', rot = 0;
  const days = p => D.daysOf(p, wk);

  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 4200);
  }
  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const roleTag = id => `<span class="tag" style="--c:${D.role(id).color}">${esc(D.role(id).short)}</span>`;
  const roleOptions = (cur, p) => D.ROLES.map(r => `<option value="${r.id}"${r.id === cur ? ' selected' : ''}>${esc(r.name)}${p && !p.skills.includes(r.id) ? ' (not trained)' : ''}</option>`).join('');

  // ---------- rota ----------
  function rotaView() {
    const shifts = D.shifts(wk), dates = D.weekDates(wk), gaps = E.gaps(wk), cap = E.capacity(wk), todayIso = D.today();
    let html = `<div class="bar">
        <button class="primary" data-act="auto" title="Keeps the shifts already on the rota and fills the remaining gaps">Fill the gaps</button>
        <button data-act="rebuild" title="Clears this week and builds the whole rota again">Build best rota from scratch</button>
        <button data-act="copyweek">Copy last week</button><button data-act="clear">Clear week</button><button data-act="print">Print</button>
        <span class="stats"><b>${h(cap.required)}</b> needed · <b>${h(cap.scheduled)}</b> scheduled · <b class="${cap.unfilled ? 'warn' : 'ok'}">${cap.unfilled ? h(cap.unfilled) + ' uncovered' : 'fully covered'}</b></span>
      </div>`;
    if (!D.state.staff.length) html += '<p class="empty">No team members yet. Add people on the <b>Team</b> tab or import them from a Google Sheet.</p>';
    html += '<div class="grid-wrap"><table class="rota"><thead><tr><th class="who">Coverage</th>'
      + dates.map((d, i) => `<th class="${d === todayIso ? 'today' : ''}">${D.DAYS[i]}<small>${D.nice(d)}</small></th>`).join('') + '<th class="hrs">Hours</th></tr>';
    cap.roles.forEach(r => {
      html += `<tr class="cover"><th class="who">${roleTag(r.role.id)} ${esc(r.role.name)}</th>` + r.byDay.map((d, i) => !d.need ? '<td class="none">–</td>'
        : d.miss ? `<td><button class="pill short" data-act="jump" data-role="${r.role.id}" data-day="${i}">${h(d.miss)} short</button></td>` : '<td><span class="pill ok">Covered</span></td>').join('')
        + `<td class="hrs">${h(r.scheduled)} / ${h(r.required)}</td></tr>`;
    });
    html += '</thead><tbody>';
    D.ROLES.forEach(r => {
      const people = D.state.staff.filter(p => p.primary === r.id);
      if (!people.length) return;
      html += `<tr class="group"><td colspan="9">${esc(r.name)}</td></tr>`;
      people.forEach(p => {
        const mins = E.minutes(shifts, p.id), over = mins > p.hours * 60;
        html += `<tr><th class="who"><button class="link" data-act="person" data-id="${p.id}">${esc(p.name)}</button><small>${p.skills.map(s => D.role(s).short).join(' · ')}${p.treatments.length ? ' · ' + p.treatments.length + ' treatment' + (p.treatments.length > 1 ? 's' : '') : ''}</small></th>`;
        dates.forEach((date, day) => {
          const mine = shifts.filter(s => s.staffId === p.id && s.day === day).sort((a, b) => a.start - b.start), hol = E.onHoliday(p, date), d = days(p)[day];
          html += `<td class="cell${hol ? ' hol' : !d.on ? ' off' : ''}" data-act="add" data-id="${p.id}" data-day="${day}">`
            + (hol ? '<span class="state">Holiday</span>' : !d.on && !mine.length ? '<span class="state">Off</span>' : !mine.length ? `<span class="avail">${span(d.start, d.end)}</span>` : '')
            + mine.map(s => { const issues = E.check(wk, s); return `<button class="shift${issues.length ? ' flag' : ''}" style="--c:${D.role(s.role).color}" data-act="edit" data-shift="${s.id}" title="${esc(issues.join('\n') || 'Click to edit')}">${span(s.start, s.end)}<small>${esc(s.treatment || D.role(s.role).short)}${issues.length ? ' ⚠' : ''}</small></button>`; }).join('')
            + '</td>';
        });
        html += `<td class="hrs${over ? ' warn' : ''}">${h(mins)}<small>of ${p.hours} h</small></td></tr>`;
      });
    });
    html += '</tbody></table></div><p class="hint">Click any cell to add a shift, or a shift to change it. Pale times show when someone is available. ⚠ marks a shift that breaks a rule; hover to see why.</p>';

    html += `<h2 id="gaps">Coverage gaps <span class="count ${gaps.length ? 'warn' : 'ok'}">${gaps.length}</span></h2>`;
    if (!gaps.length) html += '<p class="empty ok">Every area is covered for the whole week.</p>';
    gaps.forEach((g, i) => {
      const o = E.options(wk, g);
      html += `<div class="gap" id="gap-${g.role}-${g.day}" style="--c:${D.role(g.role).color}"><div class="gap-head">${roleTag(g.role)} ${g.treatment ? `<span class="treat">${esc(g.treatment)}</span> ` : ''}<b>${D.DAY_NAMES[g.day]} ${D.nice(dates[g.day])}</b> · ${span(g.start, g.end)} · <span class="warn">${g.short} ${g.short === 1 ? 'person' : 'people'} short</span></div>`;
      if (o.regular.length) html += '<div class="opts"><span class="lbl">Available</span>' + o.regular.slice(0, 6).map((c, k) =>
        `<button data-act="assign" data-gap="${i}" data-kind="regular" data-opt="${k}"><b>${esc(first(c.staff))}</b> ${span(c.start, c.end)}<small>${c.full ? 'covers it all' : 'covers part'} · ${c.primary ? 'main area' : 'cross-trained'} · ${h(c.left)} left</small></button>`).join('') + '</div>';
      if (o.exceptions.length) html += '<div class="opts exc"><span class="lbl">By exception</span>' + o.exceptions.slice(0, 4).map((c, k) =>
        `<button data-act="assign" data-gap="${i}" data-kind="exceptions" data-opt="${k}"><b>${esc(first(c.staff))}</b> ${span(c.start, c.end)}<small>${esc(c.why)}</small></button>`).join('') + '</div>';
      if (!o.regular.length && !o.exceptions.length) html += `<p class="none-free">No one ${g.treatment ? 'who does ' + esc(g.treatment) : 'trained for ' + esc(D.role(g.role).name)} is free then. Options: train someone else, change working hours on the Team tab, or reduce the cover needed.</p>`;
      html += '</div>';
    });
    return html;
  }

  function shiftDialog(shift, isNew) {
    const dlg = $('dialog'), draw = () => {
      const p = D.person(shift.staffId), issues = E.check(wk, shift).concat(shift.end <= shift.start ? ['The end time must be after the start time'] : []);
      dlg.innerHTML = `<form method="dialog"><h3>${isNew ? 'Add a shift' : 'Change shift'}</h3>
        <label>Team member<select name="staffId">${D.state.staff.map(s => `<option value="${s.id}"${s.id === shift.staffId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label>Area<select name="role">${roleOptions(shift.role, p)}</select></label>
        ${shift.role === 'therapy' ? `<label>Treatment<select name="treatment"><option value="">Any treatment (general cover)</option>${D.state.treatments.map(x => `<option${x === shift.treatment ? ' selected' : ''}${p && !p.treatments.includes(x) ? ' class="no"' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}
        <label>Day<select name="day">${D.DAY_NAMES.map((n, i) => `<option value="${i}"${i === shift.day ? ' selected' : ''}>${n} ${D.nice(D.addDays(wk, i))}</option>`).join('')}</select></label>
        <div class="two"><label>Start<input type="time" name="start" step="900" value="${D.hhmm(shift.start)}"></label><label>End<input type="time" name="end" step="900" value="${D.hhmm(shift.end)}"></label></div>
        ${issues.length ? `<ul class="issues">${issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="fine">No conflicts.</p>'}
        <div class="actions">${isNew ? '' : '<button type="button" class="danger" data-do="delete">Delete</button>'}<span></span><button type="button" data-do="cancel">Cancel</button><button type="button" class="primary" data-do="save">${issues.length && shift.end > shift.start ? 'Save anyway' : 'Save'}</button></div></form>`;
    };
    dlg.onchange = e => {
      const n = e.target.name;
      if (n === 'start' || n === 'end') shift[n] = D.t(e.target.value || '00:00'); else if (n === 'role') shift.role = e.target.value;
      else if (n === 'treatment') { if (e.target.value) shift.treatment = e.target.value; else delete shift.treatment; } else if (n) shift[n] = +e.target.value;
      if (shift.role !== 'therapy') delete shift.treatment;
      draw();
    };
    dlg.onclick = e => {
      const act = e.target.dataset.do, list = D.shifts(wk);
      if (!act) return;
      if (act === 'save') { if (shift.end <= shift.start) return; delete shift.auto; if (isNew) list.push(shift); }
      if (act === 'delete') list.splice(list.indexOf(shift), 1);
      if (act === 'cancel' && !isNew) { Object.keys(shift).forEach(k => delete shift[k]); Object.assign(shift, backup); }
      dlg.close(); D.save(); render();
    };
    const backup = Object.assign({}, shift);
    draw();
    dlg.showModal();
  }

  // ---------- team ----------
  function teamView() {
    const p = D.person(selected) || D.state.staff[0];
    selected = p ? p.id : null;
    let html = '<div class="split"><aside class="list"><button class="primary wide" data-act="newperson">+ Add team member</button>';
    D.ROLES.forEach(r => {
      const people = D.state.staff.filter(s => s.primary === r.id);
      if (people.length) html += `<h4>${esc(r.name)}</h4>` + people.map(s => `<button class="row${s.id === selected ? ' on' : ''}" data-act="select" data-id="${s.id}"><span data-name="${s.id}">${esc(s.name)}</span><small>${s.skills.length > 1 ? 'multi-skilled · ' : ''}${s.hours} h</small></button>`).join('');
    });
    html += '</aside><section class="card editor">';
    if (!p) return html + '<p class="empty">Add your first team member to get started.</p></section></div>';
    const rotating = p.patterns.length > 1, pat = p.patterns[rotating ? rot : 0];
    html += `<div class="two"><label>Name<input data-f="name" value="${esc(p.name)}"></label><label>Contracted hours per week<input type="number" min="0" max="60" step="0.5" data-f="hours" value="${p.hours}"></label></div>
      <div class="two"><label>Main area<select data-f="primary">${roleOptions(p.primary)}</select></label>
      <div class="field"><span>Trained to work in</span><div class="checks">${D.ROLES.map(r => `<label><input type="checkbox" data-skill="${r.id}"${p.skills.includes(r.id) ? ' checked' : ''}${r.id === p.primary ? ' disabled' : ''}> ${esc(r.name)}</label>`).join('')}</div></div></div>
      ${p.skills.includes('therapy') ? `<div class="field"><span>Treatments ${esc(first(p))} can do</span><div class="checks">${D.state.treatments.map(x => `<label><input type="checkbox" data-treat="${esc(x)}"${p.treatments.includes(x) ? ' checked' : ''}> ${esc(x)}</label>`).join('')}</div></div>` : ''}
      <h3>Working days and hours</h3>
      <div class="seg"><button class="${rotating ? '' : 'on'}" data-act="pattern" data-n="1">Same every week</button><button class="${rotating ? 'on' : ''}" data-act="pattern" data-n="4">4-week rotation</button>
        ${rotating ? '<span class="weeks">' + [0, 1, 2, 3].map(i => `<button class="${i === rot ? 'on' : ''}" data-act="rot" data-n="${i}">Week ${i + 1}${i === D.rotationWeek(wk) ? ' •' : ''}</button>`).join('') + '</span><button class="quiet" data-act="copyrot">Copy this week to the other three</button>' : ''}</div>
      <table class="days"><tbody>`
      + pat.map((d, i) => `<tr class="${d.on ? '' : 'offrow'}"><td><label class="chk"><input type="checkbox" data-day="${i}" data-k="on"${d.on ? ' checked' : ''}> ${D.DAY_NAMES[i]}</label></td>
        <td><input type="time" step="900" data-day="${i}" data-k="start" value="${D.hhmm(d.start)}"${d.on ? '' : ' disabled'}></td><td>to</td>
        <td><input type="time" step="900" data-day="${i}" data-k="end" value="${D.hhmm(d.end)}"${d.on ? '' : ' disabled'}></td><td class="muted">${d.on ? h(d.end - d.start) : 'not working'}</td></tr>`).join('')
      + `</tbody></table><p class="hint">${rotating ? `Rotation week ${rot + 1}: available` : 'Available'} ${h(pat.reduce((s, d) => s + (d.on ? d.end - d.start : 0), 0))} across ${pat.filter(d => d.on).length} days. ${rotating ? `The week shown on the rota is rotation week ${D.rotationWeek(wk) + 1} (•). ` : ''}The rota never gives more than the ${p.hours} contracted hours unless you override it.</p>
      <label>Notes<textarea data-f="note" rows="2" placeholder="Anything to remember when scheduling">${esc(p.note)}</textarea></label>
      <h3>Holidays and time off</h3>`
      + (p.holidays.length ? '<table class="hols"><tbody>' + p.holidays.map((x, i) => `<tr><td><input type="date" data-hol="${i}" data-k="from" value="${x.from}"></td><td>to</td><td><input type="date" data-hol="${i}" data-k="to" value="${x.to}"></td>
        <td><input placeholder="Note" data-hol="${i}" data-k="note" value="${esc(x.note || '')}"></td><td><button class="x" data-act="delhol" data-i="${i}" title="Remove">×</button></td></tr>`).join('') + '</tbody></table>' : '<p class="muted">None booked.</p>')
      + `<button data-act="addhol">+ Add time off</button><div class="foot"><button class="danger" data-act="delperson">Remove ${esc(first(p))} from the team</button></div></section></div>`;
    return html;
  }

  // ---------- coverage needs ----------
  function needsView() {
    let html = `<p class="lead">How many people each area needs, and when. The rota is checked against this, so it drives every gap and suggestion. Defaults follow the published opening hours (Mon–Fri 8:00–20:00, Sat 8:00–18:00, Sun 9:00–16:00).</p>
      <div class="card inline"><label>Longest day anyone should work<input type="number" min="4" max="14" step="0.5" data-set="maxDay" value="${D.state.settings.maxDay}"> hours</label>
        <label>Rotation week 1 starts on the week of<input type="date" data-set="rotationStart" value="${D.state.settings.rotationStart}"></label><span class="muted">This week is rotation week ${D.rotationWeek(wk) + 1}</span><button data-act="resetneeds">Reset to defaults</button></div>
      <div class="card"><label>Treatment types (separate with commas)<input data-treatlist value="${esc(D.state.treatments.join(', '))}"></label>
        <p class="hint">Tick the treatments each therapist can do on the Team tab. On a Therapists shift below, leave the treatment as “Any” for general cover, or pick one when you need someone who can do that treatment at that time. Treatment-specific cover is counted separately from general cover.</p></div><div class="needs">`;
    D.ROLES.forEach(r => {
      html += `<section class="card" style="--c:${r.color}"><h3>${roleTag(r.id)} ${esc(r.name)} <button class="quiet" data-act="copymon" data-role="${r.id}">Copy Monday to Tue–Fri</button></h3><table class="blocks"><tbody>`;
      D.DAYS.forEach((_, day) => {
        const blocks = D.state.needs[r.id][day];
        html += `<tr><th>${D.DAY_NAMES[day]}</th><td>` + (blocks.length ? '' : '<span class="muted">No cover needed</span>') + blocks.map((b, i) =>
          `<span class="block"><input type="time" step="900" data-need="${r.id}|${day}|${i}|start" value="${D.hhmm(b.start)}">–<input type="time" step="900" data-need="${r.id}|${day}|${i}|end" value="${D.hhmm(b.end)}">
           <input type="number" min="1" max="20" data-need="${r.id}|${day}|${i}|count" value="${b.count}" title="People needed"> <small>${b.count === 1 ? 'person' : 'people'}</small>
           ${r.id === 'therapy' ? `<select data-need="${r.id}|${day}|${i}|treatment" title="Treatment needed"><option value="">Any</option>${D.state.treatments.map(x => `<option${x === b.treatment ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}<button class="x" data-act="delblock" data-role="${r.id}" data-day="${day}" data-i="${i}" title="Remove">×</button></span>`).join('')
          + `<button class="quiet" data-act="addblock" data-role="${r.id}" data-day="${day}">+ shift</button></td></tr>`;
      });
      html += '</tbody></table></section>';
    });
    return html + '</div>';
  }

  // ---------- capacity ----------
  function capacityView() {
    const c = E.capacity(wk), pctOf = (a, b) => b ? Math.round(100 * a / b) : 0, bar = (v, max, color) => `<span class="bar-bg"><span style="width:${Math.min(100, pctOf(v, max))}%;background:${color}"></span></span>`;
    const insights = [];
    c.roles.forEach(r => {
      const cross = D.state.staff.filter(p => p.primary !== r.role.id && p.skills.includes(r.role.id)).map(first);
      if (r.required > r.primary + r.cross) insights.push(['bad', `${r.role.name} needs ${h(r.required)} but everyone trained for it can give at most ${h(r.primary + r.cross)} this week. That is ${h(r.required - r.primary - r.cross)} short before the rota is even built: hire, extend hours, cross-train or reduce the cover needed.`]);
      else if (r.required > r.primary) insights.push(['warn', `${r.role.name} needs ${h(r.required)} and its own team can give ${h(r.primary)}, so ${h(r.required - r.primary)} must come from cross-trained colleagues${cross.length ? ' (' + cross.join(', ') + ')' : ''}.`]);
      else insights.push(['ok', `${r.role.name}: its own team can give ${h(r.primary)} against ${h(r.required)} needed.`]);
      const worst = r.byDay.map((d, i) => [d.miss, i]).sort((a, b) => b[0] - a[0])[0];
      if (r.unfilled && r.required <= r.primary + r.cross) insights.push(['warn', `${r.role.name} still has ${h(r.unfilled)} uncovered on the rota, mostly on ${D.DAY_NAMES[worst[1]]}. The hours exist in the team but not at the right times; look at working days and hours.`]);
      if (r.dedicated === 1) insights.push(['warn', `${r.role.name} has only one dedicated person, so a single absence removes most of its cover.`]);
    });
    c.treatments.forEach(x => {
      if (!x.who.length && x.required) insights.push(['bad', `${x.name} cover is needed for ${h(x.required)} but no one on the team is marked as doing it.`]);
      else if (x.who.length === 1) insights.push(['warn', `Only ${first(x.who[0])} does ${x.name}, so it cannot be offered when they are off.`]);
      if (x.required > x.available && x.who.length) insights.push(['bad', `${x.name} cover is needed for ${h(x.required)} but the people who do it have only ${h(x.available)} available this week.`]);
    });
    const away = c.people.filter(p => p.holidayDays);
    if (away.length) insights.push(['info', `On holiday this week: ${away.map(p => `${first(p.staff)} (${p.holidayDays} working day${p.holidayDays > 1 ? 's' : ''})`).join(', ')}.`]);
    const spare = c.people.filter(p => p.available - p.scheduled >= 240).sort((a, b) => (b.available - b.scheduled) - (a.available - a.scheduled));
    if (spare.length && c.scheduled) insights.push(['info', `Spare hours this week: ${spare.slice(0, 5).map(p => `${first(p.staff)} ${h(p.available - p.scheduled)}`).join(', ')}.`]);

    let html = `<div class="tiles"><div><b>${h(c.required)}</b>cover needed</div><div><b>${h(c.available)}</b>team hours available</div><div><b>${h(c.scheduled)}</b>scheduled</div><div class="${c.unfilled ? 'warn' : 'ok'}"><b>${h(c.unfilled)}</b>uncovered</div></div>
      <h2>What the numbers say</h2><ul class="insights">${insights.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul>
      <h2>By area</h2><div class="grid-wrap"><table class="plain"><thead><tr><th>Area</th><th>Needed</th><th>Own team can give</th><th>Cross-trained cover</th><th>Scheduled</th><th>Uncovered</th><th>Covered</th></tr></thead><tbody>`
      + c.roles.map(r => `<tr><th>${roleTag(r.role.id)} ${esc(r.role.name)}<small>${r.dedicated} dedicated · ${r.people} trained</small></th><td>${h(r.required)}</td><td class="${r.primary < r.required ? 'warn' : ''}">${h(r.primary)}</td><td>${h(r.cross)}</td><td>${h(r.scheduled)}</td>
        <td class="${r.unfilled ? 'warn' : 'ok'}">${h(r.unfilled)}</td><td>${bar(r.required - r.unfilled, r.required, r.role.color)} ${pctOf(r.required - r.unfilled, r.required)}%</td></tr>`).join('')
      + `</tbody></table></div><p class="hint">“Own team can give” is the available hours of people whose main area this is; “cross-trained cover” is the hours of people from other areas who are also trained here. Cross-trained hours can only be used once, so they are not added up across areas.</p>
      <h2>Cover by day</h2><div class="grid-wrap"><table class="plain heat"><thead><tr><th>Area</th>${D.DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>`
      + c.roles.map(r => `<tr><th>${esc(r.role.name)}</th>` + r.byDay.map(d => !d.need ? '<td class="none">–</td>' : `<td class="${d.miss ? (d.miss >= d.need / 2 ? 'h2' : 'h1') : 'h0'}">${d.miss ? '−' + h(d.miss) : '✓'}</td>`).join('') + '</tr>').join('')
      + `</tbody></table></div><h2>By treatment</h2><div class="grid-wrap"><table class="plain"><thead><tr><th>Treatment</th><th>Who can do it</th><th>Their available hours</th><th>Specific cover needed</th><th>Uncovered</th></tr></thead><tbody>`
      + c.treatments.map(x => `<tr><th>${esc(x.name)}</th><td class="${x.who.length < 2 ? 'warn' : ''}" style="white-space:normal;text-align:left">${x.who.length ? x.who.map(first).map(esc).join(', ') : 'No one'}</td><td>${h(x.available)}</td><td>${x.required ? h(x.required) : '–'}</td><td class="${x.unfilled ? 'warn' : ''}">${x.required ? h(x.unfilled) : '–'}</td></tr>`).join('')
      + `</tbody></table></div><h2>By person</h2><div class="grid-wrap"><table class="plain"><thead><tr><th>Team member</th><th>Trained for</th><th>Contracted</th><th>Available this week</th><th>Scheduled</th><th>Use of available hours</th></tr></thead><tbody>`
      + c.people.map(p => `<tr><th>${esc(p.staff.name)}</th><td>${p.staff.skills.map(roleTag).join(' ')}</td><td>${h(p.contract)}</td><td>${h(p.available)}${p.holidayDays ? ' <small>holiday</small>' : ''}</td><td class="${p.scheduled > p.contract ? 'warn' : ''}">${h(p.scheduled)}</td>
        <td>${bar(p.scheduled, p.available, p.scheduled > p.contract ? '#b5523b' : D.role(p.staff.primary).color)} ${pctOf(p.scheduled, p.available)}%</td></tr>`).join('') + '</tbody></table></div>';
    return html;
  }

  // ---------- Google Sheets ----------
  function sheetsView() {
    const s = D.state.settings;
    return `<div class="cols"><section class="card"><h3>1 · Read the team, skills and hours from a Google Sheet</h3>
      <p>Two layouts are understood:</p>
      <ul><li><b>A tab per team</b> (Therapists, FOH, BaristasAttendants, Instructors, Acupuncturists), with a block for each person: their name, the days across the top, then a row for each rotation week (“WEEK 1”, “WEEK 2 &amp; 4”, “Weekly”) with times such as “7:30AM - 3:30PM”. A person on two tabs is treated as trained in both areas. A “Weekly Shifts” tab sets the cover needed.</li>
      <li><b>One row per person</b>, with a Name column and a Skills column; optional Primary role, Treatments, Hours, Mon to Sun and Holidays columns. Download the template for an example.</li></ul>
      <label>Google Sheet link<input data-set="sheetUrl" placeholder="https://docs.google.com/spreadsheets/d/…" value="${esc(s.sheetUrl)}"></label>
      <div class="btns"><button class="primary" data-act="import">Read from Google Sheet</button><button data-act="importcsv">Import a file (.xlsx or .csv)</button><button data-act="template">Download a template</button></div>
      <p class="hint">Reading from a link only works if the sheet is shared as “Anyone with the link can view”, and anyone with the link can then read everything in it, including notes about leave. To keep the sheet private, use File → Download → Microsoft Excel in Google Sheets and import that file instead: it is read in this browser and not uploaded anywhere.</p>
      ${sheetLog ? `<div class="log">${sheetLog}</div>` : ''}</section>
      <section class="card"><h3>2 · Export this week's rota to a Google Sheet</h3>
      <p><b>Quickest:</b> copy the rota and paste it into any Google Sheet.</p>
      <div class="btns"><button class="primary" data-act="copy">Copy rota for Google Sheets</button><button data-act="csv">Download rota (CSV)</button><button data-act="csvshifts">Download shift list (CSV)</button></div>
      <p><b>One-click export</b> writes three tabs (Rota, Shifts, Gaps) for the week straight into your sheet. It needs a one-off set-up:</p>
      <ol><li>Open the Google Sheet that should receive the rota and choose <b>Extensions → Apps Script</b>.</li><li>Replace what is there with the script below and save.</li>
      <li>Choose <b>Deploy → New deployment → Web app</b>; set “Execute as” to <b>Me</b> and “Who has access” to <b>Anyone</b>; then authorise it.</li><li>Copy the web app URL and paste it here.</li></ol>
      <label>Apps Script web app URL<input data-set="scriptUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(s.scriptUrl)}"></label>
      <label>Export key (optional, must match KEY in the script)<input data-set="scriptKey" value="${esc(s.scriptKey || '')}"></label>
      <div class="btns"><button class="primary" data-act="send">Send rota to Google Sheet</button><button data-act="copyscript">Copy the script</button></div>
      <details><summary>Show the script</summary><pre>${esc(Sheets.SCRIPT)}</pre></details>
      <p class="hint">Treat the web app URL like a password: anyone who has it can write rota tabs into that sheet. Setting an export key adds a second check.</p></section>
      <section class="card"><h3>3 · Export for Trybe</h3>
      <p>Trybe has no spreadsheet import for rotas. A practitioner's rota in Trybe is a repeating cycle of weeks plus dated time off, created on its schedule screen or through its API. This export turns the four weeks starting <b>${D.nice(wk)}</b> into exactly that shape.</p>
      ${(() => { const t = Sheets.trybe(wk, trybeRoles()); return `<p>${t.practitioners.length} practitioner${t.practitioners.length === 1 ? '' : 's'} ready`
        + (t.weeks_without_a_rota.length ? `. <span class="warn">${t.weeks_without_a_rota.length} of the four weeks ${t.weeks_without_a_rota.length === 1 ? 'has' : 'have'} no rota yet (${t.weeks_without_a_rota.map(D.nice).join(', ')}).</span>` : ', all four weeks scheduled.')
        + (t.not_scheduled.length ? ` Not on the rota in these weeks: ${t.not_scheduled.map(esc).join(', ')}.` : '') + '</p>'; })()}
      <label>Who is a bookable practitioner in Trybe<select data-set="trybeRoles"><option value="therapy,studio"${s.trybeRoles === 'therapy,studio' ? ' selected' : ''}>Therapists and studio</option><option value="therapy"${s.trybeRoles === 'therapy' ? ' selected' : ''}>Therapists only</option><option value="foh,cafe,therapy,studio"${s.trybeRoles === 'foh,cafe,therapy,studio' ? ' selected' : ''}>Everyone</option></select></label>
      <div class="btns"><button data-act="buildfour">Build the rota for all four weeks</button><button class="primary" data-act="trybejson">Download Trybe rota file (JSON)</button><button data-act="trybecsv">Download as a list (CSV)</button></div>
      <p class="hint">Only shifts in the chosen areas are exported, so time a multi-skilled person spends on front of house or in the café is not offered for bookings. The JSON file needs each person's Trybe practitioner ID filled in before it is loaded; the list is for entering rotas by hand. Treatments are listed for reference, because linking them needs Trybe's own offering IDs.</p>
      ${trybePanel()}</section>
      <section class="card"><h3>Backup</h3><p>Everything is stored in this browser on this computer. Download a backup to move it to another computer or keep a copy.</p>
      <div class="btns"><button data-act="backup">Download backup</button><button data-act="restore">Restore from backup</button><button data-act="sample">Load the sample team</button><button class="danger" data-act="wipe">Clear everything</button></div></section></div>`;
  }

  // ---------- Trybe connection ----------
  let trybePlan = null, trybeMsg = '', trybeResults = null;
  function trybePanel() {
    let html = '<h4>Send straight to Trybe</h4>';
    html += Trybe.connected
      ? Trybe.env === 'demo' ? '<p><span class="pill ok">Demo</span> Using a simulated Trybe built from your team. Nothing is sent anywhere. <button class="quiet" data-act="trybeforget">Leave the demo</button></p>'
        : `<p><span class="pill ok">Connected</span> ${Trybe.ENV_NAMES[Trybe.env]}${Trybe.kept ? ' · token remembered on this computer' : ' · token forgotten when this tab closes'} <button class="quiet" data-act="trybeforget">Disconnect and forget the token</button></p>`
      : '<p class="muted">Not connected. You will be asked for your Trybe API token the first time.</p>';
    html += `<div class="btns"><button class="primary" data-act="trybecheck">${trybePlan && trybePlan.wk === wk ? 'Check again' : 'Check against Trybe'}</button>${Trybe.connected ? '' : '<button data-act="trybedemo">Try it with a simulated Trybe (no token needed)</button>'}</div>`;
    if (trybeMsg) html += `<p class="${/^(Checking|Sending)/.test(trybeMsg) ? 'muted' : 'warn'}">${esc(trybeMsg)}</p>`;
    const p = trybePlan && trybePlan.wk === wk && trybePlan.env === Trybe.env ? trybePlan : null;
    if (p) {
      const ready = p.rows.filter(r => r.id && r.action !== 'skip').length;
      html += '<div class="grid-wrap"><table class="plain trybe"><thead><tr><th>Team member</th><th>In Trybe</th><th>Current rota in Trybe</th><th>New rota</th><th>What to do</th></tr></thead><tbody>'
        + p.rows.map((r, i) => `<tr><th>${esc(r.person.name)}</th>
          <td><select data-tp="${i}|id"><option value="">Not in Trybe (skip)</option>${p.practitioners.map(x => `<option value="${esc(x.id)}"${x.id === r.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${r.guessed ? '<small class="warn">matched on first name; check</small>' : ''}</td>
          <td>${r.error ? `<span class="warn">${esc(r.error)}</span>` : !r.id ? '–' : !r.existing.length ? 'None' : r.existing.map(x => `from ${x.start || '?'}${x.end ? ' to ' + x.end : ''}, ${x.scheduling_week_interval}-week cycle`).join('<br>')}</td>
          <td>${r.person.rota.scheduling_week_interval}-week cycle, ${r.person.rota.availability_rules.length} shifts${r.person.custom_availability.length ? `, ${r.person.custom_availability.length} time off` : ''}</td>
          <td><select data-tp="${i}|action"${r.id ? '' : ' disabled'}><option value="skip"${r.action === 'skip' ? ' selected' : ''}>Skip</option>
            ${r.id && !r.existing.length ? `<option value="create"${r.action === 'create' ? ' selected' : ''}>Create the rota</option>` : ''}
            ${r.id && r.existing.length && !r.blocked ? `<option value="replace"${r.action === 'replace' ? ' selected' : ''}>End the current rota on ${D.nice(D.addDays(wk, -1))} and start this one</option>` : ''}
            ${r.id && r.existing.length ? `<option value="create"${r.action === 'create' ? ' selected' : ''}>Add alongside the current rota</option>` : ''}</select>
            ${r.blocked ? '<small class="warn">Trybe already has a rota starting on or after this date. End or remove it in Trybe first.</small>' : ''}</td></tr>`).join('')
        + `</tbody></table></div>`
        + (p.weeksMissing.length ? `<p class="warn">${p.weeksMissing.length} of the four weeks ${p.weeksMissing.length === 1 ? 'has' : 'have'} no rota yet, so the cycle sent would be incomplete.</p>` : '')
        + `<div class="btns"><button class="primary" data-act="trybesend"${ready ? '' : ' disabled'}>Send ${ready} rota${ready === 1 ? '' : 's'} to Trybe (${Trybe.ENV_NAMES[p.env]})</button></div>`;
    }
    if (trybeResults) html += '<ul class="log">' + trybeResults.map(r => `<li class="${r.ok ? 'ok' : 'warn'}"><b>${esc(r.name)}</b>: ${r.ok ? 'rota created' : 'not sent. ' + esc(r.error || '')}${r.notes.length ? '; ' + r.notes.map(esc).join('; ') : ''}</li>`).join('') + '</ul>';
    return html + '<p class="hint">Start with the Playground: it is Trybe\'s test environment and changes there do not affect real bookings. The token is kept in this browser only, apart from the rota data, and is never included in backups or exports. Nothing is sent until you press Send, and existing rotas are ended rather than deleted.</p>';
  }

  function tokenDialog(next) {
    const dlg = $('dialog');
    dlg.onchange = null;
    dlg.innerHTML = `<form method="dialog"><h3>Connect to Trybe</h3>
      <p>Paste an API token from your Trybe account. If you do not have one, ask Trybe support for an API token that can manage practitioner schedules.</p>
      <label>API token<input type="password" name="token" autocomplete="off" spellcheck="false"></label>
      <label>Environment<select name="env"><option value="playground">Playground (test) — safe to try</option><option value="live">Live — real rotas and bookings</option></select></label>
      <label class="chk"><input type="checkbox" name="keep"> Remember the token on this computer</label>
      <p class="hint">Leave this unticked on a shared computer: the token is then forgotten when the tab is closed.</p>
      <ul class="issues" hidden></ul>
      <div class="actions"><span></span><button type="button" data-do="cancel">Cancel</button><button type="button" class="primary" data-do="connect">Connect</button></div></form>`;
    dlg.onclick = async e => {
      const act = e.target.dataset.do, f = dlg.querySelector('form'), err = dlg.querySelector('.issues');
      if (act === 'cancel') return dlg.close();
      if (act !== 'connect') return;
      if (!f.token.value.trim()) { err.hidden = false; err.innerHTML = '<li>Paste the token first.</li>'; return; }
      e.target.disabled = true; e.target.textContent = 'Checking…';
      try {
        const n = await Trybe.connect(f.token.value, f.env.value, f.keep.checked);
        dlg.close(); toast(`Connected to Trybe: ${n} practitioner${n === 1 ? '' : 's'} found.`);
        trybePlan = null; trybeResults = null; render();
        if (next) next();
      } catch (ex) { err.hidden = false; err.innerHTML = `<li>${esc(ex.message)}</li>`; e.target.disabled = false; e.target.textContent = 'Connect'; }
    };
    dlg.showModal();
  }
  async function trybeCheck() {
    trybeMsg = 'Checking practitioners and their current rotas in Trybe…'; trybeResults = null; render();
    try { trybePlan = await Trybe.plan(wk, trybeRoles()); trybeMsg = trybePlan.rows.length ? '' : 'There is nothing to send: no one in the chosen areas is on the rota in these four weeks.'; }
    catch (e) { trybeMsg = e.message; }
    render();
  }

  // ---------- render ----------
  const VIEWS = { rota: rotaView, team: teamView, needs: needsView, capacity: capacityView, sheets: sheetsView };
  function render() {
    const dates = D.weekDates(wk), gaps = E.gaps(wk).length;
    $('weeklabel').innerHTML = `${D.nice(dates[0])} – ${D.nice(dates[6])} ${dates[6].slice(0, 4)}<small>Rotation week ${D.rotationWeek(wk) + 1}</small>`;
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab === 'rota') b.innerHTML = 'Rota' + (gaps ? ` <i>${gaps}</i>` : ''); });
    const y = $('view').scrollTop;
    $('view').innerHTML = VIEWS[tab]();
    $('view').className = tab;
    $('view').scrollTop = y;
  }
  const go = t => { tab = t; $('view').scrollTop = 0; render(); };

  // ---------- actions ----------
  const ACT = {
    auto() { const r = E.auto(wk, false); toast(r.gaps.length ? `Added ${r.added} shifts. ${r.gaps.length} gap${r.gaps.length > 1 ? 's' : ''} could not be filled within the rules.` : `Added ${r.added} shifts. The week is fully covered.`, r.gaps.length); },
    rebuild() { if (D.shifts(wk).length && !confirm('Replace every shift in this week with a newly built rota?')) return; const r = E.auto(wk, true); toast(r.gaps.length ? `Built ${r.added} shifts. ${r.gaps.length} gap${r.gaps.length > 1 ? 's' : ''} remain; see the suggestions below.` : `Built ${r.added} shifts. The week is fully covered.`, r.gaps.length); },
    clear() { if (D.shifts(wk).length && confirm('Remove every shift in this week?')) { D.state.weeks[wk] = []; D.save(); } },
    copyweek() {
      const prev = D.shifts(D.addDays(wk, -7));
      if (!prev.length) return toast('Last week has no shifts to copy.', true);
      if (D.shifts(wk).length && !confirm('Replace this week with a copy of last week?')) return;
      D.state.weeks[wk] = prev.filter(s => D.person(s.staffId)).map(s => Object.assign({}, s, { id: D.newId() }));
      D.save(); toast('Copied last week. Check the ⚠ marks for holidays and changes.');
    },
    print() { window.print(); },
    jump(el) { const g = $(`gap-${el.dataset.role}-${el.dataset.day}`); if (g) { g.scrollIntoView({ behavior: 'smooth', block: 'center' }); g.classList.add('flash'); setTimeout(() => g.classList.remove('flash'), 1600); } return false; },
    person(el) { selected = +el.dataset.id; rot = D.rotationWeek(wk); go('team'); return false; },
    add(el) {
      const p = D.person(+el.dataset.id), day = +el.dataset.day, d = days(p)[day];
      shiftDialog({ id: D.newId(), staffId: p.id, role: p.primary, day, start: d.on ? d.start : D.t('09:00'), end: d.on ? Math.min(d.end, d.start + 480) : D.t('17:00') }, true);
      return false;
    },
    edit(el) { shiftDialog(D.shifts(wk).find(s => s.id === +el.dataset.shift), false); return false; },
    assign(el) {
      const g = E.gaps(wk)[+el.dataset.gap], o = E.options(wk, g)[el.dataset.kind][+el.dataset.opt];
      D.shifts(wk).push(Object.assign({ id: D.newId(), staffId: o.staff.id, role: g.role, day: g.day, start: o.start, end: o.end }, g.treatment ? { treatment: g.treatment } : {}));
      E.tidy(wk); D.save(); toast(`${first(o.staff)} added to ${D.role(g.role).name}, ${D.DAY_NAMES[g.day]} ${span(o.start, o.end)}.`);
    },
    newperson() { selected = D.addStaff({}).id; D.save(); },
    pattern(el) {
      const p = D.person(selected), cur = p.patterns[p.patterns.length > 1 ? rot : 0];
      p.patterns = +el.dataset.n === 1 ? [cur] : [0, 1, 2, 3].map(() => JSON.parse(JSON.stringify(cur)));
      rot = D.rotationWeek(wk); D.save();
    },
    rot(el) { rot = +el.dataset.n; },
    copyrot() { const p = D.person(selected); p.patterns = [0, 1, 2, 3].map(() => JSON.parse(JSON.stringify(p.patterns[rot]))); D.save(); toast('Copied to all four rotation weeks.'); },
    select(el) { selected = +el.dataset.id; rot = D.rotationWeek(wk); },
    addhol() { D.person(selected).holidays.push({ from: wk, to: wk, note: '' }); D.save(); },
    delhol(el) { D.person(selected).holidays.splice(+el.dataset.i, 1); D.save(); },
    delperson() {
      const p = D.person(selected);
      if (!confirm(`Remove ${p.name} and all of their shifts?`)) return;
      D.state.staff.splice(D.state.staff.indexOf(p), 1);
      Object.keys(D.state.weeks).forEach(k => { D.state.weeks[k] = D.state.weeks[k].filter(s => s.staffId !== p.id); });
      selected = null; D.save();
    },
    addblock(el) { const list = D.state.needs[el.dataset.role][+el.dataset.day], last = list[list.length - 1]; list.push(last ? { start: last.end, end: Math.min(last.end + 240, 1320), count: 1 } : { start: 540, end: 1020, count: 1 }); D.save(); },
    delblock(el) { D.state.needs[el.dataset.role][+el.dataset.day].splice(+el.dataset.i, 1); D.save(); },
    copymon(el) { const n = D.state.needs[el.dataset.role]; for (let d = 1; d < 5; d++) n[d] = n[0].map(b => Object.assign({}, b)); D.save(); toast('Monday copied to Tuesday–Friday.'); },
    resetneeds() { if (confirm('Reset the cover needed in every area to the defaults?')) { D.state.needs = D.defaultNeeds(); D.save(); } },
    async import() {
      sheetLog = 'Reading the sheet…'; render();
      try { importResult(Sheets.readAny(await Sheets.fetchSheet(D.state.settings.sheetUrl))); } catch (e) { sheetLog = `<span class="warn">${esc(e.message)}</span>`; }
    },
    importcsv() { $('file-csv').click(); return false; },
    template() { download('daha-team-template.csv', Sheets.toCsv(Sheets.TEMPLATE), 'text/csv'); return false; },
    async copy() {
      try { await navigator.clipboard.writeText(Sheets.toTsv(Sheets.build(wk).rota)); toast('Rota copied. Click a cell in Google Sheets and paste.'); }
      catch (e) { toast('The browser blocked copying. Use Download rota (CSV) instead.', true); }
      return false;
    },
    csv() { download(`daha-rota-${wk}.csv`, '﻿' + Sheets.toCsv(Sheets.build(wk).rota), 'text/csv'); return false; },
    csvshifts() { download(`daha-shifts-${wk}.csv`, '﻿' + Sheets.toCsv(Sheets.build(wk).shifts), 'text/csv'); return false; },
    async copyscript() { try { await navigator.clipboard.writeText(Sheets.SCRIPT); toast('Script copied.'); } catch (e) { toast('Open “Show the script” and copy it from there.', true); } return false; },
    async send() {
      toast('Sending…');
      try { const r = await Sheets.send(wk); toast(r.confirmed ? 'Rota written to the Google Sheet.' : 'Rota sent. The browser could not read the reply, so check the sheet for the new tabs.'); }
      catch (e) { toast(e.message, true); }
      return false;
    },
    buildfour() {
      let added = 0, left = 0;
      [0, 1, 2, 3].forEach(i => { const r = E.auto(D.addDays(wk, 7 * i), false); added += r.added; left += r.gaps.length; });
      toast(`Added ${added} shifts across four weeks.` + (left ? ` ${left} gaps remain; check each week on the Rota tab.` : ' Every week is fully covered.'), left > 0);
    },
    trybejson() { download(`daha-trybe-rotas-${wk}.json`, JSON.stringify(Sheets.trybe(wk, trybeRoles()), null, 2), 'application/json'); return false; },
    trybecsv() { download(`daha-trybe-rotas-${wk}.csv`, '\ufeff' + Sheets.toCsv(Sheets.trybeRows(Sheets.trybe(wk, trybeRoles()))), 'text/csv'); return false; },
    trybecheck() { if (Trybe.connected) trybeCheck(); else tokenDialog(trybeCheck); return false; },
    trybedemo() { Trybe.startDemo(); trybePlan = null; trybeResults = null; trybeCheck(); return false; },
    trybeforget() { const was = Trybe.env; Trybe.forget(); trybePlan = null; trybeResults = null; trybeMsg = ''; toast(was === 'demo' ? 'Left the demo.' : 'Disconnected. The token has been removed from this browser.'); },
    async trybesend() {
      const n = trybePlan.rows.filter(r => r.id && r.action !== 'skip').length;
      if (!confirm(`Send ${n} rota${n === 1 ? '' : 's'} to Trybe ${Trybe.ENV_NAMES[trybePlan.env]}, starting ${D.nice(wk)}?` + (trybePlan.env === 'live' ? '\n\nThis changes real availability for bookings.' : ''))) return false;
      trybeMsg = 'Sending…'; render();
      try { trybeResults = await Trybe.send(trybePlan); trybeMsg = ''; trybePlan = null; toast(`${trybeResults.filter(r => r.ok).length} of ${trybeResults.length} rotas sent to ${Trybe.env === 'demo' ? 'the simulated Trybe. Press Check again to see them there.' : 'Trybe.'}`, trybeResults.some(r => !r.ok)); }
      catch (e) { trybeMsg = e.message; }
    },
    backup() { download(`daha-rota-backup-${D.today()}.json`, JSON.stringify(D.state), 'application/json'); return false; },
    restore() { $('file-backup').click(); return false; },
    sample() { if (confirm('Replace everything with the sample team?')) { D.loadSample(); selected = null; } },
    wipe() { if (confirm('Delete the whole team, every rota and all settings from this browser?')) { D.clearAll(); selected = null; } }
  };
  function importResult(result) {
    const r = Sheets.apply(result);
    selected = null; rot = D.rotationWeek(wk);
    sheetLog = `<b>${r.added} added, ${r.updated} updated${r.replaced ? ' (the sample team was replaced)' : ''}.</b>`
      + (r.areas.length ? ` Cover needed was set for ${r.areas.map(a => D.role(a).name).join(', ')} from the Weekly Shifts tab.` : '')
      + '<ul>' + result.people.map(p => { const cur = D.state.staff.find(s => s.name === p.name) || p; return `<li><b>${esc(cur.name)}</b>: ${cur.skills.map(s => D.role(s).short).join(' + ')}${cur.treatments.length ? ' (' + cur.treatments.map(esc).join(', ') + ')' : ''}, ${cur.hours} h, ${cur.patterns.length > 1 ? '4-week rotation' : 'same every week'}</li>`; }).join('') + '</ul>'
      + (result.notes.length ? `<p class="warn"><b>${result.notes.length} thing${result.notes.length > 1 ? 's' : ''} to check:</b></p><ul class="warn">${result.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '');
    render();
  }

  // ---------- events ----------
  document.addEventListener('DOMContentLoaded', () => {
    D.load();
    wk = D.mondayOf(D.today());
    $('tabs').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); };
    $('weeknav').onclick = e => { const b = e.target.closest('button'); if (!b) return; wk = b.dataset.week === '0' ? D.mondayOf(D.today()) : D.addDays(wk, 7 * +b.dataset.week); render(); };
    $('view').addEventListener('click', async e => {
      const el = e.target.closest('[data-act]');
      if (!el || !ACT[el.dataset.act] || (el.dataset.act === 'add' && e.target.closest('.shift'))) return;
      e.stopPropagation();
      if (await ACT[el.dataset.act](el) !== false) render();
    });
    $('view').addEventListener('change', e => {
      const el = e.target, p = D.person(selected);
      let redraw = true;
      if (el.dataset.tp && trybePlan) {
        const [i, field] = el.dataset.tp.split('|'), row = trybePlan.rows[+i];
        if (field === 'action') { row.action = el.value; return render(); }
        row.id = el.value; row.guessed = false;
        return void Trybe.inspect(row, wk).then(render);
      }
      if (el.dataset.set) { D.state.settings[el.dataset.set] = el.type === 'number' ? +el.value || 10 : el.type === 'date' ? D.mondayOf(el.value || D.today()) : el.value.trim(); redraw = el.type === 'date' || el.tagName === 'SELECT'; if (el.dataset.set === 'trybeRoles') { trybePlan = null; trybeResults = null; } }
      else if (el.dataset.treatlist != null) {
        const list = [...new Set(el.value.split(',').map(x => x.trim()).filter(Boolean))];
        D.state.treatments = list;
        D.state.staff.forEach(s => { s.treatments = s.treatments.filter(x => list.includes(x)); });
        D.ROLES.forEach(r => D.state.needs[r.id].forEach(day => day.forEach(b => { if (b.treatment && !list.includes(b.treatment)) delete b.treatment; })));
      }
      else if (el.dataset.need) {
        const [r, day, i, k] = el.dataset.need.split('|'), b = D.state.needs[r][+day][+i];
        if (k === 'treatment') { if (el.value) b.treatment = el.value; else delete b.treatment; }
        else b[k] = k === 'count' ? Math.max(1, Math.round(+el.value) || 1) : D.t(el.value || '00:00');
        if (b.end <= b.start) { b.end = Math.min(b.start + 60, 1440); toast('The end must be after the start; adjusted.', true); }
      } else if (tab === 'team' && p) {
        if (el.dataset.f === 'name') { p.name = el.value.trim() || 'Unnamed'; }
        else if (el.dataset.f === 'hours') { p.hours = Math.max(0, +el.value || 0); }
        else if (el.dataset.f === 'note') { p.note = el.value; redraw = false; }
        else if (el.dataset.treat) { p.treatments = D.state.treatments.filter(x => x === el.dataset.treat ? el.checked : p.treatments.includes(x)); }
        else if (el.dataset.f === 'primary') { p.primary = el.value; D.normalise(p); }
        else if (el.dataset.skill) { p.skills = D.ROLES.map(r => r.id).filter(id => id === p.primary || (id === el.dataset.skill ? el.checked : p.skills.includes(id))); D.normalise(p); }
        else if (el.dataset.day != null) {
          const d = p.patterns[p.patterns.length > 1 ? rot : 0][+el.dataset.day], k = el.dataset.k;
          if (k === 'on') d.on = el.checked; else d[k] = D.t(el.value || '00:00');
          if (d.end <= d.start) { d.end = Math.min(d.start + 60, 1440); toast('The end must be after the start; adjusted.', true); }
        } else if (el.dataset.hol != null) {
          const x = p.holidays[+el.dataset.hol];
          x[el.dataset.k] = el.value;
          if (x.to < x.from) x.to = x.from;
          redraw = el.dataset.k !== 'note';
        } else return;
      } else return;
      D.save();
      if (redraw) render();
    });
    $('file-csv').onchange = e => {
      const f = e.target.files[0];
      if (f) Sheets.readFile(f).then(book => importResult(Sheets.readAny(book))).catch(err => { sheetLog = `<span class="warn">${esc(err.message)}</span>`; render(); });
      e.target.value = '';
    };
    $('file-backup').onchange = e => {
      const f = e.target.files[0];
      if (f) f.text().then(text => { try { D.restore(JSON.parse(text)); toast('Backup restored.'); } catch (err) { toast(err.message || 'That file could not be read.', true); } render(); });
      e.target.value = '';
    };
    render();
  });

  window.Rota = { render, go, get week() { return wk; }, set week(v) { wk = v; render(); } };
})();
