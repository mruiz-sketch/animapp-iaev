# Uso: python3 -I sync_render.py <index.html leído del artifact> <repo>/exp/render.html
# Copia el juego "¿Quién canceló el render?" publicado en Claude a ANIMAPP (exp/render.html).
# El archivo que entrega Artifact (read, path "index.html") ya trae el envoltorio <!doctype…</html>.
import sys
src, dest = sys.argv[1:3]
new = open(src, encoding="utf-8").read()
if not new.lstrip().lower().startswith("<!doctype") or "</body></html>" not in new[-40:]:
    sys.exit("ERROR: el archivo leído no es una página completa; no se sincroniza")
for marca in ("¿QUIÉN CANCELÓ EL RENDER?", "function build3D", "const MONO"):
    if marca not in new:
        sys.exit("ERROR: falta '%s' en el juego publicado; no se sincroniza" % marca)
try:
    old = open(dest, encoding="utf-8").read()
except FileNotFoundError:
    old = ""
if new == old:
    print("sin cambios"); sys.exit(0)
open(dest, "w", encoding="utf-8").write(new)
print("actualizado", len(new))
