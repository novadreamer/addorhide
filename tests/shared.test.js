"use strict";

const assert = require("node:assert/strict");
const HOA = require("../shared.js");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

const id = "dQw4w9WgXcQ";
const id2 = "9bZkp7q19f0";
const watch = `https://www.youtube.com/watch?v=${id}`;
const short = `https://www.youtube.com/shorts/${id2}`;
const now = Date.UTC(2026, 0, 31);

check("canonical YouTube short URL", () => assert.equal(HOA.canonicalUrl(`https://youtu.be/${id}?utm_source=x`), watch));
check("canonical YouTube tracking params", () => assert.equal(HOA.canonicalUrl(`${watch}&list=abc&index=2#comments`), watch));
check("canonical short", () => assert.equal(HOA.canonicalUrl(`${short}?si=abc#x`), short));
check("canonical generic URL", () => assert.equal(HOA.canonicalUrl("https://example.com/path/?b=2&utm_source=x&a=1#hash"), "https://example.com/path?a=1&b=2"));
check("canonical IMDb title URL", () => assert.equal(HOA.canonicalUrl("https://m.imdb.com/title/tt31450459/?ref_=chtmvm_i_1&foo=ignored#hash"), "https://www.imdb.com/title/tt31450459"));
check("canonical IMDb name URL", () => assert.equal(HOA.canonicalUrl("https://imdb.com/name/nm1234567/filmography?foo=ignored#hash"), "https://www.imdb.com/name/nm1234567"));
check("canonical IMDb list URL", () => assert.equal(HOA.canonicalUrl("https://www.imdb.com/list/ls1234567/?ref_=x#hash"), "https://www.imdb.com/list/ls1234567"));
check("canonical IMDb video URL", () => assert.equal(HOA.canonicalUrl("https://www.imdb.com/video/vi1234567/?ref_=hm_tv_1"), "https://www.imdb.com/video/vi1234567"));
check("canonical IMDb non-title URL", () => assert.equal(HOA.canonicalUrl("https://m.imdb.com/chart/moviemeter/?ref_=x&pf_rd_i=y&foo=1#hash"), "https://www.imdb.com/chart/moviemeter?foo=1"));
check("canonical ref tracking params", () => assert.equal(HOA.canonicalUrl("https://example.com/path?ref_=x&pf_rd_i=y&ref_source=z&keep=1"), "https://example.com/path?keep=1"));
check("reject unsafe URL", () => assert.equal(HOA.canonicalUrl("javascript:alert(1)"), null));
check("reject invalid YouTube id", () => assert.equal(HOA.canonicalUrl("https://www.youtube.com/watch?v=bad"), null));
check("player maps YouTube watch", () => assert.deepEqual(HOA.playerFor(watch), {
  hash: `site=youtube&id=${id}`, siteName: "YouTube"
}));
check("player maps YouTube short", () => assert.deepEqual(HOA.playerFor(short), {
  hash: `site=youtube&id=${id2}`, siteName: "YouTube"
}));
check("player maps Twitch channel", () => assert.deepEqual(HOA.playerFor("https://www.twitch.tv/Some_Channel"), {
  hash: "site=twitch&channel=Some_Channel", siteName: "Twitch"
}));
check("player maps Twitch video", () => assert.deepEqual(HOA.playerFor("https://www.twitch.tv/videos/123456789"), {
  hash: "site=twitchvideo&video=123456789", siteName: "Twitch"
}));
check("player maps Twitch clips host", () => assert.deepEqual(HOA.playerFor("https://clips.twitch.tv/Clip_Slug-123"), {
  hash: "site=twitchclip&clip=Clip_Slug-123", siteName: "Twitch"
}));
check("player maps Twitch channel clip", () => assert.deepEqual(HOA.playerFor("https://www.twitch.tv/channel_name/clip/Clip_Slug-123"), {
  hash: "site=twitchclip&clip=Clip_Slug-123", siteName: "Twitch"
}));
check("player maps IMDb video", () => assert.deepEqual(HOA.playerFor("https://www.imdb.com/video/vi123456789"), {
  hash: "site=imdb&id=vi123456789", siteName: "IMDb"
}));
check("player encodes and trims title", () => {
  const result = HOA.playerFor(watch, `  A & B / ${"x".repeat(200)}  `);
  const params = new URLSearchParams(result.hash);
  assert.equal(params.get("title"), `A & B / ${"x".repeat(200)}`.slice(0, 120));
  assert.match(result.hash, /title=A\+%26\+B\+%2F/);
});
[
  "directory", "videos", "settings", "search", "downloads", "jobs", "p", "turbo", "prime",
  "subscriptions", "inventory", "wallet", "drops", "friends", "messages", "following", "login", "signup"
].forEach(reserved => check(`player rejects Twitch reserved word ${reserved}`, () => assert.equal(
  HOA.playerFor(`https://www.twitch.tv/${reserved}`), null)));
