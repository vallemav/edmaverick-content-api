import { Router } from "express";
import { addAlbum, deleteAlbum, getAlbums, updateAlbum } from "../services/store.js";
import { fetchAlbumsFromSpotify } from "../services/spotifyScraper.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

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
