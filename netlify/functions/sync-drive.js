// Función programada (cada hora, ver netlify.toml). Si en la carpeta pública de Google Drive
// «ANIMAPP sincronización (no borrar)» aparece un archivo nuevo (mapa-*.html o render-*.html que dejan
// las tareas diarias), pide a Netlify una nueva publicación con el Build Hook guardado en la variable
// NETLIFY_BUILD_HOOK. Durante esa publicación, _build/drive_sync.py aplica los archivos al sitio.
const { fb } = require("../lib/avisos");

const CARPETA = "1JE9st78CWNzt1IpLVkASBtFP3m63Bpos";

exports.handler = async () => {
  try {
    const hook = (process.env.NETLIFY_BUILD_HOOK || "").trim();
    if (!hook) return { statusCode: 200, body: "falta la variable NETLIFY_BUILD_HOOK" };
    const r = await fetch("https://drive.google.com/embeddedfolderview?id=" + CARPETA + "#list", { headers: { "user-agent": "Mozilla/5.0 (ANIMAPP IAEV)" } });
    if (!r.ok) return { statusCode: 200, body: "carpeta " + r.status };
    const html = await r.text();
    const ids = [...new Set([...html.matchAll(/id="entry-([A-Za-z0-9_-]{20,})"/g)].map(m => m[1]))].sort();
    if (!ids.length) return { statusCode: 200, body: "carpeta vacía" };
    const firma = ids.join(",");
    const ref = fb().firestore().collection("sistema").doc("sync");
    const prev = (await ref.get()).data() || {};
    if (prev.firma === firma) return { statusCode: 200, body: "sin cambios" };
    const b = await fetch(hook, { method: "POST" });
    await ref.set({ firma, pedido: new Date().toISOString(), hook_status: b.status }, { merge: true });
    console.log("nueva publicación pedida", b.status);
    return { statusCode: 200, body: "nueva publicación pedida (" + b.status + ")" };
  } catch (e) {
    console.error(e);
    return { statusCode: 200, body: "error: " + (e.message || e) };
  }
};
