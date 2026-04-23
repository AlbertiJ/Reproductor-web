# Rocio — Plugin para Firefox

Extensión de Firefox que integra el reproductor multimedia Rocio directamente en el navegador.

## Funcionalidades

- Reproductor de video/audio en el popup
- Carga archivos locales desde el disco
- Carga URLs de YouTube, Vimeo y archivos directos
- Grabación de segmentos con inicio/fin marcables
- Compartir en WhatsApp, Telegram, Facebook e Instagram
- Detección automática de videos en páginas web
- Conexión con el servidor Python local

## Instalación en Firefox

### Modo desarrollo (temporal)
1. Abre Firefox y ve a: `about:debugging`
2. Haz clic en **Este Firefox**
3. Haz clic en **Cargar complemento temporal...**
4. Selecciona el archivo `manifest.json` de esta carpeta

### Empaquetado permanente
```bash
# Instalar web-ext (herramienta oficial de Mozilla)
npm install -g web-ext

# Empaquetar la extensión
web-ext build

# Ejecutar en Firefox con recarga automática
web-ext run
```

## Estructura del plugin

```
rocio-firefox-plugin/
├── manifest.json          # Configuración principal
├── popup/
│   ├── popup.html         # Interfaz del popup
│   ├── popup.css          # Estilos del popup
│   └── popup.js           # Lógica del popup
├── background/
│   └── background.js      # Script de fondo (detección, storage)
├── content/
│   └── content.js         # Script inyectado en páginas web
└── icons/
    ├── icon48.png
    ├── icon96.png
    └── icon128.png
```

## Conexión con el servidor Python

El plugin puede conectarse al servidor Python local (`server.py`) para:
- Navegar por directorios locales
- Hacer streaming de archivos de video/audio
- Recortar segmentos con ffmpeg

Asegúrate de que el servidor esté corriendo: `python server.py`
