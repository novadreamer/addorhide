# AddOrHide Privacy Policy

**Effective date:** October 9, 2026
**Developer:** Ashraf Mustafa
**Contact:** mybrainnoor@gmail.com

## The short version

AddOrHide does not collect your data. It has no servers, no accounts, no analytics and no ads. The videos you add or hide, and your settings, are stored only in your own browser, on your own device. We never receive them, sell them or share them.

## What AddOrHide stores on your device

The extension stores the following in your browser's local extension storage:

- **Videos you add or hide.** When you click **Add** or **Hide** on a video, the extension saves that video's web address, title, thumbnail address and site name, along with any of these that the video's card shows on the page: duration, view count, publish date or year, rating, genres, and the site's icon address. It also saves the time you took the action and, if you choose to tag a video, the type and genres you enter.
- **Site settings.** The sites where you turned the extension on, the card pattern (a CSS selector) learned when you use the card picker, and your "hide the whole feed" switches.
- **Page preferences.** How you sorted, grouped or collapsed each site on the Added Videos page.

Nothing is saved from a page until you click Add or Hide, except your settings and preferences. On sites where the extension is active, it reads the links and titles of the video cards on the page, on your device only, so it can place its buttons and keep videos you already hid out of view. This information is not stored or sent anywhere.

## How the data is used

Only to provide the extension's single purpose: showing the videos you added on your own Added Videos page and hiding videos from recommendation feeds. It is not used for advertising, profiling, analytics or any other purpose, and it is never sold or transferred to anyone.

No person reads your data. It never leaves your browser.

## Where the data lives and how to delete it

The data is kept in the extension's local storage in your browser profile. It is **not** sent to our servers and it is not synced across devices by the extension. Your browser or operating system may include it in its own profile backups, according to your settings.

You can delete your data at any time:

- **Hidden videos:** **Restore** in the Hidden Videos window (opened from the extension popup) deletes a video's record and brings the video back to the feed. **Unhide everything** in Options deletes all hidden-video records. (**Remove** in that window only takes a video off the list while keeping it hidden, so its record stays until you restore it or use Unhide everything.)
- **Added videos:** **Remove** on a card deletes that video's record, and **Clear page** deletes all of them.
- **Site settings:** **Forget** in Options deletes a site's saved settings. (**Disable** turns the extension off for the site but keeps the saved settings.)
- **Everything:** removing the extension deletes all the data it stored.

## Private windows

If you allow the extension to run in private (incognito) windows, videos you add or hide there are saved in the same extension storage used by your normal windows. They remain after the private window is closed until you delete them as described above. If you do not want this, do not enable the extension in private windows.

## Popup player

On the Added Videos page, clicking the picture of a video marked **Popup player** opens a window on novadreamer.github.io (GitHub Pages), a page that only hosts the site's official embed player. The video's id and title are passed after `#` in the address, a part browsers never send to the server, so GitHub does not learn what you play. The official player (YouTube, Twitch, IMDb) then loads from that site under its own privacy policy, with its own ads and cookies, exactly like an embedded video on any website.

## Network requests the extension makes

The extension does not send your data to the developer. These requests happen directly between your browser and the sites involved, as they would for any web page:

- **Images.** The Added Videos page and the Hidden Videos window show thumbnails and site icons by loading them from the site they came from (for example i.ytimg.com or a site's own favicon). Those sites can see that your browser requested the image, as they would for any image.
- **Adding a video by link.** If you add a YouTube link from the Options page, the extension asks YouTube's public oEmbed service for the video's title, sending the link you typed.
- **Private-window Added page.** Browsers cannot show an extension's own pages in private windows, so in a private window the extension builds the Added Videos page on an address on youtube.com (youtube.com/robots.txt). Loading that address contacts YouTube, but the contents of your list are shown by the extension on your device and are not sent to YouTube.
- **The sites you visit.** Your use of YouTube, Tubi and any other site is between you and that site and is covered by their own policies.

The extension does not download or run code from the internet.

## Permissions

- **storage** keeps your lists, settings and preferences on your device.
- **scripting** and **activeTab** let the extension add its buttons and the card picker to the page you are on, and turn itself on for a site you choose.
- **Access to YouTube and Tubi** lets the extension work on those sites. It is also needed to read the cards you act on.
- **Optional access to other sites** is requested one site at a time, only when you choose to enable the extension there, and you can revoke it at any time with Disable.

## Limited Use

The use of information received from web pages is limited to providing and improving the extension's single purpose, which is described above. The extension does not sell this information, does not use or transfer it for personalized advertising, does not use or transfer it to determine creditworthiness or for lending, and does not allow humans to read it.

## Children

AddOrHide is a general-purpose tool and is not directed at children under 13. It has no accounts and collects no personal information.

## Changes to this policy

If this policy changes, the new version will be posted at this address with a new effective date, and material changes will be noted in the extension's release notes.

## Not affiliated

AddOrHide is an independent project. It is not affiliated with, endorsed by or sponsored by YouTube, Google, Tubi or any other streaming service. All product names and trademarks belong to their owners.

## Contact

Questions about this policy: mybrainnoor@gmail.com
