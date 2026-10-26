# AddOrHide

[![Support me on Ko-fi](https://img.shields.io/badge/Support%20me%20on-Ko--fi-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/ashmustafa)

AddOrHide is a Chrome/Brave extension that puts you in charge of video recommendations: point at any video
thumbnail and choose **Add** (keep it on your own Added Videos page) or **Hide** (remove it from the feed for good).
It has built-in rules for YouTube and Tubi (tubitv.com), one-click support for IMDb, TMDB, Dailymotion and Twitch,
and a card picker that teaches it any other video site. Everything stays in your browser.

## Install

- **Chrome Web Store:** search for [AddOrHide](https://chromewebstore.google.com/search/AddOrHide) (works in Chrome,
  Brave and Edge).
- **From this repository (Developer mode):** download it (**Code → Download ZIP**, then extract) or `git clone` it,
  open `chrome://extensions` (Brave: `brave://extensions`), turn on **Developer mode**, choose **Load unpacked** and
  select the folder that contains `manifest.json`. Keep that folder; the browser runs the extension from it. To
  update, replace the files and click the extension's reload arrow.

Moving between the store copy and a Developer-mode copy: they are separate extensions with separate data, so use
**Options → Your data → Export** in one and **Import** in the other.

## Supported sites

YouTube (home feed, subscriptions and creators' Home/Videos/Shorts/Live tabs) and Tubi are built in. IMDb charts/lists, TMDB lists, Dailymotion home, explore, video pages and search, and the Twitch directory can be enabled in one click with **Enable on this site**. Any other site can use the card picker. Sites that need a login or show a CAPTCHA or consent wall were not checked and should use the picker.

The Add/Hide buttons appear centred at the top of a card (or at the bottom of its video picture, chosen with the up/down arrowhead buttons under **Position** in the popup or Options) whenever the mouse is anywhere over it. The round power button turns them off and on for every site without un-hiding anything: red while the hover buttons show (click to disable), green while they are off (click to enable); its tooltip and the line under it say which. While they are off the toolbar icon turns grey with an OFF badge. If the site's own controls sit there, the buttons slide past them; if a site lays its own hover preview over the card (YouTube), the buttons are drawn above it.

## Look and feel

AddOrHide uses a calm indigo-and-violet interface with warm neutrals, clear controls, and small motion cues that make feed control feel approachable. It supports light and dark system themes and respects reduced-motion preferences.

The sun/moon switch in the popup header picks a light or dark theme for all AddOrHide pages (the default follows the system), and the popup's troubleshooting Details line is folded away until needed.

## Using it

On a recommendation card, **Hide** removes the video from the feed and provides a six-second Undo. **Add** saves the video while leaving it in the feed; clicking **Added** removes it from the Added list. The popup has two buttons side by side: green **Added Videos** opens your Added Videos page and red **Hidden Videos** opens the Hidden videos window. Each is greyed out while its list is empty and has a count line under it ("There are 3 added videos and 2 websites."). The Hidden videos window is grouped by website with collapsible sections, icon buttons per video (back-arrow **Restore**, ✕ **Remove**), a double back-arrow (**Restore all**) and a bin (**Remove all**) for everything, and a bin button on each website that removes that site's videos from the list (they stay hidden); its lid opens with a "?" next to it to ask first.

The **Added Videos** page contains only videos explicitly added. It groups entries by website with favicon logo tiles (no brand logos are bundled), and each site shows only the sort and group options that would change something for its videos (date added, date published or year, views, votes, rating, duration, A-Z; by type, by genre). Groups follow the chosen sort, and the page keeps its scroll position when you sort, group, collapse or tag. The inline **Tag** editor lets you add or correct a type and comma-separated genres for sites that do not expose those details. Each website also has a bin button that deletes all of that site's videos from the page; its lid opens with a "?" next to it to ask first, each video's tag icon sets its type and genres, its ✕ removes it, and **Clear page** empties the whole page (greyed out, with a tooltip saying why, while there is nothing to clear). Every icon button has a short tooltip. The picker can learn up to twelve cumulative card patterns per site (**Teach cards** / **Teach more cards**).

**Where the data comes from:** duration, views, age, year, rating and genres are read from the card when you click **Add** (YouTube: duration, views and age; Tubi: duration, year, rating and genres; other sites are best effort). Nothing is fetched from the sites. Older entries and many sites will lack fields, and missing values always sort last.

On a catalog-supported site, choose **Enable on this site** and AddOrHide uses its built-in card rule. On any other site, choose **Enable on this site**, then choose a video or card in the page picker and press **Save**. AddOrHide learns a CSS pattern and adds **Hide** and **Add** buttons to similar cards. Card detection is heuristic, so a picker can fail on some sites; try a different part of the card. The site permission is requested only for the site you enable and can be revoked with **Disable**. AddOrHide never touches DRM or streaming playback.
The browser may close the popup when it asks for permission; AddOrHide finishes picker setup in the background only for sites that need it.

## Popup player

Supported videos can be played in a floating popup window using the site's official embed player. The player window is reused for later videos in the same normal or private browsing mode.

| Site | Popup player supports | Other saved entries |
| --- | --- | --- |
| YouTube | Videos and Shorts | — |
| Twitch | Live channels, videos and clips | — |
| IMDb | Video pages, including trailers | Title pages open on IMDb |
| Tubi, Dailymotion, TMDB | — | Open on the original site |

In private windows, the Added Videos page uses the hosted view at `youtube.com/robots.txt#addorhide-added`, because browsers do not open extension pages there. Turn on **Allow in Incognito** for AddOrHide. The popup and options page keep new tabs in the current window.

Storage is local to this browser and is not synced between devices. Added items are capped at 500 and hidden items at 1000, with the oldest entries evicted first. **Hide the whole feed** toggles for YouTube and Tubi are in Options (and in the popup for the current site) and are reversible from the same toggle.

## Support link

An optional Ko-fi tip link (`HOA.SUPPORT_URL`, https://ko-fi.com/ashmustafa) appears as a quiet "♥ Support" text link in the centre of the popup footer (between a GitHub icon linking here and Options), the Options page header and the Added Videos page header. It only opens the Ko-fi page; no feature depends on it and nothing is sent to Ko-fi.

## Permissions

- `storage` saves hidden videos, Added videos, and learned site rules locally.
- `scripting` registers and injects the picker and learned site rules.
- `activeTab` permits the popup to start the picker in the tab the user selected.
- Optional `http://*/*` and `https://*/*` host permissions are requested one site at a time when you choose **Enable on this site**. YouTube, Tubi and the YouTube thumbnail host are included as built-in permissions.

## Testing

Run the shared pure-function tests with:

```text
node tests/shared.test.js
node tests/sites.test.js
node tests/picker.test.js
node tests/catalog.test.js
JSDOM_PATH=<folder>/node_modules/jsdom node tests/engine.test.js
```

Regenerating icons: run `python tools/make_icons.py` from this directory.

Build the Chrome Web Store archive with `python tools/package.py .`. It writes the runtime-only archive to `dist/AddOrHide-<version>.zip`.

## Status: 1.0.13

1.0.1 is on the Chrome Web Store. Since then: YouTube search results, Shorts and new layouts everywhere, gap-free
hiding of Shorts, Hide the whole feed on every YouTube page, two installed copies no longer fight (the newest runs
the page and the other one's popup says so), a redesigned popup (Added Videos and Hidden Videos side by side, a round
3D power button, arrowhead Position buttons, a GitHub link) and a per-website delete button on the Added page and in
the Hidden videos window.

Used day to day as an unpacked extension in Brave on YouTube (home feed and creator pages), Tubi, IMDb, Twitch and Dailymotion, including private windows.

Checked in a real browser (Brave with Playwright, see below) on live pages, plus the YouTube watch-page sidebar on a styled copy of its markup: recommendation rows on detail pages (Tubi "You may also like", TMDB Recommendations, Dailymotion and IMDb suggestions), Enable on this site, Add/Hide/Undo on YouTube creator pages, Tubi, IMDb (home, charts, title, trailers, search, video gallery), Twitch and Dailymotion; the card picker on PBS and Twitch; button placement and hover visibility, including a layer covering the card; the Added page sorting, grouping and scroll position; the popup's page Details line.

Not checked by automation: the browser's own permission prompt (it cannot be clicked by automation), the signed-in YouTube home feed and its inline preview player (checked by hand only), and the private-window Added page on `youtube.com/robots.txt`.

The popup shows a **Details** line (page script version, cards found, buttons attached). It is the first thing to read when buttons do not appear on a page.

## Privacy

AddOrHide collects nothing and sends nothing anywhere: your Added and Hidden lists, site rules and settings are kept in
the browser's local extension storage. The full policy is at
https://novadreamer.github.io/addorhide-player/privacy.html (source: `store/privacy-policy.md`). Questions or problem
reports: mybrainnoor@gmail.com, or open an issue here.

## Legal

Copyright © 2026 Ashraf Mustafa. Free for personal use; you may not sell, redistribute or republish it without
written permission. See [LICENSE](LICENSE) and [LEGAL.md](LEGAL.md) (no warranty, not affiliated with any site it works
on, donations).

## Store submission

Drafts for the Chrome Web Store live in `store/`: `privacy-policy.md` (and a ready-to-host `privacy-policy.html` generated from it) and `store-listing.md` (listing text, permission justifications, data disclosures, reviewer test steps, checklist). The policy is hosted at https://novadreamer.github.io/addorhide-player/privacy.html.

## Export and import

The Options page's **Your data** section can export added videos, hidden videos, site rules and Added page preferences as a local JSON backup. **Import data** merges those items with the current browser data; newer entries win, existing data is not deleted, and site permissions are never included.

## Testing against real site markup

`tests/fixtures/*.html` hold three real cards each, captured from the live YouTube, Tubi, IMDb, TMDB, Dailymotion and Twitch pages and trimmed. `tests/engine.test.js` runs the real `shared.js`, `catalog.js` and `content.js` against them in jsdom (buttons on every card, Add and Hide data, Undo, hidden-stays-hidden, the wrapper that gets hidden). jsdom is not bundled: run `npm install jsdom` in any folder and start the test with `JSDOM_PATH=<that folder>/node_modules/jsdom node tests/engine.test.js`. Without it the test prints SKIPPED. When a site changes its markup, recapture its fixture and the test will show what broke. jsdom has no layout, so button placement and hover visibility are not covered by it.

## Real-browser tests

`tools/e2e-browser.js`, `tools/e2e-permission.js` and `tools/e2e-v09.js` load the unpacked extension into an installed Brave/Chrome/Edge with Playwright (`npm install playwright-core`, then set `PLAYWRIGHT_PATH` and `BROWSER_EXE`; see the header of each file). The permission test is the one that would have caught the "Only permissions specified in the manifest may be requested" failure that stopped **Enable on this site** from working in 0.8.0: unit tests that stub the permissions API cannot see that error, only a real browser can. The popup also shows how many videos AddOrHide recognised on the current page, so a rule that does not match a page type is visible instead of silent.
