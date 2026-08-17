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

/** Optional config: override the tags.json URL (mostly for testing/mirrors). */
export const Config = {
  tagsUrl: { type: "string" },
};

function apply(ctx, config = {}) {
  const tools = ctx.get("tools");
  if (tools === void 0) return;

  const store = createTagsStore(
    typeof config.tagsUrl === "string" && config.tagsUrl.length > 0
      ? { url: config.tagsUrl }
      : {}
  );
  const tool = createPickMemeTool(store, RAW_PREFIX);

  ctx.effect(() => tools.register(tool), "dsh-memes: pick_meme");
}

export { apply };
