// Direct connection to Trybe (try.be): look up practitioners, compare with their current rotas, and send new ones.
// Endpoints and field names follow Trybe's public specification at https://docs.try.be.
// The API token is kept apart from the rota data, so it never ends up in a backup or an export.
const Trybe = (function () {
  'use strict';
  const D = Data, KEY = 'daha.trybe';
  const HOSTS = { playground: 'https://api.playground.try.be', live: 'https://api.try.be' };
  const ENV_NAMES = { playground: 'Playground (test)', live: 'Live' };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // ---------- token ----------
  let conn = null;
  try { conn = JSON.parse(sessionStorage.getItem(KEY) || localStorage.getItem(KEY)); } catch (e) { /* no stored token */ }
  function remember(token, env, keep) {
    conn = { token: token.trim(), env, keep: !!keep };
    try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); (keep ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(conn)); } catch (e) { /* stays in memory only */ }
  }
  function forget() { conn = null; try { sessionStorage.removeItem(KEY); localStorage.removeItem(KEY); } catch (e) { /* nothing stored */ } }

  // ---------- requests ----------
  async function api(method, path, body) {
    if (!conn) throw new Error('Connect to Trybe first.');
    let res;
    try {
      res = await fetch(HOSTS[conn.env] + path, { method, headers: Object.assign({ Authorization: 'Bearer ' + conn.token, Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
    } catch (e) { throw new Error('Could not reach Trybe. Check the internet connection and try again.'); }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (res.ok) return data;
    const detail = data && data.errors ? ' ' + Object.values(data.errors).map(v => [].concat(v).join(' ')).join(' ') : data && data.message ? ' ' + data.message : '';
    if (res.status === 401) throw new Error(`Trybe did not accept the token for ${ENV_NAMES[conn.env]}. It may be mistyped, expired, or issued for the other environment.`);
    if (res.status === 403) throw new Error('This token is not allowed to do that in Trybe. Managing rotas needs the schedule-management permission.' + detail);
    if (res.status === 422) throw new Error('Trybe rejected the details.' + detail);
    if (res.status === 429) throw new Error('Trybe is limiting requests. Wait a minute and try again.');
    throw new Error(`Trybe returned an error (${res.status}).` + detail);
  }
  async function all(path) {
    const out = [];
    for (let page = 1; page <= 50; page++) {
      const r = await api('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      out.push(...(r.data || []));
      if (!r.meta || page >= (r.meta.last_page || 1)) break;
    }
    return out;
  }

  // Checks the token by reading the practitioner list, which the rest of the work needs anyway.
  async function connect(token, env, keep) {
    const before = conn;
    remember(token, env, keep);
    try { return (await all('/shop/practitioners')).length; }
    catch (e) { if (before) remember(before.token, before.env, before.keep); else forget(); throw e; }
  }

  // ---------- compare ----------
  // For each person in the export: the matching Trybe practitioner, their current rotas, and a proposed action.
  async function plan(wk, roles) {
    const exp = Sheets.trybe(wk, roles), list = (await all('/shop/practitioners')).map(p => ({ id: p.id, name: p.name }));
    const rows = [];
    for (const person of exp.practitioners) {
      const key = norm(person.name), first = key.split(' ')[0];
      const exact = list.filter(p => norm(p.name) === key), loose = list.filter(p => norm(p.name).split(' ')[0] === first);
      const match = exact.length === 1 ? exact[0] : !exact.length && loose.length === 1 ? loose[0] : null;
      const row = { person, id: match ? match.id : '', guessed: !!match && !exact.length, existing: [], action: 'skip' };
      if (match) await inspect(row, wk);
      rows.push(row);
    }
    return { wk, env: conn.env, practitioners: list, rows, weeksMissing: exp.weeks_without_a_rota };
  }
  // Loads a practitioner's current rotas and picks the safest default.
  async function inspect(row, wk) {
    row.existing = []; row.error = '';
    if (!row.id) { row.action = 'skip'; return; }
    try {
      const rotas = await all(`/shop/practitioners/${row.id}/rotas`);
      row.existing = rotas.filter(r => !r.end_date || r.end_date.slice(0, 10) >= wk).map(r => Object.assign({}, r, { start: (r.start_date || '').slice(0, 10), end: r.end_date ? r.end_date.slice(0, 10) : '' }));
      row.blocked = row.existing.some(r => r.start >= wk);
      row.action = row.blocked ? 'skip' : row.existing.length ? 'replace' : 'create';
    } catch (e) { row.error = e.message; row.action = 'skip'; }
  }

  // ---------- send ----------
  // "create" adds the new rota. "replace" first ends each current rota the day before the new one starts,
  // so past weeks keep their history. Time off is sent as unavailable windows.
  async function send(p, onProgress) {
    const results = [];
    for (const row of p.rows.filter(r => r.id && r.action !== 'skip')) {
      const name = row.person.name, out = { name, ok: false, notes: [] };
      try {
        if (row.action === 'replace') for (const r of row.existing) {
          await api('PUT', `/shop/practitioner-rotas/${r.id}`, { start_date: r.start || null, end_date: D.addDays(p.wk, -1), scheduling_week_interval: r.scheduling_week_interval, availability_rules: r.availability_rules || [] });
          out.notes.push(`ended the rota from ${r.start || 'earlier'} on ${D.addDays(p.wk, -1)}`);
        }
        await api('POST', '/shop/practitioner-rotas', Object.assign({}, row.person.rota, { practitioner_id: row.id }));
        out.ok = true;
        for (const c of row.person.custom_availability) {
          try { await api('POST', `/shop/practitioners/${row.id}/custom-availability`, c); out.notes.push(`time off from ${c.date_time_from.slice(0, 10)} added`); }
          catch (e) { out.notes.push(`time off from ${c.date_time_from.slice(0, 10)} was not added: ${e.message}`); }
        }
      } catch (e) { out.error = e.message; }
      results.push(out);
      if (onProgress) onProgress(results.length);
    }
    return results;
  }

  return { connect, forget, plan, inspect, send, ENV_NAMES, get connected() { return !!conn; }, get env() { return conn ? conn.env : null; }, get kept() { return !!(conn && conn.keep); } };
})();
