/**
 * spotifyScraper.js
 * De ManglarLeo y Claude 🐊
 *
 * Port a Node de la lógica real de SpotifyScraper (Python,
 * https://github.com/AliAkhtari78/SpotifyScraper). El intento anterior
 * (leer meta tags og:image del HTML del artista) no jala porque Spotify
 * ya no manda esa info completa en el HTML inicial de open.spotify.com.
 *
 * Lo que sí funciona (confirmado por esa librería): hablar directo con la
 * API interna que usa el propio open.spotify.com por dentro — "Pathfinder"
 * (GraphQL con persisted queries) — usando un token anónimo de corta
 * duración. Nada de OAuth, nada de client id/secret, nada de login.
 *
 * Flujo:
 * 1. GET a una página de embed pública (open.spotify.com/embed/track/<id>)
 *    → trae un <script id="__NEXT_DATA__"> con un accessToken anónimo
 *    (bearer, dura ~1h) en props.pageProps.state.settings.session.
 * 2. GET a api-partner.spotify.com/pathfinder/v1/query con ese token,
 *    pidiendo la operación persistida "queryArtistDiscographyAll" para el
 *    artista → devuelve TODOS sus álbumes/singles/EPs en JSON real
 *    (nombre, año, portada en varios tamaños, # de canciones). Nada de
 *    parsear HTML para esta parte.
 * 3. Pagina de a 50 hasta juntar discography.all.totalCount.
 *
 * Riesgos conocidos (y primer lugar a mirar si /albums/refresh falla):
 * - DISCOGRAPHY_QUERY_HASH es el sha256 de la persisted query. Spotify lo
 *   puede rotar sin avisar — si el error es "PersistedQueryNotFound", hay
 *   que sacar el hash nuevo inspeccionando el Network tab de
 *   open.spotify.com/artist/<id> (buscar la request a
 *   .../pathfinder/v1/query?operationName=queryArtistDiscographyAll) y
 *   pegarlo acá abajo.
 * - El token anónimo dura ~1h; se cachea en memoria del proceso y se
 *   renueva solo (al expirar o si Spotify responde 401).
 */

const DEFAULT_ARTIST_ID = process.env.SPOTIFY_ARTIST_ID || "3JSSjGYcIkgsrz7892CelT"; // Ed Maverick

// Track público cualquiera — solo sirve para "arrancar" el token anónimo,
// no se pide ni se usa información de esta canción.
const BOOTSTRAP_TRACK_ID = "4uLU6hMCjMI75M1A2tKUQC";

const PATHFINDER_URL = "https://api-partner.spotify.com/pathfinder/v1/query";
const DISCOGRAPHY_OPERATION = "queryArtistDiscographyAll";
const DISCOGRAPHY_QUERY_HASH = "5e07d323febb57b4a56a42abbf781490e58764aa45feb6e3dc0591564fc56599";

// Operación "getAlbum" — trae el álbum completo (incluye tracksV2, la lista
// de canciones paginada). Mismo mecanismo que la discografía: token anónimo
// + persisted query. Si un día tira "PersistedQueryNotFound", el hash nuevo
// se saca igual que el de arriba, pero inspeccionando la request a
// open.spotify.com/album/<id> en vez de /artist/<id>.
const ALBUM_OPERATION = "getAlbum";
const ALBUM_QUERY_HASH = "b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10";

const PAGE_SIZE = 50;
const TOKEN_EXPIRY_SKEW_MS = 60_000; // renueva 1 min antes de que venza, no justo al filo

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36";

// Cache del token en memoria del proceso (vive mientras el server esté
// arriba). No hace falta persistirlo en disco: se re-pide solo.
let cachedToken = null; // { accessToken, expiresAtMs }

/** Saca un token anónimo nuevo desde una página de embed pública. */
async function bootstrapToken() {
  const url = `https://open.spotify.com/embed/track/${BOOTSTRAP_TRACK_ID}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en",
    },
  });
  if (!res.ok) {
    throw new Error(`Spotify respondió ${res.status} al pedir la página de embed (bootstrap de token)`);
  }
  const html = await res.text();

  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    const err = new Error(
      "No se encontró __NEXT_DATA__ en la página de embed — Spotify pudo haber cambiado el formato (revisar spotifyScraper.js)"
    );
    err.code = "SPOTIFY_SCRAPE_EMPTY";
    throw err;
  }

  let nextData;
  try {
    nextData = JSON.parse(match[1]);
  } catch {
    throw new Error("__NEXT_DATA__ no es JSON válido — Spotify pudo haber cambiado el formato");
  }

  const session = nextData?.props?.pageProps?.state?.settings?.session;
  const accessToken = session?.accessToken;
  const expiresAtMs = session?.accessTokenExpirationTimestampMs;

  if (!accessToken || typeof expiresAtMs !== "number") {
    throw new Error("La página de embed no trajo un accessToken anónimo válido");
  }

  return { accessToken, expiresAtMs };
}

/** Devuelve un token válido, renovando si ya venció o si se pide a la fuerza. */
async function getToken({ forceRefresh = false } = {}) {
  const now = Date.now();
  const isStale = !cachedToken || now >= cachedToken.expiresAtMs - TOKEN_EXPIRY_SKEW_MS;
  if (forceRefresh || isStale) {
    cachedToken = await bootstrapToken();
  }
  return cachedToken.accessToken;
}

/** Pega una página de discografía del artista a la Pathfinder API. */
async function fetchDiscographyPage(artistId, offset, token) {
  const variables = { uri: `spotify:artist:${artistId}`, offset, limit: PAGE_SIZE };
  const params = new URLSearchParams({
    operationName: DISCOGRAPHY_OPERATION,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: DISCOGRAPHY_QUERY_HASH } }),
  });

  return fetch(`${PATHFINDER_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "app-platform": "WebPlayer",
      "User-Agent": UA,
      Accept: "application/json",
    },
  });
}

/** Portada de mayor resolución disponible en coverArt.sources[]. */
function bestCoverUrl(coverArt) {
  const sources = coverArt?.sources;
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return [...sources].sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null;
}

function mapReleaseType(type) {
  if (type === "ALBUM") return "album";
  if (type === "SINGLE") return "single";
  if (type === "COMPILATION") return "compilation";
  return (type || "").toLowerCase() || null;
}

/**
 * @param {object} opts
 * @param {string} opts.artistId - Spotify artist ID (default: Ed Maverick)
 * @param {number} opts.limit - tope de lanzamientos a traer, por seguridad
 */
export async function fetchAlbumsFromSpotify({ artistId = DEFAULT_ARTIST_ID, limit = 200 } = {}) {
  const albums = [];
  let offset = 0;
  let total = null;
  let token = await getToken();
  let retried401 = false;

  while (albums.length < limit && (total === null || offset < total)) {
    const res = await fetchDiscographyPage(artistId, offset, token);

    if (res.status === 401 && !retried401) {
      // El token venció antes de tiempo (o Spotify lo invalidó) — se
      // renueva una sola vez y se reintenta la misma página.
      retried401 = true;
      token = await getToken({ forceRefresh: true });
      continue;
    }

    if (!res.ok) {
      throw new Error(`Pathfinder respondió ${res.status} al pedir la discografía`);
    }

    const body = await res.json().catch(() => null);
    if (!body) {
      throw new Error("Pathfinder no devolvió JSON válido");
    }

    if (Array.isArray(body.errors) && body.errors.some((e) => e?.message === "PersistedQueryNotFound")) {
      const err = new Error(
        "Spotify rotó el hash de la query persistida (PersistedQueryNotFound) — hay que actualizar DISCOGRAPHY_QUERY_HASH en spotifyScraper.js"
      );
      err.code = "SPOTIFY_QUERY_HASH_ROTATED";
      throw err;
    }

    const union = body?.data?.artistUnion;
    if (!union) {
      const err = new Error("No se encontró el artista en Spotify (artistUnion vacío) — revisar SPOTIFY_ARTIST_ID");
      err.code = "SPOTIFY_ARTIST_NOT_FOUND";
      throw err;
    }

    const node = union?.discography?.all;
    const items = node?.items || [];
    if (total === null) total = typeof node?.totalCount === "number" ? node.totalCount : null;
    if (items.length === 0) break;

    for (const group of items) {
      for (const release of group?.releases?.items || []) {
        if (!release?.uri || !release?.name) continue;
        const id = release.id || release.uri.split(":").pop();
        albums.push({
          title: release.name,
          year: release.date?.year ?? null,
          coverUrl: bestCoverUrl(release.coverArt),
          tracks: release.tracks?.totalCount ?? null,
          spotifyUrl: `https://open.spotify.com/album/${id}`,
          releaseType: mapReleaseType(release.type),
        });
      }
    }

    offset += items.length;
  }

  if (albums.length === 0) {
    const err = new Error("Spotify no devolvió lanzamientos para este artista (discografía vacía)");
    err.code = "SPOTIFY_SCRAPE_EMPTY";
    throw err;
  }

  return albums.slice(0, limit);
}

