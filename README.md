# Rocio — Reproductor Multimedia

  Reproductor multimedia completo para navegador con React + Vite, servidor Python y plugin para Firefox.

  ## Estructura del proyecto

  ```
  ├── artifacts/
  │   └── rocio-player/          # Reproductor web (React + Vite + Tailwind)
  │       └── src/
  │           ├── pages/Player.tsx    # Componente principal
  │           ├── index.css           # Estilos (tema oscuro/claro)
  │           └── components/ui/     # Componentes shadcn/ui
  ├── rocio-python-server/       # Servidor Python (Flask)
  │   ├── server.py              # API REST + streaming + yt-dlp + ffmpeg
  │   ├── requirements.txt       # Dependencias Python
  │   └── setup.sh               # Script de instalación automática
  └── rocio-firefox-plugin/      # Plugin para Firefox (Manifest V3)
      ├── manifest.json
      ├── popup/
      ├── background/
      └── content/
  ```

  ## Servidor Python — Inicio rápido

  ```bash
  cd rocio-python-server

  # Instalar dependencias (usa pip3 con la bandera -r)
  pip3 install -r requirements.txt

  # O usa el script automático
  bash setup.sh

  # Iniciar servidor
  python3 server.py --dir /ruta/a/tus/videos
  ```

  ## Plugin Firefox — Inicio rápido

  1. Firefox → `about:debugging` → **Este Firefox**
  2. **Cargar complemento temporal...**
  3. Selecciona `rocio-firefox-plugin/manifest.json`

  ## Reproductor web (React)

  ```bash
  cd artifacts/rocio-player
  npm install   # o: pnpm install
  npm run dev
  ```

  ## Características

  - Panel izquierdo de previews estilo YouTube con thumbnails
  - Árbol de directorios desde raíz del disco con checkboxes
  - Carpeta Favoritos para carpetas seleccionadas
  - Cola de reproducción desplegable paginada (10 por página)
  - Grabación por segmento: marca inicio/fin y descarga en WebM
  - URL externa: YouTube, Vimeo, MP4/MP3 directo
  - Compartir en WhatsApp, Telegram, Facebook e Instagram
  - Toggle modo oscuro / claro
  - Paneles laterales ocultables

  ## Tecnologías

  | Capa | Tecnología |
  |------|------------|
  | Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
  | Íconos | Lucide React, react-icons |
  | Backend Python | Flask, yt-dlp, ffmpeg, Flask-CORS |
  | Plugin | Firefox Manifest V3 |

  ## Licencia

  MIT
  