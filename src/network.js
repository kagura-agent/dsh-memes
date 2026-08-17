// dsh-memes remote resource — tags.json fetch with concurrency-safe cache,
// timeout, schema validation, and pinned revision (reproducible fetches).
//
// Network is the only I/O module; everything else stays pure. The fetch
// function is injectable so tests can stub it without a server.

import { DEFAULT_REPO, DEFAULT_REVISION } from "./match.js";

const DEFAULT_TAGS_URL = `https://raw.githubusercontent.com/${DEFAULT_REPO}/${DEFAULT_REVISION}/tags.json`;

const CACHE_TTL_MS = 60 * 60 * 1000; // re-fetch tags.json at most once per hour
const FETCH_TIMEOUT_MS = 10 * 1000;
const MAX_TAGS_BYTES = 1024 * 1024; // tags.json must stay small
const MAX_TAG_LENGTH = 64;

/** Thrown when tags.json fails to load or fails validation. */
export class TagsError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "TagsError";
  }
}

/**
 * Validate + normalize a parsed tags.json body into a file→tags map.
 * Unknown shapes are rejected loudly rather than silently matched wrong.
 *
 * @param {unknown} json - parsed JSON body.
 * @returns {Record<string, string[]>} normalized tags map.
 */
export function validateTags(json) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new TagsError("tags.json: expected an object");
  }
  const out = {};
  let files = 0;
  for (const [key, value] of Object.entries(json)) {
    if (key === "_meta" || key === "_styles") continue; // reserved metadata keys
    if (typeof key !== "string" || key.length === 0 || !key.includes("/")) {
      throw new TagsError(`tags.json: invalid file key ${JSON.stringify(key)}`);
    }
    let tags;
    if (Array.isArray(value)) {
      tags = value;
    } else if (typeof value === "string") {
      tags = value.split(",");
    } else {
      throw new TagsError(`tags.json: invalid tags for ${key}`);
    }
    const cleaned = tags
      .map((t) => String(t).trim())
      .filter(Boolean)
      .filter((t) => t.length <= MAX_TAG_LENGTH);
    if (cleaned.length === 0) {
      throw new TagsError(`tags.json: no valid tags for ${key}`);
    }
    out[key] = cleaned;
    files += 1;
  }
  if (files === 0) {
    throw new TagsError("tags.json: no meme entries found");
  }
  return out;
}

/**
 * Create a tags store: cached, concurrency-safe, timeout-guarded, validated.
 * Concurrent callers share one in-flight fetch; a failed fetch evicts the
 * cache so the next call retries.
 *
 * @param {object} [options]
 * @param {string} [options.url] - tags.json URL (defaults to pinned revision).
 * @param {number} [options.ttlMs] - cache lifetime.
 * @param {number} [options.timeoutMs] - per-fetch timeout.
 * @param {(url: string, opts: {signal: AbortSignal}) => Promise<Response>} [options.fetchImpl] - injectable fetch.
 */
export function createTagsStore(options = {}) {
  const {
    url = DEFAULT_TAGS_URL,
    ttlMs = CACHE_TTL_MS,
    timeoutMs = FETCH_TIMEOUT_MS,
    fetchImpl = globalThis.fetch,
  } = options;

  let cache = null; // { data, fetchedAt }
  let inflight = null; // shared promise for concurrent callers

  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      if (!res.ok) {
        throw new TagsError(`tags.json fetch failed: HTTP ${res.status}`);
      }
      const length = Number(res.headers.get("content-length") || 0);
      if (length > MAX_TAGS_BYTES) {
        throw new TagsError(`tags.json too large: ${length} bytes`);
      }
      const text = await res.text();
      if (text.length > MAX_TAGS_BYTES) {
        throw new TagsError(`tags.json too large: ${text.length} bytes`);
      }
      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw new TagsError(`tags.json: invalid JSON — ${error.message}`);
      }
      const data = validateTags(json);
      cache = { data, fetchedAt: Date.now() };
      return data;
    } catch (error) {
      if (error instanceof TagsError) throw error;
      if (error.name === "AbortError") {
        throw new TagsError(`tags.json fetch timed out after ${timeoutMs}ms`);
      }
      throw new TagsError(`tags.json fetch failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function get() {
    const now = Date.now();
    if (cache !== null && now - cache.fetchedAt < ttlMs) {
      return cache.data;
    }
    if (inflight === null) {
      inflight = load().finally(() => {
        inflight = null; // a failed load leaves inflight cleared for retry
      });
    }
    return inflight;
  }

  /** Force-refresh (used by tests and manual reload). */
  async function refresh() {
    cache = null;
    return get();
  }

  return { get, refresh };
}
