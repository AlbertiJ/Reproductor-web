# Rocio — Servidor Multimedia Local

  Servidor backend en Python que sirve el reproductor web y la API de medios.
  Una vez iniciado, abres el navegador en `http://localhost:5000` y usas el reproductor directamente — sin extensiones, sin plugins, sin nada extra.

  ---

  ## Inicio rápido (3 pasos)

  ### 1. Instalar dependencias Python
  ```bash
  pip3 install -r requirements.txt
  ```
  > Nota: usa `pip3` (no `pip`) y la bandera `-r` antes del archivo.

  ### 2. Compilar el reproductor web
  ```bash
  bash build.sh
  ```
  Esto compila la interfaz React y la copia a `static/` para que el servidor la sirva.  
  Solo necesitas hacerlo la primera vez o cuando actualices la interfaz.

  ### 3. Iniciar el servidor
  ```bash
  python3 server.py
  ```

  ### Abrir en el navegador
  ```
  http://localhost:5000
  ```

  ---

  ## Opciones del servidor

  | Comando | Descripción |
  |---------|-------------|
  | `python3 server.py` | Iniciar en consola (Ctrl+C para detener) |
  | `python3 server.py --daemon` | Iniciar en segundo plano |
  | `python3 server.py --stop` | Detener el proceso en segundo plano |
  | `python3 server.py --dir /ruta` | Servir directorio específico de medios |
  | `python3 server.py --host 0.0.0.0` | Accesible desde toda la red local |
  | `python3 server.py --port 8080` | Cambiar el puerto |
  | `python3 server.py --set-password` | Cambiar la contraseña |

  ---

  ## Autenticación

  Las credenciales se guardan en `rocio.conf` (junto al script), nunca en el código.  
  La contraseña se almacena hasheada con SHA-256.

  **Por defecto:** usuario `rocio` / clave `rocio123`

  Para cambiar la clave:
  ```bash
  python3 server.py --set-password
  ```

  ---

  ## Archivos que genera el servidor

  | Archivo | Descripción |
  |---------|-------------|
  | `rocio.conf` | Configuración: usuario, clave (hash), host, puerto |
  | `connections.log` | Registro de todas las conexiones |
  | `rocio.pid` | PID del proceso demonio (solo en modo `--daemon`) |
  | `server.log` | Log del servidor en modo demonio |
  | `static/` | Archivos compilados del reproductor web |

  ---

  ## API endpoints

  | Método | Ruta | Auth | Descripción |
  |--------|------|------|-------------|
  | GET | `/` | No | Reproductor web |
  | GET | `/api/health` | No | Estado del servidor |
  | GET | `/api/tree` | Sí | Árbol de directorios |
  | GET | `/api/files` | Sí | Lista de archivos de medios |
  | GET | `/api/media?path=...` | Sí | Streaming de video/audio |
  | POST | `/api/download` | Sí | Descargar de YouTube/Vimeo |
  | POST | `/api/segment` | Sí | Recortar segmento con ffmpeg |
  | GET | `/api/connections` | Sí | Ver registro de conexiones |

  ---

  ## ffmpeg (opcional — para recorte de segmentos)

  ```bash
  # Ubuntu / Debian
  sudo apt install ffmpeg

  # macOS
  brew install ffmpeg
  ```
  