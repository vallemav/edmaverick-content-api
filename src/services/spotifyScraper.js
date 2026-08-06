/**
 * spotifyScraper.js
 * De ManglarLeo y Claude 🐊
 *
 * Discografía SIN API oficial de Spotify (sin OAuth, sin
 * SPOTIFY_CLIENT_ID/SECRET). Scrapeamos las páginas públicas de
 * open.spotify.com igual que googleImageScraper.js / googleWebScraper.js:
 * en vez de parsear el DOM (clases que cambian seguido), leemos las meta
 * tags Open Graph que Spotify sí manda renderizadas en el HTML crudo
 * (og:image, music:release_date, og:description) — mucho más estable.
 *
 * Flujo:
 * 1. GET a la página del artista → sacamos los IDs de álbum que
 *    aparecen pegados a un patrón "Album • YYYY" / "Single • YYYY".
 *    Ese patrón filtra solo, de paso, secciones que no queremos
 *    (playlists de "Featuring", "Appears On" de otros artistas, etc.)
 *    porque esas no traen ese texto al lado del link.
 * 2. Por cada ID único, GET a la página del álbum → leemos título real,
 *    portada, año exacto y cantidad de canciones desde sus meta tags.
 * 3. Mapeamos al shape que ya usa services/store.js: { title, year,
 *    coverUrl, tracks, spotifyUrl }.
 *
 * Riesgos conocidos (mismo trato que ya tienen los scrapers de Google):
 * - Si Spotify deja de mandar estas meta tags en el HTML inicial, esto
 *   se rompe — es el primer archivo a revisar si /albums/refresh empieza
 *   a devolver 0 álbumes.
 * - Puede rate-limitear la IP si se refresca muy seguido; por eso hay
 *   pausa entre requests de álbum.
 */

const DEFAULT_ARTIST_ID = process.env.SPOTIFY_ARTIST_ID || "3JSSjGYcIkgsrz7892CelT"; // Ed Maverick

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "es-MX,es;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`Spotify respondió ${res.status} al pedir ${url}`);
  }
  return res.text();
}

/** Lee una meta tag Open Graph / Facebook sin importar el orden de sus atributos. */
function getMeta(html, property) {
  const re1 = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? m[1] : null;
}

/**
 * Extrae los IDs de álbum/single de la página del artista, junto con el
 * tipo y año que Spotify muestra al lado del link (ej. "Album • 2021").
 * Devuelve un Map id -> { type, year }.
 */
function extractAlbumRefs(html) {
  const normalized = html.replace(/\\u0026/g, "&").replace(/\\\//g, "/");

  const linkRegex = /\/album\/([a-zA-Z0-9]{22})/g;
  const refs = new Map();

  let match;
  while ((match = linkRegex.exec(normalized))) {
    const id = match[1];
    if (refs.has(id)) continue;

    // Ventana corta después del link: ahí cae el "Album • 2021" visible,
    // sin depender de qué tags/clases haya en el medio.
    const window = normalized.slice(match.index, match.index + 400);
    const typeYear = window.match(/(Album|Single|EP|Compilation)\s*(?:•|·|&#8226;)\s*(\d{4})/i);
    if (typeYear) {
      refs.set(id, { type: typeYear[1], year: Number(typeYear[2]) });
    }
  }

  return refs;
}

/** Trae título real, portada, año exacto y # de canciones de un álbum puntual. */
async function fetchAlbumDetails(albumId) {
  const url = `https://open.spotify.com/album/${albumId}`;
  const html = await fetchHtml(url);

  const ogTitleRaw = getMeta(html, "og:title") || "";
  const title = ogTitleRaw.replace(/\s*-\s*(Album|Single|EP|Compilation)\s+by\s+.+$/i, "").trim() || null;

  const coverUrl = getMeta(html, "og:image");

  const releaseDate = getMeta(html, "music:release_date");
  const year = releaseDate ? Number(releaseDate.slice(0, 4)) : null;

  const description = getMeta(html, "og:description") || "";
  const trackMatch = description.match(/(\d+)\s+songs?/i);
  const tracks = trackMatch ? Number(trackMatch[1]) : null;

  return { title, year, coverUrl, tracks, spotifyUrl: url };
}

/**
 * @param {object} opts
 * @param {string} opts.artistId - Spotify artist ID (default: Ed Maverick)
 * @param {number} opts.limit - tope de álbumes a traer en detalle (evita
 *   refrescos eternos si el artista tiene discografía gigante)
 */
export async function fetchAlbumsFromSpotify({ artistId = DEFAULT_ARTIST_ID, limit = 40 } = {}) {
  const artistUrl = `https://open.spotify.com/artist/${artistId}`;
  const html = await fetchHtml(artistUrl);
  const refs = extractAlbumRefs(html);

  if (refs.size === 0) {
    const err = new Error(
      "No se encontraron álbumes en la página del artista de Spotify — puede que hayan cambiado el formato del HTML (revisar spotifyScraper.js)"
    );
    err.code = "SPOTIFY_SCRAPE_EMPTY";
    throw err;
  }

  const ids = [...refs.keys()].slice(0, limit);
  const albums = [];

  for (const id of ids) {
    try {
      const details = await fetchAlbumDetails(id);
      albums.push({
        title: details.title,
        year: details.year ?? refs.get(id).year,
        coverUrl: details.coverUrl,
        tracks: details.tracks,
        spotifyUrl: details.spotifyUrl,
      });
    } catch {
      // Si un álbum puntual falla (bloqueo puntual, 404 raro, etc.) no
      // tumbamos todo el refresh — seguimos con los demás.
    }

    // Pausa entre requests para no golpear a Spotify en ráfaga.
    await new Promise((r) => setTimeout(r, 800));
  }

  return albums;
}
