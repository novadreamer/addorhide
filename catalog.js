"use strict";

// Rule fields: id, name, builtIn, hosts, subdomains, cardSelector, linkSelector,
// titleCandidates, adMarkers, pathEquals, bulkHidePattern, bulkExtraSelector, gridSelector, removeClosest, removeClimb,
// variants[{cardSelector, pathPattern, linkSelector, titleCandidates,
// meta, typeByPath, typeByText, typeFixed, removeClosest, removeClimb}], and
// meta{duration, texts, year, rating, genres, score, votes, date, metaTexts}, channelCandidates,
// categories[{id,label,hint,card,containers,shelfTitle,pathPattern,fallback}].
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
      channelCandidates: Object.freeze([
        "ytd-channel-name #text", "ytd-channel-name a",
        ".ytContentMetadataViewModelMetadataRow:first-child .ytContentMetadataViewModelMetadataText", "a[href^=\"/@\"]"
      ]),
      categories: Object.freeze([
        { id: "recommended", label: "Recommended", hint: "Ordinary suggested videos on Home and next to a playing video", fallback: true, pathPattern: "^/($|watch)" },
        { id: "watched", label: "Watched", hint: "Videos you have watched (YouTube's red progress bar)", card: { has: "ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment, #progress.ytd-thumbnail-overlay-resume-playback-renderer" } },
        { id: "shorts", label: "Shorts", hint: "Short-form vertical videos", card: { is: "ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model, ytd-reel-item-renderer", href: "/shorts/" }, containers: "ytd-reel-shelf-renderer, ytd-rich-shelf-renderer[is-shorts], grid-shelf-view-model:has(ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model)", shelfTitle: "^Shorts$" },
        { id: "playlists", label: "Playlists", hint: "Playlists and collections", card: { has: "yt-collection-thumbnail-view-model, ytd-playlist-renderer, ytd-grid-playlist-renderer, ytd-compact-playlist-renderer", href: "list=(?!RD)" } },
        { id: "mixes", label: "Mixes", hint: "YouTube mixes and radio playlists", card: { has: "ytd-radio-renderer, ytd-compact-radio-renderer", href: "list=RD", text: "^(Mix -|My Mix)" } },
        { id: "live", label: "Live", hint: "Streams that are live now", card: { has: "[overlay-style=\"LIVE\"], .badge-style-type-live-now, .badge-style-type-live-now-alternate", text: "(^LIVE$|\\bwatching\\b)" }, shelfTitle: "^Live" },
        { id: "music", label: "Music", hint: "Music and official artist videos", card: { has: ".badge-style-type-verified-artist, [aria-label=\"Official Artist Channel\"], a[href*=\"music.youtube.com\"]", channel: "( - Topic|VEVO)$" }, shelfTitle: "(^|\\b)Music\\b" },
        // YouTube gives no reliable per-video gaming marker.  Title terms deliberately use the same
        // whole-word matcher as user keywords, while shelf titles cover game-less rows.
        { id: "gaming", label: "Gaming", hint: "Gaming shelves, and videos whose title names a game or gameplay", titleTerms: ["gameplay", "walkthrough", "playthrough", "let's play", "lets play", "speedrun", "speedrunning", "gaming", "gamer", "esports", "minecraft", "fortnite", "roblox", "gta", "gta 5", "gta v", "valorant", "league of legends", "call of duty", "warzone", "apex legends", "counter-strike", "cs2", "overwatch", "elden ring", "pokemon", "pokémon", "zelda", "mario kart", "super mario", "genshin impact", "among us", "rocket league", "fifa", "ea fc", "nba 2k", "dota", "world of warcraft", "skyrim", "the sims", "terraria", "baldur's gate", "cyberpunk 2077", "red dead", "resident evil", "final fantasy", "halo", "destiny 2", "rainbow six", "pubg", "free fire", "clash royale", "clash of clans", "brawl stars", "stardew valley", "hollow knight", "dark souls"], shelfTitle: "Gaming|Gameplay|Games" },
        { id: "podcasts", label: "Podcasts", hint: "Podcast videos and shelves", card: { href: "/podcasts|list=", text: "Podcast" }, shelfTitle: "Podcast" },
        { id: "movies", label: "Movies & TV", hint: "Movies, episodes and paid rentals", card: { is: "ytd-movie-renderer, ytd-grid-movie-renderer, ytd-compact-movie-renderer", text: "Free with ads|Buy or rent|Movie|Episode", channel: "^YouTube Movies" }, shelfTitle: "Movies|TV shows|Free movies" },
        { id: "posts", label: "Posts", hint: "Community posts", containers: "ytd-post-renderer, ytd-backstage-post-thread-renderer, ytd-rich-section-renderer:has(ytd-post-renderer, ytd-backstage-post-thread-renderer)", shelfTitle: "posts" },
        { id: "fundraisers", label: "Fundraisers", hint: "Donation and fundraiser shelves", containers: "ytd-donation-shelf-renderer, ytd-donation-unavailable-renderer", card: { text: "Fundraiser" }, shelfTitle: "Fundraiser" },
        { id: "comments", label: "Comments", hint: "The comments under videos and the Shorts comments panel", containers: "ytd-comments#comments, #comments.ytd-watch-flexy, ytd-item-section-renderer[section-identifier=\"comment-item-section\"], ytd-engagement-panel-section-list-renderer[target-id=\"engagement-panel-comments-section\"], ytd-engagement-panel-section-list-renderer[target-id=\"engagement-panel-comments\"]" }
      ]),
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
      // "Hide the whole feed" clears every video and Short on every YouTube page (the banner's Show brings them
      // back), plus what would be left as empty frames: playlists, podcasts and courses, and the shelves.
      bulkExtraSelector: "yt-lockup-view-model, grid-shelf-view-model, ytd-reel-shelf-renderer, ytd-rich-section-renderer, ytd-shelf-renderer"
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
      categories: Object.freeze([
        { id: "movies", label: "Movies", hint: "Movie tiles", card: { href: "^/movies/" } },
        { id: "series", label: "TV shows", hint: "Series tiles", card: { href: "^/series/" } },
        { id: "live", label: "Live TV", hint: "Live channels", card: { href: "^/live/", text: "\\bLive\\b" } },
        { id: "kids", label: "Kids & family", hint: "Kids, family and animation", card: { text: "Kids|Family|Animation" }, shelfTitle: "Kids|Family|Animation" },
        { id: "spanish", label: "En español", hint: "Spanish-language rows and tiles", card: { text: "Español|Spanish" }, shelfTitle: "Español|Spanish" }
      ]),
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
      categories: Object.freeze([
        { id: "trailers", label: "Trailers & videos", hint: "IMDb video cards", card: { href: "/video/vi" } },
        { id: "tv", label: "TV shows", hint: "TV series and episodes", card: { text: "TV Series|TV Mini Series|Episode" }, pathPattern: "^/(chart/tvmeter|chart/toptv)" },
        { id: "movies", label: "Movies", hint: "Movie title cards", fallback: true }
      ]),
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
      categories: Object.freeze([
        { id: "movies", label: "Movies", hint: "Movie results", card: { href: "^/movie/" } },
        { id: "tv", label: "TV shows", hint: "TV results", card: { href: "^/tv/" } }
      ]),
      variants: Object.freeze([
        // The Recommendations row on a movie or TV page.
        Object.freeze({
          cardSelector: "#recommendation_scroller div.item",
          pathPattern: "^/(movie|tv)/",
          linkSelector: 'a[href^="/movie/"], a[href^="/tv/"]',
          titleCandidates: Object.freeze(["a.title", "a[title]"]),
          meta: Object.freeze({ year: ".release_date" })
        })
      ]),
      categories: Object.freeze([{ id: "live", label: "Live", hint: "Live videos", card: { text: "\\bLive\\b" } }])
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
      meta: Object.freeze({ texts: Object.freeze(["*"]), genres: 'a[data-a-target="preview-card-game-link"]' }),
      channelCandidates: Object.freeze(["h4", "h3", 'a[data-a-target="preview-card-channel-link"]']),
      categories: Object.freeze([
        { id: "live", label: "Live channels", hint: "Channels currently streaming", card: { has: 'a[data-a-target="preview-card-image-link"]', text: "\\bLIVE\\b" } },
        { id: "videos", label: "Past broadcasts & videos", hint: "Recorded Twitch videos", card: { href: "/videos/" } },
        { id: "clips", label: "Clips", hint: "Short Twitch clips", card: { href: "/clip/" } }
      ])
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
