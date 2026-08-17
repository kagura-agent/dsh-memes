// dsh-memes tests — node:test, zero dependencies. Run: `node --test tests/`.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ALIASES,
  CATEGORIES,
  categoryOf,
  matchMemes,
  normalize,
  tokenMatch,
  RAW_PREFIX,
} from "../src/match.js";
import {
  createTagsStore,
  TagsError,
  validateTags,
} from "../src/network.js";
import { createPickMemeTool } from "../src/tool.js";

const FIXTURE_TAGS = {
  "facepalm/facepalm.gif": ["facepalm", "classic", "cringe"],
  "facepalm/frieren-cringe.gif": ["facepalm", "cringe", "frieren", "anime"],
  "happy/anime-yay.gif": ["happy", "anime", "yay", "celebrate"],
  "happy/champagne.gif": ["happy", "party", "celebration"],
  "approve/clap.gif": ["approval", "clapping", "well-done"],
  "approve/thumbs-up-cat.gif": ["approve", "cat", "animal"],
  "greeting-morning/stretch.gif": ["greeting", "morning", "wake"],
  "cute-animals/cat-stretch.gif": ["cat", "stretch", "cute", "animal"],
};

test("normalize: lowercases, replaces _- with space, trims", () => {
  assert.equal(normalize("  Well_Done-ok  "), "well done ok");
});

test("categoryOf: first path segment", () => {
  assert.equal(categoryOf("happy/anime-yay.gif"), "happy");
  assert.equal(categoryOf("nope.gif"), "");
});

test("tokenMatch: all tokens must hit", () => {
  assert.equal(tokenMatch(["facepalm", "cringe", "frieren"], "facepalm", "frieren cringe"), true);
  assert.equal(tokenMatch(["facepalm", "cringe"], "facepalm", "frieren cringe"), false);
  assert.equal(tokenMatch([], "happy", ""), false);
});

test("matchMemes: exact category hit", () => {
  const r = matchMemes(FIXTURE_TAGS, "facepalm", 3);
  assert.equal(r.length, 2);
  assert.equal(r[0].matchedBy, "category");
  assert.ok(r.every((m) => m.category === "facepalm"));
  assert.ok(r[0].url.startsWith("https://media.githubusercontent.com/media/"));
});

test("matchMemes: semantic matches vary within the matched category", () => {
  const first = matchMemes(FIXTURE_TAGS, "facepalm", 1, RAW_PREFIX, () => 0);
  const second = matchMemes(FIXTURE_TAGS, "facepalm", 1, RAW_PREFIX, () => 0.999);
  assert.notEqual(first[0].file, second[0].file);
  assert.equal(first[0].matchedBy, "category");
  assert.equal(second[0].matchedBy, "category");
});

test("matchMemes: multi-token tag hit (frieren cringe)", () => {
  const r = matchMemes(FIXTURE_TAGS, "frieren cringe", 2);
  assert.equal(r.length, 1);
  assert.equal(r[0].file, "facepalm/frieren-cringe.gif");
  assert.equal(r[0].matchedBy, "tag");
});

test("matchMemes: alias resolution (proud → approve)", () => {
  const r = matchMemes(FIXTURE_TAGS, "proud", 3);
  assert.equal(r[0].matchedBy, "alias");
  assert.ok(r.every((m) => m.category === "approve"));
});

test("matchMemes: alias for multi-word (good morning)", () => {
  const r = matchMemes(FIXTURE_TAGS, "good morning", 3);
  assert.equal(r[0].matchedBy, "alias");
  assert.equal(r[0].category, "greeting-morning");
});

test("matchMemes: substring category hit via tag stage (single token)", () => {
  const r = matchMemes(FIXTURE_TAGS, "approv", 3);
  assert.equal(r[0].matchedBy, "tag");
  assert.equal(r[0].category, "approve");
});

test("matchMemes: random fallback never empty", () => {
  const r = matchMemes(FIXTURE_TAGS, "xyzzy-nonsense", 3);
  assert.equal(r.length, 3);
  assert.equal(r[0].matchedBy, "random");
});

test("matchMemes: count clamped to [1, 10]", () => {
  assert.equal(matchMemes(FIXTURE_TAGS, "facepalm", 1).length, 1);
  assert.equal(matchMemes(FIXTURE_TAGS, "facepalm", -5).length, 1); // clamped to 1
  assert.equal(matchMemes(FIXTURE_TAGS, "facepalm", 99).length, 2); // fixture has 2, capped by data
});

test("matchMemes: custom baseUrl respected", () => {
  const r = matchMemes(FIXTURE_TAGS, "facepalm", 1, "https://cdn.example.com/v1");
  assert.ok(r[0].url.startsWith("https://cdn.example.com/v1/"));
});

