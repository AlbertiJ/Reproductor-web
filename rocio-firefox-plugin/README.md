# Rocio — Plugin para Firefox

  Extensión Manifest V3 para Firefox que integra el reproductor Rocio en el navegador.

  ## Instalación en Firefox

  1. Abre Firefox y ve a: `about:debugging`
  2. Haz clic en **Este Firefox**
  3. Haz clic en **Cargar complemento temporal...**
  4. Selecciona el archivo `rocio-firefox-plugin/manifest.json`

  > **Importante:** el plugin se carga temporalmente y desaparece al cerrar Firefox.
  > Para instalación permanente usa `web-ext` (ver abajo).

  ## Instalación permanente con web-ext

  ```bash
  # Instalar web-ext (herramienta oficial de Mozilla)
  npm install -g web-ext

  # Desde la carpeta rocio-firefox-plugin/
  cd rocio-firefox-plugin
  web-ext build      # Genera el .zip para distribución
  web-run run        # Abre Firefox con el plugin cargado y recarga automática
  ```

  ## Estructura

  ```
  rocio-firefox-plugin/
  ├── manifest.json          # Manifest V3
  ├── popup/
  │   ├── popup.html         # Interfaz del popup
  │   ├── popup.css          # Estilos
  │   └── popup.js           # Lógica
  ├── background/
  │   └── background.js      # Script de fondo (detección de videos)
  └── content/
      └── content.js         # Inyectado en páginas web
  ```

  ## Funciones del plugin

  - Reproductor de video/audio directamente en el popup
  - Cargar archivo local desde el disco
  - Cargar URL de YouTube, Vimeo o enlace directo
  - Grabación de segmentos con marcado de inicio/fin
  - Compartir en WhatsApp, Telegram, Facebook e Instagram
  - Detección automática de videos en páginas visitadas
  - Indicador de estado del servidor Python local
  