"use strict";

// Rule fields: id, name, builtIn, hosts, subdomains, cardSelector, linkSelector,
// titleCandidates, adMarkers, pathEquals, bulkHidePattern, bulkExtraSelector, gridSelector, removeClosest, removeClimb,
// variants[{cardSelector, pathPattern, linkSelector, titleCandidates,
// meta, typeByPath, typeByText, typeFixed, removeClosest, removeClimb}], and
// meta{duration, texts, year, rating, genres, score, votes, date, metaTexts}.
// var, not const: the popup re-injects this file (picker, Enable) into pages that already have it,
// and a second const declaration in the same content-script world throws and aborts the injection.
var HOA_CATALOG = Object.freeze((() => {
  const YOUTUBE_LINK = 'a[href*="/watch?v="], a[href*="/shorts/"]';
  const YOUTUBE_TITLES = Object.freeze([
    "a.ytLockupMetadataViewModelTitle", ".ytLockupMetadataViewModelHeadingReset",
    "#video-title", "a#video-title-link", "yt-formatted-string#video-title",
    ".yt-lockup-metadata-view-model-wiz__title", "h3 a[title]", "a[title]"
  ]);
  const rules = Object.freeze([
    Object.freeze({
      id: "youtube",
      name: "YouTube",
      builtIn: true,
      hosts: Object.freeze(["youtube.com"]),
      subdomains: true,
      cardSelector: "ytd-rich-item-renderer",
      linkSelector: YOUTUBE_LINK,
      titleCandidates: YOUTUBE_TITLES,
      adMarkers: Object.freeze([
        "ytd-ad-slot-renderer", "ytd-in-feed-ad-layout-renderer",
        "ytd-display-ad-renderer", "ytd-promoted-sparkles-web-renderer", "ytd-search-pyv-renderer"
      ]),
      meta: Object.freeze({
        duration: Object.freeze([".ytBadgeShapeText", "ytd-thumbnail-overlay-time-status-renderer #text", "span.ytd-thumbnail-overlay-time-status-renderer"]),
        metaTexts: Object.freeze([".ytContentMetadataViewModelMetadataText", "#metadata-line span"])
      }),
      // Cards everywhere ytd-rich-item-renderer is used (home, subscriptions, a creator's Videos/Shorts/Live
      // tabs). Everywhere else YouTube uses the card types below, on every page (home layouts YouTube is testing,
      // search, a creator's Home tab, the watch-page sidebar, history). Playlists and mixes are left alone; a card
      // inside ytd-rich-item-renderer is handled once, through that wrapper.
      variants: Object.freeze([
        Object.freeze({
          cardSelector: 'yt-lockup-view-model:has(a[href*="/watch?v="]):not(:has(yt-collection-thumbnail-view-model)), ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer',
          linkSelector: YOUTUBE_LINK,
          titleCandidates: YOUTUBE_TITLES,
          // Hide the card's own slot too (a wrapper holding only this card), so the row closes the gap.
          removeClimb: true
        }),
        Object.freeze({
          cardSelector: "ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model, ytd-reel-item-renderer",
          linkSelector: 'a[href*="/shorts/"]',
          titleCandidates: Object.freeze(["h3", "[aria-label]"]),
          removeClimb: true
        })
      ]),
      // "Hide the whole feed" covers the recommendations: the home feed and the sidebar beside a video. Search
      // results and a creator's page are things the user asked for, so they stay.
      bulkHidePattern: "^/(watch)?$",
      bulkExtraSelector: "yt-lockup-view-model"
    }),
    Object.freeze({
      id: "tubi",
      name: "Tubi",
      builtIn: true,
      hosts: Object.freeze(["tubitv.com"]),
      subdomains: true,
      cardSelector: '[data-test-id="web-ui-content-tile"]',
      linkSelector: "a.web-content-tile__poster-link",
      titleCandidates: Object.freeze([".web-content-tile__title"]),
      adMarkers: Object.freeze([]),
      meta: Object.freeze({
        duration: ".web-content-tile__duration",
        year: ".web-content-tile__year",
        rating: ".web-rating",
        genres: ".web-content-tile__tags"
      }),
      removeClosest: '[data-test-id="web-ui-grid-item"]',
      gridSelector: "",
      variants: Object.freeze([
        // "You may also like" on a movie or series page: each poster is a link card in the page's grid.
        Object.freeze({
          cardSelector: '[data-test-id="web-ui-grid-container"] a[href^="/movies/"]:has(img):has(h3), [data-test-id="web-ui-grid-container"] a[href^="/series/"]:has(img):has(h3)',
          pathPattern: "^/(movies|series)/",
          linkSelector: 'a[href^="/movies/"], a[href^="/series/"]',
          titleCandidates: Object.freeze(["h3"]),
          meta: Object.freeze({ texts: Object.freeze([".web-attributes__year-duration"]), rating: ".web-attributes__rating-badge" }),
          removeClosest: "",
          removeClimb: true
        })
      ])
    }),
    Object.freeze({
      id: "imdb", name: "IMDb", builtIn: false, hosts: Object.freeze(["imdb.com"]), subdomains: true,
      cardSelector: "li.ipc-metadata-list-summary-item", linkSelector: "a.ipc-title-link-wrapper",
      titleCandidates: Object.freeze([".ipc-title__text"]),
      meta: Object.freeze({ texts: Object.freeze([".ipc-inline-list__item"]), score: ".ipc-rating-star--rating", votes: ".ipc-rating-star--voteCount" }),
      variants: Object.freeze([
        Object.freeze({
          cardSelector: '.ipc-poster-card:has(a[href*="/title/tt"])',
          // Trailer pages reuse poster cards whose main overlay opens the video; save that video, not the title.
          linkSelector: 'a.ipc-lockup-overlay[href*="/video/vi"], a[href*="/title/tt"]',
          titleCandidates: Object.freeze([".ipc-poster-card__title"]),
          meta: Object.freeze({ score: ".ipc-rating-star--rating", texts: Object.freeze([".ipc-inline-list__item"]) })
        }),
        Object.freeze({
          cardSelector: '.ipc-slate-card:has(a[href*="/video/vi"])',
          linkSelector: 'a[href*="/video/vi"]',
          titleCandidates: Object.freeze([".ipc-slate-card__title-text", ".ipc-slate-card__title"]),
          meta: Object.freeze({ duration: Object.freeze([".ipc-lockup-overlay__text", ".ipc-slate-card__metadata", ".ipc-slate-card__metadata-item"]), texts: Object.freeze([".ipc-lockup-overlay__text", ".ipc-slate-card__metadata", ".ipc-slate-card__type"]) }),
          typeByText: Object.freeze([["trailer", "trailer"]])
        })
      ]),
      typeByPath: Object.freeze([["/chart/tvmeter", "tv"], ["/chart/toptv", "tv"], ["/chart/moviemeter", "movie"], ["/chart/top/", "movie"], ["/chart/boxoffice", "movie"]]),
      typeByText: Object.freeze([["^TV (Mini )?Series$", "tv"], ["^TV Movie$", "movie"]])
    }),
    Object.freeze({
      id: "tmdb", name: "TMDB", builtIn: false, hosts: Object.freeze(["themoviedb.org"]), subdomains: true,
      cardSelector: "#media-list .media-list-results > div[data-object-id]",
      linkSelector: 'a[href^="/movie/"], a[href^="/tv/"]', titleCandidates: Object.freeze(["h2"]),
      meta: Object.freeze({ date: ".release_date" }),
      variants: Object.freeze([
        // The Recommendations row on a movie or TV page.
        Object.freeze({
          cardSelector: "#recommendation_scroller div.item",
          pathPattern: "^/(movie|tv)/",
          linkSelector: 'a[href^="/movie/"], a[href^="/tv/"]',
          titleCandidates: Object.freeze(["a.title", "a[title]"]),
          meta: Object.freeze({ year: ".release_date" })
        })
      ])
    }),
    Object.freeze({
      id: "dailymotion", name: "Dailymotion", builtIn: false, hosts: Object.freeze(["dailymotion.com"]), subdomains: true,
      cardSelector: 'ul[data-testid="page-layout-grid"] > li', linkSelector: 'a[href^="/video/"]',
      titleCandidates: Object.freeze(['[class*="HomeVideoInfo__titleContent"]', "h2"]),
      variants: Object.freeze([
        Object.freeze({
          cardSelector: '[data-testid="video-card"]',
          linkSelector: 'a[href^="/video/"]',
          titleCandidates: Object.freeze(['[class*="VideoCard__videoTitleLink"]', '[class*="VideoCard__videoTitle"]']),
          meta: Object.freeze({
            duration: '[class*="videoDuration"]',
            texts: Object.freeze(['[class*="PubDate"]'])
          }),
          removeClimb: true
        })
      ])
    }),
    Object.freeze({
      id: "twitch", name: "Twitch", builtIn: false, hosts: Object.freeze(["twitch.tv"]), subdomains: true,
      cardSelector: 'article:has(a[data-a-target="preview-card-image-link"])',
      linkSelector: 'a[data-a-target="preview-card-image-link"]', titleCandidates: Object.freeze(["h4", "h3"]),
      typeFixed: "live", removeClimb: true,
      meta: Object.freeze({ texts: Object.freeze(["*"]), genres: 'a[data-a-target="preview-card-game-link"]' })
    })
  ]);

  function find(hostname) {
    if (typeof hostname !== "string") {
      return null;
    }
    const host = hostname.toLowerCase();
    return rules.find(rule => rule.hosts.some(ruleHost => host === ruleHost
      || (rule.subdomains === true && host.endsWith(`.${ruleHost}`)))) || null;
  }

  function byId(id) {
    return typeof id === "string" ? rules.find(rule => rule.id === id) || null : null;
  }

  return { rules, find, byId };
})());

if (typeof module !== "undefined") {
  module.exports = HOA_CATALOG;
}