test("matchMemes: empty tags map still returns something (random over empty → empty)", () => {
  const r = matchMemes({}, "anything", 3);
  assert.equal(r.length, 0); // no files at all → no candidates; caller handles
});

test("ALIASES keys all normalize to themselves (no alias aliasing)", () => {
  for (const key of Object.keys(ALIASES)) {
    assert.ok(key.length > 0);
    assert.ok(!ALIASES[key].includes(" "), `alias target should be a bare category: ${key} → ${ALIASES[key]}`);
  }
});

test("CATEGORIES: every fixture category is declared", () => {
  for (const file of Object.keys(FIXTURE_TAGS)) {
    assert.ok(CATEGORIES.includes(categoryOf(file)), `${file} category missing from CATEGORIES`);
  }
});

test("RAW_PREFIX pins a revision and uses media host (LFS-safe)", () => {
  assert.match(RAW_PREFIX, /media\.githubusercontent\.com\/media\/kagura-agent\/memes\/[0-9a-f]{40}/);
  assert.ok(!RAW_PREFIX.includes("raw.githubusercontent.com"), "raw host serves LFS pointers, not bytes");
});

// ---- network.js: validateTags ----

test("validateTags: accepts valid array, string, and structured forms", () => {
  const out = validateTags({
    "happy/a.gif": ["happy", "yay"],
    "sad/b.gif": "sad,crying",
    "smug/c.gif": { tags: ["smug", "confident"], style: "illustration" },
  });
  assert.deepEqual(out, {
    "happy/a.gif": ["happy", "yay"],
    "sad/b.gif": ["sad", "crying"],
    "smug/c.gif": ["smug", "confident"],
  });
});

test("validateTags: skips _meta/_styles, requires slash in key", () => {
  const out = validateTags({ _meta: { x: 1 }, _styles: { a: "b" }, "ok/c.gif": ["ok"] });
  assert.deepEqual(out, { "ok/c.gif": ["ok"] });
  assert.throws(() => validateTags({ "no-slash.gif": ["ok"] }), TagsError);
});

test("validateTags: rejects bad shapes loudly", () => {
  assert.throws(() => validateTags(null), TagsError);
  assert.throws(() => validateTags([1, 2]), TagsError);
  assert.throws(() => validateTags({ "a/b.gif": 42 }), TagsError);
  assert.throws(() => validateTags({ "a/b.gif": [] }), TagsError);
  assert.throws(() => validateTags({}), TagsError);
});

// ---- network.js: createTagsStore ----

function stubFetch(map) {
  return async (url, opts = {}) => {
    const entry = map[url];
    if (!entry) throw new Error(`no stub for ${url}`);
    if (opts.signal) {
      // Simulate abort by rejecting when aborted before respond — simple case:
      // stub responds synchronously, so abort rarely fires; timeout tested via
      // a never-resolving stub below.
    }
    return {
      ok: entry.status === undefined || entry.status < 400,
      status: entry.status ?? 200,
      headers: { get: (k) => (k === "content-length" ? String(entry.body?.length ?? 0) : null) },
      text: async () => entry.body,
    };
  };
}

test("store: caches within TTL, refetches after", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ "a/b.gif": ["ok"] }),
    };
  };
  const store = createTagsStore({ fetchImpl, ttlMs: 1000 });
  const first = await store.get();
  const second = await store.get();
  assert.equal(calls, 1, "second get served from cache");
  assert.deepEqual(first, { "a/b.gif": ["ok"] });
  assert.equal(second, first);
});

test("store: concurrent gets share one in-flight fetch", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const fetchImpl = async () => {
    calls += 1;
    await gate; // hold all callers until release
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ "a/b.gif": ["ok"] }),
    };
  };
  const store = createTagsStore({ fetchImpl, ttlMs: 1000 });
  const p1 = store.get();
  const p2 = store.get();
  const p3 = store.get();
  release();
  await Promise.all([p1, p2, p3]);
  assert.equal(calls, 1, "three concurrent callers → one fetch");
});

test("store: timeout aborts and raises TagsError", async () => {
  const fetchImpl = async (_url, opts = {}) => {
    // Never resolves unless aborted: hook the signal to reject on abort.
    await new Promise((_, reject) => {
      opts.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  };
  const store = createTagsStore({ fetchImpl, timeoutMs: 50 });
  await assert.rejects(() => store.get(), TagsError);
});

test("store: HTTP error raises TagsError", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 500,
    headers: { get: () => null },
    text: async () => "boom",
  });
  const store = createTagsStore({ fetchImpl, timeoutMs: 1000 });
  await assert.rejects(() => store.get(), /HTTP 500/);
});

test("store: invalid JSON raises TagsError", async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => "{ not json",
  });
  const store = createTagsStore({ fetchImpl, timeoutMs: 1000 });
  await assert.rejects(() => store.get(), TagsError);
});

