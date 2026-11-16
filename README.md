# Family Devotion

**Open / install: https://astrobsm.github.io/family-devotion/**

An offline-first, mobile-first app for the *Nnadi Family Communion Manual
2026–2027*: 59 weekly virtues, a morning and a night devotion every day
(824 in all), from 15 November 2026 to 31 December 2027.

- **Today** opens the day's devotions: the virtue, the leader, the reading.
  The morning devotion is highlighted before 3 pm and the night one after.
- **Devotion reader**: the leader reads down the page. Every prayer named in
  a list (Morning Offering, Act of Contrition, Prayer of the week…) opens its
  full text when tapped. Sunday night pulls in the Family Gathering story and
  admonition, and Wednesday night pulls in the week's challenges. The
  examination of conscience has a one-minute silence timer. The screen stays
  on while a devotion is open.
- **This week**: the Sunday Gathering, all seven days, the challenges, the
  prayer of the week, the Saturday review and a family notebook.
- **All weeks**: search by virtue, story or Bible reference.
- **Prayers**: the full texts and the "how we pray together" guide.
- Progress ("prayed together"), memorised key verses and notebook entries are
  kept on the phone. Settings → *Save backup* moves them to another phone.

No accounts, no server, no tracking, no dependencies. After the first visit
the whole app is stored on the phone and works with no internet.

## Layout

```
www/            the app; deploy this folder as-is to any static host
  data.js       generated from the PDF; do not edit by hand
  sw.js         service worker (offline cache)
tools/
  parse-manual.mjs   PDF -> www/data.js (needs pdftotext from poppler)
  build.mjs          stamps sw.js with a content hash so phones get updates
  serve.mjs          local server
  test-browser.mjs   end-to-end checks in headless Chrome, offline included
  deploy.sh          publish www/ to GitHub Pages
```

## Commands

```sh
node tools/parse-manual.mjs "path/to/Nnadi Family Communion Manual 2026-2027.pdf"
node tools/build.mjs          # run after any change in www/
node tools/serve.mjs          # http://localhost:8080
node tools/test-browser.mjs   # optional arg: a folder for screenshots
BASE_URL=https://astrobsm.github.io/family-devotion/ node tools/test-browser.mjs
sh tools/deploy.sh            # publish
```

The parser checks its own output: every week has its key verse, gathering
story, challenges and prayer; every day matches its calendar date and has a
morning and a night devotion with a reading. It exits non-zero if any check
fails, so a revised PDF that changes the layout fails loudly instead of
quietly dropping content.

## Installing on each device

Open **https://astrobsm.github.io/family-devotion/** once with internet, wait
for "Saved for offline use", then install:

| Device | How |
|---|---|
| Android phone or tablet (Chrome) | Tap **Install** when offered, or ⋮ → **Add to Home screen** → Install |
| iPhone / iPad (Safari) | Share button → **Add to Home Screen** → Add |
| Windows or Mac (Chrome / Edge) | Install icon at the right of the address bar, or menu → **Install Family Devotion** |
| Mac (Safari 17+) | File → **Add to Dock** |

After that it opens from its own icon, full screen, with no internet needed.
Each device keeps its own progress; Settings → *Save backup* / *Restore
backup* moves it between devices.

## Updating

Hosting is GitHub Pages from the `gh-pages` branch, which holds only the
contents of `www/`. (GitHub Actions is not used.) After any change, or after
re-running the parser on a revised manual:

```sh
sh tools/deploy.sh
```

Installed devices pick up the new version the next time they open with
internet and show "A new version is ready — Update".

The site is public: anyone with the address can read the manual.
