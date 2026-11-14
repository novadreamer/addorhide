# AddOrHide: Chrome Web Store submission pack

Release note: version 1.1.2 is the update to submit (1.1.0 plus Title Case group headings, the site fixes and details fill-in of 1.1.2, and the round neon power button). Same permissions as 1.0.13, so users are not asked to approve anything new. Upload `dist/AddOrHide-1.1.2.zip`, replace all five screenshots and both promo tiles with the files in `store/assets/` (regenerated 2026-11-05), paste the detailed description below, and update the Privacy tab: the data disclosure and the policy changed because 1.1.0 tracks playback on the device. If 1.0.13 is still in review, cancel that review or wait for it to finish, because the dashboard takes one submission at a time.

All the placeholders have been filled in. Field limits and required assets below come from the current Chrome Web Store documentation, except where marked "(dashboard limit)", which are limits the dashboard enforces that the docs page does not state.

---

## 1. Store listing tab

**Name** (dashboard limit 75): `AddOrHide`

**Summary** (dashboard limit 132):
Comes from the package (manifest description), nothing to type:
`Save videos, hide what you don't want, tag what you've watched and resume where you left off, on YouTube and sites you choose.`

**Category:** Entertainment (the dashboard no longer has "Productivity"; "Functionality & UI" is the alternative)
**Language:** English

**Detailed description**

```
AddOrHide puts you in charge of the videos on the sites you use. Keep what you like on your own list, hide what you don't, see at a glance what you've already watched, and pick up any video where you left off.

ADD OR HIDE, RIGHT ON THE THUMBNAIL
Point at a video on a supported site and small buttons appear:
- Add saves it to your Added Videos page.
- Hide removes it from the feed, with Undo.
- Hide channel removes everything from that channel on sites that show one, and you can bring it back from Hidden Videos.
- Hide the whole feed clears every recommendation on a page when you just want to search.

HIDE WHOLE CATEGORIES
Hide on this site lists what that site offers, such as Watched, Shorts, Playlists, Live or Movies & TV, and you can switch each one off. Add your own keywords, and hide whole rows by name on streaming sites. It works on sites you teach too, and Find all rows also looks through a site's genre pages.

KNOW WHAT YOU'VE WATCHED
A video counts as watched only after you really play about 90% of it, not when you open it or skip to the end. Watched videos get a tag on every thumbnail and on their own page, or you can hide them automatically. Remove a tag from any video with one click.
How a video counts as watched:
- Each video is split into 100 equal slices. A slice counts once you have actually played most of it, and the video counts as watched when 90 of them do, so skipping an intro and the credits is fine.
- Jumping ahead, playing faster than 2x or replaying the same part adds nothing new.
- Progress adds up across sessions, so a film watched over several evenings counts once it reaches 90%.
- On YouTube, a red progress bar at least 90% full under a thumbnail also counts, so videos you watched before installing AddOrHide or on another device are recognised too.
- Videos shorter than 20 seconds are not tracked, and neither is anything you play in a private window unless you saved it to Watch Later.
- With Watched switched on for a site, watched videos are hidden and listed under Hidden Videos > Watched. With it off, they stay in the feed with a Watched tag.
- Remove Watched takes the mark off a video until you play it to 90% again.

WATCH LATER AND CONTINUE WATCHING
Hover over the player on a video's own page and choose Add to Watch Later to save it for another time. Your list sits right under Continue Watching on the Added Videos page.
Once you play a saved video for a few seconds, it moves to Continue Watching on its own. Videos you start appear there with a progress bar and the time left. Open one and it resumes where you stopped, with a Start over button. Turn automatic adding off with one switch.

YOUR ADDED VIDEOS PAGE
- See everything on one page, or give Continue Watching, Watch Later, Channels and each website its own tab. With many websites, the rest wait behind a searchable More sites tab.
- Add a channel from a card that leads to one and it goes to your Channels list, right under Watch Later. Playlists, mixes and categories (such as one on Twitch's Browse page) are added or hidden like any card, under their website with the type Playlist or Category, and a card that plays a video saves the video, not its info page.
- Sort websites by name or by what you added last.
- Sort each site's videos by date, views, duration, year, channel or A-Z.
- Group them by channel, date added, decade, rating, type or genre. Options appear only when the site's videos can use them.
- Tag any video with your own type and genres.
- Click a video marked Popup player to watch it in a small floating window using the site's own official player, ads included.

YOUR HIDDEN VIDEOS PAGE
Hidden videos, hidden channels and watched videos are listed with the same sorting and grouping. Bring back one video, a whole website or every channel with Show all, or keep them hidden and tidy up the list.

WORKS ON
- YouTube, built in, with no setup.
- Popular movie and streaming sites with one click: open the popup there and choose Enable on this site.
- Any other site you choose. Click one thumbnail to show the extension what a video looks like, and the buttons appear on every similar one. The browser asks for permission one site at a time, and you can take it back whenever you like.

PRIVATE BY DESIGN
Everything stays on your device. AddOrHide has no accounts, no servers, no ads and no analytics, and it never sends your lists or your watch history to anyone. Nothing you play in a private window is recorded unless you saved that video to Watch Later. Clear your watch history at any time in Options.

BACKUPS
Use Export my data and Import data in Options to move your lists, Watch Later, watch history, site settings and preferences between installations. Imports merge with existing data; permissions are never included.

GOOD TO KNOW
- AddOrHide never hides or changes ads and never downloads videos.
- Details such as duration, views and genre appear only when the site shows them on the video's card. You can tag the rest yourself.
- Websites change their layout from time to time, which can occasionally affect the buttons. Please report problems at mybrainnoor@gmail.com.
- AddOrHide is free, with every feature included. If you find it useful, you can support it at https://ko-fi.com/ashmustafa (optional).
- Source code, release notes and a manual install: https://github.com/novadreamer/addorhide

AddOrHide is an independent project and is not affiliated with, endorsed by or sponsored by any of the websites it works on. All product names and trademarks belong to their owners.
```

