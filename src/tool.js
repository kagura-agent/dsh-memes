// dsh-memes tool — the pick_meme Cordis tool registration. Depends on the
// pure match module and the network tags store; keeps index.js as a thin
// plugin entry.

import { CATEGORIES, matchMemes } from "./match.js";

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
        return [{
          type: "text",
          text: `meme candidates for "${value.mood}" (matched by ${value.matches[0]?.matchedBy ?? "?"}):\n${lines.join("\n")}`,
        }];
      },
    },
    async execute(args) {
      const tags = await tagsStore.get();
      const matches = matchMemes(tags, args.mood, args.count, rawPrefix);
      return { mood: args.mood, matches };
    },
  };
}
