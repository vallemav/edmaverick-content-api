/**
 * testSearch.js
 * De ManglarLeo y Claude 🐊
 *
 * Prueba rápida del scraper, sin levantar el servidor.
 * Corre con: npm run test:search
 */

import "dotenv/config";
import { scrapeGoogleImages } from "../services/googleImageScraper.js";
import { scrapeGoogleWeb } from "../services/googleWebScraper.js";

async function main() {
  console.log("Probando scraping de imágenes...");
  const images = await scrapeGoogleImages('"ed Maverick" concierto', 10);
  console.log(`OK — ${images.length} imágenes encontradas:`);
  images.forEach((url) => console.log(" -", url));

  console.log("\nProbando scraping web (bio)...");
  const web = await scrapeGoogleWeb('"ed Maverick" biografía', 10);
  console.log(`OK — ${web.length} resultados web encontrados:`);
  web.forEach((url) => console.log(" -", url));
}

main().catch((err) => {
  console.error("Error en la prueba:", err.message);
  process.exit(1);
});
