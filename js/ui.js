// Interface: rota grid, coverage gaps, team editor, coverage needs, capacity, Google Sheets, Trybe and backups.
(function () {
  'use strict';
  const D = Data, E = Engine, $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const h = m => { const v = D.hrs(m); return (Number.isInteger(v) ? v : v.toFixed(1)) + ' h'; };
  const span = (a, b) => `${D.hhmm(a)}–${D.hhmm(b)}`;
  const hm = m => `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
  const first = p => p.name.split(' ')[0];
  const deep = x => JSON.parse(JSON.stringify(x));
  const trybeRoles = () => (D.state.settings.trybeRoles || 'therapy,studio').split(',');
  const ROT_NAMES = { 1: 'Same every week', 2: '2-week rotation', 4: '4-week rotation' };
  let wk, tab = 'rota', selected = null, sheetLog = '', rot = 0;
  const pattern = p => p.patterns[p.patterns.length > 1 ? rot % p.patterns.length : 0];

  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg; t.className = bad ? 'bad' : ''; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 5000);
  }
  const download = (name, text, type) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  };
  const roleTag = id => `<span class="tag" style="--c:${D.role(id).color}">${esc(D.role(id).short)}</span>`;
  const roleOptions = (cur, p) => D.ROLES.map(r => `<option value="${r.id}"${r.id === cur ? ' selected' : ''}>${esc(r.name)}${p && !p.skills.includes(r.id) ? ' (not trained)' : ''}</option>`).join('');


  // ---------- tooltips ----------
  // One place for the hover and keyboard-focus help on every control. A tip is only added where the element
  // does not already carry its own (some are built with the content, such as the reasons a shift is marked).
  const TIPS = [
    // rota
    ['[data-act=hours]', 'Puts each person\'s usual working days and hours for this week on the rota as shifts, with breaks. Days that already have shifts, holidays and days off are left alone, so it is safe to press again.'],
    ['[data-act=copyweek]', 'Replaces this week with a copy of last week\'s shifts. Check the ⚠ marks afterwards for holidays and changed hours.'],
    ['[data-act=clear]', 'Removes every shift in this week. The team and their working hours are not changed.'],
    ['[data-act=print]', 'Prints the rota grid for this week.'],
    ['.bar .stats', 'Cover needed comes from the Coverage needs tab. Worked is the hours on the rota after breaks. Uncovered is time when an area has fewer people than it needs.'],
    ['.rota [data-act=hoursone]', 'Adds this person\'s usual hours for this week only. Days that already have shifts are left alone.'],
    ['[data-act=person]', 'Open this person on the Team tab.'],
    ['.rota .avail', 'This person\'s usual working hours for the day. Click the cell to add a shift.'],
    ['.rota .state', 'Not a working day this week, or on holiday. You can still click to add a shift; it will be marked ⚠.'],
    ['.rota .pill.ok', 'Enough people for the whole of this day.'],
    ['.rota tr.cover th.who', 'Red times are gaps in cover: when this area has fewer people working than it needs, including during breaks.'],
    ['.rota td.hrs', 'Hours worked this week after breaks, against contracted hours.'],
    ['.opts:not(.exc) [data-act=assign]', 'Adds this shift to the rota. It breaks no rules. You can change it afterwards by clicking it.'],
    ['.opts.exc [data-act=assign]', 'Adds this shift even though it breaks the rule shown. Check with the person first.'],
    // team
    ['[data-act=newperson]', 'Add someone new, then fill in their details on the right.'],
    ['.list button.row', 'Show and edit this person\'s details.'],
    ['[data-f=name]', 'Their name as it should appear on the rota. Imports match people by name.'],
    ['[data-f=hours]', 'Hours a week they are contracted for, after breaks. A shift that takes the week over this is marked ⚠.'],
    ['[data-f=primary]', 'The area they normally work in. Their working hours go here unless a block of time says otherwise.'],
    ['label:has(input[data-skill])', 'Areas this person can cover. Gaps only suggest people trained for the area.'],
    ['label:has(input[data-treat])', 'Treatments this therapist can do. Used when cover asks for a specific treatment.'],
    ['[data-act=pattern][data-n="1"]', 'The same days and hours every week.'],
    ['[data-act=pattern][data-n="2"]', 'Two different weeks that alternate. Which week counts as week 1 is set on the Coverage needs tab.'],
    ['[data-act=pattern][data-n="4"]', 'Four different weeks in turn. Which week counts as week 1 is set on the Coverage needs tab.'],
    ['[data-act=rot]', 'Show and edit this week of the rotation. The dot marks the rotation week shown on the rota.'],
    ['[data-act=copyrot]', 'Copy the week shown to every week of the rotation.'],
    ['label:has(input[data-k=on])', 'Tick the days they work.'],
    ['.days input[data-k=start]', 'When this block of work starts.'],
    ['.days input[data-k=end]', 'When this block of work ends.'],
    ['.days select[data-k=role]', 'The area for this block of time. “Main area” means their main area.'],
    ['[data-act=addb]', 'Add another block of time on this day: a split shift, or time in a different area.'],
    ['[data-act=delb]', 'Remove this block of time.'],
    ['.editor [data-act=hoursone]', 'Adds these working hours to the rota for the week shown at the top. Days that already have shifts are left alone.'],
    ['[data-f=note]', 'Anything to remember when scheduling. Not used in any calculation.'],
    ['[data-act=addhol]', 'Book holiday or time off. They are not put on the rota or suggested for gaps on those days.'],
    ['[data-hol][data-k=from]', 'First day off.'],
    ['[data-hol][data-k=to]', 'Last day off.'],
    ['[data-act=delhol]', 'Remove this time off.'],
    ['[data-act=delperson]', 'Remove this person and all of their shifts.'],
    // coverage needs
    ['[data-set=maxDay]', 'No one should work more than this many hours in a day, after breaks. Longer days are marked ⚠.'],
    ['[data-set=rotationStart]', 'Pick any day in the week that counts as week 1. Two- and four-week rotations count on from here.'],
    ['[data-act=resetneeds]', 'Put the cover needed in every area back to the defaults.'],
    ['[data-br$="|inclusive"]', '“Of at least” includes the length itself; “longer than” does not.'],
    ['[data-br$="|hours"]', 'Shift length in hours, for example 4.5.'],
    ['[data-br$="|minutes"]', 'Break length in minutes.'],
    ['[data-act=delbreak]', 'Remove this rule.'],
    ['[data-act=addbreak]', 'Add another rule. A shift gets the longest break of all the rules it meets.'],
    ['[data-act=resetbreaks]', 'Use the standard rules: 15 minutes from 4 hours, 30 over 4.5 hours, 45 at 6 hours, and an hour over 6 hours.'],
    ['[data-treatlist]', 'The treatments to choose from, separated by commas.'],
    ['[data-act=copymon]', 'Make Tuesday to Friday the same as Monday for this area.'],
    ['[data-need$="|start"]', 'When this cover starts.'],
    ['[data-need$="|end"]', 'When this cover ends.'],
    ['[data-need$="|count"]', 'How many people are needed at the same time.'],
    ['[data-need$="|treatment"]', '“Any” for general cover, or a treatment someone must be able to do at that time.'],
    ['[data-act=delblock]', 'Remove this cover.'],
    ['[data-act=addblock]', 'Add another period of cover on this day.'],
    // capacity
    ['.tiles div:nth-child(1)', 'Hours of cover needed this week, from the Coverage needs tab (people × hours).'],
    ['.tiles div:nth-child(2)', 'Working hours the team has this week after breaks and holidays, capped at each person\'s contracted hours.'],
    ['.tiles div:nth-child(3)', 'Hours worked on this week\'s rota, after breaks.'],
    ['.tiles div:nth-child(4)', 'Hours when an area has fewer people working than it needs.'],
    // Google Sheets and Trybe
    ['[data-set=sheetUrl]', 'The address of the Google Sheet, copied from the browser while it is open.'],
    ['[data-act=import]', 'Reads the team from the link above. The sheet must be shared as “Anyone with the link can view”.'],
    ['[data-act=importcsv]', 'Choose an Excel (.xlsx) or CSV file. It is read in this browser and not uploaded.'],
    ['[data-act=template]', 'Download an example of the simple one-row-per-person layout.'],
    ['[data-act=copy]', 'Copies this week\'s rota so you can paste it into any Google Sheet.'],
    ['[data-act=csv]', 'Download this week\'s rota as a spreadsheet file.'],
    ['[data-act=csvshifts]', 'Download one row per shift, with breaks and hours worked.'],
    ['[data-set=scriptUrl]', 'The web app URL from Apps Script, ending in /exec. See the steps above.'],
    ['[data-set=scriptKey]', 'Optional password. It must match KEY in the script.'],
    ['[data-act=send]', 'Writes Rota, Shifts and Gaps tabs for this week into your Google Sheet. Needs the one-off set-up.'],
    ['[data-act=copyscript]', 'Copy the Apps Script to paste into your Google Sheet.'],
    ['[data-set=trybeRoles]', 'Which areas count as bookable practitioners in Trybe. Shifts in other areas are left out.'],
    ['[data-act=hoursfour]', 'Adds working hours to the rota for this week and the next three, ready for a Trybe export.'],
    ['[data-act=trybejson]', 'Download the four weeks as Trybe rotas, in the format Trybe\'s API accepts.'],
    ['[data-act=trybecsv]', 'Download the same rotas as a list, for entering in Trybe by hand.'],
    ['[data-act=trybecheck]', 'Look up your practitioners in Trybe and compare their current rotas. Asks for the API token the first time. Nothing is sent yet.'],
    ['[data-act=trybedemo]', 'Try the whole Trybe flow against a pretend Trybe built from your team. Nothing is sent anywhere.'],
    ['[data-act=trybesend]', 'Sends the rotas marked above to Trybe. You are asked to confirm first.'],
    ['[data-act=trybeforget]', 'Disconnect from Trybe and remove the token from this browser.'],
    ['[data-tp$="|id"]', 'The matching practitioner in Trybe. Pick another if the match is wrong.'],
    ['[data-tp$="|action"]', 'What to do in Trybe for this person.'],
    ['[data-act=openbackup]', 'Download a backup file, restore one, or go back to a copy the app kept automatically.'],
    ['[data-act=sample]', 'Replace everything with the made-up sample team. The current data is kept as a copy under Backup.'],
    ['[data-act=wipe]', 'Delete the team, every rota and the settings from this browser. A copy is kept under Backup.'],
    // dialogs
    ['[name=staffId]', 'Who works the shift.'],
    ['[name=role]', 'The area this shift covers. “(not trained)” means the person is not marked as trained for it.'],
    ['[name=treatment]', 'Leave as “Any” for general cover, or pick the treatment this shift is for.'],
    ['[name=breakStart]', 'When the break starts. It is placed in the middle of the shift unless you change it.'],
    ['[data-do=middle]', 'Put the break back in the middle of the shift.'],
    ['[data-do=delete]', 'Remove this shift from the rota.'],
    ['[data-do=save]', 'Save the shift. A shift that breaks a rule can still be saved; it is marked ⚠ on the rota.'],
    ['[data-do=download]', 'Download everything (team, rotas and settings) as one file. Keep it somewhere safe such as Google Drive.'],
    ['[data-do=file]', 'Replace what is in the app with a backup file. The current data is kept as a copy first.'],
    ['[data-do=snap]', 'Go back to this copy. The current data is kept as a copy first, so this can be undone.'],
    ['[name=token]', 'The API token Trybe\'s tech support sent you.'],
    ['[name=env]', 'Playground is Trybe\'s test environment. Live changes real availability for bookings.'],
    ['[name=keep]', 'Keep the token on this computer. Leave unticked on a shared computer.'],
    // how to use
    ['[data-act=goto]', 'Go to that tab.']
  ];
  function applyTips(root) {
    TIPS.forEach(([sel, text]) => root.querySelectorAll(sel).forEach(el => { if (!el.dataset.tip) el.dataset.tip = text; }));
    root.querySelectorAll('.plain thead th').forEach(th => { const t = HEAD_TIPS[th.textContent.trim()]; if (t && !th.dataset.tip) th.dataset.tip = t; });
  }
  const HEAD_TIPS = {
    'Needed': 'Hours of cover this area needs this week.',
    'Own team can give': 'Available hours, after breaks, of people whose main area this is.',
    'Cross-trained cover': 'Available hours of people from other areas who are trained for this one. They can only be used once across areas.',
    'Worked': 'Hours worked in this area on the rota, after breaks.',
    'Uncovered': 'Hours when fewer people are working than needed.',
    'Covered': 'Share of the needed hours that are covered.',
    'Available this week': 'Working hours this week after breaks and holidays, capped at contracted hours.',
    'Worked on the rota': 'Hours on this week\'s rota after breaks.',
    'Use of available hours': 'Hours worked as a share of the hours available.',
    'Their available hours': 'Available hours this week of everyone who does this treatment.',
    'Specific cover needed': 'Hours of cover that ask for this treatment on the Coverage needs tab.'
  };
  // A single floating tip, shown on hover (after a short pause) or keyboard focus.
  const tipBox = document.createElement('div');
  let tipFor = null, tipTimer = null;
  function showTip(el) {
    clearTimeout(tipTimer);
    if (!el.isConnected || !el.dataset.tip) return;
    tipFor = el;
    (el.closest('dialog') || document.body).append(tipBox);   // inside an open dialog so it shows above it
    tipBox.textContent = el.dataset.tip; tipBox.hidden = false;
    const r = el.getBoundingClientRect(), w = tipBox.offsetWidth, ht = tipBox.offsetHeight;
    let y = r.bottom + 8;
    if (y + ht > innerHeight - 8) y = r.top - ht - 8;
    tipBox.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8)) + 'px';
    tipBox.style.top = Math.max(8, y) + 'px';
  }
  function hideTip() { clearTimeout(tipTimer); tipFor = null; tipBox.hidden = true; }
  function initTips() {
    tipBox.id = 'tip'; tipBox.setAttribute('role', 'tooltip'); tipBox.hidden = true;
    document.body.append(tipBox);
    applyTips(document);
    document.addEventListener('mouseover', e => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (el === tipFor) return;
      if (!el) return hideTip();
      clearTimeout(tipTimer); tipBox.hidden = true; tipFor = el;
      tipTimer = setTimeout(() => showTip(el), 350);
    });
    document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && e.target.matches(':focus-visible')) showTip(el); else hideTip(); });
    document.addEventListener('focusout', hideTip);
    document.addEventListener('mousedown', hideTip);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
    document.addEventListener('scroll', hideTip, true);
  }

  // ---------- rota ----------
  function rotaView() {
    const shifts = D.shifts(wk), dates = D.weekDates(wk), gaps = E.gaps(wk), cap = E.capacity(wk), todayIso = D.today(), idx = E.breakIndex(shifts);
    let html = `<div class="bar">
        <button class="primary" data-act="hours">Add working hours to the rota</button>
        <button data-act="copyweek">Copy last week</button><button data-act="clear">Clear week</button><button data-act="print">Print</button>
        <span class="stats"><b>${h(cap.required)}</b> cover needed · <b>${h(cap.scheduled)}</b> worked · <b class="${cap.unfilled ? 'warn' : 'ok'}">${cap.unfilled ? h(cap.unfilled) + ' uncovered' : 'fully covered'}</b></span>
      </div>`;
    if (!D.state.staff.length) html += '<p class="empty">No team members yet. Add people on the <b>Team</b> tab or import them from a Google Sheet.</p>';
    else if (!shifts.length) html += `<p class="empty">This week has no shifts yet. Press <b>Add working hours to the rota</b> to put everyone's usual hours on it, then adjust by clicking. The gaps in cover are shown as you go.</p>`;
    html += '<div class="grid-wrap"><table class="rota"><thead><tr><th class="who">Gaps in cover</th>'
      + dates.map((d, i) => `<th class="${d === todayIso ? 'today' : ''}">${D.DAYS[i]}<small>${D.nice(d)}</small></th>`).join('') + '<th class="hrs">Hours</th></tr>';
    cap.roles.forEach(r => {
      html += `<tr class="cover"><th class="who">${roleTag(r.role.id)} ${esc(r.role.name)}</th>` + r.byDay.map(d => {
        if (!d.need) return '<td class="none">–</td>';
        if (!d.gaps.length) return '<td><span class="pill ok">Covered</span></td>';
        const shown = d.gaps.slice(0, 3);
        return '<td class="gapcell">' + shown.map(g => `<button class="pill short" data-act="jump" data-gap="${gaps.indexOf(g)}" data-tip="${D.role(g.role).name}${g.treatment ? ' (' + esc(g.treatment) + ')' : ''} is ${g.short} ${g.short === 1 ? 'person' : 'people'} short from ${span(g.start, g.end)}. Click to see who could cover it.">${span(g.start, g.end)}${g.short > 1 ? ' ×' + g.short : ''}</button>`).join('')
          + (d.gaps.length > 3 ? `<small>+${d.gaps.length - 3} more</small>` : '') + '</td>';
      }).join('') + `<td class="hrs">${h(r.scheduled)} / ${h(r.required)}</td></tr>`;
    });
    html += '</thead><tbody>';
    D.ROLES.forEach(r => {
      const people = D.state.staff.filter(p => p.primary === r.id);
      if (!people.length) return;
      html += `<tr class="group"><td colspan="9">${esc(r.name)}</td></tr>`;
      people.forEach(p => {
        const mins = E.minutes(shifts, p.id), over = mins > p.hours * 60;
        html += `<tr><th class="who"><button class="link" data-act="person" data-id="${p.id}">${esc(p.name)}</button><small>${p.skills.map(s => D.role(s).short).join(' · ')}${p.treatments.length ? ' · ' + p.treatments.length + ' treatment' + (p.treatments.length > 1 ? 's' : '') : ''}</small>
          <button class="quiet mini" data-act="hoursone" data-id="${p.id}">+ usual hours</button></th>`;
        dates.forEach((date, day) => {
          const mine = shifts.filter(s => s.staffId === p.id && s.day === day).sort((a, b) => a.start - b.start), hol = E.onHoliday(p, date), blocks = D.blocksOf(D.daysOf(p, wk)[day]);
          html += `<td class="cell${hol ? ' hol' : !blocks.length ? ' off' : ''}" data-act="add" data-id="${p.id}" data-day="${day}">`
            + (hol ? '<span class="state">Holiday</span>' : !blocks.length && !mine.length ? '<span class="state">Off</span>' : !mine.length ? `<span class="avail">${E.spans(blocks)}</span>` : '')
            + mine.map(s => {
              const issues = E.check(wk, s), b = E.breakIn(s, idx);
              return `<button class="shift${issues.length ? ' flag' : ''}" style="--c:${D.role(s.role).color}" data-act="edit" data-shift="${s.id}" data-tip="${esc(issues.length ? 'Breaks a rule:\n' + issues.join('\n') + '\nClick to change it.' : 'Click to change or delete this shift.' + (b ? ' The break is worked out from the break rules; it can be moved on the shift.' : ''))}">${span(s.start, s.end)}<small>${esc(s.treatment || D.role(s.role).short)}${issues.length ? ' ⚠' : ''}</small>${b ? `<small class="brk">Break ${span(b.start, b.end)}</small>` : ''}</button>`;
            }).join('')
            + '</td>';
        });
        html += `<td class="hrs${over ? ' warn' : ''}">${h(mins)}<small>of ${p.hours} h</small></td></tr>`;
      });
    });
    html += '</tbody></table></div><p class="hint">Click any cell to add a shift, or a shift to change it. Pale times show someone\'s usual hours. Breaks are worked out from the break rules on the Coverage needs tab and placed in the middle of each shift; while someone is on a break they do not count towards cover. Hours are hours worked, after breaks. ⚠ marks a shift that breaks a rule; hover to see why.</p>';

    html += `<h2 id="gaps">Coverage gaps <span class="count ${gaps.length ? 'warn' : 'ok'}">${gaps.length}</span></h2>`;
    if (!gaps.length) html += shifts.length ? '<p class="empty ok">Every area is covered for the whole week.</p>' : '';
    gaps.forEach((g, i) => {
      const o = E.options(wk, g);
      html += `<div class="gap" id="gap-${i}" style="--c:${D.role(g.role).color}"><div class="gap-head">${roleTag(g.role)} ${g.treatment ? `<span class="treat">${esc(g.treatment)}</span> ` : ''}<b>${D.DAY_NAMES[g.day]} ${D.nice(dates[g.day])}</b> · ${span(g.start, g.end)} · <span class="warn">${g.short} ${g.short === 1 ? 'person' : 'people'} short</span></div>`;
      if (o.regular.length) html += '<div class="opts"><span class="lbl">Could cover</span>' + o.regular.slice(0, 6).map((c, k) =>
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
      const b = shift.end > shift.start ? E.breakFor(wk, shift) : null;
      dlg.innerHTML = `<form method="dialog"><h3>${isNew ? 'Add a shift' : 'Change shift'}</h3>
        <label>Team member<select name="staffId">${D.state.staff.map(s => `<option value="${s.id}"${s.id === shift.staffId ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label>Area<select name="role">${roleOptions(shift.role, p)}</select></label>
        ${shift.role === 'therapy' ? `<label>Treatment<select name="treatment"><option value="">Any treatment (general cover)</option>${D.state.treatments.map(x => `<option${x === shift.treatment ? ' selected' : ''}${p && !p.treatments.includes(x) ? ' class="no"' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}
        <label>Day<select name="day">${D.DAY_NAMES.map((n, i) => `<option value="${i}"${i === shift.day ? ' selected' : ''}>${n} ${D.nice(D.addDays(wk, i))}</option>`).join('')}</select></label>
        <div class="two"><label>Start<input type="time" name="start" step="900" value="${D.hhmm(shift.start)}"></label><label>End<input type="time" name="end" step="900" value="${D.hhmm(shift.end)}"></label></div>
        <div class="breakrow">${b ? `<label>Break of ${b.end - b.start} minutes, starting at<input type="time" name="breakStart" step="900" value="${D.hhmm(b.start)}"></label>${shift.breakStart != null ? '<button type="button" class="quiet" data-do="middle">Put it back in the middle</button>' : '<small>Placed in the middle of the shift; change the time to move it.</small>'}`
          : `<small>No break needed for ${h(Math.max(0, shift.end - shift.start))} of work.</small>`}</div>
        ${issues.length ? `<ul class="issues">${issues.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="fine">No conflicts.</p>'}
        <div class="actions">${isNew ? '' : '<button type="button" class="danger" data-do="delete">Delete</button>'}<span></span><button type="button" data-do="cancel">Cancel</button><button type="button" class="primary" data-do="save">${issues.length && shift.end > shift.start ? 'Save anyway' : 'Save'}</button></div></form>`;
      applyTips(dlg);
    };
    dlg.onchange = e => {
      const n = e.target.name;
      if (n === 'start' || n === 'end') shift[n] = D.t(e.target.value || '00:00');
      else if (n === 'breakStart') shift.breakStart = D.t(e.target.value || '00:00');
      else if (n === 'role') shift.role = e.target.value;
      else if (n === 'treatment') { if (e.target.value) shift.treatment = e.target.value; else delete shift.treatment; } else if (n) shift[n] = +e.target.value;
      if (shift.role !== 'therapy') delete shift.treatment;
      draw();
    };
    dlg.onclick = e => {
      const act = e.target.dataset.do, list = D.shifts(wk);
      if (!act) return;
      if (act === 'middle') { delete shift.breakStart; return draw(); }
      if (act === 'save') { if (shift.end <= shift.start) return; if (isNew) list.push(shift); }
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
    const n = p.patterns.length, pat = pattern(p), current = D.rotationWeek(wk) % n, multi = p.skills.length > 1;
    const dayInfo = d => {
      const blocks = D.blocksOf(d);
      if (!blocks.length) return 'not working';
      const gross = blocks.reduce((s, b) => s + b.end - b.start, 0), net = E.netOf(blocks);
      return h(gross) + (gross > net ? `, ${gross - net} min break` : '');
    };
    html += `<div class="two"><label>Name<input data-f="name" value="${esc(p.name)}"></label><label>Contracted hours per week<input type="number" min="0" max="60" step="0.5" data-f="hours" value="${p.hours}"></label></div>
      <div class="two"><label>Main area<select data-f="primary">${roleOptions(p.primary)}</select></label>
      <div class="field"><span>Trained to work in</span><div class="checks">${D.ROLES.map(r => `<label><input type="checkbox" data-skill="${r.id}"${p.skills.includes(r.id) ? ' checked' : ''}${r.id === p.primary ? ' disabled' : ''}> ${esc(r.name)}</label>`).join('')}</div></div></div>
      ${p.skills.includes('therapy') ? `<div class="field"><span>Treatments ${esc(first(p))} can do</span><div class="checks">${D.state.treatments.map(x => `<label><input type="checkbox" data-treat="${esc(x)}"${p.treatments.includes(x) ? ' checked' : ''}> ${esc(x)}</label>`).join('')}</div></div>` : ''}
      <h3>Working days and hours</h3>
      <div class="seg">${D.ROTATIONS.map(k => `<button class="${n === k ? 'on' : ''}" data-act="pattern" data-n="${k}">${ROT_NAMES[k]}</button>`).join('')}
        ${n > 1 ? '<span class="weeks">' + [...Array(n).keys()].map(i => `<button class="${i === rot % n ? 'on' : ''}" data-act="rot" data-n="${i}">Week ${i + 1}${i === current ? ' •' : ''}</button>`).join('') + `</span><button class="quiet" data-act="copyrot">Copy this week to the other${n > 2 ? 's' : ''}</button>` : ''}</div>
      <table class="days"><tbody>`
      + pat.map((d, i) => `<tr class="${d.on ? '' : 'offrow'}"><td><label class="chk"><input type="checkbox" data-day="${i}" data-k="on"${d.on ? ' checked' : ''}> ${D.DAY_NAMES[i]}</label></td><td class="tblocks">`
        + d.blocks.map((b, j) => `<span class="tblock"><input type="time" step="900" data-day="${i}" data-b="${j}" data-k="start" value="${D.hhmm(b.start)}"${d.on ? '' : ' disabled'}>–<input type="time" step="900" data-day="${i}" data-b="${j}" data-k="end" value="${D.hhmm(b.end)}"${d.on ? '' : ' disabled'}>`
          + (multi ? `<select data-day="${i}" data-b="${j}" data-k="role"${d.on ? '' : ' disabled'}><option value="">Main area</option>${p.skills.map(s => `<option value="${s}"${b.role === s ? ' selected' : ''}>${esc(D.role(s).name)}</option>`).join('')}</select>` : '')
          + (d.blocks.length > 1 ? `<button class="x" data-act="delb" data-day="${i}" data-b="${j}">×</button>` : '') + '</span>').join('')
        + (d.on ? `<button class="quiet" data-act="addb" data-day="${i}">+ split shift</button>` : '')
        + `</td><td class="muted">${dayInfo(d)}</td></tr>`).join('')
      + `</tbody></table><p class="hint">${n > 1 ? `Rotation week ${rot % n + 1}: ` : ''}${h(pat.reduce((s, d) => s + E.netOf(D.blocksOf(d)), 0))} of work a week after breaks. ${n > 1 ? `The week shown on the rota is rotation week ${current + 1} (•). ` : ''}Use “+ split shift” for a day worked in two or more parts${multi ? ', and pick an area for a block when it is not the main area' : ''}.</p>
      <div class="btns"><button data-act="hoursone" data-id="${p.id}">Add ${esc(first(p))}'s hours to the rota for the week of ${D.nice(wk)}</button></div>
      <label>Notes<textarea data-f="note" rows="2" placeholder="Anything to remember when scheduling">${esc(p.note)}</textarea></label>
      <h3>Holidays and time off</h3>`
      + (p.holidays.length ? '<table class="hols"><tbody>' + p.holidays.map((x, i) => `<tr><td><input type="date" data-hol="${i}" data-k="from" value="${x.from}"></td><td>to</td><td><input type="date" data-hol="${i}" data-k="to" value="${x.to}"></td>
        <td><input placeholder="Note" data-hol="${i}" data-k="note" value="${esc(x.note || '')}"></td><td><button class="x" data-act="delhol" data-i="${i}" data-tip="Remove">×</button></td></tr>`).join('') + '</tbody></table>' : '<p class="muted">None booked.</p>')
      + `<button data-act="addhol">+ Add time off</button><div class="foot"><button class="danger" data-act="delperson">Remove ${esc(first(p))} from the team</button></div></section></div>`;
    return html;
  }

  // ---------- coverage needs ----------
  function needsView() {
    const rules = D.state.settings.breaks, examples = [180, 225, 240, 270, 285, 330, 360, 375, 480, 600];
    let html = `<p class="lead">How many people each area needs, and when. The rota is checked against this, so it drives every gap and suggestion. Defaults follow the published opening hours (Mon–Fri 8:00–20:00, Sat 8:00–18:00, Sun 9:00–16:00).</p>
      <div class="card inline"><label>Longest day anyone should work<input type="number" min="4" max="14" step="0.5" data-set="maxDay" value="${D.state.settings.maxDay}"> hours</label>
        <label>Rotation week 1 starts on the week of<input type="date" data-set="rotationStart" value="${D.state.settings.rotationStart}"></label><span class="muted">This week is week ${D.rotationWeek(wk) % 2 + 1} of a 2-week rotation and week ${D.rotationWeek(wk) + 1} of a 4-week one</span><button data-act="resetneeds">Reset cover to defaults</button></div>
      <div class="card"><h3>Breaks</h3><p class="hint" style="margin-top:0">Each continuous shift gets the longest break whose rule it meets, placed in the middle of the shift (it can be moved on the shift). Back-to-back shifts count as one. People on a break do not count towards cover, and hours worked exclude breaks.</p>
        <table class="brules"><tbody>` + rules.map((r, i) => `<tr><td>Shifts</td><td><select data-br="${i}|inclusive"><option value="1"${r.inclusive ? ' selected' : ''}>of at least</option><option value="0"${r.inclusive ? '' : ' selected'}>longer than</option></select></td>
          <td><input type="number" min="0" max="24" step="0.25" data-br="${i}|hours" value="${r.min / 60}"> hours</td><td>get a</td><td><input type="number" min="0" max="180" step="5" data-br="${i}|minutes" value="${r.minutes}"> minute break</td>
          <td><button class="x" data-act="delbreak" data-i="${i}">×</button></td></tr>`).join('') + `</tbody></table>
        <div class="btns"><button class="quiet" data-act="addbreak">+ Add a rule</button><button class="quiet" data-act="resetbreaks">Use the standard rules</button></div>
        <p class="muted">With these rules: ${examples.map(m => `${hm(m)} → ${E.breakLength(m) ? E.breakLength(m) + ' min' : 'no break'}`).join(' · ')}</p></div>
      <div class="card"><label>Treatment types (separate with commas)<input data-treatlist value="${esc(D.state.treatments.join(', '))}"></label>
        <p class="hint">Tick the treatments each therapist can do on the Team tab. On a Therapists shift below, leave the treatment as “Any” for general cover, or pick one when you need someone who can do that treatment at that time. Treatment-specific cover is counted separately from general cover.</p></div><div class="needs">`;
    D.ROLES.forEach(r => {
      html += `<section class="card" style="--c:${r.color}"><h3>${roleTag(r.id)} ${esc(r.name)} <button class="quiet" data-act="copymon" data-role="${r.id}">Copy Monday to Tue–Fri</button></h3><table class="blocks"><tbody>`;
      D.DAYS.forEach((_, day) => {
        const blocks = D.state.needs[r.id][day];
        html += `<tr><th>${D.DAY_NAMES[day]}</th><td>` + (blocks.length ? '' : '<span class="muted">No cover needed</span>') + blocks.map((b, i) =>
          `<span class="block"><input type="time" step="900" data-need="${r.id}|${day}|${i}|start" value="${D.hhmm(b.start)}">–<input type="time" step="900" data-need="${r.id}|${day}|${i}|end" value="${D.hhmm(b.end)}">
           <input type="number" min="1" max="20" data-need="${r.id}|${day}|${i}|count" value="${b.count}"> <small>${b.count === 1 ? 'person' : 'people'}</small>
           ${r.id === 'therapy' ? `<select data-need="${r.id}|${day}|${i}|treatment"><option value="">Any</option>${D.state.treatments.map(x => `<option${x === b.treatment ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>` : ''}<button class="x" data-act="delblock" data-role="${r.id}" data-day="${day}" data-i="${i}" data-tip="Remove">×</button></span>`).join('')
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
      if (r.required > r.primary + r.cross) insights.push(['bad', `${r.role.name} needs ${h(r.required)} but everyone trained for it can give at most ${h(r.primary + r.cross)} this week after breaks. That is ${h(r.required - r.primary - r.cross)} short before the rota is even built: hire, extend hours, cross-train or reduce the cover needed.`]);
      else if (r.required > r.primary) insights.push(['warn', `${r.role.name} needs ${h(r.required)} and its own team can give ${h(r.primary)}, so ${h(r.required - r.primary)} must come from cross-trained colleagues${cross.length ? ' (' + cross.join(', ') + ')' : ''}.`]);
      else insights.push(['ok', `${r.role.name}: its own team can give ${h(r.primary)} against ${h(r.required)} needed.`]);
      const worst = r.byDay.map((d, i) => [d.miss, i]).sort((a, b) => b[0] - a[0])[0];
      if (r.unfilled && r.required <= r.primary + r.cross) insights.push(['warn', `${r.role.name} still has ${h(r.unfilled)} uncovered on the rota, mostly on ${D.DAY_NAMES[worst[1]]}. The hours exist in the team but not at the right times, or breaks are not covered.`]);
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

    return `<div class="tiles"><div><b>${h(c.required)}</b>cover needed</div><div><b>${h(c.available)}</b>team hours available, after breaks</div><div><b>${h(c.scheduled)}</b>worked on the rota</div><div class="${c.unfilled ? 'warn' : 'ok'}"><b>${h(c.unfilled)}</b>uncovered</div></div>
      <h2>What the numbers say</h2><ul class="insights">${insights.map(([k, t]) => `<li class="${k}">${esc(t)}</li>`).join('')}</ul>
      <h2>By area</h2><div class="grid-wrap"><table class="plain"><thead><tr><th>Area</th><th>Needed</th><th>Own team can give</th><th>Cross-trained cover</th><th>Worked</th><th>Uncovered</th><th>Covered</th></tr></thead><tbody>`
      + c.roles.map(r => `<tr><th>${roleTag(r.role.id)} ${esc(r.role.name)}<small>${r.dedicated} dedicated · ${r.people} trained</small></th><td>${h(r.required)}</td><td class="${r.primary < r.required ? 'warn' : ''}">${h(r.primary)}</td><td>${h(r.cross)}</td><td>${h(r.scheduled)}</td>
        <td class="${r.unfilled ? 'warn' : 'ok'}">${h(r.unfilled)}</td><td>${bar(r.required - r.unfilled, r.required, r.role.color)} ${pctOf(r.required - r.unfilled, r.required)}%</td></tr>`).join('')
      + `</tbody></table></div><p class="hint">“Own team can give” is the available hours, after breaks, of people whose main area this is; “cross-trained cover” is the same for people from other areas who are also trained here. Cross-trained hours can only be used once, so they are not added up across areas.</p>
      <h2>Cover by day</h2><div class="grid-wrap"><table class="plain heat"><thead><tr><th>Area</th>${D.DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead><tbody>`
      + c.roles.map(r => `<tr><th>${esc(r.role.name)}</th>` + r.byDay.map(d => !d.need ? '<td class="none">–</td>' : `<td class="${d.miss ? (d.miss >= d.need / 2 ? 'h2' : 'h1') : 'h0'}">${d.miss ? '−' + h(d.miss) : '✓'}</td>`).join('') + '</tr>').join('')
      + `</tbody></table></div><h2>By treatment</h2><div class="grid-wrap"><table class="plain"><thead><tr><th>Treatment</th><th>Who can do it</th><th>Their available hours</th><th>Specific cover needed</th><th>Uncovered</th></tr></thead><tbody>`
      + c.treatments.map(x => `<tr><th>${esc(x.name)}</th><td class="${x.who.length < 2 ? 'warn' : ''}" style="white-space:normal;text-align:left">${x.who.length ? x.who.map(first).map(esc).join(', ') : 'No one'}</td><td>${h(x.available)}</td><td>${x.required ? h(x.required) : '–'}</td><td class="${x.unfilled ? 'warn' : ''}">${x.required ? h(x.unfilled) : '–'}</td></tr>`).join('')
      + `</tbody></table></div><h2>By person</h2><div class="grid-wrap"><table class="plain"><thead><tr><th>Team member</th><th>Trained for</th><th>Contracted</th><th>Available this week</th><th>Worked on the rota</th><th>Use of available hours</th></tr></thead><tbody>`
      + c.people.map(p => `<tr><th>${esc(p.staff.name)}</th><td>${p.staff.skills.map(roleTag).join(' ')}</td><td>${h(p.contract)}</td><td>${h(p.available)}${p.holidayDays ? ' <small>holiday</small>' : ''}</td><td class="${p.scheduled > p.contract ? 'warn' : ''}">${h(p.scheduled)}</td>
        <td>${bar(p.scheduled, p.available, p.scheduled > p.contract ? '#b5523b' : D.role(p.staff.primary).color)} ${pctOf(p.scheduled, p.available)}%</td></tr>`).join('') + '</tbody></table></div>';
  }

  // ---------- Google Sheets ----------
  function sheetsView() {
    const s = D.state.settings;
    return `<div class="cols"><section class="card"><h3>1 · Read the team, skills and hours from a Google Sheet</h3>
      <p>Two layouts are understood:</p>
      <ul><li><b>A tab per team</b> (Therapists, FOH, BaristasAttendants, Instructors, Acupuncturists), with a block for each person: their name, the days across the top, then a row for each rotation week (“WEEK 1”, “WEEK 2 &amp; 4”, “Weekly”) with times such as “7:30AM - 3:30PM”. A cell with two times becomes a split shift. A person on two tabs is treated as trained in both areas. A “Weekly Shifts” tab sets the cover needed.</li>
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
      <p>Trybe has no spreadsheet import for rotas. A practitioner's rota in Trybe is a repeating cycle of weeks plus dated time off, created on its schedule screen or through its API. This export turns the four weeks starting <b>${D.nice(wk)}</b> into exactly that shape, leaving out breaks so no one is booked over lunch.</p>
      ${(() => { const t = Sheets.trybe(wk, trybeRoles()); return `<p>${t.practitioners.length} practitioner${t.practitioners.length === 1 ? '' : 's'} ready`
        + (t.weeks_without_a_rota.length ? `. <span class="warn">${t.weeks_without_a_rota.length} of the four weeks ${t.weeks_without_a_rota.length === 1 ? 'has' : 'have'} no rota yet (${t.weeks_without_a_rota.map(D.nice).join(', ')}).</span>` : ', all four weeks scheduled.')
        + (t.not_scheduled.length ? ` Not on the rota in these weeks: ${t.not_scheduled.map(esc).join(', ')}.` : '') + '</p>'; })()}
      <label>Who is a bookable practitioner in Trybe<select data-set="trybeRoles"><option value="therapy,studio"${s.trybeRoles === 'therapy,studio' ? ' selected' : ''}>Therapists and studio</option><option value="therapy"${s.trybeRoles === 'therapy' ? ' selected' : ''}>Therapists only</option><option value="foh,cafe,therapy,studio"${s.trybeRoles === 'foh,cafe,therapy,studio' ? ' selected' : ''}>Everyone</option></select></label>
      <div class="btns"><button data-act="hoursfour">Add working hours to all four weeks</button><button class="primary" data-act="trybejson">Download Trybe rota file (JSON)</button><button data-act="trybecsv">Download as a list (CSV)</button></div>
      <p class="hint">Only shifts in the chosen areas are exported, so time a multi-skilled person spends on front of house or in the café is not offered for bookings. The JSON file needs each person's Trybe practitioner ID filled in before it is loaded; the list is for entering rotas by hand. Treatments are listed for reference, because linking them needs Trybe's own offering IDs.</p>
      ${trybePanel()}</section>
      <section class="card"><h3>Backup and sample data</h3><p>Use the <b>Backup</b> button at the top of the page to download a backup, restore one, or go back to an automatic copy.</p>
      <div class="btns"><button data-act="openbackup">Open backups</button><button data-act="sample">Load the sample team</button><button class="danger" data-act="wipe">Clear everything</button></div></section></div>`;
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
      <p>Paste your Trybe API token. Tokens are not created inside Trybe: email <b>tech-support@try.be</b> and ask for an API key, giving the email of the Trybe user it should belong to, the environment (playground, production or both) and what it is for. A token works in one environment only and can do whatever that user can do, so the user needs permission to manage schedules.</p>
      <label>API token<input type="password" name="token" autocomplete="off" spellcheck="false"></label>
      <label>Environment<select name="env"><option value="playground">Playground (test) — safe to try</option><option value="live">Live — real rotas and bookings</option></select></label>
      <label class="chk"><input type="checkbox" name="keep"> Remember the token on this computer</label>
      <p class="hint">Leave this unticked on a shared computer: the token is then forgotten when the tab is closed.</p>
      <ul class="issues" hidden></ul>
      <div class="actions"><span></span><button type="button" data-do="cancel">Cancel</button><button type="button" class="primary" data-do="connect">Connect</button></div></form>`;
    applyTips(dlg);
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

  // ---------- backups ----------
  const when = ms => new Date(ms).toLocaleString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const needsBackup = () => D.state.savedAt > D.backedUp.at && Date.now() - D.backedUp.at > 7 * 864e5;
  function backupStatus() {
    const b = $('backup-btn'), last = D.backedUp.at;
    b.classList.toggle('warn', needsBackup());
    b.innerHTML = `Backup<small>${!last ? 'no backup file yet' : D.state.savedAt > last ? 'changes since ' + new Date(last).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' }) : 'backed up ' + new Date(last).toLocaleDateString('en-IE', { day: 'numeric', month: 'short' })}</small>`;
  }
  async function backupDialog() {
    const dlg = $('dialog'), last = D.backedUp.at;
    dlg.onchange = null;
    const draw = list => {
      dlg.innerHTML = `<form method="dialog" class="wide"><h3>Backup</h3>
        <p>Everything you enter is saved in this browser as you go. Updating the app does not remove it, and a copy is kept automatically before each update and once a day. Those copies live in this browser too, so also <b>download a backup file now and then</b> and keep it somewhere safe such as Google Drive or OneDrive: it is the only copy that survives clearing the browser or moving to another computer.</p>
        <p class="${needsBackup() ? 'warn' : 'muted'}">${last ? `Last backup file: ${when(last)}.` : 'No backup file has been downloaded on this computer yet.'}${D.state.savedAt > last ? ' There are changes since then.' : ''}</p>
        <div class="btns"><button type="button" class="primary" data-do="download">Download a backup file</button><button type="button" data-do="file">Restore from a backup file</button></div>
        <h4>Copies kept in this browser</h4>
        ${list === null ? '<p class="muted">Loading…</p>' : !list.length ? '<p class="muted">None yet. The first is made automatically within a day of making changes.</p>'
          : '<table class="plain snaps"><tbody>' + list.map(s => `<tr><td>${when(s.at)}</td><td>${esc(s.reason)}</td><td>${s.people} people</td><td><button type="button" class="quiet" data-do="snap" data-at="${s.at}">Restore</button></td></tr>`).join('') + '</tbody></table>'}
        <p class="hint">Restoring replaces what is in the app now; a copy of the current data is kept first, so it can be undone from this list.</p>
        <div class="actions"><span></span><button type="button" data-do="close">Close</button></div></form>`;
      applyTips(dlg);
    };
    dlg.onclick = async e => {
      const act = e.target.dataset.do;
      if (act === 'close') return dlg.close();
      if (act === 'download') { download(`daha-rota-backup-${D.today()}.json`, D.exportText(), 'application/json'); D.backedUp.mark(); backupStatus(); draw(await D.Snapshots.all()); toast('Backup file downloaded. Keep it somewhere safe.'); }
      if (act === 'file') { dlg.close(); $('file-backup').click(); }
      if (act === 'snap') {
        const s = await D.Snapshots.get(+e.target.dataset.at);
        if (!s || !confirm(`Go back to the copy from ${when(s.at)}? What is in the app now is kept as a copy first.`)) return;
        await D.Snapshots.take('Before going back to an earlier copy');
        try { D.restore(JSON.parse(s.data)); selected = null; dlg.close(); toast(`Restored the copy from ${when(s.at)}.`); render(); }
        catch (err) { toast(err.message, true); }
      }
    };
    draw(null);
    dlg.showModal();
    draw(await D.Snapshots.all());
  }


  // ---------- how to use ----------
  function helpView() {
    const go = (t, label) => `<button class="quiet" data-act="goto" data-tab="${t}">${label} →</button>`;
    const ex = [180, 240, 270, 285, 360, 375, 480].map(m => `<li>${hm(m)}: ${E.breakLength(m) ? E.breakLength(m) + ' minute break' : 'no break'}</li>`).join('');
    const q = (title, body) => `<details><summary>${title}</summary><div>${body}</div></details>`;
    return `<div class="help">
      <section class="card"><h2>How to use the rota and capacity tool</h2>
        <p>Plan who works when across front of house, the café, therapists and the studio; see straight away where cover is missing; and share the rota with the team or with Trybe. Hover over any button or box for a short explanation of what it does.</p>
        <p class="muted">Everything you enter stays in this browser on this computer. Nothing is sent anywhere unless you export it.</p></section>

      <h2>Getting started</h2>
      <ol class="steps">
        <li><b>Bring in your team.</b> In Google Sheets, open the Available Working Hours sheet and choose <i>File → Download → Microsoft Excel</i>. Then on the Google Sheets tab press <i>Import a file</i> and pick that file. The sheet stays private, and the import lists anything it could not read so you can check those people. You can also add people one at a time on the Team tab. ${go('sheets', 'Google Sheets tab')}</li>
        <li><b>Check each person.</b> On the Team tab, check their main area, the other areas they are trained for, the treatments they do, their contracted hours, their working days and hours, and any holidays. ${go('team', 'Team tab')}</li>
        <li><b>Set the cover you need.</b> On the Coverage needs tab, set how many people each area needs and when, the break rules, and which week is week 1 of the rotation. ${go('needs', 'Coverage needs tab')}</li>
        <li><b>Put the week on the rota.</b> On the Rota tab, choose the week with the arrows at the top of the page and press <i>Add working hours to the rota</i>. Everyone's usual hours for that week appear as shifts, with their breaks. ${go('rota', 'Rota tab')}</li>
        <li><b>Close the gaps.</b> Red times at the top of the rota are gaps: times when an area has fewer people than it needs, including while someone is on a break. Below the rota each gap lists who could cover it. Click a name to add that shift, or click any cell to add a shift yourself.</li>
        <li><b>Share it.</b> On the Google Sheets tab, copy the rota into a Google Sheet or download it. Practitioners' rotas can also go to Trybe from there.</li>
        <li><b>Back up.</b> Press <i>Backup</i> at the top of the page now and then, download a backup file and keep it somewhere safe such as Google Drive.</li>
      </ol>

      <h2>Reading the rota</h2>
      <div class="legend">
        <div><span class="shift" style="--c:#304441">08:00–15:00<small>FOH</small><small class="brk">Break 11:00–12:00</small></span><p>A shift, coloured by area, with its break.</p></div>
        <div><span class="shift flag" style="--c:#5f8a84">09:00–17:00<small>Therapy ⚠</small></span><p>A shift that breaks a rule, such as a holiday or too many hours. Hover to see why.</p></div>
        <div><span class="pill short">11:00–12:00</span><p>A gap in cover. Click it to see who could fill it.</p></div>
        <div><span class="pill ok">Covered</span><p>Enough people all day in that area.</p></div>
        <div><span class="lg off"></span><p>Not a working day for that person this week.</p></div>
        <div><span class="lg hol">Holiday</span><p>Booked time off.</p></div>
        <div><span class="lg avail">09:00–17:00</span><p>Their usual hours, not yet on the rota.</p></div>
      </div>

      <h2>How do I…</h2>
      <div class="faq">
        ${q('Add or change a single shift', 'On the Rota tab, click the empty part of a cell to add a shift for that person and day, or click a shift to change its times, area or treatment, move its break, or delete it. Shifts that break a rule can still be saved; they are marked ⚠.')}
        ${q('Put just one person\'s hours on the rota', 'Press <i>+ usual hours</i> under their name on the Rota tab, or the button under their working hours on the Team tab.')}
        ${q('Set up a split shift', 'On the Team tab, press <i>+ split shift</i> on the day and set the times of the second block. Each block becomes its own shift on the rota.')}
        ${q('Show someone working in two areas', 'Tick the second area under <i>Trained to work in</i>. Each block of time then has an area box: for example studio in the morning and front of house after. Leave it on <i>Main area</i> for their usual area.')}
        ${q('Set up a 2-week or 4-week rotation', 'On the Team tab, choose <i>2-week rotation</i> or <i>4-week rotation</i>, then pick each week and set its days and hours. Which calendar week counts as week 1 is set on the Coverage needs tab; the dot on the week buttons shows which rotation week is on screen.')}
        ${q('Book a holiday', 'On the Team tab, press <i>+ Add time off</i> and set the first and last days. The person is left off the rota and out of the suggestions on those days, and any shift already on those days is marked ⚠.')}
        ${q('Move someone\'s break', 'Click the shift on the rota and change the break start time. <i>Put it back in the middle</i> undoes that.')}
        ${q('Ask for a specific treatment', 'On the Coverage needs tab, set the treatment on a Therapists period of cover. That cover then needs someone who does that treatment, and is counted separately from general cover.')}
        ${q('Reuse last week', 'Press <i>Copy last week</i> on the Rota tab, then check the ⚠ marks for holidays and changed hours.')}
        ${q('Print the rota', 'Press <i>Print</i> on the Rota tab. Only the grid is printed.')}
        ${q('Send rotas to Trybe', 'On the Google Sheets tab, press <i>Add working hours to all four weeks</i>, then <i>Check against Trybe</i>. The first time it asks for a Trybe API token, which Trybe\'s tech support issues on request. Use the Playground to try it safely, or <i>Try it with a simulated Trybe</i> to see the steps without a token. Breaks are left out so no one is booked over lunch.')}
        ${q('Move to another computer', 'Press <i>Backup</i>, download a backup file, open the app on the other computer and choose <i>Restore from a backup file</i>.')}
        ${q('Undo a mistake such as a wrong import', 'Press <i>Backup</i> and restore a copy from the list. The app keeps a copy before every import or restore, before each update, and once a day.')}
      </div>

      <h2>Breaks</h2>
      <p>Every continuous shift gets a break by the rules on the Coverage needs tab, placed in the middle of the shift. With the rules as they are now:</p>
      <ul class="cols3">${ex}</ul>
      <p class="muted">Back-to-back shifts count as one. While someone is on a break they do not count towards cover, so an uncovered lunch shows as a gap. Hours worked, and the check against contracted hours, are after breaks.</p>

      <h2>Your data</h2>
      <p>The team, rotas and settings are kept in this browser and saved as you go. Updating the app does not remove them. A copy is kept automatically before each update and once a day, and can be restored from the <i>Backup</i> button. Those copies are in the same browser, so download a backup file now and then: it is the only copy that survives clearing the browser or changing computer.</p>
    </div>`;
  }

  // ---------- render ----------
  const VIEWS = { rota: rotaView, team: teamView, needs: needsView, capacity: capacityView, sheets: sheetsView, help: helpView };
  function render() {
    const dates = D.weekDates(wk), gaps = E.gaps(wk).length;
    $('weeklabel').innerHTML = `${D.nice(dates[0])} – ${D.nice(dates[6])} ${dates[6].slice(0, 4)}<small>Rotation week ${D.rotationWeek(wk) + 1} of 4</small>`;
    document.querySelectorAll('#tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === tab); if (b.dataset.tab === 'rota') b.innerHTML = 'Rota' + (gaps ? ` <i>${gaps}</i>` : ''); });
    const y = $('view').scrollTop;
    hideTip();
    $('view').innerHTML = VIEWS[tab]();
    $('view').className = tab;
    applyTips($('view'));
    $('view').scrollTop = y;
    backupStatus();
  }
  const go = t => { tab = t; $('view').scrollTop = 0; render(); };
  const person = () => D.person(selected);

  // ---------- actions ----------
  const ACT = {
    goto(el) { go(el.dataset.tab); return false; },
    hours() {
      const r = E.fromHours(wk);
      toast(r.added ? `Added ${r.added} shift${r.added === 1 ? '' : 's'} from working hours.` + (r.kept ? ` ${r.kept} day${r.kept === 1 ? '' : 's'} that already had shifts ${r.kept === 1 ? 'was' : 'were'} left as ${r.kept === 1 ? 'it was' : 'they were'}.` : '') + ' Gaps in cover are shown below the rota.'
        : r.kept ? 'Everyone working this week already has shifts on those days, so nothing was added.' : 'No one has working hours this week. Set them on the Team tab.', !r.added);
    },
    hoursone(el) {
      const p = D.person(+el.dataset.id), r = E.fromHours(wk, [p.id]);
      toast(r.added ? `Added ${first(p)}'s hours: ${r.added} shift${r.added === 1 ? '' : 's'} for the week of ${D.nice(wk)}.` : `Nothing added for ${first(p)}: ${r.kept ? 'the working days already have shifts' : 'no working hours this week'}.`, !r.added);
    },
    hoursfour() {
      let added = 0;
      [0, 1, 2, 3].forEach(i => { added += E.fromHours(D.addDays(wk, 7 * i)).added; });
      toast(`Added ${added} shifts from working hours across the four weeks starting ${D.nice(wk)}. Days that already had shifts were left as they were.`);
    },
    clear() { if (D.shifts(wk).length && confirm('Remove every shift in this week?')) { D.state.weeks[wk] = []; D.save(); } },
    copyweek() {
      const prev = D.shifts(D.addDays(wk, -7));
      if (!prev.length) return toast('Last week has no shifts to copy.', true);
      if (D.shifts(wk).length && !confirm('Replace this week with a copy of last week?')) return;
      D.state.weeks[wk] = prev.filter(s => D.person(s.staffId)).map(s => Object.assign({}, s, { id: D.newId() }));
      D.save(); toast('Copied last week. Check the ⚠ marks for holidays and changes.');
    },
    print() { window.print(); },
    jump(el) { const g = $(`gap-${el.dataset.gap}`); if (g) { g.scrollIntoView({ behavior: 'smooth', block: 'center' }); g.classList.add('flash'); setTimeout(() => g.classList.remove('flash'), 1600); } return false; },
    person(el) { selected = +el.dataset.id; rot = D.rotationWeek(wk); go('team'); return false; },
    add(el) {
      const p = D.person(+el.dataset.id), day = +el.dataset.day, blocks = E.blocksOn(p, wk, day);
      const taken = D.shifts(wk).filter(s => s.staffId === p.id && s.day === day), free = blocks.find(b => !taken.some(s => s.start < b.end && b.start < s.end));
      const b = free || blocks[0];
      shiftDialog({ id: D.newId(), staffId: p.id, role: b && b.role && p.skills.includes(b.role) ? b.role : p.primary, day, start: b ? b.start : D.t('09:00'), end: b ? b.end : D.t('17:00') }, true);
      return false;
    },
    edit(el) { shiftDialog(D.shifts(wk).find(s => s.id === +el.dataset.shift), false); return false; },
    assign(el) {
      const g = E.gaps(wk)[+el.dataset.gap], o = E.options(wk, g)[el.dataset.kind][+el.dataset.opt];
      D.shifts(wk).push(Object.assign({ id: D.newId(), staffId: o.staff.id, role: g.role, day: g.day, start: o.start, end: o.end }, g.treatment ? { treatment: g.treatment } : {}));
      E.tidy(wk); D.save(); toast(`${first(o.staff)} added to ${D.role(g.role).name}, ${D.DAY_NAMES[g.day]} ${span(o.start, o.end)}.`);
    },
    newperson() { selected = D.addStaff({}).id; rot = D.rotationWeek(wk); D.save(); },
    pattern(el) {
      const p = person(), n = +el.dataset.n, old = p.patterns;
      if (n === old.length) return;
      // keep what has been entered: week 1 stays week 1, and so on, repeating when there were fewer weeks
      p.patterns = [...Array(n).keys()].map(i => deep(old[i % old.length]));
      rot = D.rotationWeek(wk) % n; D.save();
    },
    rot(el) { rot = +el.dataset.n; },
    copyrot() { const p = person(), cur = pattern(p); p.patterns = p.patterns.map(() => deep(cur)); D.save(); toast(`Copied to all ${p.patterns.length} rotation weeks.`); },
    addb(el) {
      const d = pattern(person())[+el.dataset.day], last = d.blocks[d.blocks.length - 1], start = Math.min(last.end + 60, 1380);
      d.blocks.push({ start, end: Math.min(start + 180, 1440) }); D.save();
    },
    delb(el) { const d = pattern(person())[+el.dataset.day]; d.blocks.splice(+el.dataset.b, 1); D.save(); },
    select(el) { selected = +el.dataset.id; rot = D.rotationWeek(wk); },
    addhol() { person().holidays.push({ from: wk, to: wk, note: '' }); D.save(); },
    delhol(el) { person().holidays.splice(+el.dataset.i, 1); D.save(); },
    delperson() {
      const p = person();
      if (!confirm(`Remove ${p.name} and all of their shifts?`)) return;
      D.state.staff.splice(D.state.staff.indexOf(p), 1);
      Object.keys(D.state.weeks).forEach(k => { D.state.weeks[k] = D.state.weeks[k].filter(s => s.staffId !== p.id); });
      selected = null; D.save();
    },
    addblock(el) { const list = D.state.needs[el.dataset.role][+el.dataset.day], last = list[list.length - 1]; list.push(last ? { start: last.end, end: Math.min(last.end + 240, 1320), count: 1 } : { start: 540, end: 1020, count: 1 }); D.save(); },
    delblock(el) { D.state.needs[el.dataset.role][+el.dataset.day].splice(+el.dataset.i, 1); D.save(); },
    copymon(el) { const n = D.state.needs[el.dataset.role]; for (let d = 1; d < 5; d++) n[d] = n[0].map(b => Object.assign({}, b)); D.save(); toast('Monday copied to Tuesday–Friday.'); },
    resetneeds() { if (confirm('Reset the cover needed in every area to the defaults?')) { D.state.needs = D.defaultNeeds(); D.save(); } },
    addbreak() { const r = D.state.settings.breaks, last = r[r.length - 1]; r.push({ min: last ? last.min + 60 : 240, inclusive: true, minutes: last ? last.minutes : 15 }); D.save(); },
    delbreak(el) { D.state.settings.breaks.splice(+el.dataset.i, 1); D.save(); },
    resetbreaks() { D.state.settings.breaks = D.BREAKS.map(b => Object.assign({}, b)); D.save(); toast('Break rules set back to the standard ones.'); },
    async import() {
      sheetLog = 'Reading the sheet…'; render();
      try { const result = Sheets.readAny(await Sheets.fetchSheet(D.state.settings.sheetUrl)); await D.Snapshots.take('Before importing from a sheet'); importResult(result); } catch (e) { sheetLog = `<span class="warn">${esc(e.message)}</span>`; }
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
    trybejson() { download(`daha-trybe-rotas-${wk}.json`, JSON.stringify(Sheets.trybe(wk, trybeRoles()), null, 2), 'application/json'); return false; },
    trybecsv() { download(`daha-trybe-rotas-${wk}.csv`, '﻿' + Sheets.toCsv(Sheets.trybeRows(Sheets.trybe(wk, trybeRoles()))), 'text/csv'); return false; },
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
    openbackup() { backupDialog(); return false; },
    async sample() { if (confirm('Replace everything with the sample team? A copy of the current data is kept under Backup.')) { await D.Snapshots.take('Before loading the sample team'); D.loadSample(); selected = null; } },
    async wipe() { if (confirm('Delete the whole team, every rota and all settings from this browser? A copy is kept under Backup.')) { await D.Snapshots.take('Before clearing everything'); D.clearAll(); selected = null; } }
  };
  function importResult(result) {
    const r = Sheets.apply(result);
    selected = null; rot = D.rotationWeek(wk);
    sheetLog = `<b>${r.added} added, ${r.updated} updated${r.replaced ? ' (the sample team was replaced)' : ''}.</b>`
      + (r.areas.length ? ` Cover needed was set for ${r.areas.map(a => D.role(a).name).join(', ')} from the Weekly Shifts tab.` : '')
      + '<ul>' + result.people.map(p => { const cur = D.state.staff.find(s => s.name === p.name) || p; return `<li><b>${esc(cur.name)}</b>: ${cur.skills.map(s => D.role(s).short).join(' + ')}${cur.treatments.length ? ' (' + cur.treatments.map(esc).join(', ') + ')' : ''}, ${cur.hours} h, ${ROT_NAMES[cur.patterns.length].toLowerCase()}</li>`; }).join('') + '</ul>'
      + (result.notes.length ? `<p class="warn"><b>${result.notes.length} thing${result.notes.length > 1 ? 's' : ''} to check:</b></p><ul class="warn">${result.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '');
    render();
  }

  // ---------- events ----------
  document.addEventListener('DOMContentLoaded', () => {
    D.load();
    initTips();
    // the first time the app opens in a browser, start with the instructions
    try { if (!localStorage.getItem('daha.rota.helpSeen')) { tab = 'help'; localStorage.setItem('daha.rota.helpSeen', '1'); } } catch (e) { /* ignore */ }
    // ask the browser to keep this site's data even when it is short of space
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    wk = D.mondayOf(D.today());
    $('tabs').onclick = e => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); };
    $('weeknav').onclick = e => { const b = e.target.closest('button'); if (!b) return; wk = b.dataset.week === '0' ? D.mondayOf(D.today()) : D.addDays(wk, 7 * +b.dataset.week); rot = D.rotationWeek(wk); render(); };
    $('backup-btn').onclick = backupDialog;
    $('view').addEventListener('click', async e => {
      const el = e.target.closest('[data-act]');
      if (!el || !ACT[el.dataset.act] || (el.dataset.act === 'add' && e.target.closest('.shift'))) return;
      e.stopPropagation();
      if (await ACT[el.dataset.act](el) !== false) render();
    });
    $('view').addEventListener('change', e => {
      const el = e.target, p = person();
      let redraw = true;
      if (el.dataset.tp && trybePlan) {
        const [i, field] = el.dataset.tp.split('|'), row = trybePlan.rows[+i];
        if (field === 'action') { row.action = el.value; return render(); }
        row.id = el.value; row.guessed = false;
        return void Trybe.inspect(row, wk).then(render);
      }
      if (el.dataset.set) { D.state.settings[el.dataset.set] = el.type === 'number' ? +el.value || 10 : el.type === 'date' ? D.mondayOf(el.value || D.today()) : el.value.trim(); redraw = el.type === 'date' || el.tagName === 'SELECT'; if (el.dataset.set === 'trybeRoles') { trybePlan = null; trybeResults = null; } }
      else if (el.dataset.br) {
        const [i, k] = el.dataset.br.split('|'), r = D.state.settings.breaks[+i];
        if (k === 'inclusive') r.inclusive = el.value === '1';
        else if (k === 'hours') r.min = Math.max(0, Math.round((+el.value || 0) * 60));
        else r.minutes = Math.max(0, Math.round(+el.value || 0));
      }
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
          const d = pattern(p)[+el.dataset.day], k = el.dataset.k;
          if (k === 'on') d.on = el.checked;
          else {
            const b = d.blocks[+el.dataset.b];
            if (k === 'role') { if (el.value) b.role = el.value; else delete b.role; }
            else {
              b[k] = D.t(el.value || '00:00');
              if (b.end <= b.start) { b.end = Math.min(b.start + 60, 1440); toast('The end must be after the start; adjusted.', true); }
              d.blocks.sort((x, y) => x.start - y.start);
              if (d.blocks.some((x, j) => j && x.start < d.blocks[j - 1].end)) toast('Two blocks on this day overlap; they are treated as one.', true);
            }
          }
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
      if (f) Sheets.readFile(f).then(async book => { const result = Sheets.readAny(book); await D.Snapshots.take('Before importing a file'); importResult(result); }).catch(err => { sheetLog = `<span class="warn">${esc(err.message)}</span>`; render(); });
      e.target.value = '';
    };
    $('file-backup').onchange = e => {
      const f = e.target.files[0];
      if (f) f.text().then(async text => {
        try { const obj = JSON.parse(text); await D.Snapshots.take('Before restoring a backup file'); D.restore(obj); selected = null; toast('Backup restored.'); }
        catch (err) { toast(err instanceof SyntaxError ? 'That file could not be read.' : err.message, true); }
        render();
      });
      e.target.value = '';
    };
    render();
  });

  window.Rota = { render, go, get week() { return wk; }, set week(v) { wk = v; rot = D.rotationWeek(v); render(); } };
})();
