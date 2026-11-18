// Coyote Party · "apretón de manos" entre la PC (pantalla) y los celulares (controles).
// Solo intercambia las descripciones WebRTC (oferta/respuesta); después hablan directo por wifi.
// Datos en Firestore (solo el servidor accede):
//   coyoteparty/{CODIGO}            { t }                         sala abierta por la PC
//   coyoteparty_peers/{CODIGO_pid}  { code, pid, name, offer, answer, slot, err, t }
// Se borran solas las salas con más de 12 horas.
import { json, firestore } from "../_lib/google.js";

const MAX_AGE = 12 * 3600 * 1000;
const okCode = c => /^[A-Z0-9]{6}$/.test(c);
const okPid = p => /^[a-z0-9]{8,24}$/.test(p);
const okSdp = s => typeof s === "string" && s.length > 20 && s.length < 20000;

async function cleanup(db, now) {
  for (const col of ["coyoteparty", "coyoteparty_peers"]) {
    const old = await db.query(col, ["t", "LESS_THAN", now - MAX_AGE], 100);
    await Promise.all(old.map(d => db.del(col + "/" + d.id)));
  }
}

export async function onRequest({ request, env, waitUntil }) {
  let b = {};
  if (request.method === "POST") { try { b = await request.json(); } catch { return json(400, { error: "JSON inválido" }); } }
  else if (request.method === "GET") b = Object.fromEntries(new URL(request.url).searchParams);
  else return json(405, { error: "Método no permitido" });
  const op = String(b.op || ""), code = String(b.code || "").toUpperCase(), pid = String(b.pid || "");
  if (!okCode(code)) return json(400, { error: "Código inválido" });
  try {
    const db = firestore(env), now = Date.now();
    if (op === "open" && request.method === "POST") {
      await db.set("coyoteparty/" + code, { t: now });
      waitUntil(cleanup(db, now).catch(() => {}));
      return json(200, { ok: true });
    }
    const s = await db.get("coyoteparty/" + code);
    if (!s || now - (s.t || 0) > MAX_AGE) return json(404, { error: "Sala no encontrada" });
    if (op === "offers") {
      const r = await db.query("coyoteparty_peers", ["code", "EQUAL", code], 50);
      const offers = r.map(d => d.data).filter(x => x.offer && !x.answer && !x.err)
        .map(x => ({ pid: x.pid, name: x.name || "", offer: x.offer, t: x.t }));
      return json(200, { offers });
    }
    if (!okPid(pid)) return json(400, { error: "Identificador inválido" });
    const path = "coyoteparty_peers/" + code + "_" + pid;
    if (op === "offer" && request.method === "POST") {
      if (!okSdp(b.sdp)) return json(400, { error: "Oferta inválida" });
      const name = String(b.name || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 12);
      await db.set(path, { code, pid, name, offer: b.sdp, answer: null, slot: null, err: null, t: now });
      return json(200, { ok: true });
    }
    if (op === "answer" && request.method === "POST") {
      if (b.err) { await db.set(path, { err: String(b.err).slice(0, 20), t: now }, { merge: true }); return json(200, { ok: true }); }
      if (!okSdp(b.sdp)) return json(400, { error: "Respuesta inválida" });
      const slot = Number(b.slot);
      if (!(slot >= 0 && slot <= 4)) return json(400, { error: "Lugar inválido" });
      await db.set(path, { answer: b.sdp, slot, t: now }, { merge: true });
      return json(200, { ok: true });
    }
    if (op === "poll") {
      const x = await db.get(path);
      if (!x) return json(200, {});
      return json(200, { answer: x.answer || null, slot: x.slot, err: x.err || null });
    }
    return json(400, { error: "Operación desconocida" });
  } catch (e) { return json(e.status || 500, { error: e.message || "Error" }); }
}
