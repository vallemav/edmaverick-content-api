import { Router } from "express";
import { scrapeGoogleWeb, mapScrapedWebResult } from "../services/googleWebScraper.js";
import { addWebResults, getWebResults, updateWebResultStatus } from "../services/store.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

export const contentRouter = Router();

const QUERIES = {
  bio: ['"ed Maverick" biografía', '"ed Maverick" entrevista'],
  news: ['"ed Maverick" nuevo álbum 2026', '"ed Maverick" gira 2026', '"ed Maverick" lanzamiento'],
};

// GET /bio | GET /news — público, solo aprobados
contentRouter.get("/:type", (req, res) => {
  const { type } = req.params;
  if (!QUERIES[type]) return res.status(404).json({ error: "Tipo inválido" });
  const results = getWebResults({ type, status: "approved" });
  res.json({ results });
});

// GET /admin/content/:type/pending
contentRouter.get("/:type/pending", requireAdmin, (req, res) => {
  const { type } = req.params;
  const results = getWebResults({ type, status: "pending" });
  res.json({ results });
});

// POST /admin/content/:type/refresh
contentRouter.post("/:type/refresh", requireAdmin, async (req, res) => {
  const { type } = req.params;
  const queries = QUERIES[type];
  if (!queries) return res.status(404).json({ error: "Tipo inválido" });

  try {
    const results = [];
    for (const query of queries) {
      const urls = await scrapeGoogleWeb(query, 10);
      results.push(...urls.map((url) => mapScrapedWebResult(url, type, query)));
      await new Promise((r) => setTimeout(r, 1500));
    }
    const added = addWebResults(results);
    res.json({ added: added.length, total: results.length });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /admin/content/:type/manual { title, url, snippet }
// o { items: [{ title, url, snippet }, ...] } para varios de un jalón.
contentRouter.post("/:type/manual", requireAdmin, (req, res) => {
  const { type } = req.params;
  if (!QUERIES[type]) return res.status(404).json({ error: "Tipo inválido" });

  const { title, url, snippet, items } = req.body || {};
  const rawItems = Array.isArray(items) && items.length ? items : url ? [{ title, url, snippet }] : [];

  if (!rawItems.length) {
    return res.status(400).json({ error: "Manda 'url' (+ title/snippet) o 'items' (array)" });
  }

  const invalid = [];
  const results = rawItems
    .map((it) => ({
      title: (it.title || "").trim(),
      url: (it.url || "").trim(),
      snippet: (it.snippet || "").trim() || null,
    }))
    .filter((it) => {
      if (!/^https?:\/\//i.test(it.url)) {
        invalid.push(it.url);
        return false;
      }
      return true;
    })
    .map((it) => ({
      ...it,
      type,
      status: "approved", // curado a mano, no necesita moderación
      fetchedAt: new Date().toISOString(),
    }));

  if (invalid.length) {
    return res.status(400).json({ error: "URLs inválidas", invalid });
  }

  const added = addWebResults(results);
  res.json({ added: added.length, total: results.length, skipped: results.length - added.length });
});

// PATCH /admin/content/:type/:id/approve
contentRouter.patch("/:type/:id/approve", requireAdmin, (req, res) => {
  const updated = updateWebResultStatus(req.params.id, "approved");
  if (!updated) return res.status(404).json({ error: "No encontrado" });
  res.json({ result: updated });
});