/** Saca el ID de álbum de una URL tipo https://open.spotify.com/album/<id>(?...). */
export function extractSpotifyAlbumId(spotifyUrl) {
  if (!spotifyUrl) return null;
  const match = spotifyUrl.match(/album\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

/** Pega una página de canciones de un álbum a la Pathfinder API. */
async function fetchAlbumPage(albumId, offset, token) {
  const variables = { uri: `spotify:album:${albumId}`, locale: "", offset, limit: PAGE_SIZE };
  const params = new URLSearchParams({
    operationName: ALBUM_OPERATION,
    variables: JSON.stringify(variables),
    extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: ALBUM_QUERY_HASH } }),
  });

  return fetch(`${PATHFINDER_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "app-platform": "WebPlayer",
      "User-Agent": UA,
      Accept: "application/json",
    },
  });
}

function msToDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Trae la lista completa de canciones de un álbum (paginando de a 50).
 * @param {object} opts
 * @param {string} opts.albumId - Spotify album ID
 */
export async function fetchAlbumTracksFromSpotify({ albumId }) {
  if (!albumId) {
    const err = new Error("Falta albumId para traer las canciones");
    err.code = "SPOTIFY_ALBUM_ID_MISSING";
    throw err;
  }

  const tracks = [];
  let offset = 0;
  let total = null;
  let token = await getToken();
  let retried401 = false;

  while (total === null || offset < total) {
    const res = await fetchAlbumPage(albumId, offset, token);

    if (res.status === 401 && !retried401) {
      retried401 = true;
      token = await getToken({ forceRefresh: true });
      continue;
    }

    if (!res.ok) {
      throw new Error(`Pathfinder respondió ${res.status} al pedir las canciones del álbum`);
    }

    const body = await res.json().catch(() => null);
    if (!body) throw new Error("Pathfinder no devolvió JSON válido al pedir las canciones del álbum");

    if (Array.isArray(body.errors) && body.errors.some((e) => e?.message === "PersistedQueryNotFound")) {
      const err = new Error(
        "Spotify rotó el hash de la query 'getAlbum' (PersistedQueryNotFound) — hay que actualizar ALBUM_QUERY_HASH en spotifyScraper.js"
      );
      err.code = "SPOTIFY_QUERY_HASH_ROTATED";
      throw err;
    }

    const union = body?.data?.albumUnion;
    if (!union) {
      const err = new Error("No se encontró el álbum en Spotify (albumUnion vacío) — revisar el ID del álbum");
      err.code = "SPOTIFY_ALBUM_NOT_FOUND";
      throw err;
    }

    const tracksNode = union?.tracksV2;
    const items = tracksNode?.items || [];
    if (total === null) total = typeof tracksNode?.totalCount === "number" ? tracksNode.totalCount : items.length;
    if (items.length === 0) break;

    for (const item of items) {
      const t = item?.track;
      if (!t?.uri || !t?.name) continue;
      const id = t.uri.split(":").pop();
      tracks.push({
        number: t.trackNumber ?? null,
        discNumber: t.discNumber ?? null,
        title: t.name,
        durationMs: t.duration?.totalMilliseconds ?? null,
        duration: msToDuration(t.duration?.totalMilliseconds),
        artists: (t.artists?.items || []).map((a) => a?.profile?.name).filter(Boolean),
        spotifyUrl: `https://open.spotify.com/track/${id}`,
      });
    }

    offset += items.length;
  }

  return tracks;
}
