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
check("canonical YouTube playlist retains its list", () => assert.equal(HOA.canonicalUrl("https://www.youtube.com/playlist?list=PL123&si=tracking"), "https://www.youtube.com/playlist?list=PL123"));
check("playlist and category types are labelled", () => {
  assert.equal(HOA.typeOf("https://www.youtube.com/playlist?list=PL123"), "playlist");
  assert.equal(HOA.typeOf("https://example.com/playlists/featured"), "playlist");
  assert.equal(HOA.typeOf("https://example.com/category/action"), "category");
  assert.equal(HOA.typeLabel("playlist"), "Playlist");
  assert.equal(HOA.typeLabel("category"), "Category");
});
check("text comparison ignores leading display decoration and sorts numbers naturally", () => {
  assert(HOA.compareText("\u200f( The 2)", "The 10") < 0);
  assert(HOA.compareText("\uFD3EAlpha\uFD3F", "Beta") < 0);
});
check("text comparison provides stable natural ordering across Arabic and Latin labels", () => {
  assert.deepEqual(["ب", "ا", "Zebra", "apple", "١٠", "٣"].sort(HOA.compareText), ["apple", "Zebra", "٣", "١٠", "ا", "ب"]);
});
check("legacy category kinds migrate to the Category type", () => {
  const items = HOA.normalizeItems({ "https://example.com/category/films": { title: "Films", thumb: "", kind: "category", type: "video", ts: 1 } });
  assert.equal(items["https://example.com/category/films"].type, "category");
});
check("canonical short", () => assert.equal(HOA.canonicalUrl(`${short}?si=abc#x`), short));
check("canonical generic URL", () => assert.equal(HOA.canonicalUrl("https://example.com/path/?b=2&utm_source=x&a=1#hash"), "https://example.com/path?a=1&b=2"));
check("canonical IMDb title URL", () => assert.equal(HOA.canonicalUrl("https://m.imdb.com/title/tt31450459/?ref_=chtmvm_i_1&foo=ignored#hash"), "https://www.imdb.com/title/tt31450459"));
check("canonical IMDb name URL", () => assert.equal(HOA.canonicalUrl("https://imdb.com/name/nm1234567/filmography?foo=ignored#hash"), "https://www.imdb.com/name/nm1234567"));
check("canonical IMDb list URL", () => assert.equal(HOA.canonicalUrl("https://www.imdb.com/list/ls1234567/?ref_=x#hash"), "https://www.imdb.com/list/ls1234567"));
check("canonical IMDb video URL", () => assert.equal(HOA.canonicalUrl("https://www.imdb.com/video/vi1234567/?ref_=hm_tv_1"), "https://www.imdb.com/video/vi1234567"));
check("canonical IMDb non-title URL", () => assert.equal(HOA.canonicalUrl("https://m.imdb.com/chart/moviemeter/?ref_=x&pf_rd_i=y&foo=1#hash"), "https://www.imdb.com/chart/moviemeter?foo=1"));
check("canonical ref tracking params", () => assert.equal(HOA.canonicalUrl("https://example.com/path?ref_=x&pf_rd_i=y&ref_source=z&keep=1"), "https://example.com/path?keep=1"));
check("reject unsafe URL", () => assert.equal(HOA.canonicalUrl("javascript:alert(1)"), null));
check("card keys are stable title slugs", () => assert.equal(HOA.cardKey("https://fawesome.tv/browse", "Breakdown!"), "https://fawesome.tv/hoa-card/breakdown"));
check("card links keep same-site real URLs and cap invalid values", () => assert.deepEqual(HOA.normalizeCardLinks({
  "https://fawesome.tv/hoa-card/breakdown": "https://fawesome.tv/movies/10863050/breakdown?x=1",
  "https://fawesome.tv/hoa-card/nope": "https://elsewhere.example/video"
}), { "https://fawesome.tv/hoa-card/breakdown": "https://fawesome.tv/movies/10863050/breakdown?x=1" }));
check("openUrl sends unresolved card keys to their home page", () => assert.equal(HOA.openUrl("https://fawesome.tv/hoa-card/breakdown"), "https://fawesome.tv/"));
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
check("actors' and directors' pages are people, not videos", () => {
  ["https://watch.plex.tv/person/michael-c-hall", "https://watch.plex.tv/en-GB/person/michael-c-hall", "https://www.themoviedb.org/person/287-brad-pitt", "https://www.imdb.com/name/nm0000093/", "https://letterboxd.com/actor/tom-hanks/", "https://www.rottentomatoes.com/celebrity/tom_hanks"]
    .forEach(url => { assert.equal(HOA.kindOf(url), "person", url); assert.equal(HOA.typeOf(url), "person", url); });
});
check("a person type is kept and labelled", () => { assert.equal(HOA.typeLabel("person"), "Person"); assert.equal(HOA.groupEntries([["https://watch.plex.tv/person/a", { type: "person", ts: 1 }]], "type")[0].label, "People"); });
check("ordinary paths are not mistaken for people", () => ["https://www.imdb.com/name/", "https://example.com/person", "https://example.com/watch/people", "https://www.imdb.com/title/tt0111161/", "https://tubitv.com/movies/1/people-like-us"].forEach(url => assert.notEqual(HOA.kindOf(url), "person", url)));
check("kind short", () => assert.equal(HOA.kindOf(short), "short"));
check("kind video", () => assert.equal(HOA.kindOf(watch), "video"));
check("kind table keeps unknown slugs playable and recognizes title, category and channel paths", () => {
  assert.equal(HOA.kindOf("https://therokuchannel.roku.com/watch/aabbccddeeff"), "video");
  assert.equal(HOA.kindOf("https://therokuchannel.roku.com/details/aabbccddeeff/a-movie"), "title");
  assert.equal(HOA.kindOf("https://therokuchannel.roku.com/browse/w.xxxxx/the-cw"), "category");
  assert.equal(HOA.kindOf("https://example.com/a-perfectly-normal-slug"), "video");
  assert.equal(HOA.kindOf("https://www.youtube.com/@creator"), "channel");
});