[
  "https://www.youtube.com/watch?v=short",
  "https://www.youtube.com/watch?v=123456789012",
  "https://www.youtube.com/shorts/not-an-id",
  "https://www.twitch.tv/a",
  "https://www.twitch.tv/videos/not-digits",
  "https://clips.twitch.tv/x",
  `https://clips.twitch.tv/${"x".repeat(101)}`,
  "https://www.imdb.com/video/tt1234567"
].forEach(key => check(`player rejects bad id ${key}`, () => assert.equal(HOA.playerFor(key), null)));
check("player rejects IMDb title page", () => assert.equal(HOA.playerFor("https://www.imdb.com/title/tt1234567"), null));
check("player rejects Dailymotion", () => assert.equal(HOA.playerFor("https://www.dailymotion.com/video/x123456"), null));
check("player rejects Tubi", () => assert.equal(HOA.playerFor("https://tubitv.com/movies/123"), null));
check("player site names", () => assert.deepEqual([
  HOA.playerSiteName("https://www.imdb.com/title/tt1234567"),
  HOA.playerSiteName("https://www.dailymotion.com/video/x123456"),
  HOA.playerSiteName("https://tubitv.com/movies/123"),
  HOA.playerSiteName("https://www.themoviedb.org/movie/123"),
  HOA.playerSiteName("https://www.twitch.tv/directory"),
  HOA.playerSiteName(watch)
], ["IMDb", "Dailymotion", "Tubi", "TMDB", "Twitch", "YouTube"]));
check("kind short", () => assert.equal(HOA.kindOf(short), "short"));
check("kind video", () => assert.equal(HOA.kindOf(watch), "video"));

const raw = {
  [watch]: {
    title: " Good title ", thumb: "", kind: "not-short", ts: 1, listed: true,
    icon: "https://example.com/favicon.ico", duration: 133, views: 1200,
    published: now, year: 2020, type: "movie", genres: ["Drama", " drama ", "Comedy"], rating: " PG ",
    score: 7.46, votes: 23000
  },
  [short]: { title: "", thumb: "https://example.com/thumb.jpg", ts: 2, listed: false },
  "not a url": { title: "bad", thumb: "", ts: 3 },
  "https://example.com/valid": {
    title: "ok", thumb: "", ts: "bad", duration: 3, views: 2, year: 2020
  }
};
const normalized = HOA.normalizeItems(raw, { max: 10, withListed: true });
check("normalize keeps valid entries", () => assert.equal(Object.keys(normalized).length, 2));
check("normalize keeps base fields", () => assert.equal(normalized[watch].kind, "video"));
check("normalize keeps listed", () => assert.equal(normalized[short].listed, false));
check("normalize derives site", () => assert.equal(normalized[short].site, "youtube.com"));
check("normalize validates optional fields", () => assert.deepEqual(
  Object.fromEntries(Object.entries(normalized[watch]).filter(([key]) => ["icon", "duration", "views", "published", "year", "type", "genres", "rating", "score", "votes"].includes(key))),
  { icon: "https://example.com/favicon.ico", duration: 133, views: 1200, published: now, year: 2020, type: "movie", genres: ["Drama", "Comedy"], rating: "PG", score: 7.5, votes: 23000 }
));

const invalidOptional = HOA.normalizeItems({ [watch]: {
  title: "x", thumb: "", ts: 1, icon: "data:image/png;base64,x", duration: 0,
  views: 1.2, score: -0.1, votes: 1.2, published: Infinity, year: 2101, type: "podcast", genres: [""], rating: ""
} });
check("invalid optional fields are dropped", () => assert.deepEqual(invalidOptional[watch], {
  title: "x", thumb: "", kind: "video", site: "youtube.com", ts: 1
}));
const bounded = HOA.normalizeItems({ [watch]: {
  title: "x", thumb: "", ts: 1, score: 10, votes: 1e11
} });
check("score and votes upper bounds are valid", () => assert.deepEqual(
  { score: bounded[watch].score, votes: bounded[watch].votes }, { score: 10, votes: 1e11 }
));

const capped = {};
for (let index = 0; index < 3; index += 1) {
  capped[`https://example.com/video-${index}`] = { title: `Video ${index}`, thumb: "", ts: index };
}
check("normalization caps oldest entries", () => assert.deepEqual(Object.keys(HOA.normalizeItems(capped, { max: 2, withListed: false })), ["https://example.com/video-1", "https://example.com/video-2"]));

