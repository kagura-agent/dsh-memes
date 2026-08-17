// dsh-memes matching — pure functions, no I/O. Unit-testable in isolation.

export const DEFAULT_REPO = "kagura-agent/memes";
export const DEFAULT_REVISION = "f360607ccdb774a8b37fdf9779e58c86abd59535";
// The memes repo stores images as Git LFS objects. raw.githubusercontent.com
// serves the LFS pointer text ("version https://git-lfs.github.com/spec/v1…"),
// NOT the image bytes — a client <img src> would render the pointer as text.
// media.githubusercontent.com/media resolves the LFS object to real bytes.
export const RAW_PREFIX = `https://media.githubusercontent.com/media/${DEFAULT_REPO}/${DEFAULT_REVISION}`;

/** Stable category list, shown in the tool description. */
export const CATEGORIES = [
  "approve", "bruh", "confused", "cute-animals", "debug-mood", "disappointed",
  "encourage", "facepalm", "greeting-bye", "greeting-hello", "greeting-morning",
  "greeting-night", "happy", "love", "nailed-it", "panic", "popcorn", "sad",
  "shrug", "smug", "thanks", "thinking", "tired", "waiting", "working", "wow",
];

/** Common mood → canonical category aliases (proud → approve, etc.). */
// No self-mappings (facepalm → facepalm): exact category hits must stay
// "category"; aliases exist only to map a different word onto a category.
export const ALIASES = {
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
  cry: "sad",
  crying: "sad",
  bye: "greeting-bye",
  goodbye: "greeting-bye",
  farewell: "greeting-bye",
  hi: "greeting-hello",
  hello: "greeting-hello",
  hey: "greeting-hello",
  good_morning: "greeting-morning",
  "good morning": "greeting-morning",
  goodnight: "greeting-night",
  good_night: "greeting-night",
  thank_you: "thanks",
  "thank you": "thanks",
  thx: "thanks",
  ty: "thanks",
  huh: "confused",
  dunno: "shrug",
  idk: "shrug",
  whatever: "shrug",
  bored: "tired",
  sleepy: "tired",
  exhausted: "tired",
  impatient: "waiting",
  hmm: "thinking",
  shocked: "wow",
  surprised: "wow",
  amazed: "wow",
  cringe: "facepalm",
  panicking: "panic",
  scared: "panic",
  fear: "panic",
  heart: "love",
  cute: "cute-animals",
  animals: "cute-animals",
  kawaii: "cute-animals",
  smug_face: "smug",
  watching: "popcorn",
  busy: "working",
  coding: "working",
  debugging: "debug-mood",
  bug: "debug-mood",
  stuck: "debug-mood",
  nailed_it: "nailed-it",
  "nailed it": "nailed-it",
  success: "nailed-it",
  win: "nailed-it",
  victory: "nailed-it",
  encouragement: "encourage",
  cheer: "encourage",
  cheer_up: "encourage",
  "cheer up": "encourage",
  support: "encourage",
  you_can_do_it: "encourage",
};

export function normalize(text) {
  return String(text).toLowerCase().replace(/[_-]+/g, " ").trim();
}

/** Category = first path segment ("happy/anime-yay.gif" → "happy"). */
export function categoryOf(file) {
  const slash = file.indexOf("/");
  return slash === -1 ? "" : file.slice(0, slash);
}

/**
 * Multi-token match: split the query into words and require every word to
 * appear in the file's tag set (or the category name). Handles compound
 * moods like "frieren cringe" → tags [frieren, cringe] both hit.
 */
export function tokenMatch(tags, category, query) {
  const tokens = normalize(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const haystack = [...tags, category].map(normalize).join(" ");
  return tokens.every((t) => haystack.includes(t));
}

/**
 * Pick top-N meme files for a mood. Pure: no network, no Date, no Math.random
 * except the random fallback. Returns { file, category, url, tags, matchedBy }.
 *
 * @param {Record<string, string[]>} tags - normalized tags map (file → tags).
 * @param {string} mood - emotion/situation in plain words.
 * @param {number} [count=3] - how many candidates, clamped to [1, 10].
 * @param {string} [baseUrl=RAW_PREFIX] - URL prefix for the image files.
 */
export function matchMemes(tags, mood, count = 3, baseUrl = RAW_PREFIX) {
  const n = Math.max(1, Math.min(count || 3, 10));
  const q = normalize(mood);
  const alias = ALIASES[q];
  const query = alias !== void 0 ? alias : mood;

  // 1) exact category-name hit (after alias resolution)
  let scored = Object.keys(tags)
    .filter((file) => normalize(categoryOf(file)) === normalize(query))
    .map((file) => ({ file, tags: tags[file], matchedBy: alias !== void 0 ? "alias" : "category" }));

  // 2) multi-token tag/category match (the haystack includes the category
  //    name, so a single-token substring hit on the category is subsumed here —
  //    there is no separate "category-substring" stage; it would be dead code)
  if (scored.length === 0) {
    scored = Object.keys(tags)
      .filter((file) => tokenMatch(tags[file], categoryOf(file), query))
      .map((file) => ({ file, tags: tags[file], matchedBy: "tag" }));
  }

  // 3) random fallback (deterministic-ish: first N of a shuffled sample)
  if (scored.length === 0) {
    const all = Object.keys(tags);
    scored = all
      .sort(() => Math.random() - 0.5)
      .slice(0, n)
      .map((file) => ({ file, tags: tags[file], matchedBy: "random" }));
  }

  return scored.slice(0, n).map(({ file, tags: fileTags, matchedBy }) => ({
    file,
    category: categoryOf(file),
    url: `${baseUrl}/${file}`,
    tags: fileTags,
    matchedBy,
  }));
}
