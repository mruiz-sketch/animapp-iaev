// POST {token, accion:"alta"|"baja", lang, grupo:"3-A"} — suscribe o da de baja un dispositivo de los avisos.
// Con grupo (de la credencial del alumno), también lo suscribe al tema de su grupo para los mensajes de los profes.
import { json, firestore, tema, sha40, okGrupo } from "../_lib/google.js";

export async function onRequestPost({ request, env }) {
  let b; try { b = await request.json(); } catch { return json(400, { error: "JSON inválido" }); }
  const token = String(b.token || "");
  if (token.length < 40 || token.length > 4096 || /\s/.test(token)) return json(400, { error: "Token inválido" });
  try {
    const path = "avisos_tokens/" + await sha40(token), db = firestore(env);
    const prev = await db.get(path).catch(() => null);
    const viejo = prev && okGrupo(prev.grupo) ? prev.grupo : "";
    if (b.accion === "baja") {
      await tema(env, token, false).catch(() => {});
      if (viejo) await tema(env, token, false, "g-" + viejo).catch(() => {});
      await db.del(path); return json(200, { ok: true });
    }
    const grupo = okGrupo(b.grupo) ? b.grupo : "";
    await tema(env, token, true);
    if (viejo && viejo !== grupo) await tema(env, token, false, "g-" + viejo).catch(() => {});
    if (grupo) await tema(env, token, true, "g-" + grupo);
    await db.set(path, { token, lang: b.lang === "en" ? "en" : "es", alta: new Date().toISOString(), grupo });
    return json(200, { ok: true, grupo });
  } catch (e) { return json(e.status || 500, { error: e.message || "Error" }); }
}
export const onRequest = () => json(405, { error: "Usa POST" });
