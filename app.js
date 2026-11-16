/* Family Devotion — offline-first, mobile-first reader for the family manual.
 * No dependencies. Content comes from data.js (window.MANUAL); everything the
 * family records (done devotions, memorised verses, notebook) stays in
 * localStorage on the device. */
(() => {
  'use strict';
  const M = window.MANUAL;
  const $view = document.getElementById('view');
  const $title = document.getElementById('title');
  const $back = document.getElementById('back');
  const KINDS = ['morning', 'night'];

  // ----------------------------------------------------------- indexing
  const byDate = new Map();      // 'YYYY-MM-DD' -> { week, day }
  const sequence = [];           // every devotion in reading order
  for (const week of M.weeks) {
    for (const day of week.days) {
      byDate.set(day.date, { week, day });
      for (const kind of KINDS) sequence.push({ date: day.date, kind });
    }
  }
  const firstDate = M.weeks[0].days[0].date;
  const lastWeek = M.weeks[M.weeks.length - 1];
  const lastDate = lastWeek.days[lastWeek.days.length - 1].date;
  const prayerById = Object.fromEntries(M.prayers.map((p) => [p.id, p]));

  // ------------------------------------------------------------- state
  const KEY = 'family-devotion:v1';
  const defaults = { done: {}, verses: {}, notes: {}, settings: { size: 18, theme: 'auto' } };
  let S = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY)) || {};
      return { ...defaults, ...s, settings: { ...defaults.settings, ...(s.settings || {}) } };
    } catch { return structuredClone(defaults); }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); }
    catch { toast('Could not save on this device (storage full or blocked).'); }
  }
  // Ask the browser not to evict our data when space is low.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const doneKey = (date, kind) => `${date}:${kind}`;
  const isDone = (date, kind) => !!S.done[doneKey(date, kind)];

  // ------------------------------------------------------------ dates
  const pad = (n) => String(n).padStart(2, '0');
  const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoLocal(new Date());
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); };
  const isMorningNow = () => new Date().getHours() < 15;
  function weekFor(iso) {
    if (iso < firstDate) return M.weeks[0];
    if (iso > lastDate) return lastWeek;
    return byDate.get(iso).week;
  }
  const fmtDay = (day) => `${day.weekday} ${day.day} ${day.month}`;

  // ------------------------------------------------------------ helpers
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ps = (arr) => arr.map((p) => `<p>${esc(p)}</p>`).join('');
  const ul = (arr) => (arr.length ? `<ul>${arr.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');
  const icon = {
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
  };

  let toastTimer;
  function toast(msg, action) {
    const t = document.getElementById('toast');
    t.innerHTML = esc(msg) + (action ? `<button type="button">${esc(action.label)}</button>` : '');
    if (action) t.querySelector('button').onclick = action.run;
    t.hidden = false;
    clearTimeout(toastTimer);
    if (!action) toastTimer = setTimeout(() => (t.hidden = true), 2600);
  }

  // ------------------------------------------------- prayer name lookup
  // The manual lists prayers by name ("Our Father · Hail Mary · ..."). Map each
  // name to its full text so the leader can tap to open it.
  const guideStep = (re) => M.guide.nightSteps.find((s) => re.test(s)) || '';
  function prayerFor(name, week) {
    const n = name.toLowerCase();
    const P = (id) => prayerById[id];
    if (n.startsWith('sign of the cross')) return P('sign');
    if (n.startsWith('morning offering')) return P('offering');
    if (n.startsWith('our father')) return P('ourfather');
    if (n.includes('hail mary')) return P('hailmary');
    if (n.startsWith('glory be')) return P('glorybe');
    if (n.startsWith('apostles')) return P('creed');
    if (n.startsWith('angel of god') || n.includes('guardian angel')) return P('angel');
    if (n.includes('st michael')) return P('michael');
    if (n.startsWith('nnadi family prayer')) return P('family');
    if (n.startsWith('act of contrition')) return P('contrition');
    if (n.startsWith('hail, holy queen')) return P('holyqueen');
    if (n.startsWith('regina caeli')) return P('reginacaeli');
    if (n.startsWith('act of faith')) return P('actfaith');
    if (n.startsWith('prayer of the week') && week && week.prayer) return { name: 'Prayer of the week', text: week.prayer, note: `Week ${week.n} · ${week.virtue}` };
    if (n.startsWith('saying sorry')) return { name, text: guideStep(/^Saying sorry/).replace(/^Saying sorry:\s*/, '') };
    if (n.startsWith('prayers of the family')) return { name, text: guideStep(/^Prayers of the family/).replace(/^Prayers of the family:\s*/, '') };
    if (n.startsWith('parents’ blessing') || n.startsWith("parents' blessing")) return { name, text: guideStep(/^Blessing/).replace(/^Blessing:\s*/, '') };
    return null;
  }
  function prayerDetails(p, label, open) {
    return `<details class="pr"${open ? ' open' : ''}><summary>${esc(label || p.name)}</summary>
      <div class="pt">${p.note ? `<p class="note">${esc(p.note)}</p>` : ''}${esc(p.text)}</div></details>`;
  }
  // A "·"-separated list of prayers and actions -> numbered, tappable steps.
  function stepList(text, week) {
    const parts = text.replace(/\s*\(full texts on the first tab[^)]*\)/, '').split(' · ').map((s) => s.trim()).filter(Boolean);
    return `<ol class="steps">${parts.map((part) => {
      const p = prayerFor(part, week);
      if (p) return `<li>${prayerDetails(p, part)}</li>`;
      const silent = /^Examination of conscience/.test(part);
      return `<li><span class="plain">${esc(part)}${silent ? ' <button type="button" class="btn timer" data-timer="60">1 minute of silence</button>' : ''}</span></li>`;
    }).join('')}</ol>`;
  }

  // ------------------------------------------------------- block render
  function introPara(p) {
    if (/^In the name of the Father/.test(p)) return `<p class="callout sign">${esc(p)}</p>`;
    if (/^(Chimdalu|Mum helps|Dad helps)/.test(p)) return `<div class="callout">${icon.users.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;margin-right:6px"')}${esc(p)}</div>`;
    return `<div class="callout season">${esc(p)}</div>`;
  }
  function gatheringBody(week) {
    const g = week.gathering;
    return `${g.leaderNote ? `<div class="callout">${esc(g.leaderNote)}</div>` : ''}
      <div class="sec-label">Story</div><h3 class="sec-title">${esc(g.story.title)}</h3>
      <div class="prose">${ps(g.story.paras)}</div>
      <div class="sec-label">Admonition</div><div class="prose">${ps(g.admonition)}</div>
      <div class="sec-label">How we will live it this week</div><div class="prose">${ul(g.liveIt)}</div>`;
  }
  function challengesBody(week) {
    const c = week.challenges;
    if (!c) return '';
    return `<div class="prose">${ps(c.paras.slice(0, 1))}${ul(c.items)}${ps(c.paras.slice(1))}</div>`;
  }
  function renderBlock(b, week) {
    const L = b.label;
    if (L === 'Morning Prayer recitation' || L === 'Closing' || L === 'Night prayers') {
      const body = b.paras.map((p) => (p.includes(' · ') || L !== 'Night prayers' ? stepList(p, week) : `<p>${esc(p)}</p>`)).join('');
      return `<section class="sec"><div class="sec-label">${esc(L === 'Closing' ? 'Closing prayers' : L)}</div>${body}${ul(b.items)}</section>`;
    }
    if (L === 'Reading') {
      const [ref, ...rest] = b.title.split(' · ');
      const extra = [];
      const paras = b.paras.filter((p) => {
        if (/^Story, admonition and/.test(p)) { extra.push(p); return false; }
        return true;
      });
      let html = `<section class="sec"><div class="sec-label">Reading · ${esc(ref)}</div>
        ${rest.length ? `<h3 class="sec-title">${esc(rest.join(' · '))}</h3>` : ''}
        <div class="prose">${ps(paras)}${ul(b.items)}</div></section>`;
      for (const p of extra) {
        html += `<section class="sec"><div class="callout">${esc(p)}</div>
          <details class="fold" open><summary>Sunday Family Gathering · ${esc(week.virtue)}</summary>${gatheringBody(week)}</details></section>`;
      }
      return html;
    }
    if (L === 'Story') {
      return `<section class="sec"><div class="sec-label">Story</div><h3 class="sec-title">${esc(b.title)}</h3>
        <div class="prose">${ps(b.paras)}${ul(b.items)}</div></section>`;
    }
    if (L === 'Thought for today' || L === 'Today’s resolution' || L === 'Question') {
      return `<section class="sec"><div class="sec-label">${esc(L)}</div>
        <div class="highlight${L === 'Question' ? ' q' : ''}">${ps(b.paras)}${ul(b.items)}</div></section>`;
    }
    if (L === 'Challenges discussion') {
      return `<section class="sec"><div class="sec-label">Challenges discussion</div><div class="prose">${ps(b.paras)}${ul(b.items)}</div>
        <details class="fold" open><summary>This week’s challenges</summary>${challengesBody(week)}</details></section>`;
    }
    return `<section class="sec"><div class="sec-label">${esc(L)}</div><div class="prose">${ps(b.paras)}${ul(b.items)}</div></section>`;
  }

  // -------------------------------------------------------------- views
  function viewToday() {
    const iso = todayISO();
    const hit = byDate.get(iso);
    $title.textContent = 'Today';
    if (!hit) {
      const before = iso < firstDate;
      const w = before ? M.weeks[0] : lastWeek;
      return `<div class="hero"><div class="eyebrow">${before ? 'Coming soon' : 'The year is complete'}</div>
        <h1>${before ? 'Starts ' + esc(fmtDay(w.days[0])) : 'Thanks be to God'}</h1>
        <p>${before ? `Week 1 · ${esc(w.virtue)}` : 'You have reached the end of the manual. Browse any week to pray it again.'}</p></div>
        <a class="card tap" href="#/week/${w.n}"><b>Open week ${w.n}: ${esc(w.virtue)}</b></a>`;
    }
    const { week, day } = hit;
    const now = isMorningNow() ? 'morning' : 'night';
    const doneThisWeek = week.days.reduce((a, d) => a + KINDS.filter((k) => isDone(d.date, k)).length, 0);
    const total = week.days.length * 2;
    const devCard = (kind) => {
      const v = day[kind];
      const reading = v.blocks.find((b) => b.label === 'Reading');
      const done = isDone(day.date, kind);
      return `<a class="card tap dev-card ${kind}${kind === now && !done ? ' now' : ''}" href="#/d/${day.date}/${kind}">
        <div class="ic">${kind === 'morning' ? icon.sun : icon.moon}</div>
        <div class="grow"><div class="t">${kind === 'morning' ? 'Morning' : 'Night'} devotion</div>
          <div class="s">${v.type ? esc(v.type) + ' · ' : ''}led by <b>${esc(v.leader)}</b></div>
          ${reading ? `<div class="s">${esc(reading.title.split(' · ')[0])}</div>` : ''}</div>
        ${done ? `<div class="tick">${icon.check}</div>` : ''}</a>`;
    };
    const streak = streakDays();
    return `<div class="hero">
        <div class="eyebrow">Week ${week.n} · ${esc(fmtDay(day))}</div>
        <h1>${esc(week.virtue)}</h1>
        ${day.feast ? `<p class="feast">${esc(day.feast)}</p>` : ''}
        <p>${esc(week.definition)}</p>
      </div>
      ${devCard('morning')}
      ${devCard('night')}
      <div class="card">
        <div class="eyebrow">Key verse to memorise</div>
        <p class="verse">${esc(week.keyVerse)}</p>
        <label class="check"><input type="checkbox" data-verse="${week.n}" ${S.verses[week.n] ? 'checked' : ''}> We can say it from memory</label>
      </div>
      <div class="card">
        <div class="row"><div class="grow"><b>This week</b> <span class="muted small">${doneThisWeek} of ${total} devotions</span></div>
        ${streak > 1 ? `<span class="chip ok">${streak}-day streak</span>` : ''}</div>
        <div class="progress" style="margin-top:10px"><i style="width:${Math.round((doneThisWeek / total) * 100)}%"></i></div>
        <div style="margin-top:12px"><a href="#/week">Open the week: gathering, challenges, notebook →</a></div>
      </div>`;
  }

  function streakDays() {
    // Consecutive days with at least one devotion done, counting back from
    // today (or from yesterday, if nothing is done yet today).
    let d = todayISO();
    const any = (iso) => KINDS.some((k) => isDone(iso, k));
    if (!any(d)) d = addDays(d, -1);
    let n = 0;
    while (byDate.has(d) && any(d)) { n++; d = addDays(d, -1); }
    return n;
  }

  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
    } catch { /* not supported or denied: fine */ }
  }

  function viewDevotion(date, kind) {
    const hit = byDate.get(date);
    if (!hit || !KINDS.includes(kind)) return notFound();
    const { week, day } = hit;
    const v = day[kind];
    $title.textContent = `${kind === 'morning' ? 'Morning' : 'Night'} · ${day.weekday}`;
    const done = isDone(date, kind);
    const i = sequence.findIndex((s) => s.date === date && s.kind === kind);
    const prev = sequence[i - 1], next = sequence[i + 1];
    const label = (s) => `${s.kind === 'morning' ? 'Morning' : 'Night'}, ${byDate.get(s.date).day.weekday.slice(0, 3)} ${byDate.get(s.date).day.day} ${byDate.get(s.date).day.month.slice(0, 3)}`;
    return `<article class="reader">
      <header class="reader-head">
        <div class="eyebrow">Week ${week.n} · ${esc(week.virtue)}</div>
        <h1>${esc(fmtDay(day))}</h1>
        ${day.feast ? `<div class="muted" style="font-style:italic">${esc(day.feast)}</div>` : ''}
        <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">
          <span class="chip ${kind === 'morning' ? 'gold' : 'night'}">${kind === 'morning' ? 'Morning devotion' : 'Night devotion'}</span>
          ${v.type ? `<span class="chip">${esc(v.type)}</span>` : ''}
        </div>
        <div class="leader">${icon.users}<span>Led by <b>${esc(v.leader)}</b></span></div>
      </header>
      ${(day.note || []).map(introPara).join('')}
      ${v.intro.map(introPara).join('')}
      ${v.blocks.map((b) => renderBlock(b, week)).join('')}
      <div class="done-bar">
        <button type="button" class="btn block ${done ? 'done' : 'primary'}" data-done="${date}:${kind}">
          ${done ? icon.check + ' Prayed together' : 'Mark as prayed'}</button>
        <div class="pager">
          ${prev ? `<a class="btn" href="#/d/${prev.date}/${prev.kind}">‹ ${esc(label(prev))}</a>` : '<span></span>'}
          ${next ? `<a class="btn" href="#/d/${next.date}/${next.kind}">${esc(label(next))} ›</a>` : '<span></span>'}
        </div>
      </div>
    </article>`;
  }

  function viewWeek(n) {
    const cur = weekFor(todayISO());
    const week = n ? M.weeks.find((w) => w.n === n) : cur;
    if (!week) return notFound();
    $title.textContent = `Week ${week.n}`;
    const note = S.notes[week.n] || {};
    const today = todayISO();
    const g = week.gathering;
    return `<div class="hero">
        <div class="eyebrow">Week ${week.n} of ${M.weeks.length} · ${esc(week.range)}</div>
        <h1>${esc(week.virtue)}</h1><p>${esc(week.definition)}</p></div>
      ${g.extra.map((p) => `<div class="callout season">${esc(p)}</div>`).join('')}
      <div class="card"><div class="eyebrow">Key verse to memorise</div><p class="verse">${esc(week.keyVerse)}</p>
        <label class="check"><input type="checkbox" data-verse="${week.n}" ${S.verses[week.n] ? 'checked' : ''}> We can say it from memory</label></div>

      <h2>Daily devotions</h2>
      <ul class="daylist">${week.days.map((d) => `<li class="${d.date === today ? 'today' : ''}">
        <div class="dname">${esc(fmtDay(d))}${d.date === today ? ' · today' : ''}</div>
        ${d.feast ? `<div class="dfeast">${esc(d.feast)}</div>` : ''}
        <div class="dlinks">${KINDS.map((k) => `<a href="#/d/${d.date}/${k}" class="${isDone(d.date, k) ? 'd' : ''}">
          ${isDone(d.date, k) ? icon.check : k === 'morning' ? icon.sun : icon.moon}
          <span>${k === 'morning' ? 'Morning' : 'Night'} · ${esc(d[k].leader.replace(/, with .*/, '+'))}</span></a>`).join('')}</div></li>`).join('')}</ul>

      <h2>Sunday Family Gathering</h2>
      <div class="leader">${icon.users}<span>Led by <b>${esc(g.leader)}</b></span></div>
      <div class="reader">${gatheringBody(week)}</div>

      <h2>Wednesday challenges</h2>
      <div class="reader">${challengesBody(week)}</div>

      ${week.prayer ? `<h2>Prayer of the week</h2><div class="reader"><div class="prose"><p>${esc(week.prayer)}</p></div></div>` : ''}

      ${week.review ? `<h2>Saturday review</h2><div class="reader"><div class="prose">${ps(week.review.paras)}${ul(week.review.items)}</div></div>` : ''}
      ${week.closing.map((c) => `<h2>${esc(c.label)}</h2><div class="reader"><div class="prose">${ps(c.paras)}${ul(c.items)}</div></div>`).join('')}
      ${week.notes.length ? `<div class="reader prose">${ps(week.notes)}</div>` : ''}

      <h2>Family notebook</h2>
      <p class="muted small">Saved on this phone only.</p>
      <label class="field" for="nb-res">This week’s resolution</label>
      <textarea id="nb-res" data-note="${week.n}:resolution" placeholder="What we will do this week…">${esc(note.resolution || '')}</textarea>
      <label class="field" for="nb-sat">Saturday: one sentence from each person</label>
      <textarea id="nb-sat" data-note="${week.n}:saturday" placeholder="How it went…">${esc(note.saturday || '')}</textarea>

      <div class="pager" style="margin-top:24px">
        ${week.n > 1 ? `<a class="btn" href="#/week/${week.n - 1}">‹ Week ${week.n - 1}</a>` : '<span></span>'}
        ${week.n < M.weeks.length ? `<a class="btn" href="#/week/${week.n + 1}">Week ${week.n + 1} ›</a>` : '<span></span>'}
      </div>`;
  }

  function weekProgress(w) {
    return w.days.reduce((a, d) => a + KINDS.filter((k) => isDone(d.date, k)).length, 0);
  }
  function viewYear(q = '') {
    $title.textContent = 'All weeks';
    return `<input class="search" type="search" id="q" placeholder="Search virtues, stories, readings…" value="${esc(q)}" autocomplete="off">
      <div id="results">${yearResults(q)}</div>`;
  }
  function yearResults(q) {
    const cur = weekFor(todayISO()).n;
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const nq = norm(q.trim());
    const weekRow = (w) => {
      const p = weekProgress(w);
      return `<a class="card tap wk${w.n === cur ? ' cur' : ''}" href="#/week/${w.n}"><div class="n">${w.n}</div>
        <div class="grow"><div class="v">${esc(w.virtue)}</div><div class="r">${esc(w.range)}</div></div>
        ${p ? `<div class="p">${p}/${w.days.length * 2}</div>` : ''}${S.verses[w.n] ? `<div class="p" title="Key verse memorised">✓ verse</div>` : ''}</a>`;
    };
    if (!nq) return M.weeks.map(weekRow).join('');
    const weeks = M.weeks.filter((w) => norm(`${w.virtue} ${w.range} ${w.keyVerse} ${w.gathering.story.title}`).includes(nq));
    const devs = [];
    for (const w of M.weeks) for (const d of w.days) for (const k of KINDS) {
      for (const b of d[k].blocks) {
        if ((b.label === 'Reading' || b.label === 'Story') && norm(b.title).includes(nq)) {
          devs.push({ d, k, b });
        }
      }
    }
    return `${weeks.map(weekRow).join('')}
      ${devs.length ? `<h2>Readings and stories (${devs.length})</h2>` : ''}
      ${devs.slice(0, 60).map(({ d, k, b }) => `<a class="card tap" href="#/d/${d.date}/${k}">
        <div class="eyebrow">${esc(fmtDay(d))} · ${k}</div><div><b>${esc(b.label)}:</b> ${esc(b.title)}</div></a>`).join('')}
      ${!weeks.length && !devs.length ? '<p class="muted">Nothing found.</p>' : ''}`;
  }

  function viewPrayers() {
    $title.textContent = 'Prayers';
    const g = M.guide;
    const morning = ['sign', 'offering', 'ourfather', 'hailmary', 'glorybe', 'creed', 'angel', 'michael', 'family'];
    const night = ['contrition', 'holyqueen'];
    const seasonal = ['reginacaeli', 'actfaith'];
    const list = (ids) => ids.map((id) => prayerDetails(prayerById[id])).join('<div style="height:8px"></div>');
    return `<h2 style="margin-top:4px">Morning prayer recitation</h2>${list(morning)}
      <h2>Night prayers</h2>
      <div class="reader"><ol class="steps">${g.nightSteps.map((s) => {
        const p = prayerFor(s);
        return `<li>${p && prayerById[p.id] ? prayerDetails(p, s) : `<span class="plain">${esc(s)}</span>`}</li>`;
      }).join('')}</ol>
      <div class="callout">${esc(g.nightNote)}</div></div>
      <h2>Seasonal prayers</h2>${list(seasonal)}

      <h2>How we pray together</h2>
      <div class="reader prose">
        <table style="width:100%;border-collapse:collapse;font-size:15px;font-family:var(--sans)">
          ${[
            ['Every morning', 'Morning Prayer recitation, the day’s Bible passage, a one-line thought, the day’s resolution', 'Morning leader'],
            ['Sunday night', 'Family Gathering: the story, the admonition, how we will live the virtue this week, prayer of the week', 'Admonition leader'],
            ['Mon, Tue, Thu, Fri night', 'Bible passage, reflection question, examination of conscience, night prayers', 'Night leader'],
            ['Wednesday night', 'Challenges discussion: what is making this virtue hard, and what we will do about it', 'Night leader'],
            ['Saturday night', 'Weekly review: each person shares one way they lived the virtue; key verse recited from memory', 'Night leader'],
          ].map((r) => `<tr style="border-bottom:1px solid var(--line)"><td style="padding:8px 8px 8px 0;vertical-align:top;font-weight:700">${esc(r[0])}</td><td style="padding:8px 0;vertical-align:top">${esc(r[1])}<div class="muted small">${esc(r[2])}</div></td></tr>`).join('')}
        </table>
        <h3 style="margin:18px 0 8px">What the leader does</h3>
        <ol>${g.leaderDoes.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
        <p>${esc(g.youngest)}</p>
        <h3 style="margin:18px 0 8px">The leaders’ rota</h3>
        <p>${esc(g.rota)}</p><p>${esc(g.away)}</p>
        <h3 style="margin:18px 0 8px">Good habits for the year</h3>${ul(g.habits)}
      </div>`;
  }

  function viewMore() {
    $title.textContent = 'Settings';
    const st = S.settings;
    const doneCount = Object.keys(S.done).length;
    const seg = (name, opts, val) => `<div class="seg">${opts.map(([v, l]) => `<button type="button" data-set="${name}" data-val="${v}" class="${String(val) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    return `<h2 style="margin-top:4px">Reading</h2>
      <label class="field">Text size</label>
      ${seg('size', [[16, 'A'], [18, 'A+'], [21, 'A++'], [24, 'A+++']], st.size)}
      <label class="field">Appearance</label>
      ${seg('theme', [['auto', 'Automatic'], ['light', 'Light'], ['dark', 'Dark']], st.theme)}

      <h2>Our progress</h2>
      <div class="card"><b>${doneCount}</b> of ${sequence.length} devotions prayed ·
        <b>${Object.values(S.verses).filter(Boolean).length}</b> key verses memorised</div>
      <p class="muted small">Progress and the family notebook are kept on this phone. Save a backup file to move them to another phone.</p>
      <div class="row" style="flex-wrap:wrap">
        <button type="button" class="btn" id="export">Save backup</button>
        <label class="btn" for="import">Restore backup</label>
        <input type="file" id="import" accept="application/json,.json" hidden>
      </div>

      <h2>Offline</h2>
      <div class="card" id="offline-status">Checking…</div>
      <p class="muted small" id="install-hint">To install: in Chrome tap ⋮ then “Add to Home screen”. On iPhone, tap Share then “Add to Home Screen”.</p>
      <button type="button" class="btn" id="install" hidden>Install app</button>

      <h2>About</h2>
      <p class="muted small">${esc(M.title)}. ${M.weeks.length} weeks, ${sequence.length} devotions, from ${esc(fmtDay(M.weeks[0].days[0]))} 2026 to ${esc(fmtDay(lastWeek.days[lastWeek.days.length - 1]))} 2027.</p>
      <button type="button" class="btn" id="reset" style="color:#b3261e">Clear progress on this phone</button>`;
  }

  function notFound() {
    $title.textContent = 'Not found';
    return '<p class="muted">That page does not exist.</p><a class="btn" href="#/today">Go to today</a>';
  }

  // ------------------------------------------------------------- router
  let lastRoute = '';
  function route() {
    const hash = location.hash || '#/today';
    const [, name = 'today', a, b] = hash.split('/');
    let html, tab = name, back = null;
    keepAwake(false);
    switch (name) {
      case 'today': html = viewToday(); break;
      case 'd': html = viewDevotion(a, b); tab = ''; back = `#/week/${byDate.get(a)?.week.n || ''}`; keepAwake(true); break;
      case 'week': html = viewWeek(a ? +a : 0); if (a && +a !== weekFor(todayISO()).n) back = '#/year'; break;
      case 'year': html = viewYear(decodeURIComponent(a || '')); break;
      case 'prayers': html = viewPrayers(); break;
      case 'more': html = viewMore(); tab = ''; back = '#/today'; break;
      default: html = notFound();
    }
    $view.innerHTML = html;
    document.querySelectorAll('.tabbar a').forEach((el) => el.classList.toggle('on', el.dataset.tab === tab));
    $back.hidden = !back;
    $back.onclick = () => { if (history.length > 1 && lastFrom) history.back(); else location.hash = back; };
    if (hash !== lastRoute) { window.scrollTo(0, 0); $view.focus({ preventScroll: true }); }
    lastFrom = lastRoute;
    lastRoute = hash;
    if (name === 'more') wireMore();
  }
  let lastFrom = '';
  // Re-render in place (after toggling "done", etc.) without losing scroll.
  function rerender() { const y = window.scrollY; route(); window.scrollTo(0, y); }

  // ------------------------------------------------------------- events
  $view.addEventListener('click', (e) => {
    const t = e.target.closest('[data-done],[data-set],[data-timer]');
    if (!t) return;
    if (t.dataset.done) {
      const k = t.dataset.done;
      if (S.done[k]) delete S.done[k]; else S.done[k] = Date.now();
      save();
      if (S.done[k]) toast('Marked as prayed. God bless you!');
      rerender();
    } else if (t.dataset.set) {
      S.settings[t.dataset.set] = t.dataset.set === 'size' ? +t.dataset.val : t.dataset.val;
      save(); applySettings(); rerender();
    } else if (t.dataset.timer) {
      if (t.dataset.running) return;
      let left = +t.dataset.timer;
      t.dataset.running = '1';
      const tick = () => {
        if (!t.isConnected) return;
        if (left <= 0) { t.textContent = 'Amen'; delete t.dataset.running; if (navigator.vibrate) navigator.vibrate(200); return; }
        t.textContent = `${left}s of silence…`; left--; setTimeout(tick, 1000);
      };
      tick();
    }
  });
  $view.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.verse) { S.verses[t.dataset.verse] = t.checked; save(); if (t.checked) toast('Well done!'); }
  });
  let noteTimer;
  $view.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.note) {
      const [n, field] = t.dataset.note.split(':');
      (S.notes[n] = S.notes[n] || {})[field] = t.value;
      clearTimeout(noteTimer); noteTimer = setTimeout(save, 400);
    } else if (t.id === 'q') {
      document.getElementById('results').innerHTML = yearResults(t.value);
      history.replaceState(null, '', '#/year/' + encodeURIComponent(t.value));
      lastRoute = location.hash;
    }
  });
  window.addEventListener('hashchange', route);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (location.hash.startsWith('#/d/')) keepAwake(true);
      // A phone left open overnight should show the new day.
      if (!location.hash || location.hash === '#/today') rerender();
    }
  });
  document.getElementById('textsize').onclick = () => {
    const sizes = [16, 18, 21, 24];
    S.settings.size = sizes[(sizes.indexOf(S.settings.size) + 1) % sizes.length];
    save(); applySettings();
    toast(`Text size ${sizes.indexOf(S.settings.size) + 1} of ${sizes.length}`);
  };

  function applySettings() {
    const root = document.documentElement;
    root.style.setProperty('--text', S.settings.size + 'px');
    const dark = S.settings.theme === 'dark' || (S.settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'dark' : 'light';
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applySettings);

  // ---------------------------------------------------- settings wiring
  let installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });
  function wireMore() {
    document.getElementById('export').onclick = () => {
      const blob = new Blob([JSON.stringify({ app: 'family-devotion', v: 1, savedAt: new Date().toISOString(), ...S }, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `devotion-backup-${todayISO()}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    document.getElementById('import').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        if (d.app !== 'family-devotion') throw new Error('not a backup');
        // Merge, so restoring never loses anything already on this phone.
        S.done = { ...d.done, ...S.done };
        S.verses = { ...d.verses, ...S.verses };
        for (const [n, v] of Object.entries(d.notes || {})) S.notes[n] = { ...v, ...(S.notes[n] || {}) };
        save(); toast('Backup restored.'); rerender();
      } catch { toast('That file is not a Family Devotion backup.'); }
    };
    document.getElementById('reset').onclick = () => {
      if (!confirm('Clear all progress, memorised verses and notebook entries on this phone? This cannot be undone. Save a backup first if unsure.')) return;
      S = { ...structuredClone(defaults), settings: S.settings };
      save(); toast('Progress cleared.'); rerender();
    };
    const inst = document.getElementById('install');
    if (installPrompt) {
      inst.hidden = false;
      inst.onclick = async () => { installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; inst.hidden = true; };
    }
    if (matchMedia('(display-mode: standalone)').matches) document.getElementById('install-hint').textContent = 'Installed on this phone.';
    const status = document.getElementById('offline-status');
    if (!('serviceWorker' in navigator)) status.textContent = 'This browser cannot store the app for offline use.';
    else if (location.protocol === 'file:') status.textContent = 'Opened as a file: works offline, but install from the web address to keep it on your home screen.';
    else navigator.serviceWorker.getRegistration().then((r) => {
      status.innerHTML = r && r.active ? `${icon.check.replace('<svg', '<svg style="width:18px;height:18px;vertical-align:-3px;color:var(--ok)"')} Ready to use with no internet.` : 'Preparing for offline use… keep the app open for a moment.';
    });
  }

  // ------------------------------------------------------ service worker
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then((reg) => {
        const offer = (w) => toast('A new version is ready.', { label: 'Update', run: () => w.postMessage('skipWaiting') });
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed') {
              if (navigator.serviceWorker.controller) offer(w);
              else toast('Saved for offline use.');
            }
          });
        });
      }).catch(() => {});
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    });
  }

  applySettings();
  route();
})();
