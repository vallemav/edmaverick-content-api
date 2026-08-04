/**
 * requireAdmin.js
 * De ManglarLeo y Claude 🐊
 *
 * Protege /admin/* con un token simple por header. El token vive solo en
 * el servidor (.env) y en el panel admin que tú uses para dispararlo —
 * nunca en el bundle del frontend público, mismo criterio que ya
 * aplicaste con /admin/verify en el resto del ecosistema.
 */

export function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: "ADMIN_TOKEN no configurado en el servidor" });
  }

  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "No autorizado" });
  }

  next();
}
