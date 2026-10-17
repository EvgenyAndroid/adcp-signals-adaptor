// src/demo/skins.ts
//
// The three nofluffadvisory.com skins (Graphite default / Olive /
// Bordeaux), defined once and inlined into every page that wears the
// house style: the dashboard (src/demo/styles.ts) and the standalone
// pages (src/routes/raceCanvas.ts, vendorHealthCanvas.ts,
// ecosystemCanvas.ts, privacy.ts). Values mirror nofluffadvisory.com
// src/styles/themes.css exactly; when that file changes, change it here
// too.
//
//   SKIN_TOKENS_CSS   the skin token blocks, keyed on [data-theme] on
//                     <html>. Graphite also sits on bare :root, so it
//                     is the default with no attribute.
//   THEME_LEGACY      values the old five-theme picker saved under
//                     localStorage "ui-theme", mapped onto the skins
//                     (paper to olive, the rest to graphite). Also
//                     read by src/demo/script/fragments/ui-state.ts.
//   THEME_HEAD_SCRIPT the no-flash <script> that applies the saved
//                     skin before first paint.
//
// These strings are inlined into other template literals, so they must
// stay free of backticks and dollar-brace sequences of their own.

export const SKIN_TOKENS_CSS = `:root, :root[data-theme="graphite"] {
  --ink:          #1a1c20;
  --ink-2:        #1f242b;
  --ink-muted:    #565a61;
  --ink-light:    #5d626a;
  --paper:        #ebedf1;
  --paper-2:      #dee1e7;
  --rule:         #ccd0d7;
  /* The bronze was darkened (lightness only) from #8a6d3b on both the
     dashboard and nofluffadvisory.com on 16 Oct 2026, so small accent text
     clears WCAG AA 4.5:1 on every graphite surface (#8a6d3b was 4.1:1). */
  --accent:       #6e5730;
  --accent-2:     #a98a57;
  --accent-rgb:   110, 87, 48;
  --accent-2-rgb: 169, 138, 87;
  --warm:         #586472;
  --warm-rgb:     88, 100, 114;
  --risk:         #a5473a;
  --risk-rgb:     165, 71, 58;
  --error:        #9e4235;
}

:root[data-theme="olive"] {
  --ink:          #1a1a1a;
  --ink-2:        #242b19;
  --ink-muted:    #5a5a5a;
  --ink-light:    #6b6b68;
  --paper:        #faf7f0;
  --paper-2:      #f3eee2;
  --rule:         #e3dccb;
  --accent:       #4a5a2e;
  --accent-2:     #6b7d44;
  --accent-rgb:   74, 90, 46;
  --accent-2-rgb: 107, 125, 68;
  --warm:         #b0623a;
  --warm-rgb:     176, 98, 58;
  --risk:         #b4503f;
  --risk-rgb:     180, 80, 63;
  --error:        #a8432f;
}

:root[data-theme="bordeaux"] {
  --ink:          #241619;
  --ink-2:        #2c1a1d;
  --ink-muted:    #6e5557;
  --ink-light:    #775e62;
  --paper:        #f9ece4;
  --paper-2:      #f2e2d6;
  --rule:         #e9d6c6;
  --accent:       #6e2433;
  --accent-2:     #8c3a49;
  --accent-rgb:   110, 36, 51;
  --accent-2-rgb: 140, 58, 73;
  --warm:         #9a7b3f;
  --warm-rgb:     154, 123, 63;
  --risk:         #a64b2a;
  --risk-rgb:     166, 75, 42;
  --error:        #9c4527;
}`;

export const THEME_LEGACY: Readonly<Record<string, string>> = {
  midnight: "graphite",
  daylight: "graphite",
  solar: "graphite",
  forest: "graphite",
  paper: "olive",
};

export const THEME_HEAD_SCRIPT = `<script>
  // No-flash skin: apply the house skin saved by the dashboard picker
  // (localStorage "ui-theme", same origin) before first paint. Graphite
  // is the default. Values saved by the old five-theme picker map onto
  // the skins: paper to olive, the rest to graphite.
  (function(){
    var t = "graphite";
    try {
      var v = localStorage.getItem("ui-theme");
      var legacy = ${JSON.stringify(THEME_LEGACY)};
      if (v && legacy[v]) v = legacy[v];
      if (v === "olive" || v === "bordeaux" || v === "graphite") t = v;
    } catch (e) {}
    document.documentElement.setAttribute("data-theme", t);
  })();
</script>`;