check("duration mm:ss", () => assert.equal(HOA.parseDuration("2:13"), 133));
check("duration hh:mm:ss", () => assert.equal(HOA.parseDuration("1:02:03"), 3723));
check("duration h m", () => assert.equal(HOA.parseDuration("1h 33m"), 5580));
check("duration with IMDb video label", () => assert.equal(HOA.parseDuration("Clip 1:01"), 61));
check("duration label without time is rejected", () => assert.equal(HOA.parseDuration("Clip"), null));
check("duration hr min", () => assert.equal(HOA.parseDuration("1 hr 27 min"), 5220));
check("duration minutes", () => assert.equal(HOA.parseDuration("93 min"), 5580));
check("duration seconds", () => assert.equal(HOA.parseDuration("45s"), 45));
check("duration hours", () => assert.equal(HOA.parseDuration("2h"), 7200));
check("duration rejects other words", () => assert.equal(HOA.parseDuration("2:13 long"), null));
check("duration rejects zero", () => assert.equal(HOA.parseDuration("0"), null));

check("views K", () => assert.equal(HOA.parseViews("99K"), 99000));
check("views decimal M", () => assert.equal(HOA.parseViews("1.2M views"), 1200000));
check("views decimal B", () => assert.equal(HOA.parseViews("3.4B"), 3400000000));
check("views comma", () => assert.equal(HOA.parseViews("1,234 views"), 1234));
check("views plural", () => assert.equal(HOA.parseViews("12 views"), 12));
check("views none", () => assert.equal(HOA.parseViews("No views"), 0));
check("views singular", () => assert.equal(HOA.parseViews("1 view"), 1));
check("views viewers suffix", () => assert.equal(HOA.parseViews("27.5K viewers"), 27500));
check("views singular viewer suffix", () => assert.equal(HOA.parseViews("1 viewer"), 1));
check("views watching suffix", () => assert.equal(HOA.parseViews("980 watching"), 980));
check("views rejects age", () => assert.equal(HOA.parseViews("8d ago"), null));
check("views rejects duration", () => assert.equal(HOA.parseViews("2:13"), null));
check("views rejects bare suffix", () => assert.equal(HOA.parseViews("K"), null));
check("views rejects malformed decimal", () => assert.equal(HOA.parseViews("1.2.3M"), null));

check("votes parentheses compact", () => assert.equal(HOA.parseVotes("(23K)"), 23000));
check("votes suffix", () => assert.equal(HOA.parseVotes("23K votes"), 23000));
check("votes decimal M", () => assert.equal(HOA.parseVotes("1.2M"), 1200000));
check("votes parentheses comma", () => assert.equal(HOA.parseVotes("(1,234)"), 1234));
check("votes singular suffix", () => assert.equal(HOA.parseVotes("1 vote"), 1));
check("votes rejects decimal without unit", () => assert.equal(HOA.parseVotes("7.4"), null));
check("votes rejects duration", () => assert.equal(HOA.parseVotes("2h 9m"), null));
check("votes rejects rating letter", () => assert.equal(HOA.parseVotes("R"), null));

check("score decimal", () => assert.equal(HOA.parseScore("7.4"), 7.4));
check("score ten", () => assert.equal(HOA.parseScore("10"), 10));
check("score star", () => assert.equal(HOA.parseScore("★ 8.1"), 8.1));
check("score over ten", () => assert.equal(HOA.parseScore("8.1/10"), 8.1));
check("score zero", () => assert.equal(HOA.parseScore("0"), 0));
check("score rejects year", () => assert.equal(HOA.parseScore("2024"), null));
check("score rejects 100", () => assert.equal(HOA.parseScore("100"), null));
check("score rejects eleven", () => assert.equal(HOA.parseScore("11"), null));
check("score rejects rating letter", () => assert.equal(HOA.parseScore("R"), null));
check("score rejects extra precision", () => assert.equal(HOA.parseScore("7.45"), null));
check("score rejects duration", () => assert.equal(HOA.parseScore("1h 33m"), null));
check("score rejects empty", () => assert.equal(HOA.parseScore(""), null));

check("relative days", () => assert.equal(HOA.parseRelativeAge("8d ago", now), now - 8 * 86400000));
check("relative spelled days", () => assert.equal(HOA.parseRelativeAge("3 days ago", now), now - 3 * 86400000));
check("relative weeks", () => assert.equal(HOA.parseRelativeAge("2 weeks ago", now), now - 14 * 86400000));
check("relative month", () => assert.equal(HOA.parseRelativeAge("1 month ago", now), now - 30 * 86400000));
check("relative year", () => assert.equal(HOA.parseRelativeAge("1 year ago", now), now - 365 * 86400000));
check("relative hours", () => assert.equal(HOA.parseRelativeAge("5h ago", now), now - 5 * 3600000));
check("relative minutes", () => assert.equal(HOA.parseRelativeAge("10 minutes ago", now), now - 10 * 60000));
check("relative streamed", () => assert.equal(HOA.parseRelativeAge("Streamed 2 days ago", now), now - 2 * 86400000));
check("relative premiered", () => assert.equal(HOA.parseRelativeAge("Premiered 3 weeks ago", now), now - 21 * 86400000));
check("relative just now", () => assert.equal(HOA.parseRelativeAge("just now", now), now));
check("relative rejects other text", () => assert.equal(HOA.parseRelativeAge("yesterday", now), null));

check("year plain", () => assert.equal(HOA.parseYear("1976"), 1976));
check("year parenthesized", () => assert.equal(HOA.parseYear("(2011)"), 2011));
check("year from a numeric date", () => assert.equal(HOA.parseYear("10/06/2000"), 2000));
check("numeric date is not a full date", () => assert.equal(HOA.parseDate("10/06/2000"), null));
check("year en dash range", () => assert.equal(HOA.parseYear("2012–2020"), 2012));
check("year hyphen range", () => assert.equal(HOA.parseYear("2012-2020"), 2012));
check("year open range", () => assert.equal(HOA.parseYear("2012–"), 2012));
check("year parenthesized range", () => assert.equal(HOA.parseYear("(2012–2020)"), 2012));
check("year rejects embedded number", () => assert.equal(HOA.parseYear("Season 1976"), null));
check("year rejects out of range", () => assert.equal(HOA.parseYear("1869"), null));
check("year rejects released text", () => assert.equal(HOA.parseYear("Released 1999"), null));
check("year rejects five digits", () => assert.equal(HOA.parseYear("12345"), null));
check("year rejects split digits", () => assert.equal(HOA.parseYear("19 76"), null));
const releaseDate = Date.UTC(2026, 8, 18);
check("date full month first", () => assert.equal(HOA.parseDate("September 18, 2026"), releaseDate));
check("date abbreviated month first", () => assert.equal(HOA.parseDate("Sep 18, 2026"), releaseDate));
check("date full month second", () => assert.equal(HOA.parseDate("18 September 2026"), releaseDate));
check("date abbreviated month second", () => assert.equal(HOA.parseDate("18 Sep 2026"), releaseDate));
check("date ISO", () => assert.equal(HOA.parseDate("2026-09-18"), releaseDate));
check("date rejects slash format", () => assert.equal(HOA.parseDate("09/18/2026"), null));
check("date rejects bare year", () => assert.equal(HOA.parseDate("2026"), null));
check("date rejects relative age", () => assert.equal(HOA.parseDate("8d ago"), null));
check("date rejects impossible day", () => assert.equal(HOA.parseDate("February 31, 2026"), null));
check("date rejects low year", () => assert.equal(HOA.parseDate("September 18, 1869"), null));
check("date rejects high year", () => assert.equal(HOA.parseDate("September 18, 2101"), null));
check("genres split and deduplicate", () => assert.deepEqual(HOA.splitGenres("Kids & Family · Animation · Comedy · comedy"), ["Kids & Family", "Animation", "Comedy"]));

check("type short", () => assert.equal(HOA.typeOf(short), "short"));
check("type movie", () => assert.equal(HOA.typeOf("https://example.com/movies/title"), "movie"));
check("type tv", () => assert.equal(HOA.typeOf("https://example.com/tv-shows/title"), "tv"));
check("type live", () => assert.equal(HOA.typeOf("https://example.com/live/title"), "live"));
check("type default", () => assert.equal(HOA.typeOf("https://example.com/watch/title"), "video"));
check("known site display name", () => assert.equal(HOA.siteDisplayName("www.youtube.com"), "YouTube"));
check("unknown site display name", () => assert.equal(HOA.siteDisplayName("www.example.com"), "example.com"));
check("hidden summary empty and invalid", () => assert.deepEqual(
  [HOA.hiddenSummaryText(0), HOA.hiddenSummaryText(-1), HOA.hiddenSummaryText("1")],
  ["No hidden videos.", "No hidden videos.", "No hidden videos."]));
check("hidden summary singular", () => assert.equal(HOA.hiddenSummaryText(1), "There is 1 hidden video."));
check("hidden summary plural", () => assert.equal(HOA.hiddenSummaryText(3), "There are 3 hidden videos."));
check("added count empty", () => assert.deepEqual([HOA.addedCountText(0), HOA.addedCountText(-1), HOA.addedCountText("1")],
  ["No added videos.", "No added videos.", "No added videos."]));
