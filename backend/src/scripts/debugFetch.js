/**
 * debugFetch.js
 * De ManglarLeo y Claude 🐊
 *
 * Guarda en disco el HTML crudo que regresa Google, para ver si de
 * verdad son resultados de búsqueda o una página de consentimiento /
 * CAPTCHA (que es lo más probable si el scraper regresa 0 resultados).
 *
 * Corre con: node src/scripts/debugFetch.js
 * Revisa después: data/debug-images.html y data/debug-web.html
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchAndSave(url, outFile) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "es-MX,es;q=0.9",
    },
  });
  const html = await res.text();

  if (!existsSync("data")) mkdirSync("data");
  writeFileSync(`data/${outFile}`, html, "utf-8");

  console.log(`${outFile}: status=${res.status}, largo=${html.length} caracteres`);
  console.log(`  contiene "captcha": ${html.toLowerCase().includes("captcha")}`);
  console.log(`  contiene "consent" / "antes de continuar": ${html.toLowerCase().includes("consent") || html.includes("Antes de continuar")}`);
  console.log(`  contiene ".jpg": ${html.includes(".jpg")}`);
  console.log(`  contiene "\\/url?q=" (escapado): ${html.includes("\\/url?q=")}`);
  console.log(`  contiene "\\.jpg" o "\\/...jpg" (escapado): ${/\\\/[^"]*\.jpg/.test(html)}`);
}

async function main() {
  const imgUrl = "https://www.google.com/search?" + new URLSearchParams({
    q: '"ed Maverick" concierto',
    udm: "2",
    hl: "es",
    safe: "active",
  }).toString();

  const webUrl = "https://www.google.com/search?" + new URLSearchParams({
    q: '"ed Maverick" biografía',
    hl: "es",
    safe: "active",
  }).toString();

  await fetchAndSave(imgUrl, "debug-images.html");
  await fetchAndSave(webUrl, "debug-web.html");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
