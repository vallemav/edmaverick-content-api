# edmaverick-content-api

De ManglarLeo y Claude 🐊

Backend de contenido para el tributo a edMaverick: fotos, biografía y
noticias, obtenidos vía **scraping directo de Google** (la Custom Search
JSON API quedó cerrada para clientes nuevos en 2025, así que no es opción).

## Cómo funciona

- `services/googleImageScraper.js` — pega a `google.com/search?udm=2`
  (pestaña Imágenes) y extrae URLs de imagen por regex del HTML/JSON
  embebido que Google manda en la página.
- `services/googleWebScraper.js` — pega a `google.com/search` normal y
  extrae las URLs de resultados (de los links `/url?q=...`), para bio y
  noticias.
- Ambos guardan **solo texto** (URLs), nunca el binario de la imagen:
  cero costo de storage, y evitamos "alojar" contenido de terceros
  nosotros mismos.
- Todo lo scrapeado entra como `pending` — se aprueba a mano desde los
  endpoints admin antes de mostrarse en el sitio público.

## ⚠️ Es frágil, a propósito lo sabemos

- Google puede cambiar el HTML/JSON embebido sin avisar → el regex deja
  de encontrar resultados. Si un día `/photos/refresh` regresa `added: 0`
  de la nada, el primer sospechoso es `googleImageScraper.js` o
  `googleWebScraper.js`.
- Hay una pausa de 1.5s entre queries para no golpear a Google en ráfaga
  y reducir el riesgo de bloqueo por IP — no la quites.
- Si empiezas a ver 429 o bloqueos consistentes, hay que espaciar más las
  llamadas o mover el refresh a correrse manualmente muy de vez en
  cuando (no en un cron agresivo).
- Contra los Términos de Servicio de Google si se hace a gran escala;
  acá el volumen es bajo (pocas queries, cache larga), pero es bueno
  tenerlo presente.

## Setup

```bash
cp .env.example .env
# llena solo ADMIN_TOKEN (ya no hay API key de Google que meter)
npm install
```

## Probar el scraper (sin levantar el servidor)

```bash
npm run test:search
```

Si ves URLs de imágenes y de resultados web en consola, el scraper sirve.
Si sale vacío o con error, revisa el aviso de arriba.

## Levantar el servidor

```bash
npm run dev
```

## Endpoints

### Públicos (el frontend los consume directo, sin token)
- `GET /photos?category=conciertos|backstage|estudio` → fotos aprobadas
- `GET /content/bio` → resultados de biografía aprobados
- `GET /content/news` → noticias/lanzamientos aprobados

### Admin (requieren header `x-admin-token: <ADMIN_TOKEN>`)
- `POST /photos/refresh` `{ "category": "todas" }` → dispara el scraping, guarda como `pending`
- `GET /photos/pending` → fotos por moderar
- `PATCH /photos/:id/approve` → aprueba una foto (pasa a visible)
- `DELETE /photos/:id` → elimina una foto
- `POST /content/:type/refresh` (`type` = `bio` o `news`)
- `GET /content/:type/pending`
- `PATCH /content/:type/:id/approve`

## Importante — seguridad

- `ADMIN_TOKEN` vive **solo** en `.env` del servidor. Nunca se manda al
  frontend, nunca se hardcodea en el código, nunca se sube al repo
  (`.env` está en `.gitignore`).
- El panel de moderación (a construir) debe vivir en un área admin que
  mande el `x-admin-token` desde una llamada server-to-server o desde un
  input que tú mismo escribes localmente — nunca un token embebido en el
  bundle público, mismo error que se corrigió antes con `VITE_ADMIN_TOKEN`.

## Siguiente paso

`store.js` guarda todo en JSON local (`data/`) para probar rápido. Cuando
quede validado el flujo, se reemplaza por las tablas Supabase
`tribute_photos` y `tribute_web_results` (mismo Supabase que ya usa el
resto del ecosistema Manglar), manteniendo el mismo shape de datos que ya
definen `googleImageScraper.js` y `googleWebScraper.js`.