function fakeCardLink(href, attributes = {}, parent = null) {
  return {
    href,
    textContent: attributes.text || "",
    parentElement: parent,
    children: attributes.children || [],
    getAttribute(name) { return name === "href" ? href : attributes[name] || null; },
    contains(node) { return this.children.includes(node); },
    closest() { return null; }
  };
}

function fakeCard(links, picture = null, nodes = []) {
  const card = {
    parentElement: null,
    matches() { return false; },
    querySelectorAll(selector) { return selector === "a[href]" ? links : []; },
    querySelector(selector) { return selector === "img, picture, video" ? picture : null; },
    contains(node) { return node === card || links.includes(node) || nodes.includes(node); }
  };
  links.forEach(link => { if (!link.parentElement) link.parentElement = card; });
  return card;
}

check("chooseCardLink follows the thumbnail and only swaps a title for its same-content play door", () => {
  const movieId = "c0734dbe498259cf87ec6f049b015eed";
  const door = fakeCardLink(`https://therokuchannel.roku.com/watch/${movieId}`);
  const action = { parentElement: null, getAttribute: name => name === "itemtype" ? "http://schema.org/WatchAction" : null };
  door.parentElement = action;
  const details = fakeCardLink(`https://therokuchannel.roku.com/details/${movieId}/coraline`);
  const movie = fakeCard([details, door], null, [action]); action.parentElement = movie;
  assert.equal(HOA.chooseCardLink(movie, details), door, "Roku movie door");
  const series = fakeCardLink("https://therokuchannel.roku.com/details/76c556224ae757e6b2a81bcb1aade466/forensic-files");
  assert.equal(HOA.chooseCardLink(fakeCard([series]), series), series, "Roku series stays details");
  const title = fakeCardLink("https://www.imdb.com/title/tt1234567");
  const trailer = fakeCardLink("https://www.imdb.com/video/vi1234567", { title: "Official trailer" });
  assert.equal(HOA.chooseCardLink(fakeCard([title, trailer]), title), title, "trailer is refused");
  const other = fakeCardLink("https://www.imdb.com/video/vi7654321", { "aria-label": "Play" });
  assert.equal(HOA.chooseCardLink(fakeCard([title, other]), title), title, "different ids stay put");
  const avatar = fakeCardLink("https://example.com/channel/creator");
  const image = {};
  const thumbnail = fakeCardLink("https://example.com/watch/episode-one", { children: [image] });
  assert.equal(HOA.chooseCardLink(fakeCard([avatar, thumbnail], image), null), thumbnail, "thumbnail beats channel avatar");
  assert.equal(HOA.chooseCardLink(fakeCard([avatar], image), null), avatar, "only channel link stays channel");
});

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
check("sites show their own name, not their address", () => {
  assert.equal(HOA.siteDisplayName("www.example.com"), "Example");
  [["cartoony.net", "Cartoony"], ["app.roku.com", "The Roku Channel"], ["therokuchannel.roku.com", "The Roku Channel"], ["watch.plex.tv", "Plex"], ["amazon.com", "Prime Video"], ["www.filmrise.com", "FilmRise"], ["play.newsite.tv", "Newsite"], ["127.0.0.1", "127.0.0.1"]]
    .forEach(([site, name]) => assert.equal(HOA.siteDisplayName(site), name, site));
});
check("The Roku Channel's old address is its new one", () => {
  assert.equal(HOA.canonicalUrl("https://therokuchannel.roku.com/details/abc/a-film"), "https://app.roku.com/details/abc/a-film");
  const moved = HOA.normalizeItems({ "https://therokuchannel.roku.com/watch/abc": { title: "A film", thumb: "", ts: 1 } });
  assert.deepEqual(Object.keys(moved), ["https://app.roku.com/watch/abc"]); assert.equal(moved["https://app.roku.com/watch/abc"].title, "A film");
});
check("hidden summary empty and invalid", () => assert.deepEqual(
  [HOA.hiddenSummaryText(0), HOA.hiddenSummaryText(-1), HOA.hiddenSummaryText("1")],
  ["No hidden items.", "No hidden items.", "No hidden items."]));
