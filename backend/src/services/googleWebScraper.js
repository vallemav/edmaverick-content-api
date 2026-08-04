/**
 * googleWebScraper.js
 * De ManglarLeo y Claude 🐊
 *
 * Scraping de resultados de búsqueda web normal de Google (sin udm=2),
 * para alimentar biografía y noticias. Mismo criterio que
 * googleImageScraper.js: extraemos por regex en vez de depender de
 * clases CSS que Google cambia seguido.
 *
 * Google envuelve cada link de resultado como /url?q=DESTINO&... — de
 * ahí sacamos la URL real. El título y snippet los tomamos del texto
 * visible cercano cuando es posible; si el formato cambia y deja de
 * encontrar snippets, igual devuelve las URLs (lo mínimo útil).
 */

const RESULT_LINK_REGEX = /https?:\\?\/\\?\/[^"\s]+/g;

const BLOCKED_DOMAINS = ["google.com", "gstatic.com", "googleusercontent.com", "youtube.com/redirect", "schema.org", "w3.org"];

function isBlocked(url) {
  return BLOCKED_DOMAINS.some((d) => url.includes(d));
}

/**
 * @param {string} query
 * @param {number} limit
 */
export async function scrapeGoogleWeb(query, limit = 10) {
  const params = new URLSearchParams({
    q: query,
    hl: "es",
    safe: "active",
  });

  const url = `https://www.google.com/search?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "es-MX,es;q=0.9",
    },
  });

  if (!res.ok) {
    throw new Error(`Google respondió ${res.status} al buscar resultados web`);
  }

  const html = await res.text();

  const normalized = html
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/\\u003d/g, "=");

  // Primero intenta el patrón clásico /url?q=DESTINO&
  const classicLinks = [...normalized.matchAll(/\/url\?q=(https?:\/\/[^&"]+)&/g)].map((m) =>
    decodeURIComponent(m[1])
  );

  // Si Google ya no usa ese wrapper (cambia seguido), cae a URLs sueltas
  // en el HTML como respaldo — más ruidoso, por eso se filtra fuerte.
  const fallbackLinks =
    classicLinks.length > 0 ? [] : [...normalized.matchAll(RESULT_LINK_REGEX)].map((m) => m[0]);

  const links = [...classicLinks, ...fallbackLinks].filter((u) => !isBlocked(u));

  const seen = new Set();
  const unique = [];
  for (const link of links) {
    if (!seen.has(link)) {
      seen.add(link);
      unique.push(link);
    }
    if (unique.length >= limit) break;
  }

  return unique;
}

/**
 * Shape mínimo: solo URL + fuente. El título/snippet reales hay que
 * llenarlos a mano en moderación (leyendo la página), porque extraer
 * snippet con regex de forma confiable es lo más frágil de todo esto.
 */
export function mapScrapedWebResult(url, type, query) {
  let source = "";
  try {
    source = new URL(url).hostname;
  } catch {
    source = "";
  }
  return {
    title: query,
    snippet: "",
    url,
    source,
    type,
    status: "pending",
    fetchedAt: new Date().toISOString(),
  };
}
