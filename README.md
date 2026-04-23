# Rocio — Reproductor Multimedia

  Reproductor multimedia completo para navegador, construido con React + Vite, con servidor backend Python y plugin para Firefox.

  ## Estructura del proyecto

  ```
  ├── artifacts/
  │   └── rocio-player/          # Reproductor web (React + Vite + Tailwind)
  │       └── src/
  │           ├── pages/Player.tsx    # Componente principal
  │           ├── index.css           # Estilos globales (tema oscuro/claro)
  │           └── components/ui/     # Componentes shadcn/ui
  ├── rocio-python-server/       # Servidor Python (Flask)
  │   ├── server.py              # API REST + streaming HTTP Range + yt-dlp + ffmpeg
  │   └── requirements.txt
  └── rocio-firefox-plugin/      # Plugin para Firefox (Manifest V3)
      ├── manifest.json
      ├── popup/                 # Interfaz del popup
      ├── background/            # Script de fondo
      └── content/               # Script inyectado en páginas
  ```

  ## Características

  - **Reproductor HTML5** con controles: play/pausa, ±10s, velocidades 0.5x–2x, volumen, pantalla completa
  - **Panel izquierdo** de previews estilo YouTube con thumbnails, nombre, carpeta y duración
  - **Árbol de directorios** desde raíz del disco con checkboxes y selección múltiple
  - **Carpeta Favoritos** para guardar accesos rápidos a carpetas seleccionadas
  - **Cola de reproducción desplegable** con vista previa en tarjetas, paginada (10 por página)
  - **Grabación por segmento**: marca inicio/fin y descarga el clip en WebM
  - **URL externa**: YouTube, Vimeo o enlaces directos (MP4, MP3, WebM)
  - **Compartir** en WhatsApp, Telegram, Facebook e Instagram
  - **Toggle modo oscuro / claro**
  - **Paneles laterales ocultables** con botones en el encabezado

  ## Servidor Python

  ```bash
  cd rocio-python-server
  pip install -r requirements.txt
  python server.py --dir /ruta/a/tus/videos
  ```

  Opciones: `--host`, `--port`, `--dir`, `--debug`

  ## Plugin Firefox

  1. Abre Firefox → `about:debugging`
  2. **Este Firefox** → **Cargar complemento temporal...**
  3. Selecciona `rocio-firefox-plugin/manifest.json`

  ## Tecnologías

  | Capa | Tecnología |
  |------|------------|
  | Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
  | Íconos | Lucide React, react-icons |
  | Backend Python | Flask, yt-dlp, ffmpeg, Flask-CORS |
  | Plugin | Firefox Manifest V3 |

  ## Licencia

  MIT
  