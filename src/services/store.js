/**
 * store.js
 * De ManglarLeo y Claude 🐊
 *
 * Persistencia mínima en disco (JSON) para arrancar rápido y probar el
 * flujo completo. Cuando quede validado, esto se reemplaza 1:1 por
 * llamadas a Supabase (tablas tribute_photos / tribute_web_results),
 * mismo patrón que ya usas en el resto del ecosistema Manglar.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const FILES = {
  photos: path.join(DATA_DIR, "photos.json"),
  webResults: path.join(DATA_DIR, "webResults.json"),
  timeline: path.join(DATA_DIR, "timeline.json"),
  albums: path.join(DATA_DIR, "albums.json"),
};

function ensureFile(filePath) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(filePath)) writeFileSync(filePath, "[]", "utf-8");
}

function readAll(filePath) {
  ensureFile(filePath);
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeAll(filePath, items) {
  writeFileSync(filePath, JSON.stringify(items, null, 2), "utf-8");
}

// --- Fotos ---
export function getPhotos({ category, status } = {}) {
  let items = readAll(FILES.photos);
  if (category && category !== "todas") items = items.filter((p) => p.category === category);
  if (status) items = items.filter((p) => p.status === status);
  return items;
}

export function addPhotos(newPhotos) {
  const items = readAll(FILES.photos);
  const existingUrls = new Set(items.map((p) => p.url));
  const toAdd = newPhotos
    .filter((p) => !existingUrls.has(p.url)) // evita duplicados
    .map((p) => ({ id: randomUUID(), ...p }));
  writeAll(FILES.photos, [...items, ...toAdd]);
  return toAdd;
}

export function updatePhotoStatus(id, status) {
  const items = readAll(FILES.photos);
  const idx = items.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  items[idx].status = status;
  writeAll(FILES.photos, items);
  return items[idx];
}

export function updatePhoto(id, patch) {
  const items = readAll(FILES.photos);
  const idx = items.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id: items[idx].id };
  writeAll(FILES.photos, items);
  return items[idx];
}

export function deletePhoto(id) {
  const items = readAll(FILES.photos);
  const filtered = items.filter((p) => p.id !== id);
  writeAll(FILES.photos, filtered);
  return filtered.length !== items.length;
}

// --- Resultados web (bio / news) ---
export function getWebResults({ type, status } = {}) {
  let items = readAll(FILES.webResults);
  if (type) items = items.filter((r) => r.type === type);
  if (status) items = items.filter((r) => r.status === status);
  return items;
}

export function addWebResults(newResults) {
  const items = readAll(FILES.webResults);
  const existingUrls = new Set(items.map((r) => r.url));
  const toAdd = newResults
    .filter((r) => !existingUrls.has(r.url))
    .map((r) => ({ id: randomUUID(), ...r }));
  writeAll(FILES.webResults, [...items, ...toAdd]);
  return toAdd;
}

export function updateWebResultStatus(id, status) {
  const items = readAll(FILES.webResults);
  const idx = items.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  items[idx].status = status;
  writeAll(FILES.webResults, items);
  return items[idx];
}

export function updateWebResult(id, patch) {
  const items = readAll(FILES.webResults);
  const idx = items.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id: items[idx].id };
  writeAll(FILES.webResults, items);
  return items[idx];
}

export function deleteWebResult(id) {
  const items = readAll(FILES.webResults);
  const filtered = items.filter((r) => r.id !== id);
  writeAll(FILES.webResults, filtered);
  return filtered.length !== items.length;
}

// --- Historia (línea de tiempo) ---
// Vos controlás esto 100% a mano desde el panel: cualquier fecha, cualquier
// hito. No depende de scraping ni de ninguna API externa.
export function getTimeline() {
  const items = readAll(FILES.timeline);
  // Orden cronológico por fecha (ascendente)
  return items.sort((a, b) => new Date(a.date) - new Date(b.date));
}

export function addTimelineEntry(entry) {
  const items = readAll(FILES.timeline);
  const toAdd = {
    id: randomUUID(),
    date: entry.date, // ISO string "YYYY-MM-DD"
    title: entry.title,
    description: entry.description || "",
    imageUrl: entry.imageUrl || null,
    createdAt: new Date().toISOString(),
  };
  writeAll(FILES.timeline, [...items, toAdd]);
  return toAdd;
}

export function updateTimelineEntry(id, patch) {
  const items = readAll(FILES.timeline);
  const idx = items.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id: items[idx].id };
  writeAll(FILES.timeline, items);
  return items[idx];
}

export function deleteTimelineEntry(id) {
  const items = readAll(FILES.timeline);
  const filtered = items.filter((t) => t.id !== id);
  writeAll(FILES.timeline, filtered);
  return filtered.length !== items.length;
}

// --- Discografía ---
// Por ahora se maneja a mano desde el panel (igual que fotos manuales).
// A futuro: reemplazar/():complementar con un fetch a la API de Spotify
// (ver services/spotifyService.js), guardando igual en este mismo store.
export function getAlbums() {
  const items = readAll(FILES.albums);
  return items.sort((a, b) => (a.year || 0) - (b.year || 0));
}

export function addAlbum(album) {
  const items = readAll(FILES.albums);
  const toAdd = {
    id: randomUUID(),
    title: album.title,
    year: album.year || null,
    coverUrl: album.coverUrl || null,
    tracks: album.tracks || null,
    trackList: album.trackList || null, // [{ number, discNumber, title, duration, durationMs, artists, spotifyUrl }]
    spotifyUrl: album.spotifyUrl || null,
    releaseType: album.releaseType || null, // "album" | "single" | "compilation"
    source: album.source || "manual", // "manual" | "spotify"
    createdAt: new Date().toISOString(),
  };
  writeAll(FILES.albums, [...items, toAdd]);
  return toAdd;
}

export function updateAlbum(id, patch) {
  const items = readAll(FILES.albums);
  const idx = items.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, id: items[idx].id };
  writeAll(FILES.albums, items);
  return items[idx];
}

export function deleteAlbum(id) {
  const items = readAll(FILES.albums);
  const filtered = items.filter((a) => a.id !== id);
  writeAll(FILES.albums, filtered);
  return filtered.length !== items.length;
}
