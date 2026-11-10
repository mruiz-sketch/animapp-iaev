# ANIMAPP IAEV

App web en pixel art de Ingeniería en Animación y Efectos Visuales (UPSRJ).

- `index.html`: la app (se genera desde la versión de Claude "ANIMAPP IAEV Pixel"; no editar a mano).
- `exp/`: experiencias que se abren dentro de la app (museo, museo 3D, Film Fest, juegos).
- `posters/`, `videos/`, `videos9/`: imágenes y cortos del Coyote Film Fest.
- `admin.html` + `firebase-config.js`: inicio de sesión y administración de horarios / Sólo Profesores (Firebase).
- `firestore.rules`: reglas de seguridad de Firestore (se pegan en la consola de Firebase; no las usa Netlify).

Netlify publica la carpeta raíz tal cual (sin compilación). Cada cambio que se sube a la rama `main` se publica solo.