**Graphic assets** (current requirements: store icon 128x128; at least 1 screenshot at 1280x800, up to 5; small promo tile 440x280 PNG or JPEG; marquee 1400x560 optional)

- **Store icon (128x128):** `store/assets/store-icon-128.png` (96x96 artwork with 16px transparent padding, per Google's icon guidelines).
- **Screenshots (1280x800):** done, in `store/assets/` (mock sites and drawn thumbnails only), upload in this order:
  1. `screenshot-1-add-or-hide.png`: *Add what you like. Hide what you don't.*
  2. `screenshot-2-continue-watching.png`: *Save it for later. Pick up where you left off.*
  3. `screenshot-3-hide-by-type.png`: *Hide whole categories in one click*
  4. `screenshot-4-tabs-sort-group.png`: *Your videos, organised your way*
  5. `screenshot-5-hidden.png`: *Changed your mind? Bring it back*
- **Small promo tile (440x280):** done, `store/assets/promo-small-440x280.png` ("Add it. Or hide it.").
- **Marquee (1400x560), optional:** done, `store/assets/promo-marquee-1400x560.png`.

**Privacy policy URL:** https://novadreamer.github.io/addorhide-player/privacy.html

**Optional fields:** Homepage URL `https://github.com/novadreamer/addorhide`, Support URL `https://github.com/novadreamer/addorhide/issues` (the repo is public since 1.0.7; email support stays mybrainnoor@gmail.com); leave "mature content" unchecked.

---

## 2. Privacy tab

**Single purpose description**
`AddOrHide lets you control the videos shown on video websites: save a video to your own list, hide it from a feed, and keep track of what you have watched so you can resume it or hide it.`

**Permission justifications**

| Permission | Justification to paste |
|---|---|
| `storage` | Saves the videos the user adds or hides, their watch progress (for Watched tags and Continue Watching), per-site settings and display preferences in local extension storage on the user's device. |
| `scripting` | Injects the extension's content script and, where needed, its card picker into a site the user has turned the extension on for, so the Add and Hide buttons appear without a page reload, and re-registers that script for the site after a restart. |
| `activeTab` | When the user opens the popup on a page, lets the extension read that tab's address to show the right controls and to start setup or the card picker on it. |
| Host permissions: `https://www.youtube.com/*`, `https://tubitv.com/*`, `https://www.tubitv.com/*` | Built-in support for these two sites: the extension adds its buttons to video cards there and hides cards the user previously hid. On YouTube it also builds the Added Videos page for private windows (see Test instructions). |
| Optional host permissions: `https://*/*`, `http://*/*` | Requested one site at a time, only when the user chooses "Enable on this site" in the popup, to run the extension on a site the user picks or to enable one-click support for a catalogued site. For sites whose video player sits on a separate host of the same service (for example player.pbs.org or geo.dailymotion.com), that host is requested in the same prompt so playback can be measured. They are never requested in bulk, are always user initiated, and the user can revoke each one with "Disable on this site". |
| Remote code | **No, I am not using remote code.** All scripts are packaged with the extension. |

**Data usage disclosure** (tick what applies; this is my reading of the Chrome Web Store user data guidance, which says local-only handling still requires disclosure. Confirm against the wording in your dashboard.)

- **Website content:** tick. The extension reads video links, titles and thumbnails from pages and stores those the user adds or hides, plus the title and thumbnail of videos the user plays.
- **Web history:** tick. The extension stores the addresses of videos the user adds, hides or plays on the sites where it is active. It does not record browsing generally, and in private windows only videos the user saved to Watch Later are recorded.
- **User activity:** tick conservatively. The extension stores how much of a video was played and where it stopped. It does not record clicks, keystrokes or mouse movement.
- Leave unticked: personally identifiable information, health, financial, authentication, personal communications, location.

**Certifications:** tick all three: not sold or transferred to third parties outside approved uses, not used for purposes unrelated to the single purpose, not used to determine creditworthiness or for lending. Certify compliance with the Limited Use policy.

**Privacy policy URL:** https://novadreamer.github.io/addorhide-player/privacy.html

**Test instructions for reviewers** (paste into the Distribution/test instructions field):

```
No account or login is needed.
1. Open https://tubitv.com/ (works logged out) and hover over any movie or TV tile: Add and Hide buttons appear centred at the top of the tile.
2. Click Add on a tile (it shows "Added"), then Hide on another tile (it disappears; an Undo message appears).
3. Click the AddOrHide toolbar icon. Click "Hidden Videos": a window lists the hidden video under Tubi with Restore and Remove. Back in the popup, click "Added Videos" to see the added video, grouped under Tubi. Use the Sort by control and the Tag button there.
4. Add a YouTube video (step 5), then on the Added Videos page click its thumbnail marked "Popup player". It opens the official YouTube player, with its normal ads, in one popup window; click another supported video to confirm the same window is reused. Twitch channels, videos and clips, and IMDb videos work the same way.
5. Watch Later: on a video's own page, hover over the player and click Add to Watch Later. It appears on the Added Videos page under Continue Watching. Play it for about 15 seconds and it moves to Continue Watching.
5a. Watch tracking, on Tubi or YouTube: play a video for over a minute and close it. Added Videos now shows it in Continue Watching; opening it resumes with a Start over button. Playing about 90% of a video puts a Watched tag on its thumbnails. Options, Watching has the switches and Clear watch history. All of this stays in local storage.
6. YouTube is also supported: the home feed (shown only to signed-in users) and any creator's page (for example `https://www.youtube.com/@NASA`, Home, Videos, Shorts and Live tabs), which works signed out.
7. Open https://www.imdb.com/chart/moviemeter/, open the popup and choose "Enable on this site". After the single-site permission prompt, Add and Hide buttons appear on the chart rows without using the picker.
8. Any other site: open the popup on it and click "Enable on this site". The browser asks for permission for that single site, then a picker asks you to click one video tile.
Note: browsers cannot open extension pages in private windows, so in a private window "Added Videos" opens https://www.youtube.com/robots.txt#addorhide-added. The extension's content script (restricted to that exact address) draws the Added Videos page there from the local list. It reads nothing from YouTube and sends nothing to it. IMDb title pages, Dailymotion, Tubi and TMDB entries do not have the popup player; their thumbnail labels open the original site.
```

---

## 3. Distribution tab

- **Visibility:** Public (or Unlisted for a beta first).
- **Regions:** all.
- **Trader status (EU):** Non-trader (individual, free extension, optional tips only). Switch to trader if you ever charge or run it as a business.
- **Publisher display name:** Ashraf Mustafa

---

## 4. Before you submit

1. **Fill the brackets** in the listing, the policy and the test instructions, and host the policy at a public address (a GitHub Pages file or any static page works). `store/privacy-policy.html` is a ready-to-host copy.
2. **Run the extension unpacked in Brave and Chrome** and complete the test instructions above yourself. Automation cannot click the browser's own permission prompt, so try **Enable on this site** once by hand.
3. **Confirm private-window storage:** hide something in a private window, close it, and see whether it is still hidden in a normal window. The policy says it is. If your test shows otherwise, fix the "Private windows" paragraph.
4. **Screenshots and promo images:** done, in `store/assets/`.
5. **Version:** 1.1.2. Keep site names in the listing to one or two (1.0.0 was rejected for listing too many, "Yellow Argon"). Upload `dist/AddOrHide-1.1.2.zip` (rebuild it with `python tools/package.py` after any change).
6. **Expect a closer review:** requests for optional access to all sites, content scripts in all frames of enabled sites and a content script on youtube.com/robots.txt are unusual. The justifications above explain both; keep them as written.
7. **Do not add** keywords such as "YouTube downloader", "ad blocker" or other site names to the listing text beyond the factual mentions above, and never use site logos.