check("hidden summary singular", () => assert.equal(HOA.hiddenSummaryText(1), "There is 1 hidden item."));
check("hidden summary plural", () => assert.equal(HOA.hiddenSummaryText(3), "There are 3 hidden items."));
check("added count empty", () => assert.deepEqual([HOA.addedCountText(0), HOA.addedCountText(-1), HOA.addedCountText("1")],
  ["No added videos.", "No added videos.", "No added videos."]));
check("added count singular", () => assert.equal(HOA.addedCountText(1), "There is 1 added video."));
check("added count plural", () => assert.equal(HOA.addedCountText(4), "There are 4 added videos."));
check("counts with websites", () => assert.deepEqual(
  [HOA.addedCountText(3, 1), HOA.addedCountText(1, 1), HOA.hiddenSummaryText(5, 2), HOA.hiddenSummaryText(0, 2), HOA.addedCountText(2, 0)],
   ["There are 3 added videos and 1 website.", "There is 1 added video and 1 website.", "There are 5 hidden items and 2 websites.",
    "No hidden items.", "There are 2 added videos."]));
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
check("channel sort and offering use stored channel names", () => {
  const entries = [["a", { title: "One", ts: 1, channel: "Zulu" }], ["b", { title: "Two", ts: 2, channel: "Alpha" }]];
  assert.deepEqual(HOA.sortEntries(entries, "channel", "asc").map(pair => pair[0]), ["b", "a"]);
  assert.ok(HOA.availableSorts(entries).includes("channel"));
});

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
check("Roku: a movie link and a series link are told apart and By type is offered", () => {
  const items = HOA.normalizeItems({
    "https://therokuchannel.roku.com/watch/6a6b665450b55647b90e9838ab92be22": { title: "Movie", thumb: "", kind: "video", site: "therokuchannel.roku.com", ts: 1, type: "video" },
    "https://therokuchannel.roku.com/details/101d8e417eb75d8f819ab9d6753fa4c9/a-series": { title: "Series", thumb: "", kind: "video", site: "therokuchannel.roku.com", ts: 2 }
  });
  const pairs = Object.entries(items);
  assert.deepEqual(pairs.map(pair => pair[1].type).sort(), ["movie", "tv"]);
  assert.ok(HOA.availableGroups(pairs).includes("type"));
  assert.deepEqual(HOA.groupEntries(pairs, "type").map(group => group.label), ["Movies", "TV shows"]);
});
check("videos and shorts only: By type adds nothing", () => assert.deepEqual(
  HOA.availableGroups(groupedPairs.slice(0, 2).map(([key, entry]) => [key, { ...entry, genres: ["Drama"] }])), ["none"]));
check("one shared genre: By genre adds nothing", () => assert.deepEqual(
  HOA.availableGroups([["a", { type: "movie", genres: ["Drama"] }], ["b", { type: "movie", genres: ["Drama"] }]]), ["none"]));
