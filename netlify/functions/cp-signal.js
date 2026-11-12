// Coyote Party · "apretón de manos" entre la PC (pantalla) y los celulares (controles).
// Solo intercambia las descripciones WebRTC (oferta/respuesta). Después, los controles hablan
// directo con la PC por la red wifi; esta función ya no interviene.
// Datos en Firestore (solo el servidor accede; las reglas no abren estas colecciones a clientes):
//   coyoteparty/{CODIGO}            { t }                         sala abierta por la PC
//   coyoteparty_peers/{CODIGO_pid}  { code, pid, name, offer, answer, slot, err, t }
// Se borran solas las salas con más de 12 horas.
const { fb, json } = require("../lib/avisos");

const MAX_AGE = 12 * 3600 * 1000;
const okCode = c => /^[A-Z0-9]{6}$/.test(c);
const okPid = p => /^[a-z0-9]{8,24}$/.test(p);
const okSdp = s => typeof s === "string" && s.length > 20 && s.length < 20000;

async function cleanup(db, now) {
  for (const col of ["coyoteparty", "coyoteparty_peers"]) {
    const old = await db.collection(col).where("t", "<", now - MAX_AGE).limit(100).get();
    if (old.empty) continue;
    const b = db.batch(); old.docs.forEach(d => b.delete(d.ref)); await b.commit();
  }
}

exports.handler = async (event) => {
  let b = {};
  if (event.httpMethod === "POST") { try { b = JSON.parse(event.body || "{}"); } catch { return json(400, { error: "JSON inválido" }); } }
  else if (event.httpMethod === "GET") b = event.queryStringParameters || {};
  else return json(405, { error: "Método no permitido" });
  const op = String(b.op || ""), code = String(b.code || "").toUpperCase(), pid = String(b.pid || "");
  if (!okCode(code)) return json(400, { error: "Código inválido" });
  try {
    const db = fb().firestore(), now = Date.now();
    const ses = db.collection("coyoteparty").doc(code), peers = db.collection("coyoteparty_peers");
    if (op === "open" && event.httpMethod === "POST") {
      await ses.set({ t: now });
      await cleanup(db, now).catch(() => {});
      return json(200, { ok: true });
    }
    const s = await ses.get();
    if (!s.exists || now - (s.get("t") || 0) > MAX_AGE) return json(404, { error: "Sala no encontrada" });
    if (op === "offers") {
      const r = await peers.where("code", "==", code).get();
      const offers = r.docs.map(d => d.data()).filter(x => x.offer && !x.answer && !x.err)
        .map(x => ({ pid: x.pid, name: x.name || "", offer: x.offer, t: x.t }));
      return json(200, { offers });
    }
    if (!okPid(pid)) return json(400, { error: "Identificador inválido" });
    const ref = peers.doc(code + "_" + pid);
    if (op === "offer" && event.httpMethod === "POST") {
      if (!okSdp(b.sdp)) return json(400, { error: "Oferta inválida" });
      const name = String(b.name || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 12);
      await ref.set({ code, pid, name, offer: b.sdp, answer: null, slot: null, err: null, t: now });
      return json(200, { ok: true });
    }
    if (op === "answer" && event.httpMethod === "POST") {
      if (b.err) { await ref.set({ err: String(b.err).slice(0, 20), t: now }, { merge: true }); return json(200, { ok: true }); }
      if (!okSdp(b.sdp)) return json(400, { error: "Respuesta inválida" });
      const slot = Number(b.slot);
      if (!(slot >= 0 && slot <= 4)) return json(400, { error: "Lugar inválido" });
      await ref.set({ answer: b.sdp, slot, t: now }, { merge: true });
      return json(200, { ok: true });
    }
    if (op === "poll") {
      const d = await ref.get();
      if (!d.exists) return json(200, {});
      const x = d.data();
      return json(200, { answer: x.answer || null, slot: x.slot, err: x.err || null });
    }
    return json(400, { error: "Operación desconocida" });
  } catch (e) {
    return json(e.status || 500, { error: e.message || "Error" });
  }
};
