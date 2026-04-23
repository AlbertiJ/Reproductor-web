# Rocio — Plugin para Firefox (Manifest V3)

  Extensión para Firefox que integra el reproductor Rocio en el navegador.

  ## ¿Qué es esto?

  Un plugin (extensión) para Firefox. Sí, se instala cargando el `manifest.json`.  
  Es una extensión temporal para desarrollo — no está en la tienda de Mozilla.

  ---

  ## Instalación en Firefox

  1. Abre Firefox y escribe en la barra de direcciones:
     ```
     about:debugging#/runtime/this-firefox
     ```
  2. Haz clic en **"Cargar complemento temporal..."**
  3. Navega hasta la carpeta `rocio-firefox-plugin/`
  4. Selecciona el archivo **`manifest.json`**

  ---

  ## ❌ Error: NS_ERROR_FILE_ACCESS_DENIED

  Este error ocurre cuando **Firefox no tiene permiso de lectura** sobre los archivos del plugin.  
  Es habitual cuando los archivos fueron creados con el usuario `root` y Firefox corre como otro usuario.

  ### Solución — correr en la terminal:

  ```bash
  # Cambiar el dueño de los archivos al usuario actual
  sudo chown -R $USER:$USER /home/albertij/Documentos/Reproductor-web/rocio-firefox-plugin/

  # Dar permisos de lectura/ejecución
  chmod -R 755 /home/albertij/Documentos/Reproductor-web/rocio-firefox-plugin/
  ```

  Después de eso, intenta cargar el complemento de nuevo.

  ### Verificar permisos antes de cargar:
  ```bash
  ls -la /home/albertij/Documentos/Reproductor-web/rocio-firefox-plugin/
  # Las líneas deben mostrar -rw-r--r-- o -rwxr-xr-x
  # y el dueño debe ser albertij, no root
  ```

  ---

  ## Estructura del plugin

  ```
  rocio-firefox-plugin/
  ├── manifest.json          ← Cargar esto en about:debugging
  ├── popup/
  │   ├── popup.html         Interfaz del popup
  │   ├── popup.css          Estilos
  │   └── popup.js           Lógica
  ├── background/
  │   └── background.js      Detección de videos en páginas
  └── content/
      └── content.js         Inyectado en páginas web
  ```

  ---

  ## Funciones del plugin

  | Función | Descripción |
  |---------|-------------|
  | Reproductor | Abre archivos locales desde el popup |
  | URL externa | Carga YouTube, Vimeo o MP4/MP3 directo |
  | Segmentos | Marca inicio/fin y graba el fragmento |
  | Compartir | WhatsApp, Telegram, Facebook, Instagram |
  | Estado servidor | Indica si el servidor Python está activo |

  ---

  ## Conexión con el servidor Python

  El plugin se conecta automáticamente a `http://localhost:5000`.  
  El indicador en la esquina superior derecha del popup muestra:
  - 🟢 Verde: servidor activo
  - 🔴 Rojo: servidor detenido o no iniciado

  Para iniciar el servidor:
  ```bash
  cd rocio-python-server
  python3 server.py
  ```

  ---

  ## Instalación permanente (opcional)

  ```bash
  npm install -g web-ext
  cd rocio-firefox-plugin/
  web-ext run    # Abre Firefox con el plugin y recarga automática
  web-ext build  # Genera el .zip para distribución
  ```
  