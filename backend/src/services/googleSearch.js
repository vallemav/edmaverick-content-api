/**
 * googleSearch.js
 * De ManglarLeo y Claude 🐊
 *
 * Única puerta de salida hacia Google Custom Search API.
 * La API key vive SOLO acá (server), leída de process.env — nunca se
 * expone al frontend, nunca se manda en una respuesta al cliente.
 */

const ENDPOINT = "https://www.googleapis.com/customsearch/v1";

/**
 * @param {string} query - texto a buscar
 * @param {object} opts
 * @param {"image"|undefined} opts.searchType - "image" para fotos, undefined para web normal
 * @param {number} opts.num - resultados a pedir (máx 10 por request en esta API)
 */
export async function googleSearch(query, { searchType, num = 10 } = {}) {
  const apiKey = process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CX;

  if (!apiKey || !cx) {
    throw new Error("Falta GOOGLE_API_KEY o GOOGLE_CX en las variables de entorno");
  }

  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(Math.min(num, 10)),
    safe: "active",
  });

  if (searchType === "image") {
    params.set("searchType", "image");
  }

  const res = await fetch(`${ENDPOINT}?${params.toString()}`);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google Custom Search respondió ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.items || [];
}

/** Mapea un item de imagen de la API al shape que guardamos en tribute_photos */
export function mapImageResult(item, category) {
  return {
    url: item.link,
    thumbnailUrl: item.image?.thumbnailLink ?? item.link,
    sourcePageUrl: item.image?.contextLink ?? item.displayLink,
    width: item.image?.width ?? null,
    height: item.image?.height ?? null,
    title: item.title ?? "",
    category,
    status: "pending", // requiere aprobación manual antes de mostrarse
    fetchedAt: new Date().toISOString(),
  };
}

/** Mapea un item de búsqueda web normal al shape que guardamos en tribute_web_results */
export function mapWebResult(item, type) {
  return {
    title: item.title ?? "",
    snippet: item.snippet ?? "",
    url: item.link,
    source: item.displayLink ?? "",
    type, // "bio" | "news"
    status: "pending",
    fetchedAt: new Date().toISOString(),
  };
}
