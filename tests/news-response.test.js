import assert from "node:assert/strict";
import { buildNewsChatResponse, fetchFirstValidNewsBatch, isAlgerianNewsQuery, normalizeNewsItems } from "../lib/news-response.js";

assert.equal(isAlgerianNewsQuery("أبرز عناوين الصحف الجزائرية"), true);
assert.equal(isAlgerianNewsQuery("أبرز عناوين الصحف الجزائرية اليوم"), true);
assert.equal(isAlgerianNewsQuery("أخبرني بآخر أخبار الجزائر اليوم"), true);
assert.equal(isAlgerianNewsQuery("اخبار الجزائر الآن"), true);
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
assert.match(reply.content, /آخر الأخبار الجزائرية/);
const emptyReply = buildNewsChatResponse([], "أخبار الجزائر");
assert.equal(emptyReply.newsItems.length, 0);
assert.match(emptyReply.content, /لن أختلق/);
console.log("news-response tests passed: routing, concurrent first-valid RSS, card mapping, unsafe URL filtering, and empty fallback");
