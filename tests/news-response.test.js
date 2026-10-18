import assert from "node:assert/strict";
import { buildNewsChatResponse, fetchFirstValidNewsBatch, getNewsFeeds, isAlgerianNewsQuery, normalizeNewsItems, paginateNewsItems, resolveNewsIntent } from "../lib/news-response.js";

assert.equal(isAlgerianNewsQuery("أبرز عناوين الصحف الجزائرية"), true);
assert.equal(isAlgerianNewsQuery("أبرز عناوين الصحف الجزائرية اليوم"), true);
assert.equal(isAlgerianNewsQuery("أخبرني بآخر أخبار الجزائر اليوم"), true);
assert.equal(isAlgerianNewsQuery("اخبار الجزائر الآن"), true);
assert.equal(isAlgerianNewsQuery("أخبار رياضية اليوم"), true);
assert.equal(isAlgerianNewsQuery("أخبار دولية اليوم"), true);

const sportIntent = resolveNewsIntent([{ role: "user", content: "أخبار رياضية اليوم" }]);
assert.equal(sportIntent.category, "sports");
assert.equal(sportIntent.page, 0);
const internationalIntent = resolveNewsIntent([{ role: "user", content: "ما أبرز الأحداث الدولية اليوم؟" }]);
assert.equal(internationalIntent.category, "international");
const followUpIntent = resolveNewsIntent([
  { role: "user", content: "ما أبرز الأحداث الدولية اليوم؟" },
  { role: "assistant", content: "news response" },
  { role: "user", content: "عرض المزيد من الأخبار" },
  { role: "assistant", content: "news response" },
  { role: "user", content: "عرض المزيد من الأخبار" },
]);
assert.equal(followUpIntent.category, "international");
assert.equal(followUpIntent.page, 2, "each follow-up advances to the next page");
assert.match(getNewsFeeds("sports").map(feed => feed.name).join(" "), /APS رياضة/);
assert.match(getNewsFeeds("international").map(feed => feed.name).join(" "), /BBC عربي/);
const pagedItems = Array.from({ length: 25 }, (_, index) => ({ title: "Headline " + index, url: "https://news.example/" + index }));
const firstPage = paginateNewsItems(pagedItems, 0, 10);
const secondPage = paginateNewsItems(pagedItems, 1, 10);
assert.equal(firstPage.items[0].title, "Headline 0");
assert.equal(secondPage.items[0].title, "Headline 10");
assert.equal(firstPage.hasMore, true);
assert.equal(paginateNewsItems(pagedItems, 2, 10).hasMore, false);
assert.equal(isAlgerianNewsQuery("عناوين البريد الإلكتروني"), false);

const started = [];
let resolveGoogle;
let resolveRss;
const feeds = [{ name: "Google News" }, { name: "Direct RSS" }, { name: "Slow RSS" }];
const pending = fetchFirstValidNewsBatch(feeds, feed => {
  started.push(feed.name);
  return new Promise(resolve => {
    if (feed.name === "Google News") resolveGoogle = resolve;
    if (feed.name === "Direct RSS") resolveRss = resolve;
    if (feed.name === "Slow RSS") setTimeout(() => resolve([]), 200);
  });
}, { graceMs: 40 });
await Promise.resolve();
assert.deepEqual(started, feeds.map(feed => feed.name), "all sources start concurrently");
resolveGoogle([{ title: "Google headline", link: "https://news.example/1", source: "Google" }]);
await new Promise(resolve => setTimeout(resolve, 0));
resolveRss([{ title: "Direct headline", link: "https://news.example/2", source: "RSS" }]);
const firstBatch = await pending;
assert.deepEqual(firstBatch.map(item => item.title), ["Google headline", "Direct headline"]);

const normalized = normalizeNewsItems([
  { title: " A ", link: "https://news.example/1", source: "S", pubDate: "2026-10-18" },
  { title: "duplicate URL", url: "https://news.example/1" },
  { title: "unsafe", link: "javascript:alert(1)" },
  { title: "missing link" },
  { title: "valid", url: "https://news.example/2" },
], 2);
assert.equal(normalized.length, 2);
assert.equal(normalized[0].title, "A");
assert.equal(normalized[0].date, "2026-10-18");
assert.equal(normalized[1].source, "مصدر إخباري");

const reply = buildNewsChatResponse([{ title: "Headline", link: "https://news.example/story", source: "APS" }], "أخبار الجزائر");
assert.equal(reply.model, "news-api");
assert.equal(reply.newsItems.length, 1);
assert.equal(reply.newsItems[0].url, "https://news.example/story");
assert.equal(reply.hasMoreNews, false);
assert.equal(reply.newsCategory, "algeria");
assert.match(reply.content, /الأخبار الجزائرية/);
const sportsReply = buildNewsChatResponse([{ title: "Goal", link: "https://news.example/sport", source: "BBC Sport" }], "أخبار رياضية", { category: "sports", page: 1, hasMoreNews: true });
assert.equal(sportsReply.newsCategory, "sports");
assert.equal(sportsReply.newsPage, 1);
assert.equal(sportsReply.hasMoreNews, true);
assert.equal(sportsReply.newsItems[0].category, "sports");
assert.match(sportsReply.content, /الأخبار الرياضية/);
const emptyReply = buildNewsChatResponse([], "أخبار الجزائر");
assert.equal(emptyReply.newsItems.length, 0);
assert.match(emptyReply.content, /لن أختلق/);
console.log("news-response tests passed: routing, concurrent first-valid RSS, card mapping, unsafe URL filtering, and empty fallback");
