// dsh-memes host half — meme/reaction picker for DeepSeek Harness agents.
//
// Registers a `pick_meme` tool that picks reaction images from the
// kagura-agent/memes library (https://github.com/kagura-agent/memes) by
// semantic tag matching. Images stay in the memes repo and are referenced by
// URL at runtime — the plugin itself carries zero copyrighted bytes, so the
// Giphy/Tenor sourcing of the library never leaks into this MIT plugin.
//
// Matching: normalize the mood → exact category name hit → tag hit →
// substring category hit → random fallback. Returns top-N matches with their
// raw.githubusercontent.com URLs.
const name = "dsh-memes";

const MEMES_REPO = "kagura-agent/memes";
const MEMES_BRANCH = "main";
const TAGS_URL = `https://raw.githubusercontent.com/${MEMES_REPO}/${MEMES_BRANCH}/tags.json`;
const RAW_PREFIX = `https://raw.githubusercontent.com/${MEMES_REPO}/${MEMES_BRANCH}`;

const CACHE_TTL_MS = 60 * 60 * 1000; // re-fetch tags.json at most once per hour
const FETCH_TIMEOUT_MS = 10 * 1000;

/** @type {{ data: Record<string, string[]>, meta: any, fetchedAt: number } | null} */
let tagsCache = null;

