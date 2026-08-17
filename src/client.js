// dsh-memes client half — dedicated Tool View for pick_meme.
//
// DSH's default Tool Card JSON.stringify()s non-text results into a <pre>,
// so meme URLs render as a code block. Registering a keyed `tool.call.toolview`
// for the `pick_meme` wire tool name replaces that default with a component
// that renders the returned GIFs directly as <img> tags.
//
// Data contract (DSH client runtime, packages/client/runtime):
//   ToolCallBlock = RunningToolCall | ToolResultNode
//   RunningToolCall = { callId, name, argsRaw, turn, step, time, ... }   // no `kind`
//   ToolResultNode  = { kind: 'tool-result', content: ContentBlock[], meta?: unknown, ... }
// The host half's `output.presentationMeta(args, value)` projects the
// structured matches onto `meta` for top-level calls; `content` holds the
// rendered text blocks (kind: 'text'). This view reads meta first, then
// falls back to parsing text content (older payloads / nested calls).
//
// URL host: the memes repo is Git LFS, so URLs use
// media.githubusercontent.com/media (raw.githubusercontent.com serves LFS
// pointer text, not image bytes).

window.__ModuleLoader__.load({
  id: "dsh-memes-client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require("react");

    var name = "dsh-memes-client";
    var inject = ["slots"];

    var NS = "dsh-memes";

    /** Settled iff the block is a ToolResultNode (carries `kind`). */
    function isSettled(block) {
      return Boolean(block && typeof block === "object" && block.kind === "tool-result");
    }

    /** Normalize one candidate entry; returns null when malformed. */
    function normalizeMatch(m) {
      if (!m || typeof m !== "object") return null;
      if (typeof m.url !== "string" || m.url.length === 0) return null;
      return {
        url: m.url,
        file: typeof m.file === "string" ? m.file : "",
        category: typeof m.category === "string" ? m.category : "",
        matchedBy: typeof m.matchedBy === "string" ? m.matchedBy : "",
        tags: Array.isArray(m.tags) ? m.tags.filter(function (t) { return typeof t === "string"; }) : [],
      };
    }

    /** Read matches from ToolResultNode.meta (presentationMeta projection). */
    function matchesFromMeta(meta) {
      if (!meta || typeof meta !== "object") return [];
      var raw = Array.isArray(meta) ? meta : meta.matches;
      if (!Array.isArray(raw)) return [];
      var out = [];
      for (var i = 0; i < raw.length; i += 1) {
        var m = normalizeMatch(raw[i]);
        if (m !== null) out.push(m);
      }
      return out;
    }

    /**
     * Fallback: parse matches out of the settled content's text blocks. The
     * host render() emits one text block per candidate ("N. [cat] file\n url"),
     * so a client that receives no meta (nested calls, older data) can still
     * recover the URLs. Best-effort; returns [] on any mismatch.
     */
    function matchesFromContent(content) {
      if (!Array.isArray(content)) return [];
      var out = [];
      for (var i = 0; i < content.length; i += 1) {
        var block = content[i];
        if (!block || typeof block !== "object" || block.kind !== "text") continue;
        if (typeof block.text !== "string") continue;
        var lines = block.text.split("\n");
        for (var j = 0; j < lines.length; j += 1) {
          var line = lines[j].trim();
          var urlMatch = line.match(/https?:\/\/[^\s]+/);
          if (!urlMatch) continue;
          var fileMatch = line.match(/\]\s*(\S+\.gif)/i);
          out.push({
            url: urlMatch[0],
            file: fileMatch ? fileMatch[1] : "",
            category: "",
            matchedBy: "",
            tags: [],
          });
        }
      }
      return out;
    }

    /** Extract the settled tool result's matches array (meta-first, content fallback). */
    function extractMatches(block) {
      if (!isSettled(block)) return [];
      var fromMeta = matchesFromMeta(block.meta);
      if (fromMeta.length > 0) return fromMeta;
      return matchesFromContent(block.content);
    }

    /**
     * MemeRow: renders the pick_meme call as a compact card — title line with
     * the matched mood, then the returned GIFs as <img> grid. Running calls
     * show the title alone; settled calls show the images.
     */
    function MemeRow(props) {
      var toolName = props.toolName;
      var block = props.block;

      var matches = extractMatches(block);
      var settled = isSettled(block);

      var titleText = toolName || "pick_meme";
      var summaryText = settled && matches.length > 0
        ? matches.length + " meme" + (matches.length === 1 ? "" : "s") + " matched"
        : "picking memes…";

      var children = [];
      if (settled && matches.length > 0) {
        var grid = react.createElement(
          "div",
          { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "8px", padding: "8px 0" } },
          matches.map(function (m, i) {
            return react.createElement(
              "div",
              { key: i, style: { textAlign: "center" } },
              react.createElement("img", {
                src: m.url,
                alt: m.file || "meme",
                title: m.file || m.url,
                style: { maxWidth: "100%", maxHeight: "180px", borderRadius: "8px", display: "block", margin: "0 auto" },
                loading: "lazy",
              })
            );
          })
        );
        children.push(grid);
      }

      return react.createElement(
        "div",
        { style: { border: "1px solid var(--dsw-alias-border-l1, #e2e6ec)", borderRadius: "10px", padding: "8px 12px", margin: "4px 0", background: "var(--dsw-alias-bg-layer-1, #ffffff)" } },
        react.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px" } },
          react.createElement("span", { "aria-hidden": true }, "🎭"),
          react.createElement("span", null, titleText),
          react.createElement(
            "span",
            { style: { fontWeight: 400, color: "var(--dsw-alias-label-secondary, #5a6472)" } },
            summaryText
          )
        ),
        children.length > 0 ? children[0] : null
      );
    }

    /**
     * The registrant plugin following the atomic Tool-view declaration
     * (same shape as dsh ui-tool's shipped toolviews).
     */
    function apply(ctx) {
      var slots = ctx.get("slots");
      if (slots === void 0) return;
      slots.inject("tool.call.toolview", function () {
        return slots.register(
          { name: "tool.call.toolview", key: "pick_meme", locale: NS },
          MemeRow
        );
      });
    }

    exports.name = name;
    exports.inject = inject;
    exports.apply = apply;
    // Test hook: expose the view component for direct rendering tests. No
    // runtime effect — DSH loads the plugin via apply(), not this export.
    exports.MemeRow = MemeRow;
    exports.extractMatches = extractMatches;
    return module.exports;
  },
});
