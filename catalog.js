"use strict";

// Rule fields: id, name, builtIn, hosts, subdomains, cardSelector, linkSelector,
// titleCandidates, adMarkers, pathEquals, bulkHidePattern, bulkExtraSelector, gridSelector, removeClosest, removeClimb,
// variants[{cardSelector, pathPattern, linkSelector, titleCandidates,
// meta, typeByPath, typeByText, typeFixed, removeClosest, removeClimb}], and
// meta{duration, texts, year, rating, genres, score, votes, date, metaTexts}, channelCandidates,
// categories[{id,label,hint,card,containers,shelfTitle,pathPattern,fallback}].
// var, not const: the popup re-injects this file (picker, Enable) into pages that already have it,
// and a second const declaration in the same content-script world throws and aborts the injection.
// Kept outside the catalog so the content script uses precisely the same progress
// selector for filtering and for the CSS-drawn Watched marker.
var HOA_WATCHED_SELECTOR = "ytd-thumbnail-overlay-resume-playback-renderer, yt-thumbnail-overlay-progress-bar-view-model, [class*='WatchedProgressBarSegment'], [class*='ResumePlayback'], #progress.ytd-thumbnail-overlay-resume-playback-renderer";

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
        { id: "watched", label: "Watched", hint: "Videos you have watched (YouTube's red progress bar)", card: { has: HOA_WATCHED_SELECTOR } },
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
        { id: "spanish", label: "En español", hint: "Spanish-language rows and tiles", card: { text: "Español|Spanish" }, shelfTitle: "Español|Spanish" },
        { id: "unsafe-kids", label: "Unsafe for children", hint: "Rated PG-13, TV-14, R, NC-17, TV-MA, 16+/18+, or unrated", card: { ratings: ["PG13", "TV14", "R", "NC17", "TVMA", "X", "16+", "18+", "NR"] } },
        { id: "mature", label: "Mature only", hint: "Rated R, NC-17, TV-MA, X, or 18+", card: { ratings: ["R", "NC17", "TVMA", "X", "18+"] } }
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
        }),
        Object.freeze({
          cardSelector: '[data-observer-listener-key]:has(.web-content-tile__label-top-left):has(.web-attributes)',
          linkSelector: 'a[href^="/movies/"], a[href^="/series/"]',
          titleCandidates: Object.freeze(["h2", "a[title]", "img[alt]"]),
          meta: Object.freeze({ texts: Object.freeze([".web-attributes__year-duration"]), rating: ".web-attributes__rating-badge", genres: ".web-attributes__year-duration" }),
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
      channelLinkSelector: 'a[data-a-target="preview-card-channel-link"]',
      channelCandidates: Object.freeze(["h4", "h3", 'a[data-a-target="preview-card-channel-link"]']),
      categories: Object.freeze([
        { id: "live", label: "Live channels", hint: "Channels currently streaming", card: { has: 'a[data-a-target="preview-card-image-link"]', text: "\\bLIVE\\b" } },
        { id: "videos", label: "Past broadcasts & videos", hint: "Recorded Twitch videos", card: { href: "/videos/" } },
        { id: "clips", label: "Clips", hint: "Short Twitch clips", card: { href: "/clip/" } }
      ])
    }),
    Object.freeze({
      id: "xumo", name: "Xumo Play", builtIn: false, hosts: Object.freeze(["play.xumo.com"]), subdomains: false,
      cardSelector: "li.card.titleCard:not(.promoCard)", removeClosest: "li.card.titleCard", linkSelector: "a[href]", titleCandidates: Object.freeze(["a[aria-label]", "img[alt]"]),
      categories: Object.freeze([
        { id: "movies", label: "Movies", hint: "On-demand movies", card: { href: "/free-movies/" } },
        { id: "tv", label: "TV shows", hint: "On-demand TV series", card: { href: "/tv-shows/" } },
        { id: "live", label: "Live channels", hint: "Live guide and network channels", card: { href: "/live-guide/|/networks/" } }
      ])
    }),
    Object.freeze({
      id: "pluto", name: "Pluto TV", builtIn: false, hosts: Object.freeze(["pluto.tv"]), subdomains: true,
      cardSelector: 'div.swiper-slide:has(a[data-testid="region-link"]), a[data-testid="region-link"]:not(div.swiper-slide a[data-testid="region-link"])', removeClosest: 'div.swiper-slide, a[data-testid="region-link"]', linkSelector: 'a[data-testid="region-link"]', titleCandidates: Object.freeze(["a[aria-label]", "img[alt]"]),
      pageData: Object.freeze({ script: "script#__NEXT_DATA__", idFromHref: "(?:movies|shows|series)/([0-9a-f]{24})", idKeys: Object.freeze(["id", "contentId", "movieId"]), fields: Object.freeze({ cast: "castNames", genres: "genre", description: "description", rating: "regionalRating.rating", kids: "isKidsContent" }) }),
      categories: Object.freeze([
        { id: "movies", label: "Movies", hint: "Movie tiles", card: { href: "/movies/" } },
        { id: "tv", label: "TV shows", hint: "Series tiles", card: { href: "/shows/|/series/" } },
        { id: "live", label: "Live TV", hint: "Live TV tiles", card: { href: "/live-tv/" } },
        { id: "kids", label: "Kids & family", hint: "Tiles marked as kids content", card: { kids: true } },
        { id: "unsafe-kids", label: "Unsafe for children", hint: "Rated PG-13, TV-14, R, NC-17, TV-MA, 16+/18+, or unrated", card: { ratings: ["PG13", "TV14", "R", "NC17", "TVMA", "X", "16+", "18+", "NR"] } }
      ])
    }),
    Object.freeze({
      id: "roku", name: "The Roku Channel", builtIn: false, hosts: Object.freeze(["therokuchannel.roku.com"]), subdomains: false,
      cardSelector: "li.movie, li.series, li[data-row][data-col]", removeClosest: "li.movie, li.series, li[data-row][data-col]", linkSelector: 'a[itemprop="url"]', titleCandidates: Object.freeze(["[aria-label]", 'meta[itemprop="name"]']),
      meta: Object.freeze({ texts: Object.freeze([".title-label", '[data-test-id="content-indicator-container"]']) }),
      categories: Object.freeze([
        { id: "movies", label: "Movies", hint: "Movie tiles", card: { is: "li.movie" } },
        { id: "tv", label: "TV shows", hint: "Series tiles", card: { is: "li.series" } },
        { id: "unsafe-kids", label: "Unsafe for children", hint: "Rated PG-13, TV-14, R, NC-17, TV-MA, 16+/18+, or unrated", card: { ratings: ["PG13", "TV14", "R", "NC17", "TVMA", "X", "16+", "18+", "NR"] } }
      ])
    }),
    Object.freeze({
      id: "fandango", name: "Fandango at Home", builtIn: false, hosts: Object.freeze(["athome.fandango.com", "fandangoathome.com", "vudu.com"]), subdomains: true,
      cardSelector: '[class*="carousel-default-styles__item"]', removeClosest: '[class*="carousel-default-styles__item"]', linkSelector: 'a[href*="/content/browse/details/"]', titleCandidates: Object.freeze(["img[alt]", "a[aria-label]"]),
      categories: Object.freeze([
        { id: "free", label: "Free with ads", hint: "Free or Free to Watch titles", card: { text: "Free to Watch|\\bFree\\b" } },
        { id: "paid", label: "Rent or buy", hint: "Titles that are not marked free", fallback: true }
      ])
    }),
    Object.freeze({
      id: "crunchyroll", name: "Crunchyroll", builtIn: false, hosts: Object.freeze(["crunchyroll.com"]), subdomains: true,
      cardSelector: '[class*="browse-card--"]:not([class*="hover"])', removeClosest: '[class*="browse-card--"]:not([class*="hover"])', linkSelector: 'a[href^="/series/"], a[href^="/watch/"]', titleCandidates: Object.freeze(['[class*="browse-card-hover"] [class*="title"]', "img[alt]", "a[aria-label]"]),
      categories: Object.freeze([
        { id: "series", label: "Series", hint: "Series cards", card: { href: "/series/" } },
        { id: "movies", label: "Movies", hint: "Movies and movie labels", card: { href: "/watch/", text: "\\bMovie\\b" } },
        { id: "dubbed", label: "Dubbed", hint: "Cards with a Dub label", card: { text: "\\bDub(bed)?\\b" } },
        { id: "subbed", label: "Subtitled only", hint: "Cards marked Sub or Subtitled, without a dub", card: { text: "\\bSub(titled)?\\b", withoutText: "\\bDub(bed)?\\b" } }
      ])
    }),
    Object.freeze({
      id: "odysee", name: "Odysee", builtIn: false, hosts: Object.freeze(["odysee.com"]), subdomains: true,
      cardSelector: "li.claim-preview__wrapper", removeClosest: "li.claim-preview__wrapper", linkSelector: 'a[href^="/@"]:has(.claim-preview__title), .claim-tile__header a[href^="/@"]', titleCandidates: Object.freeze([".claim-preview__title", "a[aria-label]"]),
      channelLinkSelector: 'a[href^="/@"]:not(:has(.claim-preview__title))', channelCandidates: Object.freeze([".channel-name"]), meta: Object.freeze({ duration: ".claim-preview__overlay-properties span" }),
      categories: Object.freeze([
        { id: "live", label: "Live", hint: "Live streams", card: { text: "\\bLIVE\\b" } },
        { id: "shorts", label: "Shorts", hint: "Videos one minute or shorter", card: { maxSeconds: 60 } }
      ])
    }),
    Object.freeze({
      id: "kick", name: "Kick", builtIn: false, hosts: Object.freeze(["kick.com"]), subdomains: true,
      cardSelector: 'div:has(> a[data-testid="media-card-thumbnail"])', removeClosest: 'div:has(> a[data-testid="media-card-thumbnail"])', linkSelector: 'a[data-testid="media-card-thumbnail"]', titleCandidates: Object.freeze(["a[data-card-link]", "a[title]"]),
      channelLinkSelector: 'a[data-card-link]', channelCandidates: Object.freeze(['a[href^="/"]:not([data-testid="media-card-thumbnail"])']),
      categories: Object.freeze([
        { id: "gambling", label: "Gambling", hint: "Casino, betting and gambling streams", card: { text: "Slots & Casino|\\bCasino\\b|\\bSlots\\b|\\bPoker\\b|Blackjack|Roulette|Gambling|Plinko|Sports betting" } },
        { id: "chatting", label: "Just Chatting / IRL", hint: "Chatting and IRL streams", card: { text: "Just Chatting|\\bIRL\\b" } },
        { id: "gaming", label: "Gaming", hint: "Streams not marked gambling or chatting", fallback: true }
      ])
    }),
    Object.freeze({
      id: "rumble", name: "Rumble", builtIn: false, hosts: Object.freeze(["rumble.com"]), subdomains: true,
      cardSelector: "rum-video-thumbnail", removeClosest: "rum-video-thumbnail", linkSelector: 'a[href*=".html"], a[href*="/shorts/"]', linkAttribute: "url", stripQuery: true, titleCandidates: Object.freeze(["[video-title]"]),
      channelHrefAttribute: "creator-url", channelNameAttribute: "name",
      categories: Object.freeze([
        { id: "live", label: "Live", hint: "Live streams", card: { text: "\\bLIVE\\b" } },
        { id: "shorts", label: "Shorts", hint: "Rumble Shorts", card: { href: "/shorts/" } },
        { id: "videos", label: "Videos", hint: "Videos that are not live or Shorts", fallback: true }
      ])
    }),
    Object.freeze({
      id: "pbs", name: "PBS", builtIn: false, hosts: Object.freeze(["pbs.org"]), subdomains: true,
      cardSelector: 'a[class*="show_poster__link"]', removeClosest: 'a[class*="show_poster__link"]', linkSelector: 'a[class*="show_poster__link"]', titleCandidates: Object.freeze(["img[alt]"]), categories: Object.freeze([])
    }),
    Object.freeze({
      id: "vix", name: "ViX", builtIn: false, hosts: Object.freeze(["vix.com"]), subdomains: true,
      cardSelector: '[data-testid="content-card"]', removeClosest: '[data-testid="content-card"]', linkSelector: 'a[href^="/detail/"]', titleCandidates: Object.freeze(["img[alt]", "h3"]), categories: Object.freeze([])
    }),
    Object.freeze({
      id: "shout", name: "Shout! TV", builtIn: false, hosts: Object.freeze(["shout-tv.com"]), subdomains: true,
      cardSelector: "div.content-pager__item", removeClosest: "div.content-pager__item", linkSelector: "a[data-content-type]", titleCandidates: Object.freeze(["a[aria-label]", "img[alt]", ".card-title__title"]),
      categories: Object.freeze([
        { id: "live", label: "Live", hint: "Live channels", card: { has: '[data-card-type="LIVE"]' } },
        { id: "vod", label: "Movies & episodes", hint: "On-demand titles", card: { has: '[data-card-type="VOD"]' } },
        { id: "signin", label: "Needs sign-up", hint: "Titles that require sign-in", card: { has: '[data-access-level="GRANTED_ON_SIGN_IN"]' } }
      ])
    }),
    Object.freeze({
      id: "justwatch", name: "JustWatch", builtIn: false, hosts: Object.freeze(["justwatch.com"]), subdomains: true,
      cardSelector: '[data-testid="titleItem"]', removeClosest: '[data-testid="titleItem"]', linkSelector: "a[href]", titleCandidates: Object.freeze(['[data-title]']),
      categories: Object.freeze([
        { id: "movies", label: "Movies", hint: "Movie titles", card: { href: "/movie/" } },
        { id: "tv", label: "TV shows", hint: "TV titles", card: { href: "/tv-show/" } }
      ])
    }),
    Object.freeze({
      id: "rottentomatoes", name: "Rotten Tomatoes", builtIn: false, hosts: Object.freeze(["rottentomatoes.com"]), subdomains: true,
      cardSelector: "div.discovery-tiles__wrap > div.flex-container", removeClosest: "div.discovery-tiles__wrap > div.flex-container", linkSelector: 'a[href^="/m/"], a[href^="/tv/"]', titleCandidates: Object.freeze(["rt-img[alt]", "a[aria-label]"]),
      categories: Object.freeze([
        { id: "movies", label: "Movies", hint: "Movie tiles", card: { href: "/m/" } },
        { id: "tv", label: "TV shows", hint: "TV tiles", card: { href: "/tv/" } },
        { id: "rotten", label: "Rotten", hint: "Critics scores below 60%", card: { scoreBelow: 60 } }
      ])
    }),
    Object.freeze({
      id: "letterboxd", name: "Letterboxd", builtIn: false, hosts: Object.freeze(["letterboxd.com"]), subdomains: true,
      cardSelector: "li.posteritem", removeClosest: "li.posteritem", linkSelector: 'a[href^="/film/"]', titleCandidates: Object.freeze(['[data-item-name]', "a[title]"]),
      categories: Object.freeze([{ id: "adult", label: "Adult themed", hint: "Adult-themed films", card: { has: '[data-resolvable-poster-path*="\\\"isAdultThemed\\\":true"]' } }])
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