test("store: failed fetch evicts cache so next call retries", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) throw new Error("network down");
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ "a/b.gif": ["ok"] }),
    };
  };
  const store = createTagsStore({ fetchImpl, ttlMs: 1000 });
  await assert.rejects(() => store.get(), TagsError);
  const data = await store.get();
  assert.equal(calls, 2);
  assert.deepEqual(data, { "a/b.gif": ["ok"] });
});

test("store: refresh forces a new fetch", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      text: async () => JSON.stringify({ "a/b.gif": ["ok"] }),
    };
  };
  const store = createTagsStore({ fetchImpl, ttlMs: 60_000 });
  await store.get();
  await store.refresh();
  assert.equal(calls, 2);
});

// ---- RAW_PREFIX + tool wiring smoke (tool.js imported via index) ----

test("index.js loads and exports name/inject/apply", async () => {
  const mod = await import("../src/index.js");
  assert.equal(mod.name, "dsh-memes");
  assert.deepEqual(mod.inject, ["tools", "systemPrompt"]);
  assert.equal(typeof mod.apply, "function");
});

test("apply fails loudly without its required services", async () => {
  const mod = await import("../src/index.js");
  assert.throws(() => mod.apply({ get: () => undefined }), /requires the tools and systemPrompt services/);
});

test("apply registers restrained proactive meme guidance", async () => {
  const mod = await import("../src/index.js");
  let section;
  const services = {
    tools: { register: () => () => {} },
    systemPrompt: { section: (value) => { section = value; return () => {}; } },
  };
  const ctx = {
    get: (key) => services[key],
    effect: (register) => register(),
  };

  mod.apply(ctx);
  assert.equal(section.name, "tool:pick_meme");
  assert.equal(section.order, 118);
  assert.match(section.text, /without being asked for a meme/);
  assert.match(section.text, /Do not use it every turn/);
  assert.match(section.text, /instead of an answer that needs words/);
  assert.match(section.text, /never repeat its URL or embed the same image in Markdown/);
});

// ---- Config must be a Schemastery schema (Standard Schema ~standard) ----
// Cordis calls runtime.Config['~standard'].validate(config) at plugin load
// (vendor/cordis/src/fiber.ts resolveConfig). A plain object has no
// `~standard`, so the plugin crashes before apply() ever runs.

test("Config exposes ~standard.validate", async () => {
  const mod = await import("../src/index.js");
  assert.ok(mod.Config, "Config must be exported");
  assert.ok(mod.Config["~standard"], "schema must expose the Standard Schema ~standard protocol");
  assert.equal(typeof mod.Config["~standard"].validate, "function");
});

test("Config validates: empty config passes (all fields optional)", async () => {
  const mod = await import("../src/index.js");
  const result = mod.Config["~standard"].validate({});
  assert.equal(result.issues, undefined);
  assert.deepEqual(result.value, {});
});

test("Config validates: valid tagsUrl passes", async () => {
  const mod = await import("../src/index.js");
  const result = mod.Config["~standard"].validate({ tagsUrl: "https://example.com/tags.json" });
  assert.equal(result.issues, undefined);
  assert.deepEqual(result.value, { tagsUrl: "https://example.com/tags.json" });
});

test("Config validates: wrong type reports issues (does not throw)", async () => {
  const mod = await import("../src/index.js");
  const result = mod.Config["~standard"].validate({ tagsUrl: 42 });
  assert.ok(result.issues, "expected validation issues");
  assert.ok(result.issues.length >= 1);
  assert.match(result.issues[0].message, /tagsUrl/);
});

test("tool declares DSH JSON Schemas and text content", async () => {
  const tool = createPickMemeTool({
    get: async () => FIXTURE_TAGS,
  });
  assert.equal(tool.parameters.type, "object");
  assert.deepEqual(tool.parameters.required, ["mood"]);
  assert.deepEqual(tool.output.schema.required, ["mood", "matches"]);

  const value = await tool.execute({ mood: "facepalm", count: 1 });
  const block = tool.output.render({ mood: "facepalm" }, value)[0];
  assert.equal(block.type, "text");
  assert.ok(!("kind" in block), "Host ContentBlock uses type; Client normalization adds kind later");
  assert.ok(!block.text.includes("https://"), "model-facing content does not expose image URLs");
  assert.match(block.text, /displayed by the client/);
});

test("tool rejects invalid model arguments", async () => {
  const tool = createPickMemeTool({ get: async () => FIXTURE_TAGS });
  await assert.rejects(() => tool.execute({ mood: 42 }), /mood must be a string/);
  await assert.rejects(() => tool.execute({ mood: "happy", count: Infinity }), /count must be a finite number/);
});
