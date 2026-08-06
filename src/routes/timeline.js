import { Router } from "express";
import {
  addTimelineEntry,
  deleteTimelineEntry,
  getTimeline,
  updateTimelineEntry,
} from "../services/store.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const timelineRouter = Router();

// GET /timeline — público, ordenado cronológicamente
timelineRouter.get("/", (req, res) => {
  const timeline = getTimeline();
  res.json({ timeline });
});

// POST /admin/timeline { date, title, description, imageUrl }
// "date" acepta cualquier fecha (pasada, futura, del año que sea).
timelineRouter.post("/", requireAdmin, (req, res) => {
  const { date, title, description, imageUrl } = req.body || {};

  if (!date || !title) {
    return res.status(400).json({ error: "Faltan 'date' y/o 'title'" });
  }
  if (Number.isNaN(new Date(date).getTime())) {
    return res.status(400).json({ error: "Fecha inválida, usa formato YYYY-MM-DD" });
  }

  const entry = addTimelineEntry({ date, title, description, imageUrl });
  res.status(201).json({ entry });
});

// POST /admin/timeline/bulk { items: [{ date, title, description, imageUrl }, ...] }
// Para cargar varios hitos de un jalón en formato JSON, ej:
// [{"date":"2016-05-01","title":"Primeras maquetas","description":"..."}, ...]
timelineRouter.post("/bulk", requireAdmin, (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Manda 'items' (array de objetos)" });
  }

  const invalid = [];
  const valid = [];
  items.forEach((it, i) => {
    if (!it || !it.date || !it.title || Number.isNaN(new Date(it.date).getTime())) {
      invalid.push({ index: i, item: it });
      return;
    }
    valid.push(it);
  });

  if (invalid.length) {
    return res.status(400).json({ error: "Algunos items son inválidos (falta date/title o la fecha no es válida)", invalid });
  }

  const entries = valid.map((it) =>
    addTimelineEntry({ date: it.date, title: it.title, description: it.description, imageUrl: it.imageUrl })
  );
  res.status(201).json({ added: entries.length });
});

// PATCH /admin/timeline/:id — editar un hito existente
timelineRouter.patch("/:id", requireAdmin, (req, res) => {
  const { date, title, description, imageUrl } = req.body || {};
  const patch = {};
  if (date !== undefined) {
    if (Number.isNaN(new Date(date).getTime())) {
      return res.status(400).json({ error: "Fecha inválida" });
    }
    patch.date = date;
  }
  if (title !== undefined) patch.title = title;
  if (description !== undefined) patch.description = description;
  if (imageUrl !== undefined) patch.imageUrl = imageUrl;

  const updated = updateTimelineEntry(req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "No encontrado" });
  res.json({ entry: updated });
});

// DELETE /admin/timeline/:id
timelineRouter.delete("/:id", requireAdmin, (req, res) => {
  const ok = deleteTimelineEntry(req.params.id);
  if (!ok) return res.status(404).json({ error: "No encontrado" });
  res.status(204).send();
});
