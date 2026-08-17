// dsh-memes client half — dedicated Tool View for pick_meme.
//
// DSH's default Tool Card JSON.stringify()s non-text results into a <pre>,
// so meme URLs render as a code block. Registering a keyed `tool.call.toolview`
// for the `pick_meme` wire tool name replaces that default with a component
// that renders the returned GIFs directly as <img> tags.
//
// The host half returns media.githubusercontent.com URLs (the memes repo is
// Git LFS; raw.githubusercontent.com serves the LFS pointer text, not the
// image bytes), so <img src={url}> just works.

window.__ModuleLoader__.load({
  id: "dsh-memes-client",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var react = require("react");

    var name = "dsh-memes-client";
    var inject = ["slots"];

    var NS = "dsh-memes";

    /** Extract the settled tool result's matches array, any shape tolerated. */
    function extractMatches(block) {
      if (!block || typeof block !== "object") return [];
      var result = block.result;
      if (!result || typeof result !== "object") return [];
      var value = result.value;
      if (!value || typeof value !== "object") return [];
      var matches = Array.isArray(value.matches) ? value.matches : [];
      return matches.filter(function (m) {
        return m && typeof m === "object" && typeof m.url === "string";
      });
    }

    /** Is the node settled (has a result) vs still running? */
    function isSettled(block) {
      return Boolean(block && block.result);
    }

    /**
     * MemeRow: renders the pick_meme call as a compact card — title line with
     * the matched mood, then the returned GIFs as <img> grid. Running calls
     * show the title alone; settled calls show the images.
     */
    function MemeRow(props) {
      var toolName = props.toolName;
      var block = props.block;
      var t = props.t;

      var matches = extractMatches(block);
      var settled = isSettled(block);

      var titleText = toolName || "pick_meme";
      var summaryText = settled && matches.length > 0
        ? matches.length + " meme" + (matches.length === 1 ? "" : "s") + " matched"
        : "picking memes…";

      var children = [];
      if (settled) {
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
    return module.exports;
  },
});