async function fetchTags() {
  const now = Date.now();
  if (tagsCache !== null && now - tagsCache.fetchedAt < CACHE_TTL_MS) {
    return tagsCache.data;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(TAGS_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`tags.json fetch failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    const data = {};
    for (const [key, value] of Object.entries(json)) {
      if (key === "_meta") continue;
      if (typeof value === "string") {
        // Older layout: "path": "tag1,tag2"
        data[key] = value.split(",").map((t) => t.trim()).filter(Boolean);
      } else if (Array.isArray(value)) {
        data[key] = value.map(String);
      }
    }
    tagsCache = { data, meta: json._meta ?? null, fetchedAt: now };
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Category = first path segment ("happy/anime-yay.gif" → "happy"). */
function categoryOf(file) {
  const slash = file.indexOf("/");
  return slash === -1 ? "" : file.slice(0, slash);
}

function normalize(text) {
  return String(text).toLowerCase().replace(/[_-]+/g, " ").trim();
}

/** Common mood → canonical category aliases (proud → approve, etc.). */
const ALIASES = {
  proud: "approve",
  approval: "approve",
  congrats: "approve",
  congratulations: "approve",
  well_done: "approve",
  "well done": "approve",
  awesome: "approve",
  celebrate: "happy",
  celebration: "happy",
  party: "happy",
  yay: "happy",
  hooray: "happy",
  excited: "happy",
  sad: "sad",
  cry: "sad",
  crying: "sad",
  bye: "greeting-bye",
  goodbye: "greeting-bye",
  farewell: "greeting-bye",
  hi: "greeting-hello",
  hello: "greeting-hello",
  hey: "greeting-hello",
  morning: "greeting-morning",
  good_morning: "greeting-morning",
  "good morning": "greeting-morning",
  night: "greeting-night",
  goodnight: "greeting-night",
  good_night: "greeting-night",
  thanks: "thanks",
  thank_you: "thanks",
  "thank you": "thanks",
  thx: "thanks",
  ty: "thanks",
  confused: "confused",
  huh: "confused",
  dunno: "shrug",
  shrug: "shrug",
  idk: "shrug",
  whatever: "shrug",
  bored: "tired",
  sleepy: "tired",
  tired: "tired",
  exhausted: "tired",
  waiting: "waiting",
  impatient: "waiting",
  thinking: "thinking",
  hmm: "thinking",
  wow: "wow",
  shocked: "wow",
  surprised: "wow",
  amazed: "wow",
  facepalm: "facepalm",
  cringe: "facepalm",
  disappointed: "disappointed",
  panic: "panic",
  panicking: "panic",
  scared: "panic",
  fear: "panic",
  love: "love",
  heart: "love",
  cute: "cute-animals",
  animals: "cute-animals",
  kawaii: "cute-animals",
  smug: "smug",
  smug_face: "smug",
  bruh: "bruh",
  popcorn: "popcorn",
  watching: "popcorn",
  working: "working",
  busy: "working",
  coding: "working",
  debug: "debug-mood",
  debugging: "debug-mood",
  bug: "debug-mood",
  stuck: "debug-mood",
  nailed_it: "nailed-it",
  "nailed it": "nailed-it",
  success: "nailed-it",
  win: "nailed-it",
  victory: "nailed-it",
  encourage: "encourage",
  encouragement: "encourage",
  cheer: "encourage",
  cheer_up: "encourage",
  "cheer up": "encourage",
  support: "encourage",
  you_can_do_it: "encourage",
};

/**
 * Multi-token match: split the query into words and require every word to
 * appear in the file's tag set (or the category name). Handles compound
 * moods like "frieren cringe" → tags ["frieren", "cringe"] both hit.
 */
function tokenMatch(tags, category, query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const haystack = [...tags, category].map(normalize).join(" ");
  return tokens.every((t) => haystack.includes(t));
}

/**
 * Pick top-N meme files for a mood. Returns an array of
 * { file, category, url, tags, matchedBy }.
 */
function matchMemes(tags, mood, count) {
  const n = Math.max(1, Math.min(count || 3, 10));
  const q = normalize(mood);
  const alias = ALIASES[q];
  const query = alias !== void 0 ? alias : mood;

  // 1) exact category-name hit (after alias resolution)
  let scored = Object.keys(tags)
    .filter((file) => normalize(categoryOf(file)) === normalize(query))
    .map((file) => ({ file, tags: tags[file], matchedBy: alias !== void 0 ? "alias" : "category" }));

  // 2) multi-token tag/category match
  if (scored.length === 0) {
    scored = Object.keys(tags)
      .filter((file) => tokenMatch(tags[file], categoryOf(file), query))
      .map((file) => ({ file, tags: tags[file], matchedBy: "tag" }));
  }

  // 3) substring category hit (single-token queries only)
  if (scored.length === 0 && normalize(query).split(/\s+/).length === 1) {
    scored = Object.keys(tags)
      .filter((file) => normalize(categoryOf(file)).includes(normalize(query)))
      .map((file) => ({ file, tags: tags[file], matchedBy: "category-substring" }));
  }

  // 4) random fallback (deterministic-ish: first N of a shuffled sample)
  if (scored.length === 0) {
    const all = Object.keys(tags);
    scored = all
      .sort(() => Math.random() - 0.5)
      .slice(0, n)
      .map((file) => ({ file, tags: tags[file], matchedBy: "random" }));
  }

  return scored.slice(0, n).map(({ file, tags, matchedBy }) => ({
    file,
    category: categoryOf(file),
    url: `${RAW_PREFIX}/${file}`,
    tags,
    matchedBy,
  }));
}

function apply(ctx) {
  const tools = ctx.get("tools");
  if (tools === void 0) return;

  const tool = {
    name: "pick_meme",
    description:
      "Pick reaction meme images for the current emotional beat of the conversation. "
      + "Give the mood or situation (e.g. 'facepalm', 'proud', 'frieren cringe', 'morning greeting') "
      + "and get back candidate images with URLs. Categories: approve, bruh, confused, cute-animals, "
      + "debug-mood, disappointed, encourage, facepalm, greeting-bye, greeting-hello, greeting-morning, "
      + "greeting-night, happy, love, nailed-it, panic, popcorn, sad, shrug, smug, thanks, thinking, "
      + "tired, waiting, working, wow.",
    parameters: {
      mood: {
        type: "string",
        required: true,
        description: "The emotion or situation the meme should express, in plain words.",
      },
      count: {
        type: "number",
        description: "How many candidates to return (default 3, max 10).",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: true,
        properties: {
          mood: { type: "string", required: true },
          matches: {
            type: "array",
            required: true,
            items: {
              type: "object",
              additionalProperties: false,
              required: true,
              properties: {
                file: { type: "string", required: true },
                category: { type: "string", required: true },
                url: { type: "string", required: true },
                matchedBy: { type: "string", required: true },
                tags: { type: "array", required: true, items: { type: "string" } },
              },
            },
          },
        },
      },
      render(args, value) {
        const lines = value.matches.map((m, i) =>
          `${i + 1}. [${m.category}] ${m.file}\n   ${m.url}`
        );
        return [{ type: "text", text: `meme candidates for "${value.mood}" (matched by ${value.matches[0]?.matchedBy ?? "?"}):\n${lines.join("\n")}` }];
      },
    },
    async execute(args) {
      const tags = await fetchTags();
      const matches = matchMemes(tags, args.mood, args.count);
      return { mood: args.mood, matches };
    },
  };

  ctx.effect(() => tools.register(tool), "dsh-memes: pick_meme");
}

export { name, apply };
