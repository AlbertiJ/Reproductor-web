# Rocio — Servidor Python

Servidor backend para el reproductor multimedia Rocio.

## Instalación rápida

```bash
pip install -r requirements.txt
```

## Uso

```bash
# Modo básico (sirve tu carpeta home)
python server.py

# Puerto y directorio personalizados
python server.py --port 8080 --dir /home/usuario/Videos

# Accesible en red local (para otros dispositivos)
python server.py --host 0.0.0.0 --port 5000

# Modo debug
python server.py --debug
```

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servidor y herramientas disponibles |
| GET | `/api/tree?path=/Videos&depth=3` | Árbol de directorios en JSON |
| GET | `/api/files?path=/Videos` | Lista archivos de una carpeta |
| GET | `/api/media?path=/Videos/film.mp4` | Streaming del archivo (con soporte Range) |
| POST | `/api/download` | Descargar video de YouTube/Vimeo |
| POST | `/api/segment` | Recortar segmento de video con ffmpeg |

## Herramientas opcionales

- **yt-dlp**: Para descargar videos de YouTube, Vimeo y más de 1000 sitios
  ```bash
  pip install yt-dlp
  ```
- **ffmpeg**: Para recortar segmentos de video
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - macOS: `brew install ffmpeg`
  - Windows: https://ffmpeg.org/download.html

## Nube

Para desplegar en la nube (AWS, GCP, Railway, etc.), usa `--host 0.0.0.0` y asegúrate de configurar las variables de entorno y un proxy reverso (nginx/caddy) con HTTPS.
