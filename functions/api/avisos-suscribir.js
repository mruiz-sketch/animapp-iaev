// POST {token, accion:"alta"|"baja", lang} — suscribe o da de baja un dispositivo de los avisos.
import { json, firestore, tema, sha40 } from "../_lib/google.js";

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json(400, { error: "JSON inválido" }); }
  const token = String(b.token || "");
  if (token.length < 40 || token.length > 4096 || /\s/.test(token)) return json(400, { error: "Token inválido" });
  try {
    const path = "avisos_tokens/" + await sha40(token), db = firestore(env);
    if (b.accion === "baja") { await tema(env, token, false).catch(() => {}); await db.del(path); return json(200, { ok: true }); }
    await tema(env, token, true);
    await db.set(path, { token, lang: b.lang === "en" ? "en" : "es", alta: new Date().toISOString() });
    return json(200, { ok: true });
  } catch (e) { return json(e.status || 500, { error: e.message || "Error" }); }
}
export const onRequest = () => json(405, { error: "Usa POST" });
