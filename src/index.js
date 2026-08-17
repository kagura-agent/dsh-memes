// dsh-memes host half — meme/reaction picker for DeepSeek Harness agents.
//
// Thin plugin entry: registers the pick_meme tool (built in tool.js) backed by
// the network tags store (network.js) and the pure matching pipeline
// (match.js). The plugin itself carries zero copyrighted bytes — images live
// in the kagura-agent/memes repo and are referenced by pinned-revision URLs at
// runtime.
//
// Install: `dsh plugin --profile web add <this-dir>` (bundle auto-enables via
// dsh.bundle.patch → cordis.patch.yml).

import { createTagsStore } from "./network.js";
import { createPickMemeTool } from "./tool.js";
import { RAW_PREFIX } from "./match.js";

export const name = "dsh-memes";
export const inject = ["tools"];

/**
 * Optional config: override the tags.json URL (mostly for testing/mirrors).
 * Cordis consumes the Standard Schema `~standard` protocol directly.
 */
export const Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-memes",
    validate(value) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return { issues: [{ message: "config must be an object" }] };
      }
      if (value.tagsUrl !== undefined && typeof value.tagsUrl !== "string") {
        return { issues: [{ message: "tagsUrl must be a string", path: ["tagsUrl"] }] };
      }
      return {
        value: value.tagsUrl === undefined ? {} : { tagsUrl: value.tagsUrl },
      };
    },
  },
};

function apply(ctx, config = {}) {
  const tools = ctx.get("tools");
  if (tools === void 0) {
    throw new Error("dsh-memes requires the tools service");
  }

  const store = createTagsStore(
    typeof config.tagsUrl === "string" && config.tagsUrl.length > 0
      ? { url: config.tagsUrl }
      : {}
  );
  const tool = createPickMemeTool(store, RAW_PREFIX);

  ctx.effect(() => tools.register(tool), "dsh-memes: pick_meme");
}

export { apply };