check("added count singular", () => assert.equal(HOA.addedCountText(1), "There is 1 added video."));
check("added count plural", () => assert.equal(HOA.addedCountText(4), "There are 4 added videos."));
check("site monogram stable", () => assert.deepEqual(HOA.siteMonogram("example.com"), HOA.siteMonogram("example.com")));
check("site monogram hue", () => assert.ok(HOA.siteMonogram("example.com").hue >= 0 && HOA.siteMonogram("example.com").hue <= 359));
check("type labels", () => assert.equal(HOA.typeLabel("tv"), "TV"));
check("duration formatting", () => assert.equal(HOA.formatDuration(3723), "1:02:03"));
check("views formatting", () => assert.equal(HOA.formatViews(99000), "99K views"));
check("views singular formatting", () => assert.equal(HOA.formatViews(1), "1 view"));
check("score formatting", () => assert.equal(HOA.formatScore(7.4), "7.4"));
check("votes K formatting", () => assert.equal(HOA.formatVotes(23000), "23K votes"));
check("votes M formatting", () => assert.equal(HOA.formatVotes(1200000), "1.2M votes"));
check("votes plural formatting", () => assert.equal(HOA.formatVotes(12), "12 votes"));
check("votes singular formatting", () => assert.equal(HOA.formatVotes(1), "1 vote"));
check("age formatting", () => assert.equal(HOA.formatAge(now - 8 * 86400000, now), "8 days ago"));
check("cleanTitle collapses and strips ranking", () => assert.equal(HOA.cleanTitle("  #3   A   title  "), "A title"));
check("cleanTitle strips dotted ranking", () => assert.equal(HOA.cleanTitle("12. A title"), "A title"));
check("cleanTitle keeps year title", () => assert.equal(HOA.cleanTitle("1917"), "1917"));
check("cleanTitle keeps plain numeric title", () => assert.equal(HOA.cleanTitle("2012"), "2012"));
check("cleanTitle keeps three digit title", () => assert.equal(HOA.cleanTitle("300"), "300"));
check("cleanTitle keeps Angry Men", () => assert.equal(HOA.cleanTitle("12 Angry Men"), "12 Angry Men"));
check("cleanTitle keeps Jump Street", () => assert.equal(HOA.cleanTitle("21 Jump Street"), "21 Jump Street"));
check("cleanTitle non-string", () => assert.equal(HOA.cleanTitle(null), ""));

const pairs = [
  ["a", { title: "beta", ts: 2, views: 20, votes: 23000, score: 8.4, duration: 10, year: 2020, published: now - 2 }],
  ["b", { title: "Alpha", ts: 1, views: 10, votes: 12000, score: 7.4, duration: 20, year: 2021 }],
  ["c", { title: "missing", ts: 3 }]
];
check("sort added ascending", () => assert.deepEqual(HOA.sortEntries(pairs, "added", "asc").map(pair => pair[0]), ["b", "a", "c"]));
check("sort added descending", () => assert.deepEqual(HOA.sortEntries(pairs, "added", "desc").map(pair => pair[0]), ["c", "a", "b"]));
check("sort missing last ascending", () => assert.deepEqual(HOA.sortEntries(pairs, "views", "asc").map(pair => pair[0]), ["b", "a", "c"]));
check("sort missing last descending", () => assert.deepEqual(HOA.sortEntries(pairs, "views", "desc").map(pair => pair[0]), ["a", "b", "c"]));
check("sort votes ascending", () => assert.deepEqual(HOA.sortEntries(pairs, "votes", "asc").map(pair => pair[0]), ["b", "a", "c"]));
check("sort votes descending", () => assert.deepEqual(HOA.sortEntries(pairs, "votes", "desc").map(pair => pair[0]), ["a", "b", "c"]));
check("sort score ascending", () => assert.deepEqual(HOA.sortEntries(pairs, "score", "asc").map(pair => pair[0]), ["b", "a", "c"]));
check("sort score descending", () => assert.deepEqual(HOA.sortEntries(pairs, "score", "desc").map(pair => pair[0]), ["a", "b", "c"]));
check("sort published year fallback", () => assert.deepEqual(HOA.sortEntries(pairs, "published", "asc").map(pair => pair[0]), ["b", "a", "c"]));
check("sort title insensitive", () => assert.deepEqual(HOA.sortEntries(pairs, "title", "asc").map(pair => pair[0]), ["b", "a", "c"]));
check("sort stable tie breaks by title and key", () => assert.deepEqual(HOA.sortEntries([["z", { title: "same", ts: 1 }], ["a", { title: "same", ts: 1 }]], "added", "asc").map(pair => pair[0]), ["a", "z"]));
check("available sorts drop Year when exact dates exist", () => assert.deepEqual(HOA.availableSorts(pairs), ["added", "published", "views", "votes", "score", "duration", "title"]));
check("one video offers no sorting", () => assert.deepEqual(HOA.availableSorts([["only", { title: "Only", ts: 1 }]]), []));
check("a value only one video has does not sort", () => assert.deepEqual(
  HOA.availableSorts([["a", { title: "A", ts: 1, views: 5 }], ["b", { title: "B", ts: 2 }]]), ["added", "title"]));
