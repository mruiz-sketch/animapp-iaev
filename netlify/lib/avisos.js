// Utilidades compartidas de los avisos (notificaciones push) de ANIMAPP.
// Usa Firebase Admin con la cuenta de servicio guardada en la variable de entorno
// FIREBASE_SERVICE_ACCOUNT de Netlify (el JSON completo, o en base64).
const admin = require("firebase-admin");

const TOPIC = "animapp";
// Docentes que pueden enviar avisos desde admin.html (los mismos de «Nuestra Academia»).
const DOCENTES = [
  "ezermeno@upsrj.edu.mx", "mruiz@upsrj.edu.mx", "acarrizalez@upsrj.edu.mx",
  "chernandez@upsrj.edu.mx", "ghernandez@upsrj.edu.mx", "jzamora@upsrj.edu.mx",
  "iraragon@upsrj.edu.mx", "jsalgado@upsrj.edu.mx", "vibarra@upsrj.edu.mx",
];

function fb() {
  if (!admin.apps.length) {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
    if (!raw) { const e = new Error("Falta la variable FIREBASE_SERVICE_ACCOUNT en Netlify."); e.status = 503; throw e; }
    const sa = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin;
}

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  body: JSON.stringify(obj),
});

const tokenId = t => require("crypto").createHash("sha256").update(t).digest("hex").slice(0, 40);

// Envía un aviso a todos los dispositivos suscritos (tema «animapp»).
async function enviar({ title, body, url, tag }) {
  const a = fb();
  const data = {
    title: String(title || "ANIMAPP IAEV").slice(0, 80),
    body: String(body || "").slice(0, 240),
    url: /^\/[^/]/.test(url || "") || url === "/" ? url : "/",
    tag: String(tag || "animapp").slice(0, 40),
  };
  const id = await a.messaging().send({
    topic: TOPIC,
    data,
    webpush: { headers: { Urgency: "high", TTL: "172800" } },
  });
  await a.firestore().collection("sistema").doc("avisos").set(
    { ultimo: { ...data, enviado: new Date().toISOString() } }, { merge: true });
  return id;
}

async function suscritos() {
  const snap = await fb().firestore().collection("avisos_tokens").count().get();
  return snap.data().count;
}

module.exports = { TOPIC, DOCENTES, fb, json, tokenId, enviar, suscritos };