check("added grouping options require distinct non-trivial values", () => {
  const entries = [["a", { type: "movie", ts: Date.now(), channel: "One", year: 1994, rating: "PG" }], ["b", { type: "movie", ts: Date.now() - 40 * 86400000, channel: "Two", year: 2004, rating: "R" }]];
  const modes = HOA.availableGroups(entries);
  ["channel", "added-date", "decade", "rating"].forEach(mode => assert.ok(modes.includes(mode), mode));
  assert.deepEqual(HOA.groupEntries(entries, "added-date").map(group => group.label), ["Today", "Earlier"]);
  assert.deepEqual(HOA.groupEntries(entries, "decade").map(group => group.label), ["1990s", "2000s"]);
  assert.deepEqual(HOA.groupEntries(entries, "rating").map(group => group.label), ["PG", "R"]);
});

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
check("prefs keep valid page tabs settings", () => assert.deepEqual(HOA.normalizePrefs({ __page: { grouping: "tabs", sort: "recent", dir: "desc", selectedTab: "example.com" } }).__page, { grouping: "tabs", sort: "recent", dir: "desc", selectedTab: "example.com" }));
check("prefs normalize invalid page tabs settings", () => assert.deepEqual(HOA.normalizePrefs({ __page: { grouping: "grid", sort: "date", dir: "sideways", selectedTab: "not a host" } }).__page, { grouping: "none", sort: "name", dir: "asc", selectedTab: "" }));
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

check("normalize hide kinds keeps allowed unique ids", () => assert.deepEqual(
  HOA.normalizeHideKinds(["shorts", " shorts ", "bad", 4], ["shorts", "live"]), ["shorts"]));
check("normalize section titles collapses space and deduplicates case-insensitively", () => assert.deepEqual(
  HOA.normalizeSectionTitles(["  Sci-Fi   & Fantasy ", "sci-fi & fantasy", 4, "Comedy"]), ["Sci-Fi & Fantasy", "Comedy"]));
check("normalize section titles drops remembered taglines", () => assert.deepEqual(
  HOA.normalizeSectionTitles(["Step inside for big names, breakout stars, and fresh finds.", "Creatorverse", "Dr. Who"]), ["Creatorverse", "Dr. Who"]));
check("normalize keywords trims, folds spaces and deduplicates case-insensitively", () => assert.deepEqual(
  HOA.normalizeKeywords(["  Space   Robot ", "space robot", "", 4]), ["Space Robot"]));
check("normalize keywords keeps at most ten words", () => assert.equal(
  HOA.normalizeKeywords(Array.from({ length: 12 }, (_, index) => `word ${index}`)).length, 10));
check("keyword matching uses Unicode whole-word boundaries", () => {
  assert.equal(HOA.keywordMatch("A Space Robot and الفن", ["space robot"]), true);
  assert.equal(HOA.keywordMatch("party time", ["art"]), false);
  assert.equal(HOA.keywordMatch("الفن رائع", ["الفن"]), true);
});
check("backup keeps filter settings", () => {
  const result = HOA.parseBackup(JSON.stringify(HOA.buildBackup({ hidden: {}, added: {}, siteRules: {
    "www.youtube.com": { hideKinds: ["shorts", "live"], hideKeywords: [" Robot ", "robot"], hideSections: [" Comedy ", "comedy"], featuredCarousels: false }
  }, prefs: {} }, "1.1.0", now)));
  assert.equal(result.ok, true);
  assert.deepEqual(result.backup.siteRules["www.youtube.com"], { hideKinds: ["shorts", "live"], hideKeywords: ["Robot"], hideSections: ["Comedy"], featuredCarousels: false });
});
check("YouTube channel keys strip query strings and normalize handles", () => assert.equal(
  HOA.youtubeChannelKey("/@Handle?si=x"), "youtube.com|/@handle"));
check("normalizeChannels keeps channel name and both identities", () => {
  const channels = HOA.normalizeChannels({ "youtube.com|/@handle": { name: "Example Channel", url: "https://www.youtube.com/@Handle?si=x", ts: 1 } });
  assert.equal(channels["youtube.com|/@handle"].nameKey, "youtube.com|name:example channel");
  assert.equal(channels["youtube.com|/@handle"].key, "youtube.com|/@handle");
});
check("watched hidden items preserve only the watched reason", () => {
  const items = HOA.normalizeItems({ [watch]: { title: "Watched", thumb: "", ts: 1, reason: "watched" }, [short]: { title: "Other", thumb: "", ts: 1, reason: "other" } }, { max: 10, withListed: true });
  assert.equal(items[watch].reason, "watched");
  assert.equal(items[short].reason, undefined);
});
check("watchedShown is normalized and markWatchedShown records restores", () => {
  assert.ok(HOA.markWatchedShown({}, [watch], 9)[watch] === 9);
});

