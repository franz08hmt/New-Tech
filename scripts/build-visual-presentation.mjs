/** Build a standalone offline deck from reviewed local assets. No service access. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "@heroicons/react/24/outline";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "docs/presentation");
const destination = resolve(
  root,
  "docs/submission/ExaMate-Presentation-Visual-20261025.html",
);
const data = (path, mime) =>
  `data:${mime};base64,${readFileSync(path).toString("base64")}`;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const provenance = JSON.parse(
  readFileSync(resolve(source, "assets/provenance.json")),
);
for (const record of provenance.records) {
  if (
    hash(readFileSync(resolve(source, "assets", record.path))) !== record.sha256
  ) {
    throw new Error(`Screenshot binding mismatch: ${record.id}`);
  }
}
let css = readFileSync(resolve(source, "deck.css"), "utf8");
for (const weight of [400, 500, 600, 700]) {
  for (const subset of ["latin", "latin-ext"]) {
    const font = data(
      resolve(
        root,
        `node_modules/@fontsource/poppins/files/poppins-${subset}-${weight}-normal.woff2`,
      ),
      "font/woff2",
    );
    const range =
      subset === "latin"
        ? "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"
        : "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0300-0303,U+0305-0307,U+0309-0328,U+032A-036F,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";
    css = `@font-face{font-family:Poppins;font-style:normal;font-weight:${weight};font-display:swap;src:url('${font}') format('woff2');unicode-range:${range}}\n${css}`;
  }
}
let html = readFileSync(resolve(source, "deck.html"), "utf8")
  .replace(
    "<!-- LICENSES -->",
    `<script type="application/json" id="asset-licenses">${JSON.stringify({
      Poppins: readFileSync(
        resolve(source, "assets/Poppins-LICENSE.txt"),
        "utf8",
      ),
      Heroicons: readFileSync(
        resolve(source, "assets/Heroicons-LICENSE.txt"),
        "utf8",
      ),
      photos: readFileSync(resolve(source, "assets/Photo-CREDITS.md"), "utf8"),
    }).replaceAll("<", "\\u003c")}</script>`,
  )
  .replace("<!-- STYLES -->", `<style>${css}</style>`)
  .replace(
    "<!-- SCRIPT -->",
    `<script>${readFileSync(resolve(source, "deck.js"), "utf8")}</script>`,
  )
  .replaceAll(/\[\[icon:([A-Za-z0-9]+)\]\]/g, (_, name) => {
    const Icon = icons[`${name}Icon`];
    if (!Icon) throw new Error(`Unknown Heroicon: ${name}`);
    return renderToStaticMarkup(
      React.createElement(Icon, {
        "aria-hidden": "true",
        focusable: "false",
        className: "icon",
      }),
    );
  })
  .replaceAll(/\[\[image:([a-z-]+)\]\]/g, (_, name) => {
    const record = provenance.records.find((item) => item.id === name);
    if (!record) throw new Error(`Unknown screenshot: ${name}`);
    return data(resolve(source, "assets", record.path), "image/jpeg");
  })
  .replaceAll(
    "[[photo]]",
    data(resolve(root, "apps/web/public/img/hero-study.webp"), "image/webp"),
  )
  .replaceAll(
    "[[library]]",
    data(resolve(root, "apps/web/public/img/course-lit.webp"), "image/webp"),
  );
if (/\[\[|<!-- (STYLES|SCRIPT|LICENSES) -->/.test(html))
  throw new Error("Unresolved template");
writeFileSync(destination, html);
writeFileSync(
  resolve(root, "docs/submission/visual-deck-manifest.json"),
  `${JSON.stringify(
    {
      schema: "examate-visual-deck-v1",
      revision: "2026-10-25",
      slides: 15,
      status:
        "DRAFT — incomplete follow-up evaluation and personal/device confirmations",
      html: destination.split(/[\\/]/).at(-1),
      htmlSha256: hash(html),
      assets: provenance.records.map(({ id, sha256 }) => ({ id, sha256 })),
      newProviderCalls: 0,
      newApplicationAcceptance: false,
    },
    null,
    2,
  )}\n`,
);
console.log(`Built 15-slide offline HTML (${Buffer.byteLength(html)} bytes)`);
