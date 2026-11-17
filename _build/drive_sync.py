# Se ejecuta en cada build de Netlify (ver netlify.toml: command).
# Las tareas diarias dejan en la carpeta pública de Google Drive «ANIMAPP sincronización (no borrar)»:
#   mapa-<versión>.html    → HTML del «Mapa Pixel UPSRJ» (se inserta en index.html con sync_map.py)
#   render-<versión>.html  → juego «¿Quién canceló el render?» (reemplaza exp/render.html con sync_render.py)
# Toma el más reciente de cada uno y lo aplica antes de publicar. Si algo falla, publica el sitio tal cual.
import os, re, subprocess, sys, tempfile, urllib.request

CARPETA = "1JE9st78CWNzt1IpLVkASBtFP3m63Bpos"
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
UA = {"User-Agent": "Mozilla/5.0 (ANIMAPP IAEV build)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def archivos():
    html = get("https://drive.google.com/embeddedfolderview?id=%s#list" % CARPETA).decode("utf-8", "replace")
    out = []
    for parte in html.split('class="flip-entry"')[1:]:
        m = re.search(r'id="entry-([A-Za-z0-9_-]{20,})"', parte) or re.search(r"/file/d/([A-Za-z0-9_-]{20,})", parte)
        t = re.search(r'class="flip-entry-title"[^>]*>([^<]*)<', parte)
        if m:
            out.append((m.group(1), (t.group(1) if t else "").strip()))
    return out


def version(titulo):
    m = re.search(r"-(\d{6,})", titulo)
    return int(m.group(1)) if m else 0


def ultimo(lista, tipo):
    xs = [x for x in lista if x[1].lower().startswith(tipo + "-")]
    return max(xs, key=lambda x: version(x[1])) if xs else None


def main():
    try:
        lista = archivos()
    except Exception as e:
        print("drive_sync: no pude leer la carpeta:", e); return
    print("drive_sync: %d archivos en la carpeta" % len(lista))
    pasos = [("mapa", "sync_map.py", os.path.join(RAIZ, "index.html")),
             ("render", "sync_render.py", os.path.join(RAIZ, "exp", "render.html"))]
    for tipo, script, destino in pasos:
        f = ultimo(lista, tipo)
        if not f:
            print("drive_sync: sin archivo de", tipo); continue
        try:
            datos = get("https://drive.google.com/uc?export=download&id=" + f[0])
            tmp = tempfile.NamedTemporaryFile(suffix=".html", delete=False); tmp.write(datos); tmp.close()
            antes = open(destino, "rb").read()
            r = subprocess.run([sys.executable, "-I", os.path.join(AQUI, script), tmp.name, destino], capture_output=True, text=True, timeout=120)
            print("drive_sync:", tipo, f[1], "→", (r.stdout + r.stderr).strip()[:300])
            if r.returncode != 0:
                open(destino, "wb").write(antes)  # deja el archivo como estaba
        except Exception as e:
            print("drive_sync: error con", tipo, e)


main()