check("normalization keeps only boolean watched markers", () => {
  const items = HOA.normalizeItems({ [watch]: { title: "Watched", thumb: "", ts: 1, watched: true },
    [short]: { title: "Other", thumb: "", ts: 1, watched: "true" } }, { max: 10, withListed: true });
  assert.equal(items[watch].watched, true);
  assert.equal(items[short].watched, undefined);
});

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

check("progress normalizer keeps a bitmap, played seconds and Continue Watching", () => {
  const key = "https://example.com/watch/one";
  const result = HOA.normalizeProgress({ [key]: { duration: 100, position: 40, played: 65, buckets: "f".repeat(25), watched: false, cw: "auto", updated: 1 } });
  assert.equal(result[key].played, 65); assert.equal(result[key].cw, "auto"); assert.equal(HOA.bucketCount(result[key].buckets), 100);
});
check("progress normalizer drops home records and merges canonical video duplicates", () => {
  const key = "https://www.youtube.com/watch?v=abc123def45";
  const result = HOA.normalizeProgress({
    "https://www.youtube.com/": { duration: 100, position: 20, updated: 1 },
    "https://www.youtube.com/watch": { duration: 100, position: 20, updated: 1 },
    "https://www.youtube.com/watch?v=abc123def45&feature=share": { duration: 100, position: 20, played: 20, buckets: "8000000000000000000000000", updated: 1 },
    [key]: { duration: 100, position: 40, played: 40, buckets: "0800000000000000000000000", updated: 2, cw: "manual" }
  });
  assert.deepEqual(Object.keys(result), [key]); assert.equal(result[key].position, 40); assert.equal(result[key].cw, "auto"); assert.equal(HOA.bucketCount(result[key].buckets), 2);
});
check("progress eviction keeps Continue Watching entries", () => {
  const entries = {}; for (let index = 0; index < 1502; index += 1) entries[`https://example.com/watch/${index}`] = { duration: 100, position: 1, updated: index, cw: index === 0 ? "manual" : undefined };
  const result = HOA.normalizeProgress(entries); assert.ok(result["https://example.com/watch/0"]); assert.equal(Object.keys(result).length, 1500);
});
check("progress eviction caps Continue Watching-only history", () => {
  const entries = {}; for (let index = 0; index < 1501; index += 1) entries[`https://example.com/watch/cw-${index}`] = { duration: 100, position: 1, updated: index, cw: "auto" };
  const result = HOA.normalizeProgress(entries); assert.equal(Object.keys(result).length, 1500); assert.equal(result["https://example.com/watch/cw-0"], undefined);
});
check("watch settings normalize safe defaults", () => {
  assert.deepEqual(HOA.normalizeWatchSettings({}), { tagWatched: true, continueWatching: "auto" });
  assert.deepEqual(HOA.normalizeWatchSettings({ tagWatched: false, continueWatching: "off" }), { tagWatched: false, continueWatching: "off" });
  assert.equal(HOA.normalizeWatchSettings({ continueWatching: "manual" }).continueWatching, "auto");
});
check("backup round trip retains watch progress", () => {
  const key = "https://example.com/watch/backup"; const backup = HOA.buildBackup({ hidden: {}, added: {}, siteRules: {}, prefs: {}, watchProgress: { [key]: { duration: 100, position: 25, updated: 1, buckets: "0".repeat(25) } } }, "1.1.0", now);
  const result = HOA.parseBackup(JSON.stringify(backup)); assert.equal(result.ok, true); assert.ok(result.backup.watchProgress[key]);
});
check("unhide all retains watched videos as user-shown", () => {
  const auto = "https://www.youtube.com/watch?v=autowatched";
  const progressed = "https://www.youtube.com/watch?v=progressed1";
  const next = HOA.prepareUnhideAll({ hidden: { [auto]: { title: "Auto", thumb: "", ts: 1, reason: "watched" } }, watchedShown: {}, watchProgress: {
    [progressed]: { duration: 100, position: 95, updated: 1, watched: true, buckets: "f".repeat(25) }
  } }, 9);
  assert.deepEqual(next.hidden, {}); assert.deepEqual(next.watchedShown, { [auto]: 9, [progressed]: 9 });
});
check("clear watch history returns watched-hidden videos and clears tracking", () => {
  const watchedKey = "https://www.youtube.com/watch?v=clearwatch1";
  const manualKey = "https://www.youtube.com/watch?v=manualhide1";
  const linked = HOA.clearWatchHistory({ hidden: {}, added: { "https://fawesome.tv/movies/1/kept": { title: "Kept" } }, watchLater: {}, cardLinks: { "https://fawesome.tv/hoa-card/kept": "https://fawesome.tv/movies/1/kept", "https://fawesome.tv/hoa-card/gone": "https://fawesome.tv/movies/2/gone" } });
  assert.deepEqual(linked.cardLinks, { "https://fawesome.tv/hoa-card/kept": "https://fawesome.tv/movies/1/kept" }, "clearing history drops card addresses nothing saved uses");
  const next = HOA.clearWatchHistory({ hidden: {
    [watchedKey]: { title: "Watched", thumb: "", ts: 1, reason: "watched" },
    [manualKey]: { title: "Manual", thumb: "", ts: 1 }
  }, watchedShown: { [watchedKey]: 1 }, watchProgress: { [watchedKey]: { duration: 100, position: 95, updated: 1, watched: true } } });
  assert.deepEqual(Object.keys(next.hidden), [manualKey]); assert.deepEqual(next.watchedShown, {}); assert.deepEqual(next.watchProgress, {});
});
check("backup round trip retains rows, hidden view settings and watch settings", () => {
  const data = HOA.buildBackup({ hidden: {}, added: {}, siteRules: {}, prefs: {}, seenRows: { "example.com": ["Drama", "Drama", "Comedy"] },
    hiddenViewPrefs: { "example.com": { sort: "title", collapsed: true }, "watched-videos": { group: "site" } },
    watchSettings: { tagWatched: false, continueWatching: "off" } }, "1.1.0", now);
  const parsed = HOA.parseBackup(JSON.stringify(data));
  const merged = HOA.mergeBackup({ seenRows: { "example.com": ["Action"] }, hiddenViewPrefs: { "example.com": { dir: "asc" } }, watchSettings: { tagWatched: true, continueWatching: "auto" } }, parsed.backup);
  assert.deepEqual(parsed.backup.seenRows["example.com"], ["Drama", "Comedy"]);
  assert.deepEqual(merged.seenRows["example.com"], ["Action", "Drama", "Comedy"]);
  assert.deepEqual(merged.hiddenViewPrefs["example.com"], { dir: "asc", sort: "title", collapsed: true });
  assert.deepEqual(merged.watchSettings, { tagWatched: false, continueWatching: "off" });
});
check("watch later normalizes video pages, caps entries, and survives backup merging", () => {
  const key = "https://www.youtube.com/watch?v=laterwatch1";
  const source = { [key]: { title: "Later", thumb: "https://i.example/later.jpg", ts: 5 }, "https://www.youtube.com/": { title: "Home", ts: 8 } };
  const normalized = HOA.normalizeWatchLater(source);
  assert.deepEqual(Object.keys(normalized), [key]);
  assert.equal(normalized[key].site, "youtube.com");
  const backup = HOA.buildBackup({ watchLater: normalized }, "1.1.0", now);
  const parsed = HOA.parseBackup(JSON.stringify(backup));
  assert.ok(parsed.backup.watchLater[key]);
  assert.ok(HOA.mergeBackup({ watchLater: {} }, parsed.backup).watchLater[key]);
});
check("watch later preserves its explicit continue-watching marker", () => {
  const key = "https://www.youtube.com/watch?v=latertag001";
  const progress = HOA.normalizeProgress({ [key]: { title: "Later", duration: 100, position: 12, updated: 1, buckets: "0".repeat(25), cw: "later" } });
  assert.equal(progress[key].cw, "later");
});
check("watch later evicts the oldest entries at its storage cap", () => {
  const entries = {}; for (let index = 0; index < 1501; index += 1) entries[`https://example.com/watch/${index}`] = { title: String(index), ts: index };
  const normalized = HOA.normalizeWatchLater(entries);
  assert.equal(Object.keys(normalized).length, 1500); assert.equal(normalized["https://example.com/watch/0"], undefined);
  assert.ok(normalized["https://example.com/watch/1500"]);
});
check("YouTube channel URL variants allow one tab and reject video/deep paths", () => {
  ["https://www.youtube.com/@creator", "https://youtube.com/channel/UC123", "https://youtube.com/c/creator/featured", "https://youtube.com/user/creator/about"].forEach(url => assert.equal(HOA.isChannelUrl(url), true, url));
  ["https://youtube.com/shorts/x", "https://youtube.com/watch?v=x", "https://youtube.com/channel/UC123/videos/extra"].forEach(url => assert.equal(HOA.isChannelUrl(url), false, url));
});
check("Twitch and Kick accept creator roots but reject every documented reserved route", () => {
  ["https://twitch.tv/streamer", "https://kick.com/creator"].forEach(url => assert.equal(HOA.isChannelUrl(url), true, url));
  ["directory", "videos", "downloads", "settings", "subscriptions", "inventory", "wallet", "drops", "p", "jobs", "turbo", "search", "friends", "following", "prime"].forEach(path => assert.equal(HOA.isChannelUrl(`https://twitch.tv/${path}`), false, path));
  ["browse", "categories", "following", "search", "category", "video"].forEach(path => assert.equal(HOA.isChannelUrl(`https://kick.com/${path}`), false, path));
});
check("Rumble recognizes c/user channels and rejects video routes", () => {
  ["https://rumble.com/c/creator", "https://rumble.com/c/creator/shorts", "https://rumble.com/user/creator/videos"].forEach(url => assert.equal(HOA.isChannelUrl(url), true, url));
  ["https://rumble.com/shorts/x", "https://rumble.com/video/x"].forEach(url => assert.equal(HOA.isChannelUrl(url), false, url));
  assert.equal(HOA.kindOf("https://rumble.com/c/creator"), "channel");
});
check("Odysee and Dailymotion channel classifications reject their non-channel paths", () => {
  assert.equal(HOA.isChannelUrl("https://odysee.com/@creator"), true);
  assert.equal(HOA.isChannelUrl("https://odysee.com/channel/creator"), false);
  assert.equal(HOA.isChannelUrl("https://dailymotion.com/creator"), true);
  ["video", "playlist", "search", "us", "library", "following"].forEach(path => assert.equal(HOA.isChannelUrl(`https://dailymotion.com/${path}`), false, path));
});
check("generic channel paths permit one optional tab but not deep/video paths", () => {
  ["https://example.com/@creator", "https://example.com/c/creator/about", "https://example.com/channel/creator", "https://example.com/channels/creator/about", "https://example.com/user/creator", "https://example.com/profile/creator/tab"].forEach(url => assert.equal(HOA.isChannelUrl(url), true, url));
  ["https://example.com/channel/creator/about/extra", "https://example.com/videos/creator", "https://example.com/profile/creator/video"].forEach(url => assert.equal(HOA.isChannelUrl(url), false, url));
});
check("normalizing existing added items derives channel kind without overwriting explicit shorts", () => {
  const channel = "https://www.youtube.com/@creator";
  const short = "https://www.youtube.com/shorts/abc123def45";
  const items = HOA.normalizeItems({ [channel]: { title: "Creator", thumb: "", ts: 1 }, [short]: { title: "Short", thumb: "", ts: 2, kind: "short" } });
  assert.equal(items[channel].kind, "channel"); assert.equal(items[short].kind, "short");
});
check("category URLs accept supported category paths and reject lookalikes", () => {
  ["https://www.twitch.tv/directory/category/just-chatting", "https://www.twitch.tv/directory/category/just-chatting/videos", "https://www.twitch.tv/directory/event/just-chatting", "https://www.twitch.tv/category/films", "https://example.com/category/films", "https://example.com/categories/films/popular"].forEach(url => assert.equal(HOA.isCategoryUrl(url), true, url));
  ["https://www.twitch.tv/directory/category/just-chatting", "https://www.twitch.tv/directory/category/just-chatting/videos", "https://www.twitch.tv/directory/game/just-chatting", "https://www.twitch.tv/category/films", "https://example.com/category/films", "https://example.com/categories/films/popular"].forEach(url => assert.equal(HOA.isCategoryUrl(url), true, url));
  ["https://www.twitch.tv/streamer", "https://www.twitch.tv/videos/1", "https://www.twitch.tv/directory", "https://www.twitch.tv/directory/all", "https://example.com/videos/category/films", "https://example.com/watch/category/films", "https://example.com/shorts/category/films", "https://example.com/categories/films/popular/extra"].forEach(url => assert.equal(HOA.isCategoryUrl(url), false, url));
});
check("categories are never channels and normalize from saved URLs", () => {
  const category = "https://www.twitch.tv/directory/category/just-chatting";
  const short = "https://www.youtube.com/shorts/abc123def45";
  assert.equal(HOA.isChannelUrl(category), false);
  assert.equal(HOA.kindOf(category), "category");
  const items = HOA.normalizeItems({ [category]: { title: "Just Chatting", thumb: "", ts: 1 }, [short]: { title: "Short", thumb: "", ts: 2, kind: "short" } });
  assert.equal(items[category].kind, "category");
  assert.equal(items[short].kind, "short");
});
check("player surface distinguishes real players from thumbnail and hover-preview cards", () => {
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const video = { closest: () => null, getBoundingClientRect: () => rect(0, 0, 100, 100) };
  const player = { matches: () => false, closest: () => null, querySelectorAll: selector => selector === "video" ? [video] : [], getBoundingClientRect: () => rect(0, 0, 100, 100) };
  assert.equal(HOA.isPlayerSurface(player, "https://rumble.com/shorts/one"), true);
  const videoLink = { ...player, querySelectorAll: selector => selector === "video" ? [video] : [{ href: "https://rumble.com/shorts/two" }] };
  assert.equal(HOA.isPlayerSurface(videoLink, "https://rumble.com/shorts/one"), false);
  const channelOnly = { ...player, querySelectorAll: selector => selector === "video" ? [video] : [{ href: "https://rumble.com/c/creator/shorts" }] };
  assert.equal(HOA.isPlayerSurface(channelOnly, "https://rumble.com/shorts/one"), true);
  const small = { ...player, querySelectorAll: selector => selector === "video" ? [{ ...video, getBoundingClientRect: () => rect(0, 0, 20, 20) }] : [] };
  assert.equal(HOA.isPlayerSurface(small, "https://rumble.com/shorts/one"), false);
});

