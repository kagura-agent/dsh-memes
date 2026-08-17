// dsh-memes tool — the pick_meme Cordis tool registration. Depends on the
// pure match module and the network tags store; keeps index.js as a thin
// plugin entry.

import { CATEGORIES, matchMemes } from "./match.js";

function validateArgs(args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    throw new TypeError("pick_meme arguments must be an object");
  }
  if (typeof args.mood !== "string") {
    throw new TypeError("pick_meme mood must be a string");
  }
  if (args.count !== undefined && (typeof args.count !== "number" || !Number.isFinite(args.count))) {
    throw new TypeError("pick_meme count must be a finite number");
  }
}

/**
 * Build the pick_meme tool definition.
 *
 * @param {ReturnType<import("./network.js").createTagsStore>} tagsStore
 * @param {string} [rawPrefix] - URL prefix for image files (pinned revision by default).
 * @returns {object} Cordis tool definition (defineTool-compatible shape).
 */
export function createPickMemeTool(tagsStore, rawPrefix) {
  return {
    name: "pick_meme",
    description:
      "Pick reaction meme images for the current emotional beat of the conversation. "
      + "Give the mood or situation (e.g. 'facepalm', 'proud', 'frieren cringe', 'morning greeting') "
      + "and get back candidate images with URLs. Categories: " + CATEGORIES.join(", ") + ".",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["mood"],
      properties: {
        mood: {
          type: "string",
          description: "The emotion or situation the meme should express, in plain words.",
        },
        count: {
          type: "number",
          description: "How many candidates to return (default 3, max 10).",
        },
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["mood", "matches"],
        properties: {
          mood: { type: "string" },
          matches: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["file", "category", "url", "matchedBy", "tags"],
              properties: {
                file: { type: "string" },
                category: { type: "string" },
                url: { type: "string" },
                matchedBy: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      render(args, value) {
        const lines = value.matches.map((m, i) =>
          `${i + 1}. [${m.category}] ${m.file}\n   ${m.url}`
        );
        return [{
          kind: "text",
          text: `meme candidates for "${value.mood}" (matched by ${value.matches[0]?.matchedBy ?? "?"}):\n${lines.join("\n")}`,
        }];
      },
      /**
       * Structured presentation metadata projected onto ToolResultNode.meta
       * for top-level calls. This is the channel the Web Client reads — the
       * render() text block is for the model transcript, while meta carries
       * the machine-readable matches (url/file/category/tags) for the
       * pick_meme toolview.
       */
      presentationMeta(args, value) {
        return { mood: value.mood, matches: value.matches };
      },
    },
    async execute(args) {
      validateArgs(args);
      const tags = await tagsStore.get();
      const matches = matchMemes(tags, args.mood, args.count, rawPrefix);
      return { mood: args.mood, matches };
    },
  };
}
