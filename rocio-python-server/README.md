# Rocio — Servidor Python

  Servidor backend local para el reproductor multimedia Rocio.
  Sirve archivos de video/audio, permite descargar con yt-dlp y recortar segmentos con ffmpeg.

  ## Instalación

  ### Opción 1 — Script automático (Linux/macOS)
  ```bash
  bash setup.sh
  ```

  ### Opción 2 — Manual paso a paso
  ```bash
  # Instalar dependencias Python (usa pip3 con la bandera -r)
  pip3 install -r requirements.txt
  ```

  > **Nota:** el comando es `pip3` (no `pip`) y necesita la bandera `-r` antes del archivo.

  ### Instalar ffmpeg (opcional, para recorte de segmentos)
  ```bash
  # Ubuntu / Debian
  sudo apt install ffmpeg

  # macOS
  brew install ffmpeg
  ```

  ## Iniciar el servidor

  ```bash
  python3 server.py
  ```

  ### Opciones disponibles
  | Opción | Valor por defecto | Descripción |
  |--------|------------------|-------------|
  | `--port` | 5000 | Puerto del servidor |
  | `--host` | 127.0.0.1 | Interfaz de red (usa 0.0.0.0 para red local) |
  | `--dir` | /home/$USER | Directorio raíz de medios |
  | `--debug` | — | Modo debug con recarga automática |

  ### Ejemplos

  ```bash
  # Servir desde una carpeta de videos
  python3 server.py --dir /home/usuario/Videos

  # Accesible desde toda la red local
  python3 server.py --host 0.0.0.0 --port 8080

  # Modo desarrollo
  python3 server.py --debug
  ```

  ## Endpoints de la API

  | Método | Endpoint | Descripción |
  |--------|---------|-------------|
  | GET | `/api/tree` | Árbol de directorios en JSON |
  | GET | `/api/stream?path=...` | Streaming de video/audio con Range |
  | POST | `/api/download` | Descargar video de YouTube/Vimeo |
  | POST | `/api/segment` | Recortar segmento con ffmpeg |
  | GET | `/api/health` | Estado del servidor |
  