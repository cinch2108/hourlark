/* Hourlark: timer, stopwatch, Pomodoro, countdown, world clock, time zone converter, alarm.
   All timing uses absolute timestamps (Date.now) rather than counting ticks, so nothing drifts
   when the tab is in the background. Pure logic lives in TK (unit-tested in Node). */
'use strict';
/* Frame-buster: GitHub Pages can't send frame-ancestors / X-Frame-Options, so if another origin frames this page, break out (or blank the page if breaking out is blocked). */
if (typeof window !== 'undefined' && window.top !== window.self) {
  let sameOrigin = false;
  try { sameOrigin = window.top.location.origin === window.location.origin; } catch (e) { sameOrigin = false; }
  if (!sameOrigin) {
    try { window.top.location.replace(window.location.href); } catch (e) { /* sandboxed */ }
    document.documentElement.style.display = 'none';
  }
}
const TK = (() => {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const int = (v, a, b, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? clamp(n, a, b) : d; };
  const MAX_DUR = 100 * 3600000 - 1000; // 99:59:59
  const cleanText = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

  /* ---------- durations ---------- */
  // ceil: countdowns show 5:00 at the start and reach 0:00 exactly at the end
  function fmtDur(ms, o = {}) {
    const neg = ms < 0; ms = Math.abs(ms);
    let t = o.cs ? Math.floor(ms / 10) : (o.ceil && !neg ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
    let cs = 0; if (o.cs) { cs = t % 100; t = Math.floor(t / 100); }
    const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    let out = (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
    if (o.cs) out += '.' + pad(cs);
    return (neg ? '-' : '') + out;
  }
  function fmtHuman(ms) {
    const t = Math.round(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60;
    return [h && h + ' h', m && m + ' min', s && s + ' sec'].filter(Boolean).join(' ') || '0 sec';
  }
  // "5" = 5 min, "1:30" = 1 min 30 s, "1:02:03", "1h 30m", "90s", "2.5 min"
  function parseDuration(str) {
    const s = String(str || '').trim().toLowerCase().slice(0, 40);
    if (!s) return null;
    let ms = null;
    if (/^\d+(\.\d+)?$/.test(s)) ms = parseFloat(s) * 60000;
    else if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(s)) {
      const p = s.split(':').map(Number); if (p.slice(1).some(x => x > 59)) return null;
      ms = (p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]) * 1000;
    } else {
      const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])\s*(?:and\s*)?,?\s*/g;
      let m, total = 0, used = 0;
      while ((m = re.exec(s))) { const u = m[2][0]; total += parseFloat(m[1]) * (u === 'h' ? 3600000 : u === 'm' ? 60000 : 1000); used += m[0].length; }
      if (used !== s.length) return null;
      ms = total;
    }
    ms = Math.round(ms / 1000) * 1000;
    return ms > 0 && ms <= MAX_DUR ? ms : null;
  }

  /* ---------- countdown timers (state objects, timestamps only) ---------- */
  const newTimer = (dur, label, id) => ({ id: id || ('t' + Math.random().toString(36).slice(2, 9)), label: cleanText(label, 40), dur, left: dur, state: 'idle', endAt: 0 });
  const tLeft = (t, now) => t.state === 'run' ? t.endAt - now : t.state === 'done' ? t.endAt - now : t.left;
  function tStart(t, now) { if (t.state === 'idle' || t.state === 'paused') { t.endAt = now + t.left; t.state = 'run'; } else if (t.state === 'done') { t.left = t.dur; t.endAt = now + t.dur; t.state = 'run'; } return t; }
  function tPause(t, now) { if (t.state === 'run') { t.left = Math.max(0, t.endAt - now); t.state = 'paused'; } return t; }
  function tReset(t) { t.state = 'idle'; t.left = t.dur; t.endAt = 0; return t; }
  function tAdd(t, ms, now) {
    if (t.state === 'run') t.endAt = Math.min(t.endAt + ms, now + MAX_DUR);
    else if (t.state === 'done') { t.state = 'run'; t.endAt = now + ms; }
    else t.left = Math.min(t.left + ms, MAX_DUR);
    if (t.state === 'idle') t.dur = t.left;
    return t;
  }
  function tCheck(t, now) { if (t.state === 'run' && now >= t.endAt) { t.state = 'done'; return true; } return false; }
  function sanitizeTimers(a, now) {
    if (!Array.isArray(a)) return [];
    return a.slice(0, 12).filter(t => t && typeof t === 'object').map(t => {
      const dur = int(t.dur, 1000, MAX_DUR, 300000);
      const x = newTimer(dur, t.label, typeof t.id === 'string' && /^t[a-z0-9]{1,12}$/.test(t.id) ? t.id : undefined);
      const st = ['idle', 'run', 'paused', 'done'].includes(t.state) ? t.state : 'idle';
      x.left = int(t.left, 0, MAX_DUR, dur);
      if ((st === 'run' || st === 'done') && Number.isFinite(t.endAt) && t.endAt > now - 864e5 && t.endAt < now + MAX_DUR + 1000) { x.state = st; x.endAt = t.endAt; }
      else if (st === 'paused') x.state = 'paused';
      return x;
    });
  }

  /* ---------- stopwatch ---------- */
  const swNew = () => ({ run: false, start: 0, acc: 0, laps: [] });
  const swElapsed = (w, now) => w.acc + (w.run ? now - w.start : 0);
  function swToggle(w, now) { if (w.run) { w.acc += now - w.start; w.run = false; } else { w.start = now; w.run = true; } return w; }
  function swLap(w, now) { if (w.laps.length < 999) w.laps.push(swElapsed(w, now)); return w; }
  function lapRows(splits) { return splits.map((s, i) => ({ n: i + 1, lap: s - (i ? splits[i - 1] : 0), split: s })); }
  function lapStats(rows) {
    if (!rows.length) return { fastest: -1, slowest: -1, avg: 0 };
    let f = 0, sl = 0, sum = 0;
    rows.forEach((r, i) => { sum += r.lap; if (r.lap < rows[f].lap) f = i; if (r.lap > rows[sl].lap) sl = i; });
    return rows.length < 2 ? { fastest: -1, slowest: -1, avg: sum } : { fastest: f, slowest: sl, avg: sum / rows.length };
  }
  const csvCell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  function lapsCSV(rows) {
    const st = lapStats(rows);
    return ['Lap,Lap time,Split time,Lap (ms),Split (ms),Note'].concat(rows.map((r, i) => [r.n, fmtDur(r.lap, { cs: true }), fmtDur(r.split, { cs: true }), Math.round(r.lap), Math.round(r.split), i === st.fastest ? 'fastest' : i === st.slowest ? 'slowest' : ''].map(csvCell).join(','))).join('\r\n') + '\r\n';
  }
  function sanitizeSW(o) {
    const w = swNew(); if (!o || typeof o !== 'object') return w;
    w.run = !!o.run; w.start = Number.isFinite(o.start) ? o.start : 0; w.acc = Number.isFinite(o.acc) && o.acc >= 0 ? o.acc : 0;
    if (Array.isArray(o.laps)) { let prev = 0; for (const s of o.laps.slice(0, 999)) { if (Number.isFinite(s) && s >= prev) { w.laps.push(s); prev = s; } } }
    if (w.run && !(w.start > 0)) w.run = false;
    return w;
  }

  /* ---------- Pomodoro ---------- */
  const PO_DEF = { work: 25, short: 5, long: 15, every: 4, autoBreak: true, autoWork: false };
  function poCfg(o) {
    o = o && typeof o === 'object' ? o : {};
    return { work: int(o.work, 1, 180, 25), short: int(o.short, 1, 60, 5), long: int(o.long, 1, 120, 15), every: int(o.every, 1, 12, 4), autoBreak: o.autoBreak === undefined ? true : !!o.autoBreak, autoWork: !!o.autoWork };
  }
  const poLen = (phase, cfg) => (phase === 'work' ? cfg.work : phase === 'short' ? cfg.short : cfg.long) * 60000;
  // after a phase finishes (or is skipped): which phase comes next, and how many focus sessions are done in this set
  function poNext(phase, done, cfg, completed = true) {
    if (phase === 'work') { const d = done + (completed ? 1 : 0); return { phase: d > 0 && d % cfg.every === 0 ? 'long' : 'short', done: d }; }
    return { phase: 'work', done: phase === 'long' ? 0 : done };
  }
  const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  /* ---------- time zones (Intl only, DST-correct) ---------- */
  const dtfCache = new Map();
  function dtf(zone, opts) {
    const k = zone + '|' + JSON.stringify(opts);
    let f = dtfCache.get(k);
    if (!f) { f = new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: zone }, opts)); dtfCache.set(k, f); }
    return f;
  }
  const PARTS = { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' };
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function zparts(ms, zone) {
    const o = {};
    for (const p of dtf(zone, PARTS).formatToParts(ms)) o[p.type] = p.value;
    return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
  }
  function offsetMin(zone, ms) {
    const p = zparts(ms, zone), sec = Math.floor(ms / 1000) * 1000;
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - sec) / 60000);
  }
  // wall-clock time in a zone -> UTC ms. Gaps (spring forward) shift forward like Temporal's "compatible";
  // ambiguous times (fall back) pick the first occurrence.
  function zonedToUtc(y, mo, d, h, mi, zone) {
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    const before = offsetMin(zone, wall - 864e5), after = offsetMin(zone, wall + 864e5);
    const cands = [...new Set([before, after, offsetMin(zone, wall)])].map(o => wall - o * 60000).filter((t, i, a) => offsetMin(zone, t) === (wall - t) / 60000 && a.indexOf(t) === i).sort((a, b) => a - b);
    if (cands.length) return { ms: cands[0], gap: false, ambiguous: cands.length > 1 };
    return { ms: wall - before * 60000, gap: true, ambiguous: false };
  }
  function validZone(z) {
    if (typeof z !== 'string' || !z || z.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(z)) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; }
  }
  const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
  function allZones() {
    let z = [];
    try { z = Intl.supportedValuesOf('timeZone'); } catch { /* older browsers */ }
    const set = new Set(z.concat(CITIES.map(c => c[2]), ['UTC']));
    return [...set].filter(validZone).sort();
  }
  function fmtOffset(min) {
    if (!min) return 'UTC';
    const a = Math.abs(min);
    return 'UTC' + (min < 0 ? '−' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + pad(a % 60) : '');
  }
  function relOffset(min) {
    if (!min) return 'same time';
    const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
    return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m ? m + ' m' : '') + (min > 0 ? ' ahead' : ' behind');
  }
  function abbr(ms, zone) {
    const p = dtf(zone, { timeZoneName: 'short' }).formatToParts(ms).find(x => x.type === 'timeZoneName');
    return p ? p.value : '';
  }
  const fmtTime = (ms, zone, h12, sec) => dtf(zone, h12 ? { hour: 'numeric', minute: '2-digit', second: sec ? '2-digit' : undefined, hour12: true } : { hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined, hourCycle: 'h23' }).format(ms);
  const fmtDate = (ms, zone, long) => dtf(zone, long ? { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' }).format(ms);
  const dayDiff = (a, b) => Math.round((Date.UTC(a.y, a.mo - 1, a.d) - Date.UTC(b.y, b.mo - 1, b.d)) / 864e5);
  const addDays = (y, mo, d, n) => { const t = new Date(Date.UTC(y, mo - 1, d + n)); return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() }; };
  const zoneCity = z => z === 'UTC' ? 'UTC' : z.split('/').pop().replace(/_/g, ' ');

  // meeting planner: one row of hourly slots per zone across the base zone's calendar day
  function planner(ymd, base, zones, ws = 9, we = 17) {
    const start = zonedToUtc(ymd.y, ymd.mo, ymd.d, 0, 0, base).ms;
    const n = addDays(ymd.y, ymd.mo, ymd.d, 1), end = zonedToUtc(n.y, n.mo, n.d, 0, 0, base).ms;
    const slots = [];
    for (let t = start; t < end && slots.length < 26; t += 3600000) {
      const cells = zones.map(z => {
        const p = zparts(t, z), hf = p.h + p.mi / 60;
        const cls = hf >= ws && hf < we ? 'w' : (hf >= 7 && hf < ws) || (hf >= we && hf < 22) ? 'e' : 'n';
        return { h: p.h, mi: p.mi, cls, dd: dayDiff(p, ymd), mid: p.h === 0 && p.mi === 0 };
      });
      slots.push({ t, cells, all: cells.every(c => c.cls === 'w') });
    }
    return slots;
  }
  function bestRanges(slots) {
    const out = []; let s = -1;
    slots.forEach((x, i) => { if (x.all && s < 0) s = i; if ((!x.all || i === slots.length - 1) && s >= 0) { const e = x.all ? i + 1 : i; out.push([slots[s].t, slots[e - 1].t + 3600000]); s = -1; } });
    return out;
  }

  /* ---------- sun position (day/night indicator) ---------- */
  function solarElevation(ms, lat, lon) {
    const rad = Math.PI / 180, d = ms / 864e5 + 2440587.5 - 2451545.0;
    const g = (357.529 + 0.98560028 * d) * rad, q = 280.459 + 0.98564736 * d;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad, e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = ((18.697374558 + 24.06570982441908 * d) % 24 + 24) % 24;
    const ha = (gmst * 15 + lon) * rad - ra;
    return Math.asin(Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(ha)) / rad;
  }
  function dayState(ms, zone, lat, lon) {
    if (Number.isFinite(lat) && Number.isFinite(lon)) { const el = solarElevation(ms, lat, lon); return el > -0.833 ? 'day' : el > -6 ? 'twilight' : 'night'; }
    const h = zparts(ms, zone).h; return h >= 7 && h < 19 ? 'day' : h === 6 || h === 19 ? 'twilight' : 'night';
  }

  /* ---------- countdown ---------- */
  function cdParts(target, now) {
    const diff = target - now, past = diff <= 0, a = Math.abs(diff);
    const t = past ? Math.floor(a / 1000) : Math.ceil(a / 1000);
    return { past, total: diff, d: Math.floor(t / 86400), h: Math.floor(t % 86400 / 3600), m: Math.floor(t % 3600 / 60), s: t % 60 };
  }
  function validYMD(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 1900 || y > 2300 || mo < 1 || mo > 12 || d < 1) return null;
    if (d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
    return { y, mo, d };
  }
  function validHM(s) { const m = /^(\d{2}):(\d{2})$/.exec(String(s || '')); if (!m || +m[1] > 23 || +m[2] > 59) return null; return { h: +m[1], mi: +m[2] }; }
  // ?e=Name&d=YYYY-MM-DD&t=HH:MM&z=Area/City. Everything is validated and capped.
  function parseCdParams(search) {
    const q = new URLSearchParams(String(search || '').slice(0, 1000));
    const date = validYMD(q.get('d')); if (!date) return null;
    const time = validHM(q.get('t')) || { h: 0, mi: 0 };
    const z = q.get('z');
    return { name: cleanText(q.get('e'), 80), date, time, zone: validZone(z) ? z : null };
  }
  function cdQuery(o) {
    const q = new URLSearchParams();
    if (o.name) q.set('e', cleanText(o.name, 80));
    q.set('d', o.date.y + '-' + pad(o.date.mo) + '-' + pad(o.date.d));
    q.set('t', pad(o.time.h) + ':' + pad(o.time.mi));
    if (o.zone) q.set('z', o.zone);
    return q.toString();
  }
  function easter(y) { // anonymous Gregorian computus
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    return [Math.floor((h + l - 7 * m + 114) / 31), ((h + l - 7 * m + 114) % 31) + 1];
  }
  const nthWd = (y, mo, wd, n) => 1 + ((wd - new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7;
  const lastWd = (y, mo, wd) => { const last = new Date(Date.UTC(y, mo, 0)); return last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7); };
  const HOLIDAYS = [
    ['newyear', 'New Year', y => [1, 1]],
    ['valentine', 'Valentine’s Day', y => [2, 14]],
    ['stpatrick', 'St. Patrick’s Day', y => [3, 17]],
    ['easter', 'Easter', easter],
    ['mother', 'Mother’s Day (US)', y => [5, nthWd(y, 5, 0, 2)]],
    ['memorial', 'Memorial Day (US)', y => [5, lastWd(y, 5, 1)]],
    ['father', 'Father’s Day (US)', y => [6, nthWd(y, 6, 0, 3)]],
    ['summer', 'First day of summer', y => [6, 21]],
    ['july4', 'Independence Day (US)', y => [7, 4]],
    ['labor', 'Labor Day (US)', y => [9, nthWd(y, 9, 1, 1)]],
    ['halloween', 'Halloween', y => [10, 31]],
    ['thanksgiving', 'Thanksgiving (US)', y => [11, nthWd(y, 11, 4, 4)]],
    ['blackfriday', 'Black Friday', y => [11, nthWd(y, 11, 4, 4) + 1]],
    ['christmas', 'Christmas', y => [12, 25]],
  ];
  // next occurrence of each event (still "on" for the whole day itself), soonest first
  function presets(now, zone) {
    const y0 = zparts(now, zone).y;
    return HOLIDAYS.map(([key, name, f]) => {
      for (let y = y0; y <= y0 + 1; y++) {
        const [mo, d] = f(y), ms = zonedToUtc(y, mo, d, 0, 0, zone).ms;
        if (ms + 864e5 > now) return { key, name: key === 'newyear' ? 'New Year ' + y : name, date: { y, mo, d }, time: { h: 0, mi: 0 }, ms };
      }
      return null;
    }).filter(Boolean).sort((a, b) => a.ms - b.ms);
  }

  /* ---------- converter share links ---------- */
  function parseTzParams(search) {
    const q = new URLSearchParams(String(search || '').slice(0, 2000));
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(q.get('t') || '');
    const date = m && validYMD(m[1]), time = m && validHM(m[2]);
    const z = q.get('z');
    const to = [...new Set(String(q.get('to') || '').split(',').slice(0, 24).map(s => s.trim()).filter(validZone))].slice(0, 12);
    return { date: date || null, time: date && time ? time : null, zone: validZone(z) ? z : null, to };
  }
  function tzQuery(date, time, zone, to) {
    const q = new URLSearchParams();
    q.set('t', date.y + '-' + pad(date.mo) + '-' + pad(date.d) + 'T' + pad(time.h) + ':' + pad(time.mi));
    q.set('z', zone); if (to.length) q.set('to', to.slice(0, 12).join(','));
    return q.toString().replace(/%2F/g, '/').replace(/%2C/g, ',');
  }

  /* ---------- alarms ---------- */
  const SOUNDS = [['beep', 'Classic beep'], ['digital', 'Digital watch'], ['chime', 'Chime'], ['bell', 'Bell'], ['marimba', 'Marimba'], ['gentle', 'Gentle rise']];
  const SOUND_IDS = SOUNDS.map(s => s[0]);
  function alarmNext(al, now, zone) {
    const p = zparts(now, zone);
    for (let i = 0; i <= 8; i++) {
      const dt = addDays(p.y, p.mo, p.d, i), wd = new Date(Date.UTC(dt.y, dt.mo - 1, dt.d)).getUTCDay();
      if (al.days.length && !al.days.includes(wd)) continue;
      const t = zonedToUtc(dt.y, dt.mo, dt.d, al.h, al.m, zone).ms;
      if (t > now) return t;
    }
    return null;
  }
  function sanitizeAlarms(a) {
    if (!Array.isArray(a)) return [];
    return a.slice(0, 30).filter(x => x && typeof x === 'object').map(x => ({
      id: typeof x.id === 'string' && /^a[a-z0-9]{1,12}$/.test(x.id) ? x.id : 'a' + Math.random().toString(36).slice(2, 9),
      h: int(x.h, 0, 23, 7), m: int(x.m, 0, 59, 0), label: cleanText(x.label, 40),
      days: Array.isArray(x.days) ? [...new Set(x.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [],
      sound: SOUND_IDS.includes(x.sound) ? x.sound : 'digital', vol: int(x.vol, 0, 100, 80), snooze: int(x.snooze, 1, 30, 9),
      on: x.on !== false, snoozeUntil: Number.isFinite(x.snoozeUntil) ? x.snoozeUntil : 0,
    }));
  }
  const DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function daysLabel(days) {
    if (!days.length) return 'Once';
    const s = days.slice().sort().join('');
    if (s === '0123456') return 'Every day';
    if (s === '12345') return 'Weekdays';
    if (s === '06') return 'Weekends';
    return [1, 2, 3, 4, 5, 6, 0].filter(d => days.includes(d)).map(d => DAYN[d]).join(', ');
  }

  /* ---------- places: built-in city list (name, country, IANA zone, lat, lon) ---------- */
  const CITIES = [
    ['New York', 'United States', 'America/New_York', 40.71, -74.01], ['Los Angeles', 'United States', 'America/Los_Angeles', 34.05, -118.24], ['Chicago', 'United States', 'America/Chicago', 41.88, -87.63],
    ['Houston', 'United States', 'America/Chicago', 29.76, -95.37], ['Phoenix', 'United States', 'America/Phoenix', 33.45, -112.07], ['Denver', 'United States', 'America/Denver', 39.74, -104.99],
    ['San Francisco', 'United States', 'America/Los_Angeles', 37.77, -122.42], ['Seattle', 'United States', 'America/Los_Angeles', 47.61, -122.33], ['Las Vegas', 'United States', 'America/Los_Angeles', 36.17, -115.14],
    ['Dallas', 'United States', 'America/Chicago', 32.78, -96.8], ['Austin', 'United States', 'America/Chicago', 30.27, -97.74], ['Miami', 'United States', 'America/New_York', 25.76, -80.19],
    ['Atlanta', 'United States', 'America/New_York', 33.75, -84.39], ['Boston', 'United States', 'America/New_York', 42.36, -71.06], ['Washington DC', 'United States', 'America/New_York', 38.9, -77.04],
    ['Philadelphia', 'United States', 'America/New_York', 39.95, -75.17], ['Detroit', 'United States', 'America/Detroit', 42.33, -83.05], ['Minneapolis', 'United States', 'America/Chicago', 44.98, -93.27],
    ['Anchorage', 'United States', 'America/Anchorage', 61.22, -149.9], ['Honolulu', 'United States', 'Pacific/Honolulu', 21.31, -157.86], ['Toronto', 'Canada', 'America/Toronto', 43.65, -79.38],
    ['Vancouver', 'Canada', 'America/Vancouver', 49.28, -123.12], ['Montreal', 'Canada', 'America/Toronto', 45.5, -73.57], ['Calgary', 'Canada', 'America/Edmonton', 51.05, -114.07],
    ['Halifax', 'Canada', 'America/Halifax', 44.65, -63.58], ['St. John’s', 'Canada', 'America/St_Johns', 47.56, -52.71], ['Mexico City', 'Mexico', 'America/Mexico_City', 19.43, -99.13],
    ['Cancún', 'Mexico', 'America/Cancun', 21.16, -86.85], ['Guatemala City', 'Guatemala', 'America/Guatemala', 14.63, -90.51], ['Panama City', 'Panama', 'America/Panama', 8.98, -79.52],
    ['Havana', 'Cuba', 'America/Havana', 23.11, -82.37], ['San Juan', 'Puerto Rico', 'America/Puerto_Rico', 18.47, -66.11], ['Bogotá', 'Colombia', 'America/Bogota', 4.71, -74.07],
    ['Lima', 'Peru', 'America/Lima', -12.05, -77.04], ['Caracas', 'Venezuela', 'America/Caracas', 10.48, -66.9], ['Santiago', 'Chile', 'America/Santiago', -33.45, -70.67],
    ['Buenos Aires', 'Argentina', 'America/Argentina/Buenos_Aires', -34.6, -58.38], ['São Paulo', 'Brazil', 'America/Sao_Paulo', -23.55, -46.63], ['Rio de Janeiro', 'Brazil', 'America/Sao_Paulo', -22.91, -43.17],
    ['Montevideo', 'Uruguay', 'America/Montevideo', -34.9, -56.16], ['Quito', 'Ecuador', 'America/Guayaquil', -0.18, -78.47], ['La Paz', 'Bolivia', 'America/La_Paz', -16.5, -68.15],
    ['London', 'United Kingdom', 'Europe/London', 51.51, -0.13], ['Manchester', 'United Kingdom', 'Europe/London', 53.48, -2.24], ['Edinburgh', 'United Kingdom', 'Europe/London', 55.95, -3.19],
    ['Dublin', 'Ireland', 'Europe/Dublin', 53.35, -6.26], ['Lisbon', 'Portugal', 'Europe/Lisbon', 38.72, -9.14], ['Madrid', 'Spain', 'Europe/Madrid', 40.42, -3.7],
    ['Barcelona', 'Spain', 'Europe/Madrid', 41.39, 2.17], ['Paris', 'France', 'Europe/Paris', 48.86, 2.35], ['Brussels', 'Belgium', 'Europe/Brussels', 50.85, 4.35],
    ['Amsterdam', 'Netherlands', 'Europe/Amsterdam', 52.37, 4.9], ['Berlin', 'Germany', 'Europe/Berlin', 52.52, 13.4], ['Munich', 'Germany', 'Europe/Berlin', 48.14, 11.58],
    ['Frankfurt', 'Germany', 'Europe/Berlin', 50.11, 8.68], ['Zurich', 'Switzerland', 'Europe/Zurich', 47.38, 8.54], ['Geneva', 'Switzerland', 'Europe/Zurich', 46.2, 6.14],
    ['Rome', 'Italy', 'Europe/Rome', 41.9, 12.5], ['Milan', 'Italy', 'Europe/Rome', 45.46, 9.19], ['Vienna', 'Austria', 'Europe/Vienna', 48.21, 16.37],
    ['Prague', 'Czechia', 'Europe/Prague', 50.08, 14.44], ['Warsaw', 'Poland', 'Europe/Warsaw', 52.23, 21.01], ['Budapest', 'Hungary', 'Europe/Budapest', 47.5, 19.04],
    ['Copenhagen', 'Denmark', 'Europe/Copenhagen', 55.68, 12.57], ['Stockholm', 'Sweden', 'Europe/Stockholm', 59.33, 18.07], ['Oslo', 'Norway', 'Europe/Oslo', 59.91, 10.75],
    ['Helsinki', 'Finland', 'Europe/Helsinki', 60.17, 24.94], ['Reykjavík', 'Iceland', 'Atlantic/Reykjavik', 64.15, -21.94], ['Athens', 'Greece', 'Europe/Athens', 37.98, 23.73],
    ['Bucharest', 'Romania', 'Europe/Bucharest', 44.43, 26.1], ['Sofia', 'Bulgaria', 'Europe/Sofia', 42.7, 23.32], ['Belgrade', 'Serbia', 'Europe/Belgrade', 44.79, 20.45],
    ['Kyiv', 'Ukraine', 'Europe/Kyiv', 50.45, 30.52], ['Istanbul', 'Türkiye', 'Europe/Istanbul', 41.01, 28.98], ['Moscow', 'Russia', 'Europe/Moscow', 55.76, 37.62],
    ['Cairo', 'Egypt', 'Africa/Cairo', 30.04, 31.24], ['Johannesburg', 'South Africa', 'Africa/Johannesburg', -26.2, 28.05], ['Cape Town', 'South Africa', 'Africa/Johannesburg', -33.92, 18.42],
    ['Lagos', 'Nigeria', 'Africa/Lagos', 6.52, 3.38], ['Nairobi', 'Kenya', 'Africa/Nairobi', -1.29, 36.82], ['Casablanca', 'Morocco', 'Africa/Casablanca', 33.57, -7.59],
    ['Accra', 'Ghana', 'Africa/Accra', 5.6, -0.19], ['Addis Ababa', 'Ethiopia', 'Africa/Addis_Ababa', 9.03, 38.74], ['Tel Aviv', 'Israel', 'Asia/Jerusalem', 32.09, 34.78],
    ['Jerusalem', 'Israel', 'Asia/Jerusalem', 31.77, 35.21], ['Dubai', 'United Arab Emirates', 'Asia/Dubai', 25.2, 55.27], ['Abu Dhabi', 'United Arab Emirates', 'Asia/Dubai', 24.45, 54.38],
    ['Riyadh', 'Saudi Arabia', 'Asia/Riyadh', 24.71, 46.68], ['Doha', 'Qatar', 'Asia/Qatar', 25.29, 51.53], ['Tehran', 'Iran', 'Asia/Tehran', 35.69, 51.39],
    ['Karachi', 'Pakistan', 'Asia/Karachi', 24.86, 67.0], ['Mumbai', 'India', 'Asia/Kolkata', 19.08, 72.88], ['New Delhi', 'India', 'Asia/Kolkata', 28.61, 77.21],
    ['Bengaluru', 'India', 'Asia/Kolkata', 12.97, 77.59], ['Kolkata', 'India', 'Asia/Kolkata', 22.57, 88.36], ['Kathmandu', 'Nepal', 'Asia/Kathmandu', 27.72, 85.32],
    ['Dhaka', 'Bangladesh', 'Asia/Dhaka', 23.81, 90.41], ['Colombo', 'Sri Lanka', 'Asia/Colombo', 6.93, 79.86], ['Yangon', 'Myanmar', 'Asia/Yangon', 16.87, 96.2],
    ['Bangkok', 'Thailand', 'Asia/Bangkok', 13.76, 100.5], ['Ho Chi Minh City', 'Vietnam', 'Asia/Ho_Chi_Minh', 10.82, 106.63], ['Hanoi', 'Vietnam', 'Asia/Ho_Chi_Minh', 21.03, 105.85],
    ['Jakarta', 'Indonesia', 'Asia/Jakarta', -6.21, 106.85], ['Bali', 'Indonesia', 'Asia/Makassar', -8.65, 115.22], ['Kuala Lumpur', 'Malaysia', 'Asia/Kuala_Lumpur', 3.14, 101.69],
    ['Singapore', 'Singapore', 'Asia/Singapore', 1.35, 103.82], ['Manila', 'Philippines', 'Asia/Manila', 14.6, 120.98], ['Hong Kong', 'Hong Kong', 'Asia/Hong_Kong', 22.32, 114.17],
    ['Shanghai', 'China', 'Asia/Shanghai', 31.23, 121.47], ['Beijing', 'China', 'Asia/Shanghai', 39.9, 116.41], ['Shenzhen', 'China', 'Asia/Shanghai', 22.54, 114.06],
    ['Taipei', 'Taiwan', 'Asia/Taipei', 25.03, 121.57], ['Seoul', 'South Korea', 'Asia/Seoul', 37.57, 126.98], ['Tokyo', 'Japan', 'Asia/Tokyo', 35.68, 139.69],
    ['Osaka', 'Japan', 'Asia/Tokyo', 34.69, 135.5], ['Perth', 'Australia', 'Australia/Perth', -31.95, 115.86], ['Adelaide', 'Australia', 'Australia/Adelaide', -34.93, 138.6],
    ['Darwin', 'Australia', 'Australia/Darwin', -12.46, 130.84], ['Brisbane', 'Australia', 'Australia/Brisbane', -27.47, 153.03], ['Sydney', 'Australia', 'Australia/Sydney', -33.87, 151.21],
    ['Melbourne', 'Australia', 'Australia/Melbourne', -37.81, 144.96], ['Auckland', 'New Zealand', 'Pacific/Auckland', -36.85, 174.76], ['Wellington', 'New Zealand', 'Pacific/Auckland', -41.29, 174.78],
    ['Fiji', 'Fiji', 'Pacific/Fiji', -18.14, 178.44], ['Tashkent', 'Uzbekistan', 'Asia/Tashkent', 41.3, 69.24], ['Almaty', 'Kazakhstan', 'Asia/Almaty', 43.24, 76.89],
    ['Baku', 'Azerbaijan', 'Asia/Baku', 40.41, 49.87], ['Tbilisi', 'Georgia', 'Asia/Tbilisi', 41.72, 44.79], ['Kabul', 'Afghanistan', 'Asia/Kabul', 34.56, 69.21],
  ];
  const ALIASES = { est: 'New York', edt: 'New York', eastern: 'New York', et: 'New York', pst: 'Los Angeles', pdt: 'Los Angeles', pacific: 'Los Angeles', pt: 'Los Angeles', cst: 'Chicago', cdt: 'Chicago', central: 'Chicago', mst: 'Denver', mdt: 'Denver', mountain: 'Denver', akst: 'Anchorage', hst: 'Honolulu', gmt: 'London', bst: 'London', wet: 'Lisbon', cet: 'Paris', cest: 'Paris', eet: 'Athens', msk: 'Moscow', ist: 'New Delhi', pkt: 'Karachi', jst: 'Tokyo', kst: 'Seoul', sgt: 'Singapore', hkt: 'Hong Kong', aest: 'Sydney', aedt: 'Sydney', awst: 'Perth', nzst: 'Auckland', nzdt: 'Auckland', gst: 'Dubai', sast: 'Johannesburg', wat: 'Lagos', eat: 'Nairobi', brt: 'São Paulo', art: 'Buenos Aires' };
  const fold = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const slug = s => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const PLACES = CITIES.map(c => ({ id: slug(c[0]), city: c[0], country: c[1], zone: c[2], lat: c[3], lon: c[4] }));
  const placeById = id => {
    if (typeof id !== 'string' || id.length > 70) return null;
    if (id.startsWith('z:')) { const z = id.slice(2); return validZone(z) ? { id, city: zoneCity(z), country: z.includes('/') ? z.split('/')[0].replace(/_/g, ' ') : 'Time zone', zone: z } : null; }
    const p = PLACES.find(x => x.id === id); return p && validZone(p.zone) ? p : null;
  };
  const placeForZone = z => PLACES.find(p => p.zone === z) || placeById('z:' + z);
  function searchPlaces(q, zones, limit = 8) {
    q = fold(q).trim().slice(0, 60); if (!q) return [];
    const out = [], seen = new Set();
    const push = (p, score) => { if (!seen.has(p.id) && validZone(p.zone)) { seen.add(p.id); out.push([score, p]); } };
    if (ALIASES[q]) push(PLACES.find(p => p.city === ALIASES[q]), 0);
    for (const p of PLACES) {
      const c = fold(p.city), k = fold(p.country);
      if (c.startsWith(q)) push(p, 1); else if (c.includes(q)) push(p, 2); else if (k.startsWith(q)) push(p, 3); else if (k.includes(q) && q.length > 2) push(p, 4); else if (fold(p.zone).includes(q.replace(/ /g, '_'))) push(p, 5);
    }
    const known = new Set(PLACES.map(p => p.zone));
    for (const z of zones || []) { if (known.has(z)) continue; const f = fold(z); if (f.includes(q.replace(/ /g, '_'))) push({ id: 'z:' + z, city: zoneCity(z), country: z, zone: z }, f.split('/').pop().startsWith(q.replace(/ /g, '_')) ? 3.5 : 6); }
    return out.sort((a, b) => a[0] - b[0]).slice(0, limit).map(x => x[1]);
  }

  return { pad, esc, clamp, int, cleanText, MAX_DUR, fmtDur, fmtHuman, parseDuration, newTimer, tLeft, tStart, tPause, tReset, tAdd, tCheck, sanitizeTimers,
    swNew, swElapsed, swToggle, swLap, lapRows, lapStats, lapsCSV, sanitizeSW, PO_DEF, poCfg, poLen, poNext, dayKey,
    zparts, offsetMin, zonedToUtc, validZone, localZone, allZones, fmtOffset, relOffset, abbr, fmtTime, fmtDate, dayDiff, addDays, zoneCity, planner, bestRanges,
    solarElevation, dayState, cdParts, validYMD, validHM, parseCdParams, cdQuery, easter, presets, parseTzParams, tzQuery,
    SOUNDS, SOUND_IDS, alarmNext, sanitizeAlarms, daysLabel, CITIES, PLACES, placeById, placeForZone, searchPlaces, slug };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = TK;

/* ==========================================================================
   UI (browser only). No inline handlers: everything is delegated from here.
   ========================================================================== */
if (typeof document !== 'undefined') (() => {
  const { pad, fmtDur, fmtTime, fmtDate } = TK;
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const setText = (e, t) => { if (e && e.textContent !== t) e.textContent = t; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / full */ } },
  };
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800); };
  function copy(txt, label) {
    const done = () => toast(label || 'Copied');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done)); else fallbackCopy(txt, done);
  }
  function fallbackCopy(txt, done) { const ta = el('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch { toast('Copy failed: select and press Ctrl+C'); } ta.remove(); }
  function download(name, data, type) {
    const url = URL.createObjectURL(new Blob([data], { type })); const a = el('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const typing = e => { const t = e.target; if (!t || !t.tagName) return false; if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true; return t.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit)$/.test(t.type); };
  const LZ = TK.localZone();
  const ZONES = TK.allZones();
  let h12 = store.get('hl.h12', null);
  if (typeof h12 !== 'boolean') { try { h12 = /h1[12]/.test(new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle || 'h12'); } catch { h12 = true; } }
  const fmtHM = (h, m) => h12 ? ((h % 12) || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM') : pad(h) + ':' + pad(m);
  const soundOk = v => TK.SOUND_IDS.includes(v);
  const relIn = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'in under a minute' : 'in ' + (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60) + ' min'; };
  const params = new URLSearchParams(location.search.slice(0, 2000));
  const startView = document.body.dataset.view || 'timer';

  /* ---------- sound (Web Audio only, no files) ---------- */
  const Snd = (() => {
    let ctx = null; const active = new Set();
    function ensure() {
      try { if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); } if (ctx.state === 'suspended') ctx.resume().catch(() => {}); } catch { return null; }
      return ctx;
    }
    function tone(dest, t, f, dur, type, peak, att) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + (att || 0.008)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
    }
    const PAT = {
      beep: (d, t) => { for (let i = 0; i < 3; i++) tone(d, t + i * 0.22, 880, 0.16, 'square', 0.12); return 0.8; },
      digital: (d, t) => { for (let k = 0; k < 2; k++) for (let i = 0; i < 4; i++) tone(d, t + k * 0.55 + i * 0.09, 2093, 0.06, 'square', 0.08, 0.003); return 1.0; },
      chime: (d, t) => { [1046.5, 1318.5, 1568].forEach((f, i) => { tone(d, t + i * 0.18, f, 1.3, 'sine', 0.3); tone(d, t + i * 0.18, f * 2, 0.6, 'sine', 0.06); }); return 1.8; },
      bell: (d, t) => { [[1, 0.35, 2.6], [2.76, 0.16, 1.6], [5.4, 0.08, 1], [8.93, 0.04, 0.6]].forEach(([m, a, du]) => tone(d, t, 660 * m, du, 'sine', a, 0.004)); return 2.6; },
      marimba: (d, t) => { [784, 1046.5, 1318.5, 1568].forEach((f, i) => { tone(d, t + i * 0.14, f, 0.45, 'sine', 0.32, 0.004); tone(d, t + i * 0.14, f * 4, 0.12, 'sine', 0.05, 0.002); }); return 1.2; },
      gentle: (d, t) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(d, t + i * 0.32, f, 1.1, 'sine', 0.24, 0.12)); return 2.2; },
    };
    // Schedules every repeat on the audio clock up front, so ringing keeps going in background tabs.
    function play(name, vol, loopSec) {
      const c = ensure(); if (!c) return { stop() {} };
      const pat = PAT[name] || PAT.beep, v = Math.pow(TK.clamp(+vol || 0, 0, 100) / 100, 2);
      const master = c.createGain(); master.connect(c.destination);
      const t0 = c.currentTime + 0.05; let t = t0, n = 0;
      do { t += pat(master, t) + 0.4; n++; } while (loopSec && t < t0 + loopSec && n < 150);
      if (name === 'gentle' && loopSec) { master.gain.setValueAtTime(v * 0.2, t0); master.gain.linearRampToValueAtTime(v, t0 + Math.min(30, loopSec)); } else master.gain.setValueAtTime(v, t0);
      const h = { stop() { try { master.gain.cancelScheduledValues(c.currentTime); master.gain.setValueAtTime(0, c.currentTime); setTimeout(() => master.disconnect(), 120); } catch { /* closed */ } active.delete(h); }, until: t };
      active.add(h); return h;
    }
    return { ensure, play, state: () => (ctx ? ctx.state : 'none') };
  })();
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => Snd.ensure(), { capture: true, passive: true }));
  $$('[data-sound-select]').forEach(s => TK.SOUNDS.forEach(([v, n]) => s.append(new Option(n, v))));

  /* ---------- notifications (only after the user clicks to allow) ---------- */
  const Notify = {
    ok: () => 'Notification' in window && Notification.permission === 'granted' && store.get('hl.notify', false) === true,
    ui() {
      const on = Notify.ok(), blocked = 'Notification' in window && Notification.permission === 'denied';
      $$('[data-notify-status]').forEach(p => { p.textContent = on ? 'Notifications on' : blocked ? 'Blocked in browser settings' : 'Notifications off'; p.className = 'pill ' + (on ? 'ok' : blocked ? 'bad' : ''); });
      $$('[data-act="notify"]').forEach(b => { b.textContent = on ? '🔕 Turn off notifications' : '🔔 Enable notifications'; });
    },
    async toggle() {
      if (!('Notification' in window)) return toast('This browser doesn’t support notifications');
      if (Notify.ok()) { store.set('hl.notify', false); Notify.ui(); return toast('Notifications off'); }
      if (Notification.permission === 'denied') return toast('Notifications are blocked. Allow them in your browser’s site settings.');
      let p = Notification.permission;
      if (p !== 'granted') { try { p = await Notification.requestPermission(); } catch { p = 'denied'; } }
      store.set('hl.notify', p === 'granted'); Notify.ui(); toast(p === 'granted' ? 'Notifications on' : 'Notifications not allowed');
    },
    send(title, body) {
      if (!Notify.ok()) return;
      try { const n = new Notification(title, { body, tag: 'hourlark', renotify: true }); n.onclick = () => { window.focus(); n.close(); }; } catch { /* some mobile browsers need a service worker */ }
    },
  };
  Notify.ui();

  /* ---------- keep screen awake ---------- */
  const Wake = {
    lock: null, want: store.get('hl.wake', false) === true,
    async apply() {
      $$('[data-wake]').forEach(c => { c.checked = Wake.want; });
      try {
        if (Wake.want && !Wake.lock && navigator.wakeLock && document.visibilityState === 'visible') { Wake.lock = await navigator.wakeLock.request('screen'); Wake.lock.addEventListener('release', () => { Wake.lock = null; }); }
        else if (!Wake.want && Wake.lock) { await Wake.lock.release(); Wake.lock = null; }
      } catch { /* denied, e.g. battery saver */ }
    },
  };
  Wake.apply();

  function toggleFS(node) {
    if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
    if (!node || !node.requestFullscreen) return toast('Fullscreen isn’t available here');
    node.requestFullscreen().catch(() => toast('Fullscreen isn’t available here'));
  }

  /* ---------- ringing overlay (shared by timers and alarms) ---------- */
  const Ring = (() => {
    const box = $('#ringer'); let items = [], snd = null, back = null;
    function render() {
      if (!items.length) { if (!box.hidden) { box.hidden = true; if (back && back.focus) back.focus(); } return; }
      const it = items[items.length - 1];
      $('#rg-title').textContent = it.title; $('#rg-sub').textContent = it.sub || '';
      $('#rg-more').textContent = items.length > 1 ? '+ ' + (items.length - 1) + ' more ringing' : '';
      const sz = $('#rg-snooze'); sz.hidden = !it.snooze; if (it.snooze) sz.textContent = 'Snooze ' + it.snoozeMin + ' min';
      if (box.hidden) { back = document.activeElement; box.hidden = false; $('#rg-stop').focus(); }
    }
    function sound() { if (snd) snd.stop(); snd = null; const it = items[items.length - 1]; if (it) snd = Snd.play(it.sound, it.vol, it.loop); }
    function show(it) { items = items.filter(x => x.key !== it.key); items.push(it); sound(); render(); }
    function stop() { if (snd) snd.stop(); snd = null; const its = items; items = []; render(); its.forEach(i => i.onStop && i.onStop()); }
    function snooze() { const it = items.pop(); if (it && it.snooze) it.snooze(); sound(); render(); }
    $('#rg-stop').addEventListener('click', stop); $('#rg-snooze').addEventListener('click', snooze);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && items.length) { e.preventDefault(); stop(); } });
    return { show, stop, active: () => items.length > 0, top: () => items[items.length - 1], drop(key) { const had = items.length; items = items.filter(x => x.key !== key); if (items.length !== had) { sound(); render(); } } };
  })();

  /* ---------- reusable city / zone search (combobox) ---------- */
  function combo(input, list, onPick) {
    let items = [], idx = -1;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
    const draw = () => {
      list.textContent = ''; const now = Date.now();
      items.forEach((p, i) => {
        const li = el('li'); li.id = list.id + '-' + i; li.dataset.i = i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        li.append(el('b', null, p.city), el('span', null, (p.country !== p.zone ? p.country + ' · ' : '') + fmtTime(now, p.zone, h12) + ' · ' + TK.fmtOffset(TK.offsetMin(p.zone, now))));
        list.append(li);
      });
      if (!items.length) list.append(el('li', null, 'No matching city or time zone'));
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
      if (idx >= 0) { input.setAttribute('aria-activedescendant', list.id + '-' + idx); const a = list.children[idx]; if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' }); }
    };
    const pick = p => { input.value = ''; close(); onPick(p); };
    input.addEventListener('input', () => { if (!input.value.trim()) return close(); items = TK.searchPlaces(input.value, ZONES); idx = items.length ? 0 : -1; draw(); });
    input.addEventListener('keydown', e => {
      if (list.hidden || !items.length) { if (e.key === 'Escape') close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); idx = (idx + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length; draw(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (items[idx]) pick(items[idx]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    list.addEventListener('mousedown', e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } });
    input.addEventListener('blur', () => setTimeout(close, 150));
  }
  function fillZones(sel, value) {
    const now = Date.now(); sel.textContent = '';
    for (const z of ZONES) sel.append(new Option(z.replace(/_/g, ' ') + ' (' + TK.fmtOffset(TK.offsetMin(z, now)) + ')', z));
    sel.value = value;
  }

  /* ======================= TIMER ======================= */
  const TM = (() => {
    let list = TK.sanitizeTimers(store.get('hl.timers', null), Date.now());
    const c0 = store.get('hl.tm.cfg', {}) || {};
    const cfg = { sound: soundOk(c0.sound) ? c0.sound : 'beep', vol: TK.int(c0.vol, 0, 100, 70), loop: c0.loop !== false };
    if (!list.length) list = [TK.newTimer(300000, '')];
    const wrap = $('#tm-list'), cards = new Map();
    const save = () => store.set('hl.timers', list);
    const saveCfg = () => store.set('hl.tm.cfg', cfg);
    $('#tm-sound').value = cfg.sound; $('#tm-vol').value = cfg.vol; $('#tm-loop').checked = cfg.loop;
    function card(t) {
      const c = el('div', 'tcard'); c.dataset.id = t.id;
      const top = el('div', 'tc-top'), lab = el('input', 'tc-label');
      lab.type = 'text'; lab.maxLength = 40; lab.placeholder = 'Timer'; lab.value = t.label; lab.setAttribute('aria-label', 'Timer label'); lab.dataset.id = t.id;
      const fs = el('button', 'iconbtn', '⛶'); fs.dataset.act = 'tm-fs'; fs.dataset.id = t.id; fs.title = 'Fullscreen'; fs.setAttribute('aria-label', 'Fullscreen');
      const del = el('button', 'iconbtn', '✕'); del.dataset.act = 'tm-del'; del.dataset.id = t.id; del.title = 'Remove timer'; del.setAttribute('aria-label', 'Remove timer');
      top.append(lab, fs, del);
      const disp = el('div', 'tc-disp mono'); disp.setAttribute('role', 'timer');
      const bar = el('div', 'tc-bar'), fill = el('i'); bar.append(fill);
      const meta = el('div', 'tc-meta'), m1 = el('span'), m2 = el('span'); meta.append(m1, m2);
      const row = el('div', 'row tight');
      const mk = (act, txt, cls, ms) => { const b = el('button', 'btn ' + (cls || ''), txt); b.dataset.act = act; b.dataset.id = t.id; if (ms) b.dataset.ms = ms; row.append(b); return b; };
      const tog = mk('tm-toggle', 'Start', 'primary'); mk('tm-reset', 'Reset'); mk('tm-plus', '+1 min', '', 60000); mk('tm-plus', '+5 min', '', 300000);
      c.append(top, disp, bar, meta, row);
      return { c, disp, fill, m1, m2, tog, lab };
    }
    function render(now) {
      const ids = new Set(list.map(t => t.id));
      for (const [id, k] of cards) if (!ids.has(id)) { k.c.remove(); cards.delete(id); }
      list.forEach((t, i) => {
        let k = cards.get(t.id); if (!k) { k = card(t); cards.set(t.id, k); }
        if (wrap.children[i] !== k.c) wrap.insertBefore(k.c, wrap.children[i] || null);
        const left = TK.tLeft(t, now);
        setText(k.disp, t.state === 'done' ? '+' + fmtDur(-left) : fmtDur(left, { ceil: true }));
        const p = t.state === 'done' ? 0 : TK.clamp(left / t.dur, 0, 1);
        k.fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        k.c.classList.toggle('done', t.state === 'done'); k.c.classList.toggle('paused', t.state === 'paused');
        setText(k.tog, { idle: 'Start', run: 'Pause', paused: 'Resume', done: 'Restart' }[t.state]);
        setText(k.m1, 'of ' + TK.fmtHuman(t.dur));
        setText(k.m2, t.state === 'run' ? 'ends ' + fmtTime(t.endAt, LZ, h12) : t.state === 'done' ? 'finished ' + fmtTime(t.endAt, LZ, h12) : t.state === 'paused' ? 'paused' : '');
      });
    }
    function fire(t) {
      const name = t.label || 'Timer';
      Ring.show({ key: 'tm:' + t.id, title: name, sub: 'Time’s up · ' + TK.fmtHuman(t.dur), sound: cfg.sound, vol: cfg.vol, loop: cfg.loop ? 60 : 0 });
      Notify.send('⏰ ' + name, 'Time’s up (' + TK.fmtHuman(t.dur) + ')');
    }
    function check(now) { let ch = false; for (const t of list) if (TK.tCheck(t, now)) { ch = true; fire(t); } if (ch) { save(); render(now); } }
    const find = id => list.find(t => t.id === id);
    function add(ms, label, start) {
      const now = Date.now();
      if (list.length === 1 && list[0].state === 'idle' && !list[0].label && !cards.get(list[0].id)?.touched) list = [];
      if (list.length >= 12) return toast('You can run up to 12 timers at once');
      const t = TK.newTimer(ms, label); list.unshift(t);
      if (start) TK.tStart(t, now);
      save(); render(now); kick();
      return t;
    }
    function act(a, id, b) {
      const now = Date.now(), t = id ? find(id) : list[0]; if (!t) return;
      if (a === 'toggle') { if (t.state === 'run') TK.tPause(t, now); else { Snd.ensure(); if (t.state === 'done') Ring.drop('tm:' + t.id); TK.tStart(t, now); } }
      else if (a === 'reset') { TK.tReset(t); Ring.drop('tm:' + t.id); }
      else if (a === 'plus') { TK.tAdd(t, +b.dataset.ms, now); Ring.drop('tm:' + t.id); }
      else if (a === 'del') { list = list.filter(x => x !== t); Ring.drop('tm:' + t.id); }
      else if (a === 'fs') { const k = cards.get(t.id); if (k) toggleFS(k.c); return; }
      save(); render(now); kick();
    }
    const deadline = () => { const r = list.filter(t => t.state === 'run').map(t => t.endAt); return r.length ? Math.min(...r) : null; };
    function title(now) {
      const r = list.filter(t => t.state === 'run').sort((a, b) => a.endAt - b.endAt)[0];
      return r ? fmtDur(r.endAt - now, { ceil: true }) + ' ⏱ ' + (r.label || 'Timer') : null;
    }
    wrap.addEventListener('input', e => { const t = e.target.classList.contains('tc-label') && find(e.target.dataset.id); if (t) { t.label = TK.cleanText(e.target.value, 40); const k = cards.get(t.id); if (k) k.touched = true; save(); } });
    const fromFields = () => (TK.int($('#tm-h').value, 0, 99, 0) * 3600 + TK.int($('#tm-m').value, 0, 59, 0) * 60 + TK.int($('#tm-s').value, 0, 59, 0)) * 1000;
    function addFromFields() { const ms = Math.min(fromFields(), TK.MAX_DUR); if (!ms) return toast('Set a time first'); Snd.ensure(); add(ms, $('#tm-label').value, true); $('#tm-label').value = ''; }
    $('#tm-quick').addEventListener('keydown', e => {
      if (e.key !== 'Enter') return; e.preventDefault();
      const ms = TK.parseDuration(e.target.value); if (!ms) return toast('Try a format like 7m, 1h 30m, 90s or 2:30');
      Snd.ensure(); add(ms, $('#tm-label').value, true); e.target.value = ''; $('#tm-label').value = '';
    });
    $('#tm-sound').addEventListener('change', e => { cfg.sound = soundOk(e.target.value) ? e.target.value : 'beep'; saveCfg(); });
    $('#tm-vol').addEventListener('change', e => { cfg.vol = TK.int(e.target.value, 0, 100, 70); saveCfg(); });
    $('#tm-loop').addEventListener('change', e => { cfg.loop = e.target.checked; saveCfg(); });
    if (startView === 'timer' && params.get('t')) { const ms = TK.parseDuration(params.get('t')); if (ms) { add(ms, TK.cleanText(params.get('label'), 40), false); setTimeout(() => toast('Timer ready: press Start'), 300); } }
    render(Date.now());
    return { render, check, act, add, addFromFields, deadline, title, list: () => list };
  })();

  /* ======================= STOPWATCH ======================= */
  const SW = (() => {
    let w = TK.sanitizeSW(store.get('hl.sw', null));
    const save = () => store.set('hl.sw', w), tb = $('#sw-laps');
    function render(now) {
      const e = TK.swElapsed(w, now), last = w.laps.length ? w.laps[w.laps.length - 1] : 0;
      setText($('#sw-disp'), fmtDur(e, { cs: true }));
      setText($('#sw-lapnow'), 'Lap ' + (w.laps.length + 1) + ' · ' + fmtDur(e - last, { cs: true }));
    }
    function renderLaps() {
      const rows = TK.lapRows(w.laps), st = TK.lapStats(rows);
      tb.textContent = '';
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i], tr = el('tr'); const isF = i === st.fastest, isS = i === st.slowest;
        if (isF) tr.className = 'fast'; if (isS) tr.className = 'slow';
        const c1 = el('td', null, String(r.n)); if (isF || isS) c1.append(el('small', null, isF ? 'fastest' : 'slowest'));
        const d = rows.length > 1 ? r.lap - st.avg : 0;
        tr.append(c1, el('td', null, fmtDur(r.lap, { cs: true })), el('td', null, fmtDur(r.split, { cs: true })), el('td', null, rows.length > 1 ? (d >= 0 ? '+' : '−') + (Math.abs(d) / 1000).toFixed(2) + ' s' : '–'));
        tb.append(tr);
      }
      setText($('#sw-n'), String(rows.length));
      setText($('#sw-fast'), st.fastest >= 0 ? fmtDur(rows[st.fastest].lap, { cs: true }) : '–');
      setText($('#sw-slow'), st.slowest >= 0 ? fmtDur(rows[st.slowest].lap, { cs: true }) : '–');
      setText($('#sw-avg'), rows.length > 1 ? fmtDur(st.avg, { cs: true }) : '–');
      $('#sw-empty').hidden = rows.length > 0;
      setText($('#sw-toggle'), w.run ? 'Stop' : w.acc > 0 ? 'Resume' : 'Start');
      $('#sw-lap').disabled = !w.run;
    }
    function act(a) {
      const now = Date.now();
      if (a === 'toggle') TK.swToggle(w, now);
      else if (a === 'lap') { if (!w.run) return; if (w.laps.length >= 999) return toast('999 laps is the limit'); TK.swLap(w, now); }
      else if (a === 'reset') w = TK.swNew();
      else if (a === 'csv' || a === 'copy') {
        const rows = TK.lapRows(w.laps); if (!rows.length) return toast('No laps yet');
        if (a === 'csv') { download('hourlark-laps-' + TK.dayKey(new Date()) + '.csv', TK.lapsCSV(rows), 'text/csv;charset=utf-8'); toast('CSV downloaded'); }
        else copy(['Lap\tLap time\tSplit'].concat(rows.map(r => r.n + '\t' + fmtDur(r.lap, { cs: true }) + '\t' + fmtDur(r.split, { cs: true }))).join('\n'), 'Laps copied');
        return;
      }
      save(); render(now); renderLaps();
    }
    renderLaps(); render(Date.now());
    return { render, act, title: now => w.run ? fmtDur(TK.swElapsed(w, now)) + ' ⏱ Stopwatch' : null, state: () => w };
  })();

  /* ======================= POMODORO ======================= */
  const PO = (() => {
    let cfg = TK.poCfg(store.get('hl.po.cfg', null));
    const s0 = store.get('hl.po.snd', {}) || {};
    const snd = { sound: soundOk(s0.sound) ? s0.sound : 'chime', vol: TK.int(s0.vol, 0, 100, 70) };
    const r0 = store.get('hl.po', {}) || {};
    const st = { phase: ['work', 'short', 'long'].includes(r0.phase) ? r0.phase : 'work', done: TK.int(r0.done, 0, 999, 0), state: ['idle', 'run', 'paused'].includes(r0.state) ? r0.state : 'idle', left: 0, endAt: 0 };
    st.left = TK.int(r0.left, 0, TK.poLen(st.phase, cfg), TK.poLen(st.phase, cfg)); if (!st.left) st.left = TK.poLen(st.phase, cfg);
    if (st.state === 'run') { if (Number.isFinite(r0.endAt) && r0.endAt > Date.now() - 864e5) st.endAt = r0.endAt; else st.state = 'idle'; }
    let tasks = (Array.isArray(store.get('hl.po.tasks', [])) ? store.get('hl.po.tasks', []) : []).slice(0, 50).filter(t => t && typeof t.text === 'string')
      .map(t => ({ id: typeof t.id === 'string' && /^k[a-z0-9]{1,12}$/.test(t.id) ? t.id : 'k' + Math.random().toString(36).slice(2, 9), text: TK.cleanText(t.text, 120), done: !!t.done, n: TK.int(t.n, 0, 9999, 0) })).filter(t => t.text);
    let cur = store.get('hl.po.cur', null); if (!tasks.some(t => t.id === cur)) cur = null;
    let hist = store.get('hl.po.hist', {}); if (!hist || typeof hist !== 'object' || Array.isArray(hist)) hist = {};
    hist = Object.fromEntries(Object.entries(hist).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v === 'object').sort().slice(-30).map(([k, v]) => [k, { n: TK.int(v.n, 0, 999, 0), min: TK.int(v.min, 0, 99999, 0) }]));
    const save = () => { store.set('hl.po', st); store.set('hl.po.tasks', tasks); store.set('hl.po.cur', cur); store.set('hl.po.hist', hist); };
    const ids = { work: 'po-work', short: 'po-short', long: 'po-long', every: 'po-every' };
    const syncInputs = () => { for (const k in ids) $('#' + ids[k]).value = cfg[k]; $('#po-auto-break').checked = cfg.autoBreak; $('#po-auto-work').checked = cfg.autoWork; $('#po-sound').value = snd.sound; $('#po-vol').value = snd.vol; };
    syncInputs();
    const len = () => TK.poLen(st.phase, cfg);
    const left = now => st.state === 'run' ? st.endAt - now : st.left;
    const NAMES = { work: 'Focus', short: 'Short break', long: 'Long break' };
    function complete(now, natural) {
      const was = st.phase, prevEnd = st.endAt;
      if (was === 'work' && natural) {
        const k = TK.dayKey(new Date(now)); const h = hist[k] || (hist[k] = { n: 0, min: 0 }); h.n++; h.min += cfg.work;
        const keys = Object.keys(hist).sort(); while (keys.length > 30) delete hist[keys.shift()];
        const t = tasks.find(x => x.id === cur); if (t) t.n++;
      }
      const nx = TK.poNext(was, st.done, cfg, natural); st.phase = nx.phase; st.done = nx.done; st.left = len();
      const auto = st.phase === 'work' ? cfg.autoWork : cfg.autoBreak;
      if (natural && auto) { st.state = 'run'; st.endAt = (now - prevEnd < 5000 ? prevEnd : now) + st.left; } else st.state = 'idle';
      if (natural) {
        Snd.play(snd.sound, snd.vol, 3);
        const msg = was === 'work' ? 'Focus session done. Time for a ' + (st.phase === 'long' ? 'long' : 'short') + ' break.' : 'Break over. Ready to focus?';
        toast(msg); Notify.send(was === 'work' ? '🍅 Focus session complete' : '☕ Break finished', msg);
      }
      save(); renderAll(now); kick();
    }
    function check(now) { if (st.state === 'run' && now >= st.endAt) complete(now, true); }
    function render(now) {
      const l = Math.max(0, left(now)), L = len();
      setText($('#po-time'), fmtDur(l, { ceil: true }));
      $('#po-arc').style.strokeDashoffset = (628.32 * (1 - TK.clamp(l / L, 0, 1))).toFixed(2);
    }
    function renderAll(now) {
      render(now);
      const n = st.phase === 'work' ? (st.done % cfg.every) + 1 : st.done % cfg.every || cfg.every;
      setText($('#po-label'), NAMES[st.phase] + ' · ' + (st.phase === 'work' ? 'session ' + n + ' of ' + cfg.every : 'after session ' + n));
      $$('#po-phase button').forEach(b => b.classList.toggle('on', b.dataset.ph === st.phase));
      $('#po-card').classList.toggle('brk', st.phase !== 'work');
      setText($('#po-toggle'), st.state === 'run' ? 'Pause' : st.state === 'paused' ? 'Resume' : 'Start');
      const k = TK.dayKey(new Date(now)), td = hist[k] || { n: 0, min: 0 };
      setText($('#po-today'), String(td.n)); setText($('#po-mins'), String(td.min));
      const wk = $('#po-week'); wk.textContent = ''; const days = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(d); }
      const max = Math.max(1, ...days.map(d => (hist[TK.dayKey(d)] || {}).n || 0));
      days.forEach((d, i) => { const v = (hist[TK.dayKey(d)] || {}).n || 0, c = el('div', i === 6 ? 'today' : ''), bar = el('i'); bar.style.height = Math.round(v / max * 64) + 'px'; bar.title = v + ' sessions'; c.append(el('span', null, String(v)), bar, el('span', null, d.toLocaleDateString('en-US', { weekday: 'narrow' }))); wk.append(c); });
      const ul = $('#po-tasks'); ul.textContent = '';
      tasks.forEach(t => {
        const li = el('li', (t.id === cur ? 'cur ' : '') + (t.done ? 'done' : '')); li.dataset.id = t.id;
        const cb = el('input'); cb.type = 'checkbox'; cb.checked = t.done; cb.dataset.act = 'po-task-done'; cb.dataset.id = t.id; cb.setAttribute('aria-label', 'Done');
        const tt = el('span', 'tt', t.text); tt.dataset.act = 'po-task-pick'; tt.dataset.id = t.id; tt.title = 'Work on this'; tt.tabIndex = 0; tt.setAttribute('role', 'button');
        const tn = el('span', 'tn', t.n ? t.n + '×' : ''); tn.title = t.n + ' focus sessions';
        const x = el('button', 'iconbtn', '✕'); x.dataset.act = 'po-task-del'; x.dataset.id = t.id; x.setAttribute('aria-label', 'Delete task');
        li.append(cb, tt, tn, x); ul.append(li);
      });
      const ct = tasks.find(t => t.id === cur);
      setText($('#po-task-now'), ct ? 'Working on: ' + ct.text : tasks.length ? 'Click a task to track sessions against it.' : 'Add a task on the right to track sessions per task.');
    }
    function act(a, b) {
      const now = Date.now();
      if (a === 'toggle') { if (st.state === 'run') { st.left = Math.max(0, st.endAt - now); st.state = 'paused'; } else { Snd.ensure(); st.endAt = now + st.left; st.state = 'run'; } }
      else if (a === 'reset') { st.state = 'idle'; st.left = len(); }
      else if (a === 'skip') return complete(now, false);
      else if (a === 'phase') { st.phase = b.dataset.ph; st.state = 'idle'; st.left = len(); }
      else if (a === 'task-add') {
        const inp = $('#po-task-in'), v = TK.cleanText(inp.value, 120); if (!v) return toast('Type a task first');
        if (tasks.length >= 50) return toast('50 tasks is the limit'); const t = { id: 'k' + Math.random().toString(36).slice(2, 9), text: v, done: false, n: 0 };
        tasks.push(t); if (!cur) cur = t.id; inp.value = '';
      }
      else if (a === 'task-del') { tasks = tasks.filter(t => t.id !== b.dataset.id); if (cur === b.dataset.id) cur = null; }
      else if (a === 'task-done') { const t = tasks.find(x => x.id === b.dataset.id); if (t) t.done = b.checked; }
      else if (a === 'task-pick') cur = cur === b.dataset.id ? null : b.dataset.id;
      save(); renderAll(now); kick();
    }
    $('#po-task-in').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act('task-add'); } });
    $('#po-tasks').addEventListener('keydown', e => { const t = e.target.closest('[data-act="po-task-pick"]'); if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); act('task-pick', t); } });
    $('#v-pomodoro').addEventListener('change', e => {
      const id = e.target.id; if (!/^po-(work|short|long|every|auto-break|auto-work|sound|vol)$/.test(id)) return;
      if (id === 'po-sound' || id === 'po-vol') { snd.sound = soundOk($('#po-sound').value) ? $('#po-sound').value : 'chime'; snd.vol = TK.int($('#po-vol').value, 0, 100, 70); store.set('hl.po.snd', snd); return; }
      cfg = TK.poCfg({ work: $('#po-work').value, short: $('#po-short').value, long: $('#po-long').value, every: $('#po-every').value, autoBreak: $('#po-auto-break').checked, autoWork: $('#po-auto-work').checked });
      store.set('hl.po.cfg', cfg); syncInputs(); if (st.state === 'idle') st.left = len(); save(); renderAll(Date.now());
    });
    renderAll(Date.now());
    return { render, renderAll, check, act, deadline: () => st.state === 'run' ? st.endAt : null, title: now => st.state === 'run' ? fmtDur(Math.max(0, st.endAt - now), { ceil: true }) + ' 🍅 ' + NAMES[st.phase] : null, state: () => st };
  })();

  /* ======================= COUNTDOWN ======================= */
  const CD = (() => {
    const ps = TK.presets(Date.now(), LZ);
    const fromPreset = p => ({ name: p.name, date: p.date, time: p.time, zone: LZ });
    let ev = null;
    if (startView === 'countdown') { const q = TK.parseCdParams(location.search); if (q) ev = { name: q.name, date: q.date, time: q.time, zone: q.zone || LZ }; }
    if (!ev) { const s = store.get('hl.cd', null); if (s && typeof s === 'object') { const d = TK.validYMD(s.d), t = TK.validHM(s.t); if (d) ev = { name: TK.cleanText(s.name, 80), date: d, time: t || { h: 0, mi: 0 }, zone: TK.validZone(s.z) ? s.z : LZ }; } }
    if (!ev) ev = fromPreset(ps.find(p => p.key === 'newyear') || ps[0]);
    let target = 0, info = null;
    fillZones($('#cd-zone'), ev.zone);
    const bar = $('#cd-presets');
    ps.forEach(p => { const b = el('button', 'btn', p.name + ' '); b.dataset.act = 'cd-preset'; b.dataset.key = p.key; b.append(el('small', null, new Date(Date.UTC(p.date.y, p.date.mo - 1, p.date.d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }))); bar.append(b); });
    const ymd = d => d.y + '-' + pad(d.mo) + '-' + pad(d.d);
    function sync() { $('#cd-name').value = ev.name; $('#cd-date').value = ymd(ev.date); $('#cd-time').value = pad(ev.time.h) + ':' + pad(ev.time.mi); $('#cd-zone').value = ev.zone; }
    function compute() {
      info = TK.zonedToUtc(ev.date.y, ev.date.mo, ev.date.d, ev.time.h, ev.time.mi, ev.zone); target = info.ms;
      const when = fmtDate(target, ev.zone, true) + ' at ' + fmtTime(target, ev.zone, h12) + ' ' + TK.abbr(target, ev.zone);
      const local = ev.zone !== LZ && TK.offsetMin(ev.zone, target) !== TK.offsetMin(LZ, target) ? ' · ' + fmtTime(target, LZ, h12) + ' ' + fmtDate(target, LZ) + ' your time' : '';
      setText($('#cd-when'), when + local);
      setText($('#cd-note'), info.gap ? 'That time is skipped by a daylight-saving change in this zone, so the countdown uses the moment clocks jump forward.' : info.ambiguous ? 'That time happens twice (clocks fall back); the countdown uses the first one.' : '');
      setText($('#cd-title'), ev.name || 'Countdown');
      store.set('hl.cd', { name: ev.name, d: ymd(ev.date), t: pad(ev.time.h) + ':' + pad(ev.time.mi), z: ev.zone });
    }
    function render(now) {
      const p = TK.cdParts(target, now);
      setText($('#cd-d'), p.d.toLocaleString('en-US')); setText($('#cd-h'), pad(p.h)); setText($('#cd-m'), pad(p.m)); setText($('#cd-s'), pad(p.s));
      $('#cd-card').classList.toggle('past', p.past);
      const lbl = $$('#cd-card .cd-grid span'); setText(lbl[0], p.past ? 'Days since' : 'Days');
    }
    function readInputs() {
      const d = TK.validYMD($('#cd-date').value); if (!d) return;
      ev = { name: TK.cleanText($('#cd-name').value, 80), date: d, time: TK.validHM($('#cd-time').value) || { h: 0, mi: 0 }, zone: TK.validZone($('#cd-zone').value) ? $('#cd-zone').value : LZ };
      compute(); render(Date.now());
    }
    ['cd-name', 'cd-date', 'cd-time', 'cd-zone'].forEach(id => $('#' + id).addEventListener(id === 'cd-zone' ? 'change' : 'input', readInputs));
    function act(a, b) {
      if (a === 'preset') { const p = TK.presets(Date.now(), LZ).find(x => x.key === b.dataset.key); if (p) { ev = fromPreset(p); sync(); compute(); render(Date.now()); toast('Counting down to ' + p.name); } }
      else if (a === 'share') {
        const tab = $('#tabs a[data-p="countdown"]'); const base = tab ? tab.href : location.origin + location.pathname;
        copy(base.split('?')[0] + '?' + TK.cdQuery(ev), 'Share link copied');
      }
    }
    sync(); compute(); render(Date.now());
    return { render, act, title: now => { const p = TK.cdParts(target, now); return p.past ? '🎉 ' + (ev.name || 'Countdown') : (p.d ? p.d + 'd ' : '') + pad(p.h) + ':' + pad(p.m) + ':' + pad(p.s) + ' · ' + (ev.name || 'Countdown'); }, refresh() { compute(); }, event: () => ev, target: () => target };
  })();

  /* ======================= WORLD CLOCK ======================= */
  const WC = (() => {
    let ids = store.get('hl.wc', null);
    ids = (Array.isArray(ids) ? ids : ['new-york', 'london', 'tokyo', 'sydney', 'los-angeles'].filter(x => TK.placeById(x).zone !== LZ).slice(0, 4)).filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i && TK.placeById(x)).slice(0, 24);
    let face = store.get('hl.wc.face', 'both'); if (!['both', 'analog', 'digital'].includes(face)) face = 'both';
    const wrap = $('#wc-list'), NS = 'http://www.w3.org/2000/svg';
    let cards = [];
    const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
    function build() {
      wrap.textContent = ''; cards = [];
      const lp = TK.placeForZone(LZ) || { city: TK.zoneCity(LZ), country: LZ, zone: LZ };
      const all = [{ local: true, p: Object.assign({}, lp, { id: 'local' }) }].concat(ids.map(id => ({ p: TK.placeById(id) })));
      for (const { local, p } of all) {
        const c = el('div', 'clock' + (local ? ' local' : ''));
        const svg = svgEl('svg', { viewBox: '0 0 140 140', 'aria-hidden': 'true' });
        svg.append(svgEl('circle', { class: 'face', cx: 70, cy: 70, r: 66 }));
        for (let i = 0; i < 60; i++) { const big = i % 5 === 0; svg.append(svgEl('line', { class: 'tick' + (big ? ' h' : ''), x1: 70, y1: big ? 9 : 7, x2: 70, y2: big ? 18 : 12, transform: 'rotate(' + i * 6 + ' 70 70)' })); }
        const hh = svgEl('line', { class: 'hand h', x1: 70, y1: 74, x2: 70, y2: 34 }), mm = svgEl('line', { class: 'hand m', x1: 70, y1: 76, x2: 70, y2: 20 }), ss = svgEl('line', { class: 'hand s', x1: 70, y1: 82, x2: 70, y2: 14 });
        svg.append(hh, mm, ss, svgEl('circle', { class: 'hub', cx: 70, cy: 70, r: 3.5 }));
        const dn = el('span', 'dn'), dig = el('div', 'dig mono'), meta = el('div', 'meta'), meta2 = el('div', 'meta');
        c.append(dn, svg, el('div', 'city', local ? 'Your time · ' + p.city : p.city), el('div', 'ctry', p.country), dig, meta, meta2);
        if (!local) { const x = el('button', 'iconbtn x', '✕'); x.dataset.act = 'wc-del'; x.dataset.id = p.id; x.setAttribute('aria-label', 'Remove ' + p.city); c.append(x); }
        wrap.append(c); cards.push({ p, c, hh, mm, ss, dn, dig, meta, meta2, lastSec: -1 });
      }
      wrap.className = 'clocks mt ' + (face === 'both' ? '' : face);
      $$('#wc-face button').forEach(b => b.classList.toggle('on', b.dataset.face === face));
      render(Date.now(), true);
    }
    function render(now, force) {
      const sec = Math.floor(now / 1000), lo = TK.offsetMin(LZ, now);
      for (const k of cards) {
        const z = k.p.zone, p = TK.zparts(now, z), s = p.s + (now % 1000) / 1000;
        k.ss.setAttribute('transform', 'rotate(' + (s * 6).toFixed(2) + ' 70 70)');
        k.mm.setAttribute('transform', 'rotate(' + ((p.mi + s / 60) * 6).toFixed(2) + ' 70 70)');
        k.hh.setAttribute('transform', 'rotate(' + (((p.h % 12) + p.mi / 60) * 30).toFixed(2) + ' 70 70)');
        if (k.lastSec === sec && !force) continue; k.lastSec = sec;
        setText(k.dig, fmtTime(now, z, h12, true));
        setText(k.meta, fmtDate(now, z) + ' · ' + TK.abbr(now, z));
        setText(k.meta2, k.p.id === 'local' ? TK.fmtOffset(lo) : TK.relOffset(TK.offsetMin(z, now) - lo));
        if (force || sec % 30 === 0) { const ds = TK.dayState(now, z, k.p.lat, k.p.lon); k.c.classList.toggle('day', ds === 'day'); k.c.classList.toggle('night', ds === 'night'); setText(k.dn, ds === 'day' ? '☀' : ds === 'twilight' ? '◐' : '☾'); k.dn.title = ds === 'day' ? 'Daytime' : ds === 'twilight' ? 'Twilight' : 'Night'; }
      }
    }
    combo($('#wc-q'), $('#wc-sug'), p => {
      if (ids.includes(p.id)) return toast(p.city + ' is already on your list');
      if (ids.length >= 24) return toast('24 clocks is the limit');
      ids.push(p.id); store.set('hl.wc', ids); build(); toast('Added ' + p.city);
    });
    function act(a, b) {
      if (a === 'del') { ids = ids.filter(x => x !== b.dataset.id); store.set('hl.wc', ids); build(); }
      else if (a === 'face') { face = b.dataset.face; store.set('hl.wc.face', face); build(); }
    }
    build();
    return { render, act, build, ids: () => ids };
  })();

  /* ======================= TIME ZONE CONVERTER ======================= */
  const TZ = (() => {
    const saved = store.get('hl.tz', {}) || {};
    let base = TK.validZone(saved.base) ? saved.base : LZ;
    let to = (Array.isArray(saved.to) ? saved.to : ['new-york', 'london', 'new-delhi', 'tokyo', 'los-angeles'].filter(x => TK.placeById(x).zone !== LZ).slice(0, 4)).filter((x, i, a) => typeof x === 'string' && a.indexOf(x) === i && TK.placeById(x)).slice(0, 12);
    let ws = TK.int(saved.ws, 0, 23, 9), we = TK.int(saved.we, 1, 24, 17); if (we <= ws) { ws = 9; we = 17; }
    let date, time;
    const setNow = () => { const p = TK.zparts(Date.now(), base); date = { y: p.y, mo: p.mo, d: p.d }; time = { h: p.h, mi: p.mi }; };
    setNow();
    if (startView === 'converter') {
      const q = TK.parseTzParams(location.search);
      if (q.zone) base = q.zone;
      if (q.date && q.time) { date = q.date; time = q.time; } else if (q.zone) setNow();
      if (q.to.length) to = q.to.map(z => TK.placeForZone(z)).filter(Boolean).map(p => p.id).filter((x, i, a) => a.indexOf(x) === i);
    }
    const save = () => store.set('hl.tz', { base, to, ws, we });
    fillZones($('#tz-base'), base);
    for (let h = 0; h < 24; h++) $('#tz-ws').append(new Option(fmtHM(h, 0), h));
    for (let h = 1; h <= 24; h++) $('#tz-we').append(new Option(h === 24 ? 'midnight' : fmtHM(h, 0), h));
    $('#tz-ws').value = ws; $('#tz-we').value = we;
    const inp = $('#tz-dt');
    const syncInput = () => { inp.value = date.y + '-' + pad(date.mo) + '-' + pad(date.d) + 'T' + pad(time.h) + ':' + pad(time.mi); $('#tz-base').value = base; };
    function places() { const bp = TK.placeForZone(base); return [Object.assign({}, bp, { base: true })].concat(to.map(TK.placeById).filter(Boolean)); }
    function render() {
      const r = TK.zonedToUtc(date.y, date.mo, date.d, time.h, time.mi, base), ms = r.ms, bo = TK.offsetMin(base, ms);
      setText($('#tz-note'), r.gap ? '⚠ ' + fmtHM(time.h, time.mi) + ' doesn’t exist on this date in ' + TK.zoneCity(base) + ' (clocks spring forward), so it’s shown as ' + fmtTime(ms, base, h12) + '.' : r.ambiguous ? '⚠ ' + fmtHM(time.h, time.mi) + ' happens twice on this date in ' + TK.zoneCity(base) + ' (clocks fall back). Showing the first one, ' + TK.abbr(ms, base) + '.' : 'Daylight saving time is applied automatically for each zone on the chosen date.');
      const rows = $('#tz-rows'); rows.textContent = '';
      for (const p of places()) {
        const pp = TK.zparts(ms, p.zone), dd = TK.dayDiff(pp, date), off = TK.offsetMin(p.zone, ms);
        const row = el('div', 'tzrow' + (p.base ? ' base' : ''));
        const nm = el('div', 'nm'); nm.append(el('b', null, p.city + (p.base ? ' (from)' : '')), el('span', null, (p.country !== p.zone ? p.country + ' · ' : '') + TK.abbr(ms, p.zone) + ' · ' + TK.fmtOffset(off) + (p.base ? '' : ' · ' + TK.relOffset(off - bo))));
        const tm = el('div', 'tm', fmtTime(ms, p.zone, h12));
        const dt = el('div', 'dt', fmtDate(ms, p.zone)); if (dd) dt.append(el('span', 'pill sm ' + (dd > 0 ? 'warn' : ''), (dd > 0 ? '+' : '−') + Math.abs(dd) + ' day'));
        row.append(nm, tm, dt);
        if (p.base) row.append(el('span', 'iconbtn')); else { const x = el('button', 'iconbtn', '✕'); x.dataset.act = 'tz-del'; x.dataset.id = p.id; x.setAttribute('aria-label', 'Remove ' + p.city); row.append(x); }
        row.dataset.zone = p.zone; rows.append(row);
      }
      plan(ms);
    }
    function plan(selMs) {
      const ps = places(), slots = TK.planner(date, base, ps.map(p => p.zone), ws, we);
      const tbl = el('table'), body = el('tbody');
      ps.forEach((p, i) => {
        const tr = el('tr'), th = el('th'); th.append(document.createTextNode(p.city), el('small', null, TK.abbr(slots[0].t, p.zone) + ' · ' + TK.fmtOffset(TK.offsetMin(p.zone, slots[0].t))));
        tr.append(th);
        slots.forEach((s, j) => {
          const c = s.cells[i], td = el('td', c.cls + (c.mid ? ' mid' : '') + (selMs >= s.t && selMs < s.t + 3600000 ? ' sel' : ''), h12 ? ((c.h % 12) || 12) + (c.mi ? ':' + pad(c.mi) : '') + (c.h < 12 ? 'a' : 'p') : pad(c.h) + (c.mi ? ':' + pad(c.mi) : ''));
          td.dataset.t = s.t; td.title = p.city + ': ' + fmtDate(s.t, p.zone) + ' ' + fmtTime(s.t, p.zone, h12);
          tr.append(td);
        });
        body.append(tr);
      });
      const ov = el('tr', 'ov'); ov.append(el('th', null, 'Everyone working')); slots.forEach(s => ov.append(el('td', s.all ? 'all' : ''))); body.append(ov);
      tbl.append(body); const pl = $('#tz-plan'); pl.textContent = ''; pl.append(tbl);
      const best = TK.bestRanges(slots);
      setText($('#tz-best'), ps.length < 2 ? 'Add a city to compare working hours.' : best.length ? '✅ Everyone is in working hours ' + best.map(([a, b]) => fmtTime(a, base, h12) + '–' + fmtTime(b, base, h12)).join(', ') + ' ' + TK.zoneCity(base) + ' time.' : 'No hour where everyone is in working hours (' + fmtHM(ws, 0) + '–' + (we === 24 ? 'midnight' : fmtHM(we, 0)) + '). Try wider hours or pick the least-bad yellow slot.');
    }
    inp.addEventListener('input', () => { const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(inp.value); if (!m) return; const d = TK.validYMD(m[1]), t = TK.validHM(m[2]); if (d && t) { date = d; time = t; render(); } });
    $('#tz-base').addEventListener('change', e => { if (!TK.validZone(e.target.value)) return; const ms = TK.zonedToUtc(date.y, date.mo, date.d, time.h, time.mi, base).ms; base = e.target.value; const p = TK.zparts(ms, base); date = { y: p.y, mo: p.mo, d: p.d }; time = { h: p.h, mi: p.mi }; syncInput(); save(); render(); });
    ['tz-ws', 'tz-we'].forEach(id => $('#' + id).addEventListener('change', () => { const a = TK.int($('#tz-ws').value, 0, 23, 9), b = TK.int($('#tz-we').value, 1, 24, 17); if (b <= a) { toast('End must be after start'); $('#tz-ws').value = ws; $('#tz-we').value = we; return; } ws = a; we = b; save(); render(); }));
    $('#tz-plan').addEventListener('click', e => { const td = e.target.closest('td[data-t]'); if (!td) return; const p = TK.zparts(+td.dataset.t, base); date = { y: p.y, mo: p.mo, d: p.d }; time = { h: p.h, mi: p.mi }; syncInput(); render(); });
    combo($('#tz-q'), $('#tz-sug'), p => {
      if (to.includes(p.id)) return toast(p.city + ' is already listed');
      if (to.length >= 12) return toast('12 zones is the limit'); to.push(p.id); save(); render();
    });
    function act(a, b) {
      if (a === 'del') { to = to.filter(x => x !== b.dataset.id); save(); render(); }
      else if (a === 'now') { setNow(); syncInput(); render(); }
      else if (a === 'share') {
        const tab = $('#tabs a[data-p="converter"]'); const u = (tab ? tab.href : location.origin + location.pathname).split('?')[0];
        copy(u + '?' + TK.tzQuery(date, time, base, to.map(id => TK.placeById(id).zone)), 'Share link copied');
      }
    }
    syncInput(); render();
    return { render, act, utc: () => TK.zonedToUtc(date.y, date.mo, date.d, time.h, time.mi, base).ms, set(d, t, z) { date = d; time = t; if (z) base = z; syncInput(); render(); } };
  })();

  /* ======================= ALARM ======================= */
  const AL = (() => {
    let list = TK.sanitizeAlarms(store.get('hl.alarms', []));
    const c0 = store.get('hl.al.cfg', {}) || {};
    $('#al-sound').value = soundOk(c0.sound) ? c0.sound : 'digital'; $('#al-vol').value = TK.int(c0.vol, 0, 100, 80); $('#al-snooze').value = String([5, 9, 10, 15].includes(c0.snooze) ? c0.snooze : 9);
    const next = new Map(); let tests = [];
    const save = () => store.set('hl.alarms', list.map(a => Object.assign({}, a)));
    function plan(a, now) { if (!a.on) next.delete(a.id); else next.set(a.id, a.snoozeUntil > now ? a.snoozeUntil : TK.alarmNext(a, now, LZ)); }
    const now0 = Date.now(); list.forEach(a => plan(a, now0));
    function fire(a, now, late) {
      Ring.show({ key: 'al:' + a.id, title: a.label || 'Alarm', sub: fmtHM(a.h, a.m) + (late ? ' (rang late: the device was asleep)' : ''), sound: a.sound, vol: a.vol, loop: 180, snoozeMin: a.snooze,
        snooze: () => { a.snoozeUntil = Date.now() + a.snooze * 60000; a.on = true; next.set(a.id, a.snoozeUntil); save(); renderList(); toast('Snoozed for ' + a.snooze + ' min'); kick(); } });
      Notify.send('⏰ ' + (a.label || 'Alarm'), fmtHM(a.h, a.m));
    }
    function check(now) {
      let ch = false;
      for (const a of list) {
        const t = next.get(a.id); if (!a.on || t == null || now < t) continue;
        ch = true; a.snoozeUntil = 0;
        if (now - t < 30 * 60000) fire(a, now, now - t > 90000); else toast('Missed alarm: ' + (a.label || fmtHM(a.h, a.m)));
        if (!a.days.length) { a.on = false; next.delete(a.id); } else plan(a, Math.max(now, t + 1000));
      }
      for (const x of tests) if (now >= x.at) { ch = true; Ring.show({ key: 'al:test', title: 'Test alarm', sub: 'It works! Real alarms ring like this.', sound: x.sound, vol: x.vol, loop: 20 }); Notify.send('⏰ Test alarm', 'It works!'); }
      tests = tests.filter(x => now < x.at);
      if (ch) { save(); renderList(); }
      const tb = $('#al-test'); if (tb) setText(tb, tests.length ? 'Ringing in ' + Math.max(0, Math.ceil((tests[0].at - now) / 1000)) + ' s…' : 'Test: ring in 5 s');
    }
    function renderList() {
      const box = $('#al-list'), now = Date.now(); box.textContent = '';
      list.slice().sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m)).forEach(a => {
        const r = el('div', 'alarm' + (a.on ? '' : ' off')), t = next.get(a.id);
        const info = el('div', 'ai'); info.append(el('b', null, a.label || 'Alarm'), el('span', null, TK.daysLabel(a.days) + ' · ' + (a.on && t ? (a.snoozeUntil > now ? 'snoozed, ' : '') + 'rings ' + relIn(t - now) : 'off') + ' · ' + (TK.SOUNDS.find(s => s[0] === a.sound) || [0, ''])[1]));
        const sw = el('label', 'switch'), cb = el('input'); cb.type = 'checkbox'; cb.checked = a.on; cb.dataset.act = 'al-on'; cb.dataset.id = a.id; cb.setAttribute('aria-label', 'Alarm ' + fmtHM(a.h, a.m) + ' on'); sw.append(cb, el('span'));
        const x = el('button', 'iconbtn', '✕'); x.dataset.act = 'al-del'; x.dataset.id = a.id; x.setAttribute('aria-label', 'Delete alarm');
        r.append(el('div', 'at', fmtHM(a.h, a.m)), info, sw, x); box.append(r);
      });
      $('#al-empty').hidden = list.length > 0;
    }
    function render(now) { setText($('#al-now'), fmtTime(now, LZ, h12, true)); setText($('#al-date'), fmtDate(now, LZ, true) + ' · ' + TK.abbr(now, LZ)); }
    function act(a, b) {
      const now = Date.now();
      if (a === 'add') {
        const t = TK.validHM($('#al-time').value); if (!t) return toast('Pick a time first'); if (list.length >= 30) return toast('30 alarms is the limit');
        Snd.ensure();
        const cfg = { sound: soundOk($('#al-sound').value) ? $('#al-sound').value : 'digital', vol: TK.int($('#al-vol').value, 0, 100, 80), snooze: TK.int($('#al-snooze').value, 1, 30, 9) };
        store.set('hl.al.cfg', cfg);
        const al = TK.sanitizeAlarms([Object.assign({ h: t.h, m: t.mi, label: $('#al-label').value, days: $$('#al-days button[aria-pressed="true"]').map(x => +x.dataset.d), on: true }, cfg)])[0];
        list.push(al); plan(al, now); $('#al-label').value = '';
        toast('Alarm set for ' + fmtHM(al.h, al.m) + ', ' + relIn(next.get(al.id) - now));
      }
      else if (a === 'on') { const al = list.find(x => x.id === b.dataset.id); if (al) { al.on = b.checked; al.snoozeUntil = 0; plan(al, now); if (al.on) { Snd.ensure(); toast('Rings ' + relIn(next.get(al.id) - now)); } } }
      else if (a === 'del') { list = list.filter(x => x.id !== b.dataset.id); next.delete(b.dataset.id); Ring.drop('al:' + b.dataset.id); }
      else if (a === 'test') { Snd.ensure(); tests = [{ at: now + 5000, sound: soundOk($('#al-sound').value) ? $('#al-sound').value : 'digital', vol: TK.int($('#al-vol').value, 0, 100, 80) }]; toast('Test alarm will ring in 5 seconds'); }
      else if (a === 'day') { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); return; }
      save(); renderList(); kick();
    }
    renderList(); render(Date.now());
    return { render, renderList, check, act, deadline: () => { const v = [...next.values()].filter(x => x != null).concat(tests.map(t => t.at)); return v.length ? Math.min(...v) : null; }, list: () => list, next: () => next };
  })();

  /* ---------- engine: rAF for smooth display, timestamps for truth ---------- */
  let view = startView, baseTitle = document.title, sched = 0;
  const MODS = { timer: TM, stopwatch: SW, pomodoro: PO, countdown: CD, worldclock: WC, converter: TZ, alarm: AL };
  function setTitle(now) {
    let t = null;
    if (Ring.active()) t = '⏰ ' + Ring.top().title + '!';
    else {
      const m = MODS[view]; t = m && m.title ? m.title(now) : null;
      if (!t) t = TM.title(now) || PO.title(now);
    }
    const want = t ? t + ' · Hourlark' : baseTitle;
    if (document.title !== want) document.title = want;
  }
  function checkAll() { const now = Date.now(); TM.check(now); PO.check(now); AL.check(now); setTitle(now); }
  function kick() {
    clearTimeout(sched); const now = Date.now();
    const ds = [TM.deadline(), PO.deadline(), AL.deadline()].filter(x => x != null && x > now);
    if (ds.length) sched = setTimeout(() => { checkAll(); kick(); }, Math.min(Math.min(...ds) - now + 2, 2147483000));
  }
  setInterval(checkAll, 250); // also keeps the tab title counting down while the tab is hidden
  let lastList = 0;
  function frame() {
    const now = Date.now();
    const m = MODS[view]; if (m && m.render && !document.hidden) m.render(now);
    if (view === 'alarm' && now - lastList > 15000) { lastList = now; AL.renderList(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  kick();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkAll(); kick(); Wake.apply(); } });

  /* ---------- 12/24h ---------- */
  const syncH12 = () => $$('[data-h12-toggle] button').forEach(b => b.classList.toggle('on', (b.dataset.h12 === '1') === h12));
  syncH12();

  /* ---------- delegated clicks ---------- */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-h12],[data-ph],[data-face],#al-days button'); if (!b) return;
    if (b.dataset.h12 != null && b.closest('[data-h12-toggle]')) { h12 = b.dataset.h12 === '1'; store.set('hl.h12', h12); syncH12(); WC.build(); TZ.render(); AL.renderList(); CD.refresh(); TM.render(Date.now()); return; }
    if (b.dataset.ph && b.closest('#po-phase')) return PO.act('phase', b);
    if (b.dataset.face && b.closest('#wc-face')) return WC.act('face', b);
    if (b.closest('#al-days')) return AL.act('day', b);
    const a = b.dataset.act; if (!a) return;
    if (a === 'tm-preset') { Snd.ensure(); TM.add(+b.dataset.ms, $('#tm-label').value, true); $('#tm-label').value = ''; }
    else if (a === 'tm-add') TM.addFromFields();
    else if (a.startsWith('tm-')) TM.act(a.slice(3), b.dataset.id, b);
    else if (a.startsWith('sw-')) SW.act(a.slice(3));
    else if (a.startsWith('po-')) { if (a === 'po-task-done') return; PO.act(a.slice(3), b); }
    else if (a.startsWith('cd-')) CD.act(a.slice(3), b);
    else if (a.startsWith('wc-')) WC.act(a.slice(3), b);
    else if (a.startsWith('tz-')) TZ.act(a.slice(3), b);
    else if (a.startsWith('al-')) { if (a === 'al-on') return; AL.act(a.slice(3), b); }
    else if (a === 'test-sound') { const s = document.getElementById(b.dataset.sel), v = document.getElementById(b.dataset.vol); Snd.play(s ? s.value : 'beep', v ? v.value : 70, 0); }
    else if (a === 'notify') Notify.toggle();
    else if (a === 'fs') toggleFS(document.getElementById(b.dataset.target));
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('[data-wake]')) { Wake.want = t.checked; store.set('hl.wake', Wake.want); if (Wake.want && !navigator.wakeLock) toast('This browser can’t keep the screen awake'); Wake.apply(); }
    else if (t.dataset.act === 'al-on') AL.act('on', t);
    else if (t.dataset.act === 'po-task-done') PO.act('task-done', t);
  });

  /* ---------- keyboard ---------- */
  document.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) { const t = $$('#tabs .tab')[+e.code.slice(5) - 1]; if (t) { e.preventDefault(); t.click(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || typing(e) || Ring.active()) return;
    const k = e.key.toLowerCase(), onBtn = e.target.tagName === 'BUTTON' || e.target.tagName === 'A' || e.target.getAttribute('role') === 'button';
    if (k === ' ' && onBtn) return;
    const map = {
      timer: { ' ': () => TM.act('toggle'), r: () => TM.act('reset'), f: () => TM.act('fs') },
      stopwatch: { ' ': () => SW.act('toggle'), l: () => SW.act('lap'), r: () => SW.act('reset'), f: () => toggleFS($('#sw-card')) },
      pomodoro: { ' ': () => PO.act('toggle'), s: () => PO.act('skip'), r: () => PO.act('reset'), f: () => toggleFS($('#po-card')) },
      countdown: { f: () => toggleFS($('#cd-card')) },
    }[view];
    if (map && map[k]) { e.preventDefault(); map[k](); }
  });
  document.addEventListener('keydown', e => {
    const tabs = $$('#tabs .tab'), i = tabs.indexOf(document.activeElement); if (i < 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].focus(); }
  });

  /* ---------- tabs are real links; we swap pages in place so running timers and alarms never stop ---------- */
  function activate(v) { view = v; $$('.view').forEach(x => x.classList.toggle('active', x.id === 'v-' + v)); const m = MODS[v]; if (m && m.render) m.render(Date.now()); if (v === 'pomodoro') PO.renderAll(Date.now()); if (v === 'alarm') AL.renderList(); }
  function resume() {
    const last = store.get('hl.last', null), page = document.body.dataset.page || view, r = $('#resume');
    if (r && document.body.dataset.home === '1' && last && last !== page) {
      const t = $$('#tabs .tab').find(x => x.dataset.p === last);
      if (t) { const a = el('a'); a.href = t.href; a.textContent = '↩ Continue with ' + (t.dataset.name || t.textContent); r.textContent = ''; r.appendChild(a); r.hidden = false; }
    }
    store.set('hl.last', page);
  }
  async function go(url, push) {
    let d;
    try { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('http'); d = new DOMParser().parseFromString(await r.text(), 'text/html'); }
    catch { location.href = url; return; }
    const v = d.body && d.body.dataset.view;
    if (!v || !document.getElementById('v-' + v)) { location.href = url; return; }
    if (push) history.pushState({ hl: 1 }, '', url);
    for (const sel of ['header', '.hero', 'article.seo', 'footer']) { const a = $(sel), b = d.querySelector(sel); if (a && b) a.replaceWith(document.importNode(b, true)); }
    const cl = d.querySelector('#consent a'); if (cl) $('#consent a').setAttribute('href', cl.getAttribute('href'));
    for (const sel of ['meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:url"]', 'meta[property="og:title"]', 'meta[property="og:description"]']) {
      const a = document.head.querySelector(sel), b = d.head.querySelector(sel); if (a && b) for (const at of ['content', 'href']) if (b.hasAttribute(at)) a.setAttribute(at, b.getAttribute(at));
    }
    document.body.dataset.view = v; document.body.dataset.page = d.body.dataset.page || v;
    if (d.body.dataset.home) document.body.dataset.home = '1'; else delete document.body.dataset.home;
    baseTitle = d.title; document.title = baseTitle;
    activate(v); resume(); window.scrollTo(0, 0);
    const h = $('.hero h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a'); if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target || a.hasAttribute('download')) return;
    if (!a.matches('#tabs a, a.logo, .toollinks a, #resume a') || !window.fetch || !window.DOMParser) return;
    const u = new URL(a.href, location.href); if (u.origin !== location.origin || location.protocol === 'file:') return;
    e.preventDefault(); if (u.href !== location.href) go(u.href, true);
  });
  window.addEventListener('popstate', () => go(location.href, false));
  activate(view); resume();

  /* ---------- consent (needed before showing personalised ads in EU/UK) ---------- */
  const CKEY = 'hl.consent';
  if (!store.get(CKEY, null)) $('#consent').classList.add('show');
  $('#c-yes').addEventListener('click', () => { store.set(CKEY, 'granted'); $('#consent').classList.remove('show'); });
  $('#c-no').addEventListener('click', () => { store.set(CKEY, 'denied'); $('#consent').classList.remove('show'); });

  window.__hourlark = { TM, SW, PO, CD, WC, TZ, AL, Ring, Snd, checkAll };
})();
