// dsh-memes client tests — real React rendering of the pick_meme toolview
// against DSH's actual ToolCallBlock shapes:
//   ToolResultNode  = { kind: 'tool-result', content, meta?, isError, ... }
//   RunningToolCall = { callId, name, argsRaw, ... }   // no `kind`
// No jsdom needed: renderToStaticMarkup produces real HTML strings.

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load client.js through its ModuleLoader wrapper (as DSH would). */
function loadClientModule() {
  let captured = null;
  globalThis.window = {
    __ModuleLoader__: {
      load: (mod) => {
        captured = mod;
      },
    },
  };
  const src = readFileSync(join(__dirname, "..", "src", "client.js"), "utf8");
  // client.js executes `window.__ModuleLoader__.load({...})` at top level.
  // Wrap in a function and eval so the loader captures the module descriptor.
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  assert.ok(captured, "ModuleLoader.load was not called");
  const exports = captured.factory(require);
  return exports;
}

const client = loadClientModule();
const { MemeRow, extractMatches } = client;

const MEDIA_URL =
  "https://media.githubusercontent.com/media/kagura-agent/memes/f360607ccdb774a8b37fdf9779e58c86abd59535/facepalm/frieren-cringe.gif";

/** A settled ToolResultNode exactly as the DSH client runtime types it. */
function settledBlock(overrides = {}) {
  return {
    kind: "tool-result",
    seq: 1,
    time: 1723800000000,
    callId: "call_meme_1",
    call: { name: "pick_meme", argsRaw: '{"mood":"frieren cringe"}' },
    callTime: 1723799999000,
    content: [
      { kind: "text", text: 'meme candidates for "frieren cringe" (matched by tag):\n1. [facepalm] facepalm/frieren-cringe.gif\n   ' + MEDIA_URL },
    ],
    isError: false,
    meta: {
      mood: "frieren cringe",
      matches: [
        {
          file: "facepalm/frieren-cringe.gif",
          category: "facepalm",
          url: MEDIA_URL,
          matchedBy: "tag",
          tags: ["facepalm", "cringe", "frieren"],
        },
      ],
    },
    callView: null,
    resultView: null,
    subCalls: [],
    ...overrides,
  };
}

/** A running ToolCallBlock (no `kind`). */
function runningBlock() {
  return {
    callId: "call_meme_1",
    name: "pick_meme",
    argsRaw: '{"mood":"facepalm"}',
    turn: 1,
    step: 2,
    time: 1723799999000,
    callView: null,
    subCalls: [],
  };
}

test("client: module exposes name/inject/apply/MemeRow", () => {
  assert.equal(client.name, "dsh-memes");
  assert.deepEqual(client.inject, ["slots"]);
  assert.equal(typeof client.apply, "function");
  assert.equal(typeof client.MemeRow, "function");
});

test("extractMatches: reads meta (presentationMeta projection)", () => {
  const matches = extractMatches(settledBlock());
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, MEDIA_URL);
  assert.equal(matches[0].file, "facepalm/frieren-cringe.gif");
  assert.equal(matches[0].matchedBy, "tag");
});

test("extractMatches: falls back to content text blocks when meta missing", () => {
  const block = settledBlock({ meta: undefined });
  const matches = extractMatches(block);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].url, MEDIA_URL);
});

test("extractMatches: running block (no kind) yields []", () => {
  assert.deepEqual(extractMatches(runningBlock()), []);
});

test("extractMatches: error result yields []", () => {
  const block = settledBlock({ isError: true, meta: undefined, content: [] });
  assert.deepEqual(extractMatches(block), []);
});

test("extractMatches: malformed matches are filtered", () => {
  const block = settledBlock({
    meta: {
      mood: "x",
      matches: [
        { url: MEDIA_URL, file: "ok.gif" },
        { url: "", file: "bad.gif" },
        { noUrl: true },
        null,
        "string",
      ],
    },
  });
  const matches = extractMatches(block);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].file, "ok.gif");
});

// ---- real rendering (renderToStaticMarkup) ----

test("MemeRow: settled call renders <img> with the meme URL", () => {
  const html = renderToStaticMarkup(
    React.createElement(MemeRow, { toolName: "pick_meme", block: settledBlock() })
  );
  assert.ok(html.includes("<img"), "renders an img tag");
  assert.ok(html.includes(MEDIA_URL), "img src is the media URL");
  assert.ok(html.includes("frieren-cringe.gif"), "alt carries the file name");
  assert.ok(html.includes('aria-label="Meme reaction"'), "labels the reaction for assistive technology");
  assert.ok(html.includes("width:fit-content"), "reaction container hugs the image content");
  assert.ok(!html.includes("pick_meme"), "does not expose the tool name");
  assert.ok(!html.includes("matched"), "does not expose matching internals");
});

test("MemeRow: multiple matches render only reaction images", () => {
  const block = settledBlock({
    meta: {
      mood: "facepalm",
      matches: [
        { file: "a.gif", category: "facepalm", url: MEDIA_URL.replace("frieren-cringe", "a"), matchedBy: "category", tags: [] },
        { file: "b.gif", category: "facepalm", url: MEDIA_URL.replace("frieren-cringe", "b"), matchedBy: "category", tags: [] },
      ],
    },
  });
  const html = renderToStaticMarkup(
    React.createElement(MemeRow, { toolName: "pick_meme", block })
  );
  assert.equal((html.match(/<img/g) || []).length, 2);
  assert.ok(!html.includes("pick_meme"));
  assert.ok(!html.includes("matched"));
});

test("MemeRow: running call stays visually silent", () => {
  const html = renderToStaticMarkup(
    React.createElement(MemeRow, { toolName: "pick_meme", block: runningBlock() })
  );
  assert.equal(html, "");
});

test("MemeRow: error result stays visually silent", () => {
  const block = settledBlock({ isError: true, meta: undefined, content: [] });
  const html = renderToStaticMarkup(
    React.createElement(MemeRow, { toolName: "pick_meme", block })
  );
  assert.equal(html, "");
});

// ---- apply() registers the keyed toolview ----

test("apply: registers keyed tool.call.toolview for pick_meme", () => {
  let captured = null;
  const slots = {
    register: (descriptor, component) => {
      captured = { descriptor, component };
      return () => {};
    },
    inject: (name, cb) => {
      cb.call(slots);
    },
  };
  const ctx = {
    get: (key) => (key === "slots" ? slots : undefined),
  };
  client.apply(ctx);
  assert.ok(captured, "slots.register was called");
  assert.equal(captured.descriptor.name, "tool.call.toolview");
  assert.equal(captured.descriptor.key, "pick_meme");
  assert.equal(captured.descriptor.locale, "dsh-memes");
  assert.equal(typeof captured.component, "function");
  assert.equal(captured.component, MemeRow, "registers the MemeRow component");
});

test("apply: no-op when slots service missing", () => {
  const ctx = { get: () => undefined };
  assert.doesNotThrow(() => client.apply(ctx));
});
