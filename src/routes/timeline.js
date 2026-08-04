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
