// Enviar un aviso desde admin.html. Requiere iniciar sesión con una cuenta docente de la Academia.
// GET -> {suscritos}   POST {title, body, url} -> {ok, id}
import { json, DOCENTES, usuario, enviar, firestore } from "../_lib/google.js";

export async function onRequest({ request, env }) {
  try {
    const m = /^Bearer (.+)$/.exec(request.headers.get("authorization") || "");
    if (!m) return json(401, { error: "Inicia sesión" });
    const u = await usuario(m[1]);
    if (!u.verified || !DOCENTES.includes(u.email)) return json(403, { error: "Solo los docentes de la Academia IAEV pueden enviar avisos." });
    if (request.method === "GET") return json(200, { suscritos: await firestore(env).count("avisos_tokens") });
    if (request.method !== "POST") return json(405, { error: "Usa POST" });
    const b = await request.json().catch(() => ({}));
    if (!String(b.title || "").trim()) return json(400, { error: "Falta el título" });
    const id = await enviar(env, { title: b.title, body: b.body, url: b.url, tag: "admin-" + Date.now() });
    return json(200, { ok: true, id });
  } catch (e) { return json(e.status || 500, { error: e.message || "Error" }); }
}