check("equal values do not sort", () => assert.deepEqual(
  HOA.availableSorts([["a", { title: "A", ts: 1, duration: 60 }], ["b", { title: "B", ts: 2, duration: 60 }]]), ["added", "title"]));
check("years without exact dates offer Year, not Date published", () => assert.deepEqual(
  HOA.availableSorts([["a", { title: "A", ts: 1, year: 1999 }], ["b", { title: "B", ts: 2, year: 2004 }]]), ["added", "title", "year"]));

const groupedPairs = [
  ["video", { title: "Video", kind: "video", type: "video", ts: 1, genres: ["Drama"] }],
  ["short", { title: "Short", kind: "short", type: "short", ts: 2, genres: ["Comedy"] }],
  ["other", { title: "Other", kind: "video", type: "movie", ts: 3 }]
];
check("none groups videos and shorts", () => assert.deepEqual(HOA.groupEntries(groupedPairs, "none").map(group => group.label), ["Videos", "Shorts"]));
check("none group without shorts has blank label", () => assert.deepEqual(HOA.groupEntries([groupedPairs[0]], "none"), [{ id: "video", label: "", entries: [groupedPairs[0]] }]));
check("type groups in label order", () => assert.deepEqual(HOA.groupEntries(groupedPairs, "type").map(group => group.id), ["video", "short", "movie"]));
check("genre groups alphabetically", () => assert.deepEqual(HOA.groupEntries(groupedPairs, "genre").map(group => group.label), ["Comedy", "Drama", "No genre"]));
check("available groups", () => assert.deepEqual(HOA.availableGroups(groupedPairs), ["none", "type", "genre"]));
check("videos and shorts only: By type adds nothing", () => assert.deepEqual(
  HOA.availableGroups(groupedPairs.slice(0, 2).map(([key, entry]) => [key, { ...entry, genres: ["Drama"] }])), ["none"]));
check("one shared genre: By genre adds nothing", () => assert.deepEqual(
  HOA.availableGroups([["a", { type: "movie", genres: ["Drama"] }], ["b", { type: "movie", genres: ["Drama"] }]]), ["none"]));

const bySite = HOA.groupBySite({
  "https://www.youtube.com/watch?v=aaaaaaaaaaa": { title: "Old", site: "youtube.com", ts: 1, icon: "https://old.example/icon" },
  "https://www.youtube.com/watch?v=bbbbbbbbbbb": { title: "New", site: "youtube.com", ts: 2, icon: "https://new.example/icon" },
  "https://tubitv.com/movies/title": { title: "Tubi", site: "tubitv.com", ts: 3 }
});
check("site groups alphabetically", () => assert.deepEqual(bySite.map(group => group.name), ["Tubi", "YouTube"]));
check("site group icon uses newest available", () => assert.equal(bySite[1].icon, "https://new.example/icon"));
check("site group entries newest first", () => assert.deepEqual(bySite[1].entries.map(pair => pair[0]), ["https://www.youtube.com/watch?v=bbbbbbbbbbb", "https://www.youtube.com/watch?v=aaaaaaaaaaa"]));

check("prefs defaults and invalid fields", () => assert.deepEqual(HOA.normalizePrefs({
  "example.com": {}, "bad site": {}, "other.com": { sort: "bad", dir: "sideways", group: "bad", collapsed: "yes" }
}), {
  "example.com": { sort: "added", dir: "desc", group: "none", collapsed: false },
  "other.com": { sort: "added", dir: "desc", group: "none", collapsed: false }
}));
check("prefs keep valid values", () => assert.deepEqual(HOA.normalizePrefs({ "example.com": { sort: "year", dir: "asc", group: "genre", collapsed: true } })["example.com"], { sort: "year", dir: "asc", group: "genre", collapsed: true }));
check("prefs invalid root", () => assert.deepEqual(HOA.normalizePrefs(null), {}));
const manyPrefs = {};
for (let index = 0; index < 201; index += 1) {
  manyPrefs[`site${index}.example`] = {};
}
check("prefs cap at 200 sites", () => assert.equal(Object.keys(HOA.normalizePrefs(manyPrefs)).length, 200));

