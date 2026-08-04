/**
 * server.js
 * De ManglarLeo y Claude 🐊
 *
 * Backend de contenido para el tributo edMaverick: fotos, bio y noticias
 * vía Google Custom Search API. La API key y el ADMIN_TOKEN solo existen
 * acá (server), nunca se exponen al frontend.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { photosRouter } from "./routes/photos.js";
import { contentRouter } from "./routes/content.js";
import { timelineRouter } from "./routes/timeline.js";
import { albumsRouter } from "./routes/albums.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
  })
);
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

// Panel admin: solo pega el token y sube links. Nunca linkeado desde el
// frontend público ni indexado (meta robots + ruta no obvia).
// Cambia PANEL_PATH en .env si quieres una ruta distinta a la default.
const panelPath = process.env.PANEL_PATH || "/panel-em26";
app.use(panelPath, express.static(path.join(__dirname, "public/panel")));

// Un solo montaje por router: las rutas admin (pending, refresh, approve,
// delete) ya están protegidas con requireAdmin dentro del propio router,
// así que no hace falta duplicar el prefijo /admin/*.
app.use("/photos", photosRouter);
app.use("/content", contentRouter);
app.use("/timeline", timelineRouter);
app.use("/albums", albumsRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`edmaverick-content-api escuchando en puerto ${port}`);
});
