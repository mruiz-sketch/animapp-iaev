// Enviar un aviso desde admin.html. Requiere iniciar sesión con una cuenta docente de la Academia.
// GET  -> {suscritos}   POST {title, body, url} -> {ok, id}
const { DOCENTES, fb, json, enviar, suscritos } = require("../lib/avisos");

exports.handler = async (event) => {
  try {
    const m = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || "");
    if (!m) return json(401, { error: "Inicia sesión" });
    const u = await fb().auth().verifyIdToken(m[1]);
    const mail = String(u.email || "").toLowerCase();
    if (!u.email_verified || !DOCENTES.includes(mail)) return json(403, { error: "Solo los docentes de la Academia IAEV pueden enviar avisos." });
    if (event.httpMethod === "GET") return json(200, { suscritos: await suscritos() });
    if (event.httpMethod !== "POST") return json(405, { error: "Usa POST" });
    const b = JSON.parse(event.body || "{}");
    if (!String(b.title || "").trim()) return json(400, { error: "Falta el título" });
    const id = await enviar({ title: b.title, body: b.body, url: b.url, tag: "admin-" + Date.now() });
    console.log("Aviso enviado por", mail, id);
    return json(200, { ok: true, id });
  } catch (e) {
    console.error(e);
    const code = String(e.code || "");
    return json(e.status || (code.startsWith("auth/") ? 401 : 500), { error: e.message || "Error" });
  }
};
