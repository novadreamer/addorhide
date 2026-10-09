# AddOrHide

AddOrHide is a browser extension for hiding recommendations or saving videos to an Added Videos list. It includes built-in rules for YouTube and Tubi (tubitv.com), plus one-click and picker support for other websites.

## Supported sites

YouTube (home feed, subscriptions and creators' Home/Videos/Shorts/Live tabs) and Tubi are built in. IMDb charts/lists, TMDB lists, Dailymotion home, explore, video pages and search, and the Twitch directory can be enabled in one click with **Enable on this site**. Any other site can use the card picker. Sites that need a login or show a CAPTCHA or consent wall were not checked and should use the picker.

The Add/Hide buttons appear centred at the top of a card (or at the bottom of its video picture, chosen under **Buttons on videos** in the popup or Options) whenever the mouse is anywhere over it. If the site's own controls sit there, the buttons slide past them; if a site lays its own hover preview over the card (YouTube), the buttons are drawn above it.

## Look and feel

AddOrHide uses a calm indigo-and-violet interface with warm neutrals, clear controls, and small motion cues that make feed control feel approachable. It supports light and dark system themes and respects reduced-motion preferences.

## Load the extension

1. Open `chrome://extensions` in Brave.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select this folder.

On a recommendation card, **Hide** removes the video from the feed and provides a six-second Undo. **Add** saves the video while leaving it in the feed; clicking **Added** removes it from the Added list. The popup can Restore a hidden video, which returns it to the normal feed without adding it, or Remove it from the popup list while keeping it hidden.

The **Added Videos** page contains only videos explicitly added. It groups entries by website with favicon logo tiles (no brand logos are bundled), and each site shows only the sort and group options that would change something for its videos (date added, date published or year, views, votes, rating, duration, A-Z; by type, by genre). Groups follow the chosen sort, and the page keeps its scroll position when you sort, group, collapse or tag. The inline **Tag** editor lets you add or correct a type and comma-separated genres for sites that do not expose those details. The picker can learn up to twelve cumulative card patterns per site (**Teach cards** / **Teach more cards**).

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

Storage is local to this browser and is not synced between devices. Hidden items are capped at 1000 and Added items at 500, with the oldest entries evicted first. **Hide the whole feed** toggles for YouTube and Tubi are in Options (and in the popup for the current site) and are reversible from the same toggle.

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

Build the Chrome Web Store archive with `python tools/package.py .`. It writes the runtime-only archive to `dist/AddOrHide-1.0.0.zip`.

## Status: 1.0.0 (ready for Chrome Web Store submission)

Used day to day as an unpacked extension in Brave on YouTube (home feed and creator pages), Tubi, IMDb, Twitch and Dailymotion, including private windows.

Checked in a real browser (Brave with Playwright, see below) on live pages: Enable on this site, Add/Hide/Undo on YouTube creator pages, Tubi, IMDb (home, charts, title, trailers, search, video gallery), Twitch and Dailymotion; the card picker on PBS and Twitch; button placement and hover visibility, including a layer covering the card; the Added page sorting, grouping and scroll position; the popup's page Details line.

Not checked by automation: the browser's own permission prompt (it cannot be clicked by automation), the signed-in YouTube home feed and its inline preview player (checked by hand only), and the private-window Added page on `youtube.com/robots.txt`.

The popup shows a **Details** line (page script version, cards found, buttons attached). It is the first thing to read when buttons do not appear on a page.

## Store submission

Drafts for the Chrome Web Store live in `store/`: `privacy-policy.md` (and a ready-to-host `privacy-policy.html` generated from it) and `store-listing.md` (listing text, permission justifications, data disclosures, reviewer test steps, checklist). Fill the [BRACKETS] before submitting.

## Export and import

The Options page's **Your data** section can export hidden videos, added videos, site rules and Added page preferences as a local JSON backup. **Import data** merges those items with the current browser data; newer entries win, existing data is not deleted, and site permissions are never included.

## Testing against real site markup

`tests/fixtures/*.html` hold three real cards each, captured from the live YouTube, Tubi, IMDb, TMDB, Dailymotion and Twitch pages and trimmed. `tests/engine.test.js` runs the real `shared.js`, `catalog.js` and `content.js` against them in jsdom (buttons on every card, Add and Hide data, Undo, hidden-stays-hidden, the wrapper that gets hidden). jsdom is not bundled: run `npm install jsdom` in any folder and start the test with `JSDOM_PATH=<that folder>/node_modules/jsdom node tests/engine.test.js`. Without it the test prints SKIPPED. When a site changes its markup, recapture its fixture and the test will show what broke. jsdom has no layout, so button placement and hover visibility are not covered by it.

## Real-browser tests

`tools/e2e-browser.js`, `tools/e2e-permission.js` and `tools/e2e-v09.js` load the unpacked extension into an installed Brave/Chrome/Edge with Playwright (`npm install playwright-core`, then set `PLAYWRIGHT_PATH` and `BROWSER_EXE`; see the header of each file). The permission test is the one that would have caught the "Only permissions specified in the manifest may be requested" failure that stopped **Enable on this site** from working in 0.8.0: unit tests that stub the permissions API cannot see that error, only a real browser can. The popup also shows how many videos AddOrHide recognised on the current page, so a rule that does not match a page type is visible instead of silent.
