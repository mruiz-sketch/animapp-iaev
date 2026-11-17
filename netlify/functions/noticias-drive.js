// Función programada (cada hora, ver netlify.toml). La tarea diaria de noticias deja un archivo
// noticias-AAAA-MM-DD.json en la carpeta pública de Google Drive «ANIMAPP noticias (no borrar)».
// Aquí se lee el más reciente, se guarda en Firestore publico/noticias (de ahí lo lee la app)
// y se avisa por push de las noticias nuevas. Así las noticias no dependen de GitHub.
const { fb, avisarNoticias } = require("../lib/avisos");

const CARPETA = "1iWXH3frsKxVPVChm5fUuUbpk6yRz278G";
const UA = { "user-agent": "Mozilla/5.0 (ANIMAPP IAEV)" };

async function idsCarpeta() {
  const r = await fetch("https://drive.google.com/embeddedfolderview?id=" + CARPETA + "#list", { headers: UA });
  if (!r.ok) throw new Error("carpeta " + r.status);
  const html = await r.text();
  const ids = new Set();
  for (const re of [/id="entry-([A-Za-z0-9_-]{20,})"/g, /\/file\/d\/([A-Za-z0-9_-]{20,})/g])
    for (const m of html.matchAll(re)) if (m[1] !== CARPETA) ids.add(m[1]);
  return [...ids];
}

async function leer(id) {
  const r = await fetch("https://drive.google.com/uc?export=download&id=" + id, { headers: UA });
  if (!r.ok) return null;
  try {
    const j = JSON.parse(await r.text());
    return j && Array.isArray(j.items) && j.items.length && /^\d{4}-\d{2}-\d{2}$/.test(j.actualizado || "") ? j : null;
  } catch { return null; }
}

exports.handler = async () => {
  try {
    const ids = await idsCarpeta();
    const docs = (await Promise.all(ids.slice(0, 15).map(leer))).filter(Boolean);
    if (!docs.length) return { statusCode: 200, body: `sin archivos válidos (${ids.length} en la carpeta)` };
    docs.sort((a, b) => b.actualizado.localeCompare(a.actualizado) || b.items.length - a.items.length);
    const nuevo = docs[0];
    const ref = fb().firestore().collection("publico").doc("noticias");
    const prev = (await ref.get()).data();
    let out = "sin cambios";
    if (!prev || prev.json !== JSON.stringify(nuevo)) {
      if (prev && prev.actualizado && prev.actualizado > nuevo.actualizado) out = "Firestore ya tiene una versión más nueva";
      else { await ref.set({ json: JSON.stringify(nuevo), actualizado: nuevo.actualizado }); out = "noticias del " + nuevo.actualizado + " guardadas"; }
    }
    const aviso = await avisarNoticias(nuevo.items);
    console.log(out + " | " + aviso);
    return { statusCode: 200, body: out + " | " + aviso };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: "error: " + (e.message || e) };
  }
};
