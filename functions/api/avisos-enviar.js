// Avisos desde admin.html. Requiere iniciar sesión con una cuenta docente de la Academia.
// GET  -> {suscritos, grupos:{ "3-A": n, … }}
// POST {title, body, url}            -> aviso a todos
// POST {grupos:["3-A",…], body}      -> mensaje del profe a esos grupos: el título es su nombre (sin apellidos)
//      y al tocarlo se abre ANIMAPP con una ventana del aviso (/?aviso=…)
import { json, DOCENTES, usuario, enviar, firestore, okGrupo } from "../_lib/google.js";

// Encabezado de los mensajes a grupos: título y nombre de cada docente
const FIRMAS = {
  "ezermeno@upsrj.edu.mx": "Mtra. Elia", "acarrizalez@upsrj.edu.mx": "Prof. Aziz", "mruiz@upsrj.edu.mx": "Mtra. Melanie",
  "chernandez@upsrj.edu.mx": "Mtra. Carmina", "jsalgado@upsrj.edu.mx": "Mtro. Juan Carlos", "jzamora@upsrj.edu.mx": "Mtro. Francisco",
  "iraragon@upsrj.edu.mx": "Prof. Isaí", "ghernandez@upsrj.edu.mx": "Mtro. Germán", "vibarra@upsrj.edu.mx": "Mtro. Víctor",
};
const firma = u => FIRMAS[u.email] || (u.name || u.email.split("@")[0]).split(/\s+/)[0];
const b64u = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function onRequest({ request, env }) {
  try {
    const m = /^Bearer (.+)$/.exec(request.headers.get("authorization") || "");
    if (!m) return json(401, { error: "Inicia sesión" });
    const u = await usuario(m[1]);
    if (!u.verified || !DOCENTES.includes(u.email)) return json(403, { error: "Solo los docentes de la Academia IAEV pueden enviar avisos." });
    const db = firestore(env);
    if (request.method === "GET") {
      const docs = await db.query("avisos_tokens", null, 5000);
      const grupos = {}; docs.forEach(d => { const g = d.data.grupo; if (okGrupo(g)) grupos[g] = (grupos[g] || 0) + 1; });
      return json(200, { suscritos: docs.length, grupos, nombre: firma(u) });
    }
    if (request.method !== "POST") return json(405, { error: "Usa POST" });
    const b = await request.json().catch(() => ({}));
    if (Array.isArray(b.grupos)) {
      const grupos = [...new Set(b.grupos.filter(okGrupo))].slice(0, 30);
      const texto = String(b.body || "").trim().slice(0, 500);
      if (!grupos.length) return json(400, { error: "Elige al menos un grupo" });
      if (!texto) return json(400, { error: "Escribe el mensaje" });
      const nombre = firma(u).slice(0, 40);
      const url = "/?aviso=" + b64u(JSON.stringify({ n: nombre, m: texto, g: grupos, t: Date.now() }));
      const ids = [];
      for (const g of grupos) ids.push(await enviar(env, { title: nombre, body: texto, url, tag: "grupo-" + Date.now(), topic: "g-" + g }));
      return json(200, { ok: true, enviados: ids.length, nombre });
    }
    if (!String(b.title || "").trim()) return json(400, { error: "Falta el título" });
    const id = await enviar(env, { title: b.title, body: b.body, url: b.url, tag: "admin-" + Date.now() });
    return json(200, { ok: true, id });
  } catch (e) { return json(e.status || 500, { error: e.message || "Error" }); }
}
