import { Router } from "express";
import { addAlbum, deleteAlbum, getAlbums, updateAlbum } from "../services/store.js";
import { fetchAlbumsFromSpotify } from "../services/spotifyService.js";
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

// POST /admin/albums/refresh — a futuro trae discografía real desde
// Spotify. Por ahora responde 501 explicando que falta configurar.
albumsRouter.post("/refresh", requireAdmin, async (req, res) => {
  try {
    const albums = await fetchAlbumsFromSpotify();
    const added = albums.map((a) => addAlbum({ ...a, source: "spotify" }));
    res.json({ added: added.length });
  } catch (err) {
    res.status(501).json({ error: err.message, code: err.code || "NOT_IMPLEMENTED" });
  }
});
