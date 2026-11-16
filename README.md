# Family Devotion

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
```

## Commands

```sh
node tools/parse-manual.mjs "path/to/Nnadi Family Communion Manual 2026-2027.pdf"
node tools/build.mjs          # run after any change in www/
node tools/serve.mjs          # http://localhost:8080
node tools/test-browser.mjs   # optional arg: a folder for screenshots
```

The parser checks its own output: every week has its key verse, gathering
story, challenges and prayer; every day matches its calendar date and has a
morning and a night devotion with a reading. It exits non-zero if any check
fails, so a revised PDF that changes the layout fails loudly instead of
quietly dropping content.

## Putting it on the family's phones

Offline install needs **https**. Deploy `www/` to any static host (Vercel,
Netlify, GitHub Pages, Cloudflare Pages), open the address once on each phone,
then:

- Android (Chrome): ⋮ menu → *Add to Home screen* (or *Install app*).
- iPhone (Safari): Share → *Add to Home Screen*.

The manual contains the family's names, so if you host it publicly, use an
unlisted address or a host with access protection.

When the manual is revised: re-run the parser, then `build.mjs`, then
redeploy. Installed phones show "A new version is ready — Update".