check("Prime Video titles drop the row code, and saves under the old address move to the clean one", () => {
  const old = "https://www.amazon.com/gp/video/detail/B0HKXZ6P14?jic=16%7CCgNhbGw&ref_=atv_hm";
  assert.equal(HOA.canonicalUrl(old), "https://www.amazon.com/gp/video/detail/B0HKXZ6P14");
  const items = HOA.normalizeItems({ [old]: { title: "Other Mommy", thumb: "", ts: Date.now(), site: "amazon.com" } });
  assert.deepEqual(Object.keys(items), ["https://www.amazon.com/gp/video/detail/B0HKXZ6P14"]);
  assert.equal(items["https://www.amazon.com/gp/video/detail/B0HKXZ6P14"].title, "Other Mommy");
});

check("a trailing [TV Series] or [Movie] is not part of the name", () => {
  assert.equal(HOA.cleanTitle("Anna Pigeon [TV Series]"), "Anna Pigeon");
  assert.equal(HOA.cleanTitle("Clueless [Movie]"), "Clueless");
  assert.equal(HOA.cleanTitle("Band [Live]"), "Band [Live]");
});

check("Twitch links distinguish live streams, past broadcasts and clips", () => {
  assert.equal(HOA.typeOf("https://www.twitch.tv/streamer"), "live");
  assert.equal(HOA.typeOf("https://www.twitch.tv/videos/123456789"), "past");
  assert.equal(HOA.typeOf("https://www.twitch.tv/streamer/clip/Clip_Slug-123"), "clip");
  assert.equal(HOA.typeOf("https://clips.twitch.tv/Clip_Slug-123"), "clip");
});
check("filmography and Letterboxd job paths are people", () => {
  ["https://athome.fandango.com/content/browse/filmography/Stacey-Dash/560619", "https://letterboxd.com/director/greta-gerwig/"]
    .forEach(url => assert.equal(HOA.isPersonUrl(url), true, url));
});
check("person roles label cards and groups", () => {
  assert.equal(HOA.roleLabel({ type: "person", role: "Director" }), "Director");
  assert.deepEqual(HOA.groupEntries([["a", { type: "person", role: "Actor" }], ["b", { type: "person", role: "Director" }]], "type").map(group => group.label), ["Actors", "Directors"]);
});
check("normalization keeps a person role and rating groups follow age", () => {
  const items = HOA.normalizeItems({ [watch]: { title: "A", thumb: "", type: "person", role: "Actor", ts: 1 } });
  assert.equal(items[watch].role, "Actor");
  assert.deepEqual(HOA.groupEntries([["a", { rating: "R" }], ["b", { rating: "PG" }], ["c", { rating: "TV-14" }], ["d", {}]], "rating").map(group => group.label), ["PG", "TV-14", "R", "Unrated"]);
});

console.log(`shared.test.js: ${passed} passed, 0 failed`);
