import { Router } from "express";
import { scrapeGoogleImages, mapScrapedImage } from "../services/googleImageScraper.js";
import { addPhotos, deletePhoto, getPhotos, updatePhoto, updatePhotoStatus } from "../services/store.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const photosRouter = Router();

// Queries por categoría: ajusta/agrega las que quieras
const CATEGORY_QUERIES = {
  conciertos: ['"ed Maverick" concierto', '"ed Maverick" en vivo'],
  backstage: ['"ed Maverick" backstage'],
  estudio: ['"ed Maverick" estudio grabación'],
};

// GET /photos?category=conciertos&status=approved
// Público: solo lee del store, nunca llama a Google en vivo.
photosRouter.get("/", (req, res) => {
  const { category } = req.query;
  const photos = getPhotos({ category, status: "approved" });
  res.json({ photos });
});

// GET /admin/photos/pending — para el panel de moderación
photosRouter.get("/pending", requireAdmin, (req, res) => {
  const photos = getPhotos({ status: "pending" });
  res.json({ photos });
});

// GET /admin/photos/all?category=&status= — vista completa para el panel
// (aprobadas, pendientes, todas). Sirve para "ver las fotos que ya hay".
photosRouter.get("/all", requireAdmin, (req, res) => {
  const { category, status } = req.query;
  const photos = getPhotos({ category, status });
  res.json({ photos, total: photos.length });
});

// GET /admin/photos/categories — categorías existentes + conteo, para
// armar filtros dinámicos en el panel sin hardcodear nada.
photosRouter.get("/categories", requireAdmin, (req, res) => {
  const photos = getPhotos({});
  const counts = {};
  for (const p of photos) counts[p.category] = (counts[p.category] || 0) + 1;
  res.json({ categories: counts });
});

// POST /admin/photos/refresh { category: "conciertos" | "todas" }
photosRouter.post("/refresh", requireAdmin, async (req, res) => {
  const { category = "todas" } = req.body || {};
  const categories = category === "todas" ? Object.keys(CATEGORY_QUERIES) : [category];

  try {
    const results = [];
    for (const cat of categories) {
      const queries = CATEGORY_QUERIES[cat];
      if (!queries) continue;
      for (const query of queries) {
        // Pequeña pausa entre queries para no golpear a Google en ráfaga
        // (esto ayuda a evitar bloqueos por IP).
        const urls = await scrapeGoogleImages(query, 10);
        results.push(...urls.map((url) => mapScrapedImage(url, cat, query)));
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    const added = addPhotos(results);
    res.json({ added: added.length, total: results.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /admin/photos/manual { category, urls: ["https://...", ...] }
// o { category, url: "https://..." } para una sola.
// Tú ya validaste las imágenes a mano, así que entran directo como "approved".
photosRouter.post("/manual", requireAdmin, (req, res) => {
  const { category, url, urls, title, sourcePageUrl } = req.body || {};

  // La categoría ya no es obligatoria: no todas las fotos son de un lugar/
  // evento identificable. Si no viene, cae en "sin-categoria".
  const finalCategory = category && category.trim() ? category.trim() : "sin-categoria";

  const rawUrls = Array.isArray(urls) && urls.length ? urls : url ? [url] : [];

  if (!rawUrls.length) {
    return res.status(400).json({ error: "Manda 'url' o 'urls' (array)" });
  }

  const cleanUrls = rawUrls
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);

  const invalid = cleanUrls.filter((u) => !/^https?:\/\//i.test(u));
  if (invalid.length) {
    return res.status(400).json({ error: "URLs inválidas", invalid });
  }

  const photos = cleanUrls.map((u) => ({
    url: u,
    thumbnailUrl: u,
    sourcePageUrl: sourcePageUrl || null,
    width: null,
    height: null,
    title: title || finalCategory,
    category: finalCategory,
    status: "approved", // curadas a mano, no necesitan pasar por moderación
    fetchedAt: new Date().toISOString(),
  }));

  const added = addPhotos(photos);
  res.json({ added: added.length, total: photos.length, skipped: photos.length - added.length });
});

// PATCH /admin/photos/:id/approve
photosRouter.patch("/:id/approve", requireAdmin, (req, res) => {
  const updated = updatePhotoStatus(req.params.id, "approved");
  if (!updated) return res.status(404).json({ error: "No encontrada" });
  res.json({ photo: updated });
});

// PATCH /admin/photos/:id/reject — la manda de vuelta a "pending" o la
// marca "rejected" según lo que mandes en status.
photosRouter.patch("/:id/reject", requireAdmin, (req, res) => {
  const updated = updatePhotoStatus(req.params.id, "rejected");
  if (!updated) return res.status(404).json({ error: "No encontrada" });
  res.json({ photo: updated });
});

// PATCH /admin/photos/:id — editar título/categoría/urls de una foto ya
// existente, sin tener que borrarla y resubirla.
photosRouter.patch("/:id", requireAdmin, (req, res) => {
  const { title, category, url, thumbnailUrl, sourcePageUrl } = req.body || {};
  const patch = {};
  if (title !== undefined) patch.title = title;
  if (category !== undefined) patch.category = category;
  if (url !== undefined) patch.url = url;
  if (thumbnailUrl !== undefined) patch.thumbnailUrl = thumbnailUrl;
  if (sourcePageUrl !== undefined) patch.sourcePageUrl = sourcePageUrl;

  const updated = updatePhoto(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "No encontrada" });
  res.json({ photo: updated });
});

// DELETE /admin/photos/:id
photosRouter.delete("/:id", requireAdmin, (req, res) => {
  const ok = deletePhoto(req.params.id);
  if (!ok) return res.status(404).json({ error: "No encontrada" });
  res.status(204).send();
});
