#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  ROCIO — Servidor Backend en Python                              ║
║  Servidor local / nube para el reproductor multimedia            ║
║                                                                  ║
║  Funcionalidades:                                                ║
║    - Servir archivos de video y audio desde directorios locales  ║
║    - API REST para listar directorios y archivos                 ║
║    - Descarga de videos de YouTube y Vimeo (yt-dlp)             ║
║    - Conversión de segmentos (recorte de video) con ffmpeg       ║
║    - CORS habilitado para uso con el frontend en browser         ║
║                                                                  ║
║  Uso:                                                            ║
║    pip install flask flask-cors yt-dlp                           ║
║    python server.py                                              ║
║    python server.py --port 8080 --dir /home/user/Videos          ║
╚══════════════════════════════════════════════════════════════════╝
"""

# ─────────────────────────────────────────────────────────────────
# BLOQUE 1: IMPORTACIONES
# Bibliotecas estándar de Python + dependencias externas
# ─────────────────────────────────────────────────────────────────
import os
import sys
import json
import argparse
import subprocess
import tempfile
import threading
import logging
from pathlib import Path
from typing import Optional

# Flask: framework web ligero para la API REST
from flask import (
    Flask,
    jsonify,
    request,
    send_file,
    abort,
    Response,
    stream_with_context,
)

# Flask-CORS: permite solicitudes desde el frontend en el navegador
from flask_cors import CORS

# ─────────────────────────────────────────────────────────────────
# BLOQUE 2: CONFIGURACIÓN GLOBAL
# Parámetros por defecto y extensiones de medios soportadas
# ─────────────────────────────────────────────────────────────────

# Extensiones de video soportadas
VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".avi", ".mov", ".webm",
    ".flv", ".wmv", ".m4v", ".ogv", ".ts",
}

# Extensiones de audio soportadas
AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".flac", ".ogg", ".m4a",
    ".aac", ".wma", ".opus", ".aiff",
}

# Puerto por defecto del servidor
DEFAULT_PORT = 5000

# Directorio raíz por defecto para servir medios
DEFAULT_MEDIA_DIR = str(Path.home())

# Configurar logger para registro de eventos
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("rocio")


# ─────────────────────────────────────────────────────────────────
# BLOQUE 3: INICIALIZACIÓN DE FLASK
# Crear la aplicación y habilitar CORS
# ─────────────────────────────────────────────────────────────────

app = Flask(__name__)

# Habilitar CORS para todos los orígenes (necesario para uso local)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Variable global para el directorio raíz de medios
MEDIA_ROOT: str = DEFAULT_MEDIA_DIR


# ─────────────────────────────────────────────────────────────────
# BLOQUE 4: FUNCIONES AUXILIARES — Sistema de Archivos
# Funciones para explorar y filtrar archivos de medios
# ─────────────────────────────────────────────────────────────────

def get_file_type(path: Path) -> str:
    """
    Determina el tipo de un archivo según su extensión.
    Retorna: 'video', 'audio', 'folder' o 'file'
    """
    if path.is_dir():
        return "folder"
    ext = path.suffix.lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    return "file"


def is_media_file(path: Path) -> bool:
    """
    Verifica si un archivo es de tipo video o audio.
    Retorna True si la extensión coincide con las soportadas.
    """
    ext = path.suffix.lower()
    return ext in VIDEO_EXTENSIONS or ext in AUDIO_EXTENSIONS


def safe_path(base: str, relative: str) -> Optional[Path]:
    """
    Construye una ruta segura evitando path traversal (../).
    Retorna None si la ruta sale del directorio base.
    
    Parámetros:
        base: Directorio raíz permitido
        relative: Ruta relativa solicitada por el cliente
    """
    base_path = Path(base).resolve()
    # Combinar y resolver la ruta completa
    target = (base_path / relative.lstrip("/")).resolve()
    # Verificar que la ruta resultante está dentro del directorio base
    try:
        target.relative_to(base_path)
        return target
    except ValueError:
        return None  # Intento de path traversal detectado


def build_tree_node(path: Path, base: Path, max_depth: int = 3, depth: int = 0) -> dict:
    """
    Construye un nodo del árbol de directorios de forma recursiva.
    
    Parámetros:
        path: Ruta del nodo actual
        base: Ruta base para calcular rutas relativas
        max_depth: Profundidad máxima de exploración
        depth: Profundidad actual (inicio en 0)
    
    Retorna:
        Diccionario con información del nodo y sus hijos (si es carpeta)
    """
    rel = str(path.relative_to(base))
    node = {
        "id": rel,
        "name": path.name,
        "type": get_file_type(path),
        "path": "/" + rel,
        "checked": False,
    }

    # Si es directorio y no se ha alcanzado la profundidad máxima, explorar hijos
    if path.is_dir() and depth < max_depth:
        children = []
        try:
            # Ordenar: primero carpetas, luego archivos de medios
            entries = sorted(
                path.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower())
            )
            for entry in entries:
                # Ignorar archivos ocultos y no-medios que no sean carpetas
                if entry.name.startswith("."):
                    continue
                if entry.is_file() and not is_media_file(entry):
                    continue
                children.append(
                    build_tree_node(entry, base, max_depth, depth + 1)
                )
        except PermissionError:
            pass  # Ignorar directorios sin permiso de lectura

        node["children"] = children
        node["isOpen"] = depth == 0  # Abrir solo el nivel raíz

    return node


# ─────────────────────────────────────────────────────────────────
# BLOQUE 5: RUTAS DE LA API — Directorio y Árbol de Archivos
# ─────────────────────────────────────────────────────────────────

@app.route("/api/tree", methods=["GET"])
def get_tree():
    """
    GET /api/tree
    
    Retorna el árbol de directorios desde el directorio raíz de medios.
    Parámetros de query:
        path (opcional): subdirectorio a explorar (relativo a MEDIA_ROOT)
        depth (opcional): profundidad máxima (por defecto 3)
    
    Respuesta:
        JSON con la lista de nodos del árbol
    """
    relative = request.args.get("path", "")
    max_depth = int(request.args.get("depth", 3))

    # Construir ruta segura
    target = safe_path(MEDIA_ROOT, relative) if relative else Path(MEDIA_ROOT).resolve()

    if not target or not target.exists():
        return jsonify({"error": "Directorio no encontrado"}), 404

    if not target.is_dir():
        return jsonify({"error": "La ruta no es un directorio"}), 400

    base = Path(MEDIA_ROOT).resolve()
    tree = build_tree_node(target, base, max_depth=max_depth)

    logger.info(f"Árbol generado para: {target}")
    return jsonify({"tree": tree})


@app.route("/api/files", methods=["GET"])
def list_files():
    """
    GET /api/files
    
    Lista archivos de medios en un directorio específico (sin recursión).
    Parámetros de query:
        path (opcional): subdirectorio (relativo a MEDIA_ROOT)
    
    Respuesta:
        JSON con lista de archivos {name, type, path, size}
    """
    relative = request.args.get("path", "")
    target = safe_path(MEDIA_ROOT, relative) if relative else Path(MEDIA_ROOT).resolve()

    if not target or not target.exists() or not target.is_dir():
        return jsonify({"error": "Directorio inválido"}), 404

    files = []
    try:
        for entry in sorted(target.iterdir(), key=lambda p: p.name.lower()):
            if entry.name.startswith("."):
                continue
            file_type = get_file_type(entry)
            if file_type not in ("video", "audio", "folder"):
                continue

            # Calcular tamaño en MB para archivos
            size_mb = None
            if entry.is_file():
                try:
                    size_mb = round(entry.stat().st_size / (1024 * 1024), 2)
                except OSError:
                    pass

            files.append({
                "name": entry.name,
                "type": file_type,
                "path": "/" + str(entry.relative_to(Path(MEDIA_ROOT).resolve())),
                "size_mb": size_mb,
            })
    except PermissionError:
        return jsonify({"error": "Sin permisos de lectura"}), 403

    return jsonify({"files": files, "count": len(files)})


# ─────────────────────────────────────────────────────────────────
# BLOQUE 6: RUTA — Streaming de Archivos de Medios
# Servir archivos con soporte para HTTP Range (streaming parcial)
# ─────────────────────────────────────────────────────────────────

@app.route("/api/media", methods=["GET"])
def serve_media():
    """
    GET /api/media?path=/Videos/pelicula.mp4
    
    Sirve un archivo de video o audio con soporte para Range requests.
    Esto permite que el navegador pueda saltar a cualquier posición del video.
    
    Parámetros de query:
        path (requerido): ruta relativa al archivo (desde MEDIA_ROOT)
    
    Respuesta:
        Contenido del archivo con headers apropiados (206 Partial Content si Range)
    """
    relative = request.args.get("path", "")
    if not relative:
        return jsonify({"error": "Parámetro 'path' requerido"}), 400

    target = safe_path(MEDIA_ROOT, relative)
    if not target or not target.exists() or not target.is_file():
        return jsonify({"error": "Archivo no encontrado"}), 404

    if not is_media_file(target):
        return jsonify({"error": "Tipo de archivo no soportado"}), 415

    # Obtener tamaño del archivo
    file_size = target.stat().st_size

    # Detectar MIME type según extensión
    ext = target.suffix.lower()
    mime_map = {
        ".mp4": "video/mp4", ".mkv": "video/x-matroska",
        ".webm": "video/webm", ".avi": "video/x-msvideo",
        ".mov": "video/quicktime", ".ogv": "video/ogg",
        ".mp3": "audio/mpeg", ".wav": "audio/wav",
        ".flac": "audio/flac", ".ogg": "audio/ogg",
        ".m4a": "audio/mp4", ".aac": "audio/aac",
        ".opus": "audio/opus",
    }
    mime_type = mime_map.get(ext, "application/octet-stream")

    # Procesar cabecera Range para streaming parcial
    range_header = request.headers.get("Range")
    if range_header:
        # Parsear el rango (ej: "bytes=0-1023")
        byte_start = 0
        byte_end = file_size - 1
        try:
            parts = range_header.replace("bytes=", "").split("-")
            byte_start = int(parts[0]) if parts[0] else 0
            byte_end = int(parts[1]) if parts[1] else file_size - 1
        except (ValueError, IndexError):
            pass

        chunk_size = byte_end - byte_start + 1

        # Generador de streaming parcial
        def generate_chunk():
            with open(target, "rb") as f:
                f.seek(byte_start)
                remaining = chunk_size
                while remaining > 0:
                    data = f.read(min(65536, remaining))  # Chunks de 64KB
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        response = Response(
            stream_with_context(generate_chunk()),
            status=206,  # Partial Content
            mimetype=mime_type,
        )
        response.headers["Content-Range"] = f"bytes {byte_start}-{byte_end}/{file_size}"
        response.headers["Accept-Ranges"] = "bytes"
        response.headers["Content-Length"] = str(chunk_size)
        response.headers["Cache-Control"] = "no-cache"
        logger.info(f"Streaming parcial: {target.name} [{byte_start}-{byte_end}]")
        return response

    # Sin Range: enviar el archivo completo
    logger.info(f"Sirviendo archivo: {target.name} ({file_size} bytes)")
    return send_file(target, mimetype=mime_type)


# ─────────────────────────────────────────────────────────────────
# BLOQUE 7: RUTA — Descarga desde YouTube/Vimeo con yt-dlp
# Requiere que yt-dlp esté instalado: pip install yt-dlp
# ─────────────────────────────────────────────────────────────────

@app.route("/api/download", methods=["POST"])
def download_video():
    """
    POST /api/download
    Body JSON: { "url": "https://youtube.com/watch?v=...", "quality": "best" }
    
    Descarga un video usando yt-dlp y lo guarda en el directorio de medios.
    Retorna información del archivo descargado.
    
    Requiere: yt-dlp instalado (pip install yt-dlp)
    """
    data = request.get_json()
    if not data or "url" not in data:
        return jsonify({"error": "Body JSON con campo 'url' requerido"}), 400

    url = data["url"].strip()
    quality = data.get("quality", "best")  # Calidad: 'best', '720p', '480p', etc.
    output_dir = data.get("output_dir", MEDIA_ROOT)

    # Verificar que yt-dlp está instalado
    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return jsonify({
            "error": "yt-dlp no instalado. Ejecuta: pip install yt-dlp"
        }), 503

    # Configurar el comando de descarga
    output_template = os.path.join(output_dir, "%(title)s.%(ext)s")
    cmd = [
        "yt-dlp",
        "--format", quality,
        "--output", output_template,
        "--no-playlist",        # No descargar listas de reproducción completas
        "--restrict-filenames", # Nombres de archivo seguros (sin caracteres especiales)
        "--print", "filename",  # Imprimir el nombre del archivo descargado
        url,
    ]

    logger.info(f"Iniciando descarga: {url}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # Tiempo máximo: 5 minutos
        )
        if result.returncode != 0:
            logger.error(f"Error yt-dlp: {result.stderr}")
            return jsonify({"error": result.stderr}), 500

        # Obtener el nombre del archivo descargado
        filename = result.stdout.strip().split("\n")[-1]
        file_path = Path(filename)

        return jsonify({
            "success": True,
            "filename": file_path.name,
            "path": filename,
            "size_mb": round(file_path.stat().st_size / (1024 * 1024), 2) if file_path.exists() else None,
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Tiempo de descarga agotado (máximo 5 minutos)"}), 504
    except Exception as e:
        logger.error(f"Error descarga: {e}")
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────────────────────────
# BLOQUE 8: RUTA — Recorte de Segmento con ffmpeg
# Extrae un fragmento de video entre dos marcas de tiempo
# ─────────────────────────────────────────────────────────────────

@app.route("/api/segment", methods=["POST"])
def cut_segment():
    """
    POST /api/segment
    Body JSON: {
        "path": "/Videos/pelicula.mp4",
        "start": 30.5,     (segundos)
        "end": 90.0,       (segundos)
        "output_name": "mi_segmento"  (opcional)
    }
    
    Recorta un segmento de video usando ffmpeg y lo retorna como descarga.
    Requiere: ffmpeg instalado en el sistema
    
    Retorna:
        Archivo de video recortado para descarga directa
    """
    data = request.get_json()
    if not data or "path" not in data:
        return jsonify({"error": "Body JSON con campos 'path', 'start' y 'end' requerido"}), 400

    relative = data.get("path", "")
    start_sec = float(data.get("start", 0))
    end_sec = float(data.get("end", 0))
    output_name = data.get("output_name", "segmento")

    # Validar el segmento
    if end_sec <= start_sec:
        return jsonify({"error": "El tiempo de fin debe ser mayor al de inicio"}), 400

    # Obtener ruta segura del archivo fuente
    target = safe_path(MEDIA_ROOT, relative)
    if not target or not target.exists() or not target.is_file():
        return jsonify({"error": "Archivo fuente no encontrado"}), 404

    # Verificar que ffmpeg está disponible
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return jsonify({"error": "ffmpeg no instalado. Visita: https://ffmpeg.org/download.html"}), 503

    # Calcular duración del segmento
    duration = end_sec - start_sec

    # Crear archivo temporal para el resultado
    suffix = target.suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name

    # Comando ffmpeg para recortar sin re-codificar (más rápido)
    cmd = [
        "ffmpeg",
        "-y",                           # Sobrescribir sin preguntar
        "-ss", str(start_sec),          # Tiempo de inicio
        "-i", str(target),              # Archivo de entrada
        "-t", str(duration),            # Duración del segmento
        "-c", "copy",                   # Sin re-codificar (rápido)
        "-avoid_negative_ts", "1",      # Evitar timestamps negativos
        tmp_path,
    ]

    logger.info(f"Recortando segmento: {target.name} [{start_sec}s → {end_sec}s]")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            logger.error(f"Error ffmpeg: {result.stderr}")
            return jsonify({"error": f"Error ffmpeg: {result.stderr[-500:]}"}), 500

        # Enviar el archivo recortado como descarga
        download_name = f"{output_name}_{int(start_sec)}s-{int(end_sec)}s{suffix}"
        return send_file(
            tmp_path,
            as_attachment=True,
            download_name=download_name,
            mimetype="video/mp4",
        )
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Tiempo de recorte agotado (máximo 2 minutos)"}), 504
    except Exception as e:
        logger.error(f"Error segmento: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        # Limpiar archivo temporal en un thread separado para no bloquear
        def cleanup():
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        threading.Thread(target=cleanup, daemon=True).start()


# ─────────────────────────────────────────────────────────────────
# BLOQUE 9: RUTA — Estado del Servidor (Health Check)
# ─────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health_check():
    """
    GET /api/health
    
    Verifica que el servidor está funcionando y retorna información del entorno.
    Útil para el frontend para confirmar que el servidor local está activo.
    """
    # Verificar disponibilidad de herramientas opcionales
    has_ytdlp = False
    has_ffmpeg = False

    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
        has_ytdlp = True
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        has_ffmpeg = True
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass

    return jsonify({
        "status": "ok",
        "media_root": MEDIA_ROOT,
        "tools": {
            "yt_dlp": has_ytdlp,
            "ffmpeg": has_ffmpeg,
        },
        "version": "1.0.0",
    })


# ─────────────────────────────────────────────────────────────────
# BLOQUE 10: PUNTO DE ENTRADA — Parseo de argumentos e inicio
# ─────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Configurar argumentos de línea de comandos
    parser = argparse.ArgumentParser(
        description="Rocio — Servidor Multimedia en Python",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python server.py                          # Inicia en localhost:5000
  python server.py --port 8080              # Puerto personalizado
  python server.py --dir /home/user/Videos  # Directorio de medios
  python server.py --host 0.0.0.0           # Accesible en red local
        """,
    )
    parser.add_argument(
        "--port", type=int, default=DEFAULT_PORT,
        help=f"Puerto del servidor (por defecto: {DEFAULT_PORT})"
    )
    parser.add_argument(
        "--host", default="127.0.0.1",
        help="Dirección de escucha (por defecto: 127.0.0.1)"
    )
    parser.add_argument(
        "--dir", default=DEFAULT_MEDIA_DIR,
        help=f"Directorio raíz de medios (por defecto: {DEFAULT_MEDIA_DIR})"
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="Activar modo debug de Flask"
    )

    args = parser.parse_args()

    # Configurar directorio de medios global
    MEDIA_ROOT = str(Path(args.dir).resolve())
    if not os.path.isdir(MEDIA_ROOT):
        logger.error(f"El directorio '{MEDIA_ROOT}' no existe.")
        sys.exit(1)

    logger.info("=" * 60)
    logger.info("  ROCIO — Servidor Multimedia")
    logger.info("=" * 60)
    logger.info(f"  URL:        http://{args.host}:{args.port}")
    logger.info(f"  Medios:     {MEDIA_ROOT}")
    logger.info(f"  Debug:      {args.debug}")
    logger.info("=" * 60)

    # Iniciar el servidor Flask
    app.run(
        host=args.host,
        port=args.port,
        debug=args.debug,
        threaded=True,  # Soportar múltiples conexiones simultáneas
    )