let prefsRead;
let storedPrefs;
global.chrome = { storage: { local: {
  get(defaults, callback) { callback({ [HOA.PREFS_KEY]: { "example.com": { collapsed: true } } }); },
  set(payload, callback) { storedPrefs = payload; callback(); }
} } };
check("readPrefs storage helper", () => HOA.readPrefs(value => { prefsRead = value; }));
check("readPrefs normalizes storage", () => assert.equal(prefsRead["example.com"].collapsed, true));
check("writePrefs storage helper", () => HOA.writePrefs({ "example.com": { sort: "views" } }, () => {}));
check("writePrefs uses prefs key", () => assert.ok(storedPrefs[HOA.PREFS_KEY]));
delete global.chrome;

const hidden = { [watch]: { title: "Watch", thumb: "", kind: "video", site: "youtube.com", ts: 1, listed: true }, [short]: { title: "Short", thumb: "", kind: "short", site: "youtube.com", ts: 2, listed: true } };
check("restore keys", () => assert.deepEqual(Object.keys(HOA.restoreKeys(hidden, [watch])), [short]));
check("remove from list", () => assert.equal(HOA.removeFromList(hidden, [watch])[watch].listed, false));
check("listed hidden", () => assert.deepEqual(HOA.listedHidden(hidden).map(pair => pair[0]), [short, watch]));
const added = HOA.toggleAdded({}, watch, { title: "Watch", thumb: "", kind: "video", ts: 10, views: 12 });
check("toggle adds", () => assert.ok(added[watch]));
check("toggle removes", () => assert.equal(Object.keys(HOA.toggleAdded(added, watch, added[watch])).length, 0));
check("group by kind", () => assert.equal(HOA.groupByKind({ [watch]: { kind: "video" }, [short]: { kind: "short" } }).short.length, 1));

check("usable picks ignore bare tags", () => assert.deepEqual(HOA.usablePicks({ pickedSelectors: ["a", "a.card", " div ", "li.slide"] }), ["a.card", "li.slide"]));
check("usable picks read the legacy cardSelector", () => assert.deepEqual(HOA.usablePicks({ cardSelector: "div.tile" }), ["div.tile"]));
check("usable picks of nothing", () => assert.deepEqual(HOA.usablePicks(undefined), []));
const genrePairs = [
  ["long", { title: "Long", duration: 300, genres: ["Drama"] }],
  ["short", { title: "Short", duration: 60, genres: ["Action"] }],
  ["none", { title: "None", duration: 900 }]
];
const sortedByDuration = HOA.sortEntries(genrePairs, "duration", "desc");
check("groups follow the sort", () => assert.deepEqual(
  HOA.orderGroupsBySort(HOA.groupEntries(sortedByDuration, "genre"), sortedByDuration, "genre").map(group => group.label),
  ["Drama", "Action", "No genre"]));
const sortedAsc = HOA.sortEntries(genrePairs, "duration", "asc");
check("reversing the sort reverses the groups", () => assert.deepEqual(
  HOA.orderGroupsBySort(HOA.groupEntries(sortedAsc, "genre"), sortedAsc, "genre").map(group => group.label),
  ["Action", "Drama", "No genre"]));

const backupData = {
  hidden: { [watch]: { title: "Hidden video", thumb: "", ts: 10, listed: true } },
  added: { [short]: { title: "Added video", thumb: "", ts: 20 } },
  siteRules: {
    "example.com": { enabled: true, scheme: "https", pickedSelectors: ["div.card", "a", "x".repeat(301)] }
  },
  prefs: { "example.com": { sort: "title", dir: "asc", group: "genre", collapsed: true } }
};
const backup = HOA.buildBackup(backupData, "1.0.0", Date.UTC(2026, 0, 2));
check("buildBackup has the stable envelope", () => assert.deepEqual(
  { app: backup.app, format: backup.format, version: backup.version, exportedAt: backup.exportedAt },
  { app: "AddOrHide", format: 1, version: "1.0.0", exportedAt: "2026-01-02T00:00:00.000Z" }));
