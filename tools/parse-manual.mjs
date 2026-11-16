// Parses the Family Communion Manual PDF into structured data for the app.
//
//   node tools/parse-manual.mjs "<path to manual.pdf>"
//
// Needs `pdftotext` (poppler) on PATH. Writes www/data.js and prints a
// validation report; exits non-zero if any week or day looks malformed.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pdf = process.argv[2];
if (!pdf) {
  console.error('usage: node tools/parse-manual.mjs <manual.pdf>');
  process.exit(2);
}

const tmp = join(mkdtempSync(join(tmpdir(), 'manual-')), 'm.txt');
execFileSync('pdftotext', ['-enc', 'UTF-8', pdf, tmp]);
const rawLines = readFileSync(tmp, 'utf8').split(/\r?\n/);

// ---------------------------------------------------------------- patterns
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RE_WEEK = /^Week (\d+) · (.+?) · (.+)$/;
const RE_DAY = new RegExp(`^(${WEEKDAYS.join('|')}) (\\d{1,2}) (${MONTHS.join('|')})(?: \\d{4})?(?: · (.*))?$`);
const RE_DEV = /^(MORNING|NIGHT) DEVOTION · (.*)$/;
const RE_PAGE = /\s*Page \d+ of \d+\s*/g;

// Labels that start a block inside a devotion. Text after the colon is the
// first line of the block (for Reading/Story it is the title).
const BLOCK_LABELS = [
  'Morning Prayer recitation', 'Reading', 'Story', 'Thought for today',
  'Today’s resolution', 'Question', 'Closing', 'Night prayers',
  'Challenges discussion', 'Weekly review', 'Year-end thanksgiving',
];
const RE_BLOCK = new RegExp(`^(${BLOCK_LABELS.map(esc).join('|')}):\\s*(.*)$`);
// Week trailer sections (may appear mid-line in the extracted text).
const TRAILER = ['Wednesday challenges discussion', 'Prayer of the week', 'Saturday review',
  'A closing blessing for our family', 'Closing the year'];

// "Prayer of the week · Prayers of the family · ..." is a night prayer list
// running onto a new page, not the week's prayer section.
const trailerOf = (l) => TRAILER.find((t) => l.startsWith(t) && !l.startsWith(t + ' ·'));
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const isHeader = (l) => RE_WEEK.test(l) || RE_DAY.test(l) || RE_DEV.test(l) || RE_BLOCK.test(l)
  || !!trailerOf(l) || /^(Admonition|How we will live it this week|Daily devotions|Key verse to memorise:|Sunday Family Gathering)/.test(l);
