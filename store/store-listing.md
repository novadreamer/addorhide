# AddOrHide: Chrome Web Store submission pack (draft)

Release note: version 1.0.0 is ready for submission. The Options page includes Export my data and Import data for moving local lists and settings between extension installations.

All the placeholders have been filled in. Field limits and required assets below come from the current Chrome Web Store documentation, except where marked "(dashboard limit)", which are limits the dashboard enforces that the docs page does not state.

---

## 1. Store listing tab

**Name** (dashboard limit 75): `AddOrHide`

**Summary** (dashboard limit 132):
`Save videos you like to your own list and hide ones you don't want on YouTube, Tubi, IMDb, Dailymotion, Twitch and more.`

**Category:** Productivity
**Language:** English

**Detailed description**

```
AddOrHide puts you in charge of the video recommendations on the sites you use. Add any video to your own Added Videos list so you can find it again later, or hide anything you don't want to see.

HOW IT WORKS
Hover over a video on a supported site and two small buttons appear:
- Hide removes the video from the feed. Changed your mind? Tap Undo, or restore it from the Hidden Videos window in the extension popup.
- Add saves the video to your Added Videos page. The video stays where it is, and the button turns into "Added".

YOUR ADDED VIDEOS PAGE
- Videos are grouped by website, each with its own logo tile.
- Sort each site's videos by date added, date published, views, duration, year or A-Z.
- Group them by type (video, short, movie, TV, live, music, sport) or by genre where the site shows one.
- Tag any video with your own type and genres.
- Click **Play** on supported YouTube, Twitch or IMDb videos to open the site's official player in a popup window; other saved videos open on their original site.
- Works in private windows too, if you allow the extension there.

THE HIDDEN LIST
The toolbar popup shows how many videos you hid. Its Hidden Videos button opens a window listing them by website, with thumbnails. Restore one or all of them, or remove a row to keep the video hidden without cluttering the list.

WORKS ON
- YouTube and Tubi, built in.
- IMDb charts/lists, TMDB lists, Dailymotion home and Twitch directory: choose Enable on this site for one-click support.
- Any other site you choose. Turn it on for that site, click one video tile to show the extension what a video looks like, and the buttons appear on every similar tile. The browser asks for permission one site at a time, and you can take it back whenever you like.

PRIVATE BY DESIGN
Everything stays on your device. AddOrHide has no accounts, no servers, no ads and no analytics, and it never sends your lists to anyone.

BACKUPS
Use Export my data and Import data in Options to move your Added list, hidden videos, site settings and page preferences between installations. Imports merge with existing data; permissions are never included.

GOOD TO KNOW
- AddOrHide never hides or changes ads and never downloads videos.
- Details such as duration, views and genre appear only when the site shows them on the video's card. You can tag the rest yourself.
- Websites change their layout from time to time, which can occasionally affect the buttons. Please report problems at mybrainnoor@gmail.com.

AddOrHide is an independent project and is not affiliated with, endorsed by or sponsored by YouTube, Google, Tubi or any other streaming service. All product names and trademarks belong to their owners.
```

**Graphic assets** (current requirements: store icon 128x128; at least 1 screenshot at 1280x800, up to 5; small promo tile 440x280 PNG or JPEG; marquee 1400x560 optional)

- **Store icon (128x128):** done, `icons/icon128.png`.
- **Screenshots (1280x800):** done, in `store/assets/` (mock sites and drawn thumbnails only), upload in this order:
  1. `screenshot-1-add-or-hide.png`: *Add what you like. Hide what you don't.*
  2. `screenshot-2-added-page.png`: *Your own list of saved videos*
  3. `screenshot-3-sort-group.png`: *Sort and group your way*
  4. `screenshot-4-hidden.png`: *Changed your mind? Restore anytime*
  5. `screenshot-5-any-site.png`: *Works on the sites you watch*
- **Small promo tile (440x280):** done, `store/assets/promo-small-440x280.png` ("Add it. Or hide it.").
- **Marquee (1400x560), optional:** done, `store/assets/promo-marquee-1400x560.png`.

**Privacy policy URL:** https://novadreamer.github.io/addorhide-player/privacy.html

**Optional fields:** leave Homepage URL and Support URL empty (support is by email: mybrainnoor@gmail.com); leave "mature content" unchecked.

---

## 2. Privacy tab

