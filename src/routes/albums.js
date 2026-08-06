import { Router } from "express";
import { addAlbum, deleteAlbum, getAlbums, updateAlbum } from "../services/store.js";
import { extractSpotifyAlbumId, fetchAlbumsFromSpotify, fetchAlbumTracksFromSpotify } from "../services/spotifyScraper.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const albumsRouter = Router();

// GET /albums — público
albumsRouter.get("/", (req, res) => {
  const albums = getAlbums();
  res.json({ albums });
});

// POST /admin/albums { title, year, coverUrl, tracks, spotifyUrl }
// Carga manual mientras conectamos Spotify.
albumsRouter.post("/", requireAdmin, (req, res) => {
  const { title, year, coverUrl, tracks, spotifyUrl } = req.body || {};
  if (!title) return res.status(400).json({ error: "Falta 'title'" });

  const album = addAlbum({ title, year, coverUrl, tracks, spotifyUrl, source: "manual" });
  res.status(201).json({ album });
});

// PATCH /admin/albums/:id
albumsRouter.patch("/:id", requireAdmin, (req, res) => {
  const { title, year, coverUrl, tracks, spotifyUrl } = req.body || {};
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (year !== undefined) patch.year = year;
  if (coverUrl !== undefined) patch.coverUrl = coverUrl;
  if (tracks !== undefined) patch.tracks = tracks;
  if (spotifyUrl !== undefined) patch.spotifyUrl = spotifyUrl;

  const updated = updateAlbum(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "No encontrado" });
  res.json({ album: updated });
});

// DELETE /admin/albums/:id
albumsRouter.delete("/:id", requireAdmin, (req, res) => {
  const ok = deleteAlbum(req.params.id);
  if (!ok) return res.status(404).json({ error: "No encontrado" });
  res.status(204).send();
});

// POST /admin/albums/refresh — trae la discografía real haciendo scraping
// de la página pública del artista en Spotify (sin API oficial, ver
// services/spotifyScraper.js). Deduplica por spotifyUrl para que
// refrescar varias veces no ande metiendo álbumes repetidos.
albumsRouter.post("/refresh", requireAdmin, async (req, res) => {
  try {
    const scraped = await fetchAlbumsFromSpotify();

    const existingUrls = new Set(getAlbums().map((a) => a.spotifyUrl).filter(Boolean));
    const nuevos = scraped.filter((a) => a.title && !existingUrls.has(a.spotifyUrl));

    const added = nuevos.map((a) => addAlbum({ ...a, source: "spotify" }));
    res.json({ added: added.length, total: scraped.length, skipped: scraped.length - added.length });
  } catch (err) {
    res.status(502).json({ error: err.message, code: err.code || "SPOTIFY_SCRAPE_FAILED" });
  }
});

// POST /admin/albums/:id/tracks/refresh — trae la lista de canciones de UN
// álbum desde Spotify (Pathfinder "getAlbum") y la guarda en trackList.
// Requiere que el álbum tenga spotifyUrl (si se cargó a mano sin link de
// Spotify, no hay forma de saber qué álbum es allá).
albumsRouter.post("/:id/tracks/refresh", requireAdmin, async (req, res) => {
  const album = getAlbums().find((a) => a.id === req.params.id);
  if (!album) return res.status(404).json({ error: "No encontrado" });

  const albumId = extractSpotifyAlbumId(album.spotifyUrl);
  if (!albumId) {
    return res.status(400).json({ error: "Este álbum no tiene un link de Spotify válido (spotifyUrl)" });
  }

  try {
    const trackList = await fetchAlbumTracksFromSpotify({ albumId });
    const updated = updateAlbum(album.id, { trackList, tracks: trackList.length || album.tracks });
    res.json({ album: updated });
  } catch (err) {
    res.status(502).json({ error: err.message, code: err.code || "SPOTIFY_SCRAPE_FAILED" });
  }
});

// POST /admin/albums/refresh-tracks — recorre TODOS los álbumes que tengan
// spotifyUrl y les rellena trackList. Por defecto solo completa los que
// todavía no tienen canciones cargadas (para no repegarle a Spotify sin
// necesidad); mandando { force: true } en el body los vuelve a traer todos.
// Va uno por uno con una pausa chica entre cada uno para no disparar rate
// limiting de Spotify.
albumsRouter.post("/refresh-tracks", requireAdmin, async (req, res) => {
  const force = Boolean(req.body?.force);
  const albums = getAlbums().filter((a) => a.spotifyUrl && (force || !a.trackList || a.trackList.length === 0));

  const results = [];
  for (const album of albums) {
    const albumId = extractSpotifyAlbumId(album.spotifyUrl);
    if (!albumId) {
      results.push({ id: album.id, title: album.title, ok: false, error: "spotifyUrl inválida" });
      continue;
    }
    try {
      const trackList = await fetchAlbumTracksFromSpotify({ albumId });
      updateAlbum(album.id, { trackList, tracks: trackList.length || album.tracks });
      results.push({ id: album.id, title: album.title, ok: true, tracks: trackList.length });
    } catch (err) {
      results.push({ id: album.id, title: album.title, ok: false, error: err.message });
    }
    await sleep(300); // pequeña pausa entre álbum y álbum
  }

  const ok = results.filter((r) => r.ok).length;
  res.json({ processed: results.length, ok, failed: results.length - ok, results });
});
