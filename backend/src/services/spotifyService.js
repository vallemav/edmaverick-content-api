/**
 * spotifyService.js
 * De ManglarLeo y Claude 🐊
 *
 * Placeholder para cuando conectemos la Discografía a la API real de
 * Spotify (Client Credentials Flow: buscar artista por nombre, traer sus
 * álbumes/singles con /artists/{id}/albums). Por ahora no hay credenciales
 * (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET) configuradas, así que el
 * refresh automático no está activo — la discografía se carga a mano
 * desde el panel (igual que las fotos manuales).
 *
 * Cuando se active, este archivo debe:
 * 1. Pedir un access_token con client_credentials a accounts.spotify.com.
 * 2. Buscar el artista (o usar su Spotify ID fijo, mejor).
 * 3. Traer /artists/{id}/albums?include_groups=album,single
 * 4. Mapear cada álbum a { title, year, coverUrl, tracks, spotifyUrl, source: "spotify" }
 * 5. Guardarlos con addAlbum() en services/store.js (mismo patrón que fotos).
 */

export async function fetchAlbumsFromSpotify() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    const err = new Error(
      "Spotify no está configurado todavía (faltan SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET en .env)"
    );
    err.code = "SPOTIFY_NOT_CONFIGURED";
    throw err;
  }

  // TODO: implementar el flujo real cuando tengamos las credenciales.
  throw new Error("fetchAlbumsFromSpotify aún no está implementado");
}