**Single purpose description**
`AddOrHide lets you control the video recommendations shown on video websites: save any video to your own Added Videos list, or hide it from a feed.`

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `storage` | Saves the videos the user adds or hides, per-site settings and display preferences in local extension storage on the user's device. |
| `scripting` | Injects the extension's content script and, where needed, its card picker into a site the user has turned the extension on for, so the Add and Hide buttons appear without a page reload, and re-registers that script for the site after a restart. |
| `activeTab` | When the user opens the popup on a page, lets the extension read that tab's address to show the right controls and to start setup or the card picker on it. |
| Host permissions: `https://www.youtube.com/*`, `https://tubitv.com/*`, `https://www.tubitv.com/*` | Built-in support for these two sites: the extension adds its buttons to video cards there and hides cards the user previously hid. On YouTube it also builds the Added Videos page for private windows (see Test instructions). |
| Optional host permissions: `https://*/*`, `http://*/*` | Requested one site at a time, only when the user chooses "Enable on this site" in the popup, to run the extension on a site the user picks or to enable one-click support for IMDb, TMDB, Dailymotion or Twitch. They are never requested in bulk, are always user initiated, and the user can revoke each one with "Disable on this site". |
| Remote code | **No, I am not using remote code.** All scripts are packaged with the extension. |

**Data usage disclosure** (tick what applies; this is my reading of the Chrome Web Store user data guidance, which says local-only handling still requires disclosure. Confirm against the wording in your dashboard.)

- **Website content:** tick. The extension reads video links, titles and thumbnails from pages and stores those the user adds or hides.
- **Web history:** tick conservatively. The extension stores the addresses of videos the user chooses to add or hide. It does not record browsing generally.
- Leave unticked: personally identifiable information, health, financial, authentication, personal communications, location, user activity (clicks and keystrokes).

**Certifications:** tick all three: not sold or transferred to third parties outside approved uses, not used for purposes unrelated to the single purpose, not used to determine creditworthiness or for lending. Certify compliance with the Limited Use policy.

**Privacy policy URL:** [HOSTED URL OF store/privacy-policy.html]. It must be reachable without signing in.

**Test instructions for reviewers** (paste into the Distribution/test instructions field):

```
No account or login is needed.
1. Open https://tubitv.com/ (works logged out) and hover over any movie or TV tile: Add and Hide buttons appear centred at the top of the tile.
2. Click Add on a tile (it shows "Added"), then Hide on another tile (it disappears; an Undo message appears).
3. Click the AddOrHide toolbar icon: the hidden video is listed with Restore and Remove buttons. Click "Open added page" to see the added video, grouped under Tubi. Use the Sort by control and the Tag button there.
4. On a saved YouTube video or Short, click the **Play** thumbnail button. It opens the official player in one popup window; click another supported video to confirm the same window is reused. Twitch channels, videos and clips, and IMDb videos work the same way.
5. YouTube is also supported: the home feed (shown only to signed-in users) and any creator's page (for example `https://www.youtube.com/@NASA`, Home, Videos, Shorts and Live tabs), which works signed out.
6. Open https://www.imdb.com/chart/moviemeter/, open the popup and choose "Enable on this site". After the single-site permission prompt, Add and Hide buttons appear on the chart rows without using the picker.
7. Any other site: open the popup on it and click "Enable on this site". The browser asks for permission for that single site, then a picker asks you to click one video tile.
Note: browsers cannot open extension pages in private windows, so in a private window "Open added page" opens https://www.youtube.com/robots.txt#addorhide-added. The extension's content script (restricted to that exact address) draws the Added Videos page there from the local list. It reads nothing from YouTube and sends nothing to it. IMDb title pages, Dailymotion, Tubi and TMDB entries do not have the popup player; their thumbnail labels open the original site.
```

---

## 3. Distribution tab

- **Visibility:** Public (or Unlisted for a beta first).
- **Regions:** all.
- **Trader status (EU):** if this is a free hobby project with no commercial activity you can usually declare non-trader. If you charge or run it as a business, you must declare trader status and publish contact details. Check the dashboard wording.

---

## 4. Before you submit

1. **Fill the brackets** in the listing, the policy and the test instructions, and host the policy at a public address (a GitHub Pages file or any static page works). `store/privacy-policy.html` is a ready-to-host copy.
2. **Run the extension unpacked in Brave and Chrome** and complete the test instructions above yourself. Automation cannot click the browser's own permission prompt, so try **Enable on this site** once by hand.
3. **Confirm private-window storage:** hide something in a private window, close it, and see whether it is still hidden in a normal window. The policy says it is. If your test shows otherwise, fix the "Private windows" paragraph.
4. **Screenshots and promo images:** done, in `store/assets/`.
5. **Version:** already 1.0.0. Upload `dist/AddOrHide-1.0.0.zip` (rebuild it with `python tools/package.py` after any change).
6. **Expect a closer review:** requests for optional access to all sites and a content script on youtube.com/robots.txt are unusual. The justifications above explain both; keep them as written.
7. **Do not add** keywords such as "YouTube downloader", "ad blocker" or other site names to the listing text beyond the factual mentions above, and never use site logos.
