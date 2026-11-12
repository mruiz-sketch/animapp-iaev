// POST {token, accion:"alta"|"baja", lang} — suscribe o da de baja un dispositivo de los avisos.
const { TOPIC, fb, json, tokenId } = require("../lib/avisos");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Usa POST" });
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "JSON inválido" }); }
  const token = String(b.token || "");
  if (token.length < 40 || token.length > 4096 || /\s/.test(token)) return json(400, { error: "Token inválido" });
  try {
    const a = fb(), ref = a.firestore().collection("avisos_tokens").doc(tokenId(token));
    if (b.accion === "baja") {
      await a.messaging().unsubscribeFromTopic([token], TOPIC).catch(() => {});
      await ref.delete();
      return json(200, { ok: true });
    }
    const r = await a.messaging().subscribeToTopic([token], TOPIC);
    if (r.failureCount) return json(400, { error: "FCM rechazó el token", detalle: String(r.errors[0]?.error?.code || "") });
    await ref.set({ token, lang: b.lang === "en" ? "en" : "es", alta: new Date().toISOString() }, { merge: true });
    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(e.status || 500, { error: e.message || "Error" });
  }
};
