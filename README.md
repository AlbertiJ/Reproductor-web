# Rocio — Reproductor Multimedia Local

  > Servidor ligero + reproductor en el navegador para ver y escuchar tu colección de medios desde cualquier dispositivo de tu red local.

  ---

  ## ¿Qué es Rocio?

  Rocio es un **reproductor multimedia autoalojado** que corre en tu propia computadora. Levantás un servidor Python (Flask) que expone tu biblioteca de videos y audios, y accedés al reproductor desde el navegador — ya sea en la misma máquina o desde otro dispositivo conectado a tu red local (celular, tablet, TV con navegador).

  No necesitás instalar nada en los clientes. Solo abrir el navegador y listo.

  ---

  ## Características principales

  ### 🎬 Reproductor
  - Soporte para video (MP4, MKV, AVI, WebM…) y audio (MP3, FLAC, OGG, WAV…)
  - Panel lateral de lista estilo YouTube con thumbnails y hover preview flotante
  - Árbol de directorios del disco con navegación completa
  - Toggle de aspecto de video: Ajustado / Rellenar / Estirar
  - Controles de segmento: marcadores A/B para recortar y grabar en WebM
  - Reproducción de URLs externas: YouTube, Vimeo, MP4/MP3 directo (vía yt-dlp)
  - Compartir en WhatsApp, Telegram, Facebook e Instagram
  - Modo oscuro / claro
  - Paneles laterales ocultables

  ### 📁 Carpetas Favoritas
  - Marcá cualquier carpeta del árbol de directorios como favorita con un solo clic
  - Las favoritas aparecen fijadas en la parte superior del árbol para acceso rápido
  - Se guardan por usuario, cada perfil tiene sus propios favoritos

  ### 👥 Perfiles de Usuario
  - Autenticación con usuario y contraseña (base de datos SQLite local)
  - Roles: **admin** y **user**
  - Los admins pueden:
    - Crear, editar y eliminar usuarios
    - Asignar directorios permitidos por usuario (las carpetas que cada uno puede ver)
    - Cambiar roles
  - Los usuarios limitados solo ven las carpetas que el admin les asignó
  - Rate limiting de seguridad: máximo 10 intentos de login por IP cada 5 minutos
  - Soporte opcional para autenticación con usuarios del sistema operativo (PAM, opt-in)

  ### 🔒 Seguridad
  - Sesiones autenticadas con cookie segura
  - Las rutas de medios solo son accesibles para usuarios autenticados
  - El usuario `root` del sistema operativo está bloqueado por código
  - Los logs, la base de datos y el archivo de configuración **nunca** se incluyen en el repositorio

  ---

  ## Estructura del proyecto

  ```
  ├── artifacts/
  │   └── rocio-player/              # Frontend — React + Vite + Tailwind
  │       └── src/
  │           ├── pages/Player.tsx   # Componente principal del reproductor
  │           ├── index.css          # Estilos (tema oscuro/claro)
  │           └── components/ui/    # Componentes shadcn/ui
  └── rocio-python-server/           # Backend — Python / Flask
      ├── server.py                  # API REST + streaming + auth + yt-dlp
      ├── requirements.txt           # Dependencias Python
      ├── setup.sh                   # Script de instalación automática
      └── README.md                  # Documentación del servidor
  ```

  ---

  ## Inicio rápido

  ### 1 — Servidor Python

  ```bash
  cd rocio-python-server

  # Instalar dependencias
  pip3 install -r requirements.txt

  # O con el script automático (también instala ffmpeg y yt-dlp)
  bash setup.sh

  # Iniciar apuntando a tu carpeta de medios
  python3 server.py --dir /ruta/a/tus/videos
  ```

  El servidor queda escuchando en `http://localhost:5000`.

  **Opciones disponibles:**

  | Opción | Descripción | Default |
  |--------|-------------|---------|
  | `--dir` | Directorio raíz de medios | `.` |
  | `--port` | Puerto del servidor | `5000` |
  | `--host` | Dirección de escucha | `0.0.0.0` |
  | `--daemon` | Correr en segundo plano | — |
  | `--log` | Ruta del archivo de log | — |

  ### 2 — Acceder al reproductor

  Abrí el navegador y navegá a:

  - **Misma máquina:** `http://localhost:5000`
  - **Otro dispositivo en la red:** `http://<ip-de-tu-pc>:5000`

  ### 3 — Primer inicio de sesión

  Las credenciales por defecto se configuran en `rocio.conf` (se crea automáticamente al primer arranque):

  | Usuario | Contraseña | Rol |
  |---------|------------|-----|
  | `rocio` | `rocio123` | admin |

  > ⚠️ Cambiá la contraseña antes de exponer el servidor en tu red.

  ---

  ## Gestión de usuarios

  Iniciá sesión como admin y hacé clic en el botón 👥 del encabezado para abrir el panel de administración.

  Desde ahí podés:
  - Ver todos los usuarios registrados con su rol y estado
  - Crear nuevos usuarios con rol limitado
  - Asignar directorios específicos a cada usuario (separados por coma)
  - Editar o eliminar usuarios existentes

  Los usuarios con rol `user` solo ven las carpetas que el admin les asignó en el campo **Directorios permitidos**.

  ---

  ## Tecnologías

  | Capa | Tecnología |
  |------|------------|
  | Frontend | React 18, Vite, Tailwind CSS, shadcn/ui |
  | Íconos | Lucide React |
  | Backend | Python 3, Flask, Flask-CORS |
  | Medios | yt-dlp, ffmpeg |
  | Base de datos | SQLite (usuarios y sesiones) |
  | Autenticación | SHA-256 + cookie de sesión |

  ---

  ## Licencia

  MIT
  