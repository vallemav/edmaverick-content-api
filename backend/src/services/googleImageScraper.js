/**
 * googleImageScraper.js
 * De ManglarLeo y Claude 🐊
 *
 * Scraping directo de Google Imágenes (udm=2). Es FRÁGIL a propósito:
 * Google no expone una estructura HTML estable para esto, así que en
 * vez de parsear el DOM (que cambia de clases/ids sin avisar), extraemos
 * las URLs de imagen directamente del bloque de datos JSON que Google
 * incrusta en <script> para hidratar la página. Ese bloque cambia menos
 * seguido que las clases CSS, pero igual puede romperse — si un día deja
 * de traer resultados, este es el primer archivo a revisar.
 *
 * Guardamos SOLO la URL (texto), nunca el binario de la imagen:
 * - no hay costo de storage
 * - no "alojamos" contenido con copyright, solo apuntamos a la fuente
 *
 * Riesgos conocidos (ya platicados):
 * - Google puede bloquear/rate-limitear la IP si se abusa la frecuencia
 * - El HTML/JSON embebido puede cambiar de formato sin aviso
 * - Contra ToS de Google si se hace a gran escala; acá el uso es bajo
 *   volumen y con cache larga, pero es bueno saberlo
 */

const IMAGE_URL_REGEX = /https?:\\?\/\\?\/[^"\s]+?\.(?:jpg|jpeg|png|webp|gif)/gi;

// Dominios que NO queremos (iconos/UI propios de Google, no fotos reales)
const BLOCKED_DOMAINS = [
  "gstatic.com",
  "google.com/images",
  "ssl.gstatic.com",
];

function isBlocked(url) {
  return BLOCKED_DOMAINS.some((d) => url.includes(d));
}

/**
 * @param {string} query - término de búsqueda, ej: '"ed Maverick" concierto'
 * @param {number} limit - cuántas URLs devolver como máximo
 */
export async function scrapeGoogleImages(query, limit = 10) {
  const params = new URLSearchParams({
    q: query,
    udm: "2", // fuerza la pestaña de Imágenes
    hl: "es",
    safe: "active",
  });

  const url = `https://www.google.com/search?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      // User-Agent de navegador real: sin esto Google responde con una
      // página distinta (o bloquea) porque detecta cliente no-browser.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "es-MX,es;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`Google respondió ${res.status} al buscar imágenes`);
  }

  const html = await res.text();

  // El JSON embebido escapa las diagonales (\/) y el & (\u0026). Hay que
  // normalizar ANTES de aplicar el regex, si no, nunca hace match.
  const normalized = html
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\u003d/g, "=");

  const matches = [...normalized.matchAll(IMAGE_URL_REGEX)]
    .map((m) => m[0])
    .filter((u) => !isBlocked(u));

  // dedupe preservando orden
  const seen = new Set();
  const unique = [];
  for (const u of matches) {
    if (!seen.has(u)) {
      seen.add(u);
      unique.push(u);
    }
    if (unique.length >= limit) break;
  }

  return unique;
}

/** Mapea una URL cruda al shape que guarda el store (tribute_photos) */
export function mapScrapedImage(url, category, query) {
  return {
    url,
    thumbnailUrl: url, // no tenemos thumbnail separado del scraping crudo
    sourcePageUrl: null,
    width: null,
    height: null,
    title: query,
    category,
    status: "pending", // sigue requiriendo aprobación manual
    fetchedAt: new Date().toISOString(),
  };
}
