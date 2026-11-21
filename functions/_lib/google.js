// ANIMAPP en Cloudflare Pages: acceso a Firebase sin firebase-admin (no corre en Workers).
// Usa la cuenta de servicio del secreto FIREBASE_SERVICE_ACCOUNT (JSON completo o en base64)
// para pedir un token OAuth (JWT RS256 firmado con WebCrypto) y llamar a las APIs REST de Google.
export const TOPIC = "animapp";
export const API_KEY = "AIzaSyAo6ZfqsRJN4dDHsFj1eJgHc-6b6VDz5LQ"; // clave web pública de Firebase
export const DOCENTES = [
  "ezermeno@upsrj.edu.mx", "mruiz@upsrj.edu.mx", "acarrizalez@upsrj.edu.mx",
  "chernandez@upsrj.edu.mx", "ghernandez@upsrj.edu.mx", "jzamora@upsrj.edu.mx",
  "iraragon@upsrj.edu.mx", "jsalgado@upsrj.edu.mx", "vibarra@upsrj.edu.mx",
];

export const json = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function sa(env) {
  const raw = String(env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) { const e = new Error("Falta el secreto FIREBASE_SERVICE_ACCOUNT en Cloudflare."); e.status = 503; throw e; }
  return JSON.parse(raw.startsWith("{") ? raw : atob(raw));
}
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = s => b64u(new TextEncoder().encode(s));

let cache = null; // {token, exp}
export async function accessToken(env) {
  if (cache && cache.exp > Date.now() + 60000) return cache.token;
  const s = sa(env), now = Math.floor(Date.now() / 1000);
  const head = b64uStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64uStr(JSON.stringify({
    iss: s.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore",
  }));
  const pem = s.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + head + "." + claim + "." + b64u(sig),
  });
  const j = await r.json();
  if (!r.ok) throw new Error("OAuth: " + (j.error_description || j.error || r.status));
  cache = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.token;
}
export const projectId = env => sa(env).project_id;

// ---------- Firestore REST ----------
const enc = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
};
const dec = v => {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(dec);
  if ("mapValue" in v) return decFields(v.mapValue.fields || {});
  return null;
};
const decFields = f => Object.fromEntries(Object.entries(f || {}).map(([k, x]) => [k, dec(x)]));

export function firestore(env) {
  const base = () => `https://firestore.googleapis.com/v1/projects/${projectId(env)}/databases/(default)/documents`;
  const call = async (url, opt = {}) => {
    const r = await fetch(url, { ...opt, headers: { authorization: "Bearer " + await accessToken(env), "content-type": "application/json" } });
    if (r.status === 404 && (!opt.method || opt.method === "GET")) return null;
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error("Firestore: " + (j.error?.message || r.status)); e.status = 502; throw e; }
    return j;
  };
  return {
    async get(path) { const j = await call(`${base()}/${path}`); return j ? decFields(j.fields) : null; },
    async set(path, data, { merge = false } = {}) {
      const mask = merge ? "?" + Object.keys(data).map(k => "updateMask.fieldPaths=" + encodeURIComponent("`" + k + "`")).join("&") : "";
      await call(`${base()}/${path}${mask}`, { method: "PATCH", body: JSON.stringify({ fields: enc(data).mapValue.fields }) });
    },
    async del(path) { await call(`${base()}/${path}`, { method: "DELETE" }); },
    // where: [campo, op ("EQUAL"|"LESS_THAN"…), valor]
    async query(col, where, limit = 200) {
      const sq = { from: [{ collectionId: col }], limit };
      if (where) sq.where = { fieldFilter: { field: { fieldPath: where[0] }, op: where[1], value: enc(where[2]) } };
      const j = await call(`${base()}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: sq }) });
      return (j || []).filter(x => x.document).map(x => ({ id: x.document.name.split("/").pop(), data: decFields(x.document.fields) }));
    },
    async count(col) {
      const j = await call(`${base()}:runAggregationQuery`, { method: "POST", body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: col }] }, aggregations: [{ alias: "n", count: {} }] } }) });
      return Number(j?.[0]?.result?.aggregateFields?.n?.integerValue || 0);
    },
  };
}

// ---------- Mensajes (FCM) ----------
export async function enviar(env, { title, body, url, tag, topic }) {
  const data = {
    title: String(title || "ANIMAPP IAEV").slice(0, 80),
    body: String(body || "").slice(0, 240),
    url: /^\/[^/]/.test(url || "") || url === "/" ? String(url).slice(0, 1800) : "/",
    tag: String(tag || "animapp").slice(0, 40),
  };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId(env)}/messages:send`, {
    method: "POST", headers: { authorization: "Bearer " + await accessToken(env), "content-type": "application/json" },
    body: JSON.stringify({ message: { topic: topic || TOPIC, data, webpush: { headers: { Urgency: "high", TTL: "172800" } } } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("FCM: " + (j.error?.message || r.status));
  await firestore(env).set("sistema/avisos", { ultimo: { ...data, enviado: new Date().toISOString() } }, { merge: true });
  return j.name;
}
// Alta/baja de un dispositivo en el tema (misma API que usa firebase-admin)
// Grupo del alumno: "<cuatrimestre>-<GRUPO>", p. ej. "3-A". Tema FCM: "g-3-A".
export function grupoKey(c, g) {
  const cu = String(c ?? "").replace(/\D/g, "").slice(0, 2), gr = String(g ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  return cu && gr ? cu + "-" + gr : "";
}
export const okGrupo = k => /^\d{1,2}-[A-Z0-9]{1,6}$/.test(String(k || ""));
export async function tema(env, token, alta, topic) {
  const r = await fetch("https://iid.googleapis.com/iid/v1:" + (alta ? "batchAdd" : "batchRemove"), {
    method: "POST",
    headers: { authorization: "Bearer " + await accessToken(env), access_token_auth: "true", "content-type": "application/json" },
    body: JSON.stringify({ to: "/topics/" + (topic || TOPIC), registration_tokens: [token] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("FCM tema: " + (j.error || r.status));
  const err = j.results?.[0]?.error;
  if (alta && err) { const e = new Error("FCM rechazó el token: " + err); e.status = 400; throw e; }
}
// Verifica el ID token de Firebase Auth y regresa {email, verified}
export async function usuario(idToken) {
  const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + API_KEY, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }),
  });
  const j = await r.json().catch(() => ({}));
  const u = j.users?.[0];
  if (!r.ok || !u) { const e = new Error("Sesión no válida; vuelve a iniciar sesión."); e.status = 401; throw e; }
  return { email: String(u.email || "").toLowerCase(), verified: !!u.emailVerified, name: String(u.displayName || "").trim() };
}
export async function sha40(t) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 40);
}