const endsSentence = (l) => /[.!?:;”"’)\]…]$/.test(l);

// --------------------------------------------------------- line cleaning
// pdftotext gives roughly one paragraph per line, but paragraphs that cross a
// page, and some list items, are split. Re-join them.
function clean(lines) {
  const out = [];
  let pageBreak = false;
  for (let line of lines) {
    if (RE_PAGE.test(line)) { pageBreak = true; }
    line = line.replace(RE_PAGE, ' ').replace(/\s+/g, ' ').trim();
    if (!line) continue;
    // Split trailer headings that got glued onto the end of a paragraph.
    for (const t of TRAILER) {
      line = line.replace(new RegExp(`([.!?”)])\\s+(${esc(t)})(?=\\s|$)`), '$1\n$2');
    }
    for (const part of line.split('\n')) {
      const prev = out[out.length - 1];
      const lower = /^[a-z(“‘"']/.test(part) && !/^(a|b|c)\) /.test(part);
      // A heading must not swallow the paragraph after it. Labels that carry
      // running text ("Thought for today: ...") may be continued, though.
      const headingLike = prev && isHeader(prev) && !(RE_BLOCK.test(prev) && !/^(Story|Reading):/.test(prev));
      const join = prev && !isHeader(part) && (
        (lower && !endsSentence(prev)) ||
        (pageBreak && !endsSentence(prev) && !headingLike && prev.length > 60)
      );
      if (join) out[out.length - 1] = prev + ' ' + part;
      else out.push(part);
      pageBreak = false;
    }
  }
  return out;
}

const splitBullets = (text) => {
  const parts = text.split('•').map((s) => s.trim()).filter(Boolean);
  if (!text.includes('•')) return { lead: text, items: [] };
  const lead = text.trim().startsWith('•') ? '' : parts.shift();
  return { lead, items: parts };
};

// A block = { label, title?, paras: [], items: [] }
function addText(block, text) {
  const { lead, items } = splitBullets(text);
  if (lead) {
    const last = block.items[block.items.length - 1];
    // A list item that wrapped onto a new line: join it back.
    if (last && (/^[a-z]/.test(lead) || !endsSentence(last))) block.items[block.items.length - 1] += ' ' + lead;
    else block.paras.push(lead);
  }
  block.items.push(...items);
}
const newBlock = (label, title) => ({ label, title: title || '', paras: [], items: [] });

// ------------------------------------------------------------- prayers
const intro = clean(rawLines.slice(0, rawLines.findIndex((l) => RE_WEEK.test(l))));
const introText = intro.join('\n');
function between(text, start, end) {
  const i = text.indexOf(start);
  if (i < 0) throw new Error('prayer start not found: ' + start);
  const from = i + start.length;
  const j = end ? text.indexOf(end, from) : -1;
  return text.slice(from, j < 0 ? undefined : j).replace(/\s+/g, ' ').trim();
}
const nightLine = introText.slice(introText.indexOf('Night prayers\n'), introText.indexOf('Seasonal prayers'));
const prayers = [
  { id: 'sign', name: 'Sign of the Cross', text: 'In the name of the Father, and of the Son, and of the Holy Spirit. Amen.' },
  { id: 'offering', name: 'Morning Offering', text: between(introText, 'Morning Offering ', '\nOur Father') },
  { id: 'ourfather', name: 'Our Father', text: between(introText, '\nOur Father ', '\nHail Mary') },
  { id: 'hailmary', name: 'Hail Mary', text: between(introText, 'Hail Mary (three times) ', '\nGlory Be') },
  { id: 'glorybe', name: 'Glory Be', text: between(introText, '\nGlory Be ', '\nApostles') },
  { id: 'creed', name: 'Apostles’ Creed', text: between(introText, 'Apostles’ Creed ', '\nPrayer to my Guardian') },
  { id: 'angel', name: 'Angel of God', note: 'At night say “ever this night be at my side”.', text: between(introText, 'Prayer to my Guardian Angel ', '\nPrayer to St Michael') },
  { id: 'michael', name: 'Prayer to St Michael', text: between(introText, 'Prayer to St Michael the Archangel ', '\nThen:') },
  { id: 'family', name: 'Nnadi Family Prayer', note: 'Said together every morning. Each day it asks for the virtue of the week.', text: between(introText, 'Nnadi Family Prayer (said together every morning) ', '\n') },
  { id: 'contrition', name: 'Act of Contrition', text: between(nightLine, 'Act of Contrition ', ' 6.') },
  { id: 'holyqueen', name: 'Hail, Holy Queen', text: between(nightLine, 'Hail, Holy Queen ', ' 9.') },
  { id: 'reginacaeli', name: 'Regina Caeli', note: 'Easter season, from Easter Sunday to Pentecost, in place of the Hail, Holy Queen.', text: between(introText, 'in place of the Hail, Holy Queen): ', '\n') },
  { id: 'actfaith', name: 'Act of Faith', note: 'Added to the morning recitation in the week of Faith.', text: between(introText, 'in the week of Faith): ', '\n') },
];
const nightSteps = between(introText, 'Night prayers\n', '\nOn Friday nights')
  .split(/\s(?=\d{1,2}\. )/).map((s) => s.replace(/^\d{1,2}\.\s*/, '').trim())
  // the full texts of these two are in `prayers`; keep only the name here
  .map((s) => s.replace(/^(Act of Contrition|Hail, Holy Queen) .*/, '$1'));
const nightNote = between(introText, 'On Friday nights', '\n');
const guide = {
  habits: splitBullets(between(introText, 'Good habits for the year ', '\nOur prayers').replace(/\n/g, ' ')).items,
  leaderDoes: between(introText, 'What the leader does ', '\n').split(/\s(?=\d\. )/).map((s) => s.replace(/^\d\.\s*/, '')),
  youngest: between(introText, 'Chimdalu leads with', '\n'),
  rota: between(introText, 'The leaders’ rota ', '\n'),
  away: between(introText, 'If a leader is away', '\n'),
  nightSteps,
  nightNote: 'On Friday nights' + nightNote,
};
guide.youngest = 'Chimdalu leads with' + guide.youngest;
guide.away = 'If a leader is away' + guide.away;

// --------------------------------------------------------------- weeks
const lines = clean(rawLines.slice(rawLines.findIndex((l) => RE_WEEK.test(l))));
const weeks = [];
let week = null, day = null, dev = null, block = null, mode = null;

function closeDev() { dev = null; block = null; }
for (const line of lines) {
  let m;
  if ((m = RE_WEEK.exec(line))) {
    closeDev(); day = null;
    week = { n: +m[1], range: m[2], virtue: m[3], definition: '', keyVerse: '', gathering: { leader: '', story: null, admonition: [], liveIt: [], extra: [] }, days: [], challenges: null, prayer: '', review: null, notes: [], closing: [] };
    weeks.push(week); mode = 'head'; block = null;
    continue;
  }
  if (!week) continue;

  if ((m = RE_DAY.exec(line)) && mode !== 'trailer') {
    closeDev();
    day = { weekday: m[1], day: +m[2], month: m[3], feast: m[4] || '', morning: null, night: null };
    week.days.push(day); mode = 'day';
    continue;
  }
  if ((m = RE_DEV.exec(line)) && day) {
    const parts = m[2].split(' · ');
    const ledBy = parts.pop().replace(/^led by\s*/, '');
    dev = { kind: m[1].toLowerCase(), type: parts.join(' · '), leader: ledBy, intro: [], blocks: [] };
    day[dev.kind] = dev; block = null; mode = 'dev';
    continue;
  }
  const trailer = trailerOf(line);
  if (trailer && (mode === 'dev' || mode === 'trailer' || mode === 'day')) {
    closeDev(); mode = 'trailer';
    const rest = line.slice(trailer.length).trim();
    if (trailer === 'Prayer of the week') {
      week.prayer = rest;
      block = rest ? null : newBlock('prayer'); // heading on its own line: text follows
      continue;
    }
    block = newBlock(trailer);
    if (trailer === 'Wednesday challenges discussion') week.challenges = block;
    else if (trailer === 'Saturday review') week.review = block;
    else week.closing.push(block);
    if (rest) addText(block, rest);
    continue;
  }

  if (mode === 'head') {
    if (line.startsWith('Key verse to memorise:')) { week.keyVerse = line.slice(22).trim(); continue; }
    if ((m = /^Sunday Family Gathering \(led by (.+?)\)\s*(.*)$/.exec(line))) {
      week.gathering.leader = m[1];
      block = null;
      const s = /^Story:\s*(.*)$/.exec(m[2]);
      if (s) block = week.gathering.story = newBlock('Story', s[1]);
      else if (m[2]) week.gathering.leaderNote = m[2];
      continue;
    }
    if ((m = /^Story:\s*(.*)$/.exec(line))) { block = week.gathering.story = newBlock('Story', m[1]); continue; }
    if (line === 'Admonition') { block = { label: 'Admonition', paras: week.gathering.admonition, items: [] }; continue; }
    if (line.startsWith('How we will live it this week')) { block = { label: 'live', paras: week.gathering.extra, items: week.gathering.liveIt }; continue; }
    if (line.startsWith('Daily devotions') || line.startsWith('Each day is written out in full')) { block = null; continue; }
    if (!week.definition && !block) { week.definition = line; continue; }
    if (block) addText(block, line); else week.gathering.extra.push(line);
    continue;
  }
  if (mode === 'dev') {
    if ((m = RE_BLOCK.exec(line))) {
      block = newBlock(m[1]);
      if (m[1] === 'Reading' || m[1] === 'Story') block.title = m[2];
      else if (m[2]) addText(block, m[2]);
      dev.blocks.push(block);
      continue;
    }
    if (block) addText(block, line); else dev.intro.push(line);
    continue;
  }
  if (mode === 'trailer') {
    if (block && block.label === 'prayer') { week.prayer = line; block = null; }
    else if (block) addText(block, line);
    else if (line.includes('•')) { week.review = week.review || newBlock('Saturday review'); addText(week.review, line); }
    else week.notes.push(line);
    continue;
  }
  // text between a day header and its first devotion
  if (mode === 'day') { (day.note = day.note || []).push(line); }
}

// ------------------------------------------------------------- dates
const start = Date.UTC(2026, 10, 15); // Sunday 15 November 2026 = week 1, day 1
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const problems = [];
for (const w of weeks) {
  w.start = iso(start + (w.n - 1) * 7 * 864e5);
  w.days.forEach((d, i) => {
    const t = start + ((w.n - 1) * 7 + i) * 864e5;
    const dt = new Date(t);
    d.date = iso(t);
    if (WEEKDAYS[dt.getUTCDay()] !== d.weekday || dt.getUTCDate() !== d.day || MONTHS[dt.getUTCMonth()] !== d.month) {
      problems.push(`week ${w.n}: ${d.weekday} ${d.day} ${d.month} does not match computed ${d.date}`);
    }
    for (const k of ['morning', 'night']) {
      const v = d[k];
      if (!v) { problems.push(`week ${w.n} ${d.date}: no ${k} devotion`); continue; }
      if (!v.blocks.some((b) => b.label === 'Reading')) problems.push(`week ${w.n} ${d.date} ${k}: no reading`);
    }
  });
  const expected = w.n === 59 ? 6 : 7;
  if (w.days.length !== expected) problems.push(`week ${w.n}: ${w.days.length} days (expected ${expected})`);
  if (!w.keyVerse) problems.push(`week ${w.n}: no key verse`);
  if (!w.gathering.story) problems.push(`week ${w.n}: no gathering story`);
  if (!w.prayer) problems.push(`week ${w.n}: no prayer of the week`);
  if (!w.challenges) problems.push(`week ${w.n}: no challenges`);
}
const nums = weeks.map((w) => w.n);
for (let i = 1; i <= 59; i++) if (!nums.includes(i)) problems.push(`week ${i} missing`);

const data = { title: 'Nnadi Family Communion Manual 2026–2027', prayers, guide, weeks };
const json = JSON.stringify(data);
writeFileSync(join(ROOT, 'www', 'data.js'), `// Generated by tools/parse-manual.mjs — do not edit by hand.\nwindow.MANUAL=${json};\n`);
console.log(`weeks: ${weeks.length}, days: ${weeks.reduce((a, w) => a + w.days.length, 0)}, size: ${(json.length / 1024).toFixed(0)} KB`);
if (problems.length) {
  console.log(`${problems.length} problem(s):\n  ` + problems.join('\n  '));
  process.exit(1);
}
console.log('no problems');