const parsedBackup = HOA.parseBackup(JSON.stringify(backup));
check("parseBackup round trips the backup", () => assert.equal(parsedBackup.ok, true));
check("parseBackup keeps sanitized lists", () => assert.deepEqual(parsedBackup.backup.addedItems, backup.addedItems));
check("parseBackup rejects malformed JSON", () => assert.equal(HOA.parseBackup("{").ok, false));
check("parseBackup rejects another app", () => assert.equal(HOA.parseBackup(JSON.stringify({ app: "Other", format: 1 })).ok, false));
check("parseBackup rejects unknown format", () => assert.equal(HOA.parseBackup(JSON.stringify({ app: "AddOrHide", format: 2 })).ok, false));
check("parseBackup rejects missing objects", () => assert.equal(HOA.parseBackup(JSON.stringify({ app: "AddOrHide", format: 1 })).ok, false));
const hostile = {
  app: "AddOrHide", format: 1, hiddenItems: {}, addedItems: {},
  siteRules: {
    "bad host": { enabled: true },
    "safe.example": { pickedSelectors: Array.from({ length: 20 }, (_, index) => `div.card-${index}`), cardSelector: "<script>" }
  },
  addedViewPrefs: { "safe.example": { sort: "<script>", collapsed: true } }
};
const sanitized = HOA.parseBackup(JSON.stringify(hostile));
check("parseBackup drops bad hosts and caps picks", () => {
  assert.deepEqual(Object.keys(sanitized.backup.siteRules), ["safe.example"]);
  assert.equal(sanitized.backup.siteRules["safe.example"].pickedSelectors.length, 12);
});
check("parseBackup keeps hostile text inert", () => assert.equal(
  sanitized.backup.siteRules["safe.example"].cardSelector, "<script>"));
const merge = HOA.mergeBackup({
  hidden: { [watch]: { title: "Old hidden", thumb: "", ts: 1, listed: true } },
  added: { [short]: { title: "Old added", thumb: "", ts: 10 } },
  siteRules: { "example.com": { enabled: false, pickedSelectors: ["div.old"] } },
  prefs: { "example.com": { sort: "added", collapsed: false } }
}, {
  hiddenItems: { [watch]: { title: "New hidden", thumb: "", ts: 2, listed: true } },
  addedItems: {
    [short]: { title: "New added", thumb: "", ts: 9 },
    "https://www.dailymotion.com/video/xbd3ori": { title: "New video", thumb: "", ts: 30 }
  },
  siteRules: { "example.com": { enabled: true, pickedSelectors: ["div.new"] } },
  addedViewPrefs: { "example.com": { dir: "asc" } }
});
check("mergeBackup keeps newer item conflicts and adds new items", () => {
  assert.equal(merge.hidden[watch].title, "New hidden");
  assert.equal(merge.added[short].title, "Old added");
  assert.ok(merge.added["https://www.dailymotion.com/video/xbd3ori"]);
});
check("mergeBackup unions picks and shallow merges prefs", () => {
  assert.deepEqual(merge.siteRules["example.com"].pickedSelectors, ["div.old", "div.new"]);
  assert.deepEqual(merge.prefs["example.com"], { sort: "added", collapsed: false, dir: "asc" });
});
check("mergeBackup reports changed and new counts", () => assert.deepEqual(merge.counts, { added: 1, hidden: 1, sites: 1 }));

check("buttons are enabled unless turned off", () => assert.deepEqual([HOA.buttonsEnabledOf(false), HOA.buttonsEnabledOf(true), HOA.buttonsEnabledOf(undefined)], [false, true, true]));
check("button edge defaults to top", () => assert.deepEqual([HOA.buttonEdgeOf("bottom"), HOA.buttonEdgeOf("top"), HOA.buttonEdgeOf(undefined), HOA.buttonEdgeOf("left")], ["bottom", "top", "top", "top"]));
check("theme key and values", () => {
  assert.equal(HOA.THEME_KEY, "theme");
  assert.deepEqual([HOA.themeOf("light"), HOA.themeOf("dark"), HOA.themeOf("system"), HOA.themeOf(undefined)], ["light", "dark", "", ""]);
});
check("added summary text", () => assert.deepEqual([
  HOA.addedSummaryText(0, 0),
  HOA.addedSummaryText(1, 1),
  HOA.addedSummaryText(3, 1),
  HOA.addedSummaryText(2, 4)
], ["Nothing saved yet.", "1 video saved on 1 site", "3 videos saved on 1 site", "2 videos saved across 4 sites"]));

// The popup injects shared.js/catalog.js again into pages that already run them (picker, Enable).
check("shared.js and catalog.js can be injected twice into one world", () => {
  const vm = require("node:vm");
  const fs = require("node:fs");
  const path = require("node:path");
  const sandbox = vm.createContext({ URL, console });
  const files = ["shared.js", "catalog.js"].map(file => fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
  for (let round = 0; round < 2; round += 1) {
    files.forEach(source => vm.runInContext(source, sandbox));
  }
  assert.equal(vm.runInContext("typeof HOA.canonicalUrl + typeof HOA_CATALOG.find", sandbox), "functionfunction");
});

console.log(`shared.test.js: ${passed} passed, 0 failed`);
