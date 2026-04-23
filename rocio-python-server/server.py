#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════╗
║  ROCIO — Servidor Multimedia Local v2                            ║
║                                                                  ║
║  Características:                                                ║
║    - Autenticación usuario/clave (archivo rocio.conf)            ║
║    - Registro de conexiones en connections.log                   ║
║    - Modo segundo plano (--daemon) con control por PID           ║
║    - Streaming de video/audio con HTTP Range                     ║
║    - API REST para árbol de directorios                          ║
║    - Descarga YouTube/Vimeo con yt-dlp                           ║
║    - Recorte de segmentos con ffmpeg                             ║
║                                                                  ║
║  Uso rápido:                                                     ║
║    python3 server.py                        (consola)            ║
║    python3 server.py --daemon               (segundo plano)      ║
║    python3 server.py --stop                 (detener demonio)    ║
║    python3 server.py --dir /ruta/Videos                          ║
╚══════════════════════════════════════════════════════════════════╝
"""

# ─────────────────────────────────────────────────────────────────
# BLOQUE 1: IMPORTACIONES
# ─────────────────────────────────────────────────────────────────
import os
import sys
import json
import argparse
import subprocess
import tempfile
import threading
import logging
import signal
import hashlib
import configparser
import socket
import sqlite3
from pathlib import Path
from typing import Optional
from datetime import datetime
from functools import wraps

from flask import (
    Flask, jsonify, request, send_file, send_from_directory,
    abort, Response, stream_with_context, session,
)
from flask_cors import CORS


# ─────────────────────────────────────────────────────────────────
# BLOQUE 2: RUTAS DE ARCHIVOS DEL SERVIDOR
# Todos los archivos auxiliares viven junto al script
# ─────────────────────────────────────────────────────────────────

BASE_DIR       = Path(__file__).parent.resolve()
CONFIG_FILE    = BASE_DIR / "rocio.conf"       # Credenciales admin inicial (usuario/clave)
DB_FILE        = BASE_DIR / "rocio.db"         # Base de datos de perfiles de usuario
CONN_LOG_FILE  = BASE_DIR / "connections.log"  # Registro de conexiones
PID_FILE       = BASE_DIR / "rocio.pid"        # PID del proceso demonio
SERVER_LOG     = BASE_DIR / "server.log"       # Log del servidor en modo demonio
STATIC_DIR     = BASE_DIR / "static"           # Reproductor web compilado (build)


# ─────────────────────────────────────────────────────────────────
# BLOQUE 3: CONFIGURACIÓN GLOBAL
# ─────────────────────────────────────────────────────────────────

VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".avi", ".mov", ".webm",
    ".flv", ".wmv", ".m4v", ".ogv", ".ts",
}
AUDIO_EXTENSIONS = {
    ".mp3", ".wav", ".flac", ".ogg", ".m4a",
    ".aac", ".wma", ".opus", ".aiff",
}

DEFAULT_PORT      = 5000
DEFAULT_HOST      = "127.0.0.1"
DEFAULT_MEDIA_DIR = str(Path.home())


# ─────────────────────────────────────────────────────────────────
# BLOQUE 4: GESTIÓN DEL ARCHIVO DE CONFIGURACIÓN (rocio.conf)
#
# El archivo rocio.conf se crea automáticamente si no existe.
# Guarda el usuario y la contraseña hasheada con SHA-256.
# NUNCA almacena la contraseña en texto plano.
# ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hashea la contraseña con SHA-256 para almacenamiento seguro."""
    return hashlib.sha256(password.encode()).hexdigest()


def load_config() -> configparser.ConfigParser:
    """
    Carga rocio.conf. Si no existe, lo crea con valores por defecto.
    La clave por defecto es 'rocio123' (hasheada).
    """
    config = configparser.ConfigParser()

    if not CONFIG_FILE.exists():
        # Crear configuración inicial con valores por defecto
        config["auth"] = {
            "username": "rocio",
            "password_hash": hash_password("rocio123"),
        }
        config["server"] = {
            "host": DEFAULT_HOST,
            "port": str(DEFAULT_PORT),
            "media_dir": DEFAULT_MEDIA_DIR,
        }
        with open(CONFIG_FILE, "w") as f:
            config.write(f)
        print(f"  ► Archivo de configuración creado: {CONFIG_FILE}")
        print(f"  ► Usuario por defecto: rocio / Clave: rocio123")
        print(f"  ► Cambia la clave ejecutando: python3 server.py --set-password")
        print()

    config.read(CONFIG_FILE)
    return config


def verify_credentials(username: str, password: str, config: configparser.ConfigParser) -> bool:
    """Verifica usuario y contraseña contra el hash almacenado en rocio.conf."""
    stored_user  = config.get("auth", "username", fallback="rocio")
    stored_hash  = config.get("auth", "password_hash", fallback="")
    input_hash   = hash_password(password)
    user_ok  = username == stored_user
    pass_ok  = input_hash == stored_hash
    return user_ok and pass_ok


def change_password(new_password: str, config: configparser.ConfigParser):
    """Actualiza el hash de contraseña en rocio.conf."""
    if "auth" not in config:
        config["auth"] = {}
    config["auth"]["password_hash"] = hash_password(new_password)
    with open(CONFIG_FILE, "w") as f:
        config.write(f)
    print(f"✅ Contraseña actualizada en {CONFIG_FILE}")


# ─────────────────────────────────────────────────────────────────
# BLOQUE 4.5: BASE DE DATOS SQLite — Perfiles de usuario
#
# rocio.db contiene dos tablas:
#   users          — todos los perfiles de Rocio
#   login_attempts — registro de intentos de autenticación (rate limiting)
#
# Esquema de users:
#   id           INTEGER PRIMARY KEY
#   username     TEXT UNIQUE NOT NULL
#   password_hash TEXT NOT NULL
#   role         TEXT  ('admin' | 'user')
#   allowed_dirs TEXT  JSON — lista de rutas permitidas ([] = sin restricción)
#   system_user  INTEGER 0/1 — si usa autenticación PAM del sistema operativo
#   created_at   TEXT
#   last_login   TEXT
#
# SEGURIDAD:
#   - El usuario 'root' nunca puede autenticarse via web (bloqueado por código)
#   - Los usuarios del sistema requieren que allow_system_users = true en rocio.conf
#   - Rate limiting: máx. 10 intentos fallidos / IP en 5 minutos
#   - Las contraseñas se almacenan siempre como hash SHA-256
# ─────────────────────────────────────────────────────────────────

def get_db():
    """Retorna una conexión SQLite con filas como diccionarios."""
    conn = sqlite3.connect(str(DB_FILE))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """
    Crea las tablas si no existen y siembra el admin desde rocio.conf.
    Se llama una sola vez al arrancar el servidor.
    """
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL DEFAULT '',
                role          TEXT NOT NULL DEFAULT 'user',
                allowed_dirs  TEXT NOT NULL DEFAULT '[]',
                system_user   INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT DEFAULT (datetime('now')),
                last_login    TEXT
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS login_attempts (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                ip       TEXT,
                username TEXT,
                ts       TEXT DEFAULT (datetime('now')),
                success  INTEGER DEFAULT 0
            )
        """)
        conn.commit()

        # Sembrar admin desde rocio.conf si la tabla está vacía
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count == 0:
            conf = load_config()
            admin_user = conf.get("auth", "username", fallback="rocio")
            admin_hash = conf.get("auth", "password_hash",
                                  fallback=hash_password("rocio123"))
            conn.execute(
                "INSERT INTO users (username, password_hash, role, allowed_dirs) "
                "VALUES (?, ?, 'admin', '[]')",
                (admin_user, admin_hash),
            )
            conn.commit()
            print(f"  ► Perfil admin '{admin_user}' importado desde rocio.conf")


# ──── Funciones de acceso a la base de datos ─────────────────────

def db_get_user(username: str) -> Optional[dict]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
    return dict(row) if row else None


def db_verify_credentials(username: str, password: str) -> Optional[dict]:
    """
    Verifica usuario y contraseña contra rocio.db.
    Retorna el dict del usuario si es válido, o None si falla.
    El usuario 'root' siempre es rechazado para prevenir escalada de privilegios.
    """
    # Bloqueo explícito de root — nunca permitir login de root via web
    if username.lower() == "root":
        logger.warning("Intento de login como root bloqueado por política de seguridad.")
        return None

    user = db_get_user(username)
    if not user:
        return None

    if user["system_user"]:
        return _verify_system_user(username, password, user)

    if user["password_hash"] == hash_password(password):
        _db_update_last_login(username)
        return user

    return None


def _verify_system_user(username: str, password: str, user_row: dict) -> Optional[dict]:
    """
    Verifica credenciales contra el sistema operativo (PAM).
    SOLO se activa si el usuario tiene system_user=1 en la BD
    Y si allow_system_users=true en rocio.conf.
    NUNCA autentica a 'root'.
    """
    if username.lower() == "root":
        return None

    allow = CONFIG.getboolean("auth", "allow_system_users", fallback=False)
    if not allow:
        logger.warning(
            f"Intento de login de sistema rechazado: "
            f"allow_system_users no está habilitado en rocio.conf"
        )
        return None

    # Intentar via python-pam (método preferido)
    try:
        import pam as pam_module  # pip install python-pam
        p = pam_module.pam()
        if p.authenticate(username, password):
            _db_update_last_login(username)
            return user_row
        return None
    except ImportError:
        pass

    # Fallback: subprocess con timeout estricto
    # NOTA: requiere que el servidor tenga permisos suficientes (grupo shadow)
    try:
        # Sanitizar: solo letras, números y guiones en el nombre de usuario
        import re
        if not re.match(r'^[a-zA-Z0-9_\-]+$', username):
            logger.error(f"Nombre de usuario inválido rechazado: {username!r}")
            return None
        result = subprocess.run(
            ["su", "-s", "/bin/sh", "-c", "echo __ok__", username],
            input=f"{password}\n",
            capture_output=True,
            text=True,
            timeout=3,
        )
        if "__ok__" in result.stdout:
            _db_update_last_login(username)
            return user_row
    except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError):
        pass

    return None


def _db_update_last_login(username: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE users SET last_login = datetime('now') WHERE username = ?",
            (username,),
        )
        conn.commit()


# ──── Rate limiting ───────────────────────────────────────────────

def is_rate_limited(ip: str) -> bool:
    """Bloquea si hubo más de 10 intentos fallidos desde esta IP en 5 minutos."""
    with get_db() as conn:
        count = conn.execute("""
            SELECT COUNT(*) FROM login_attempts
            WHERE ip = ? AND success = 0
            AND ts >= datetime('now', '-5 minutes')
        """, (ip,)).fetchone()[0]
    return count >= 10


def record_login_attempt(ip: str, username: str, success: bool):
    with get_db() as conn:
        conn.execute(
            "INSERT INTO login_attempts (ip, username, success) VALUES (?, ?, ?)",
            (ip, username, 1 if success else 0),
        )
        conn.commit()


# ─────────────────────────────────────────────────────────────────
# BLOQUE 5: REGISTRO DE CONEXIONES (connections.log)
#
# Cada solicitud a la API queda registrada con:
#   - Fecha/hora
#   - IP del cliente
#   - Método HTTP y ruta
#   - Código de respuesta
#   - Usuario autenticado
# ─────────────────────────────────────────────────────────────────

def log_connection(ip: str, method: str, path: str, status: int, user: str = "-"):
    """
    Escribe una línea en connections.log con información de la conexión.
    Formato: [2024-01-15 14:30:22] 192.168.1.5 rocio GET /api/tree 200
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{timestamp}] {ip:15s} {user:10s} {method:6s} {path} → {status}\n"
    try:
        with open(CONN_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass  # No interrumpir el servidor por un fallo de log


# ─────────────────────────────────────────────────────────────────
# BLOQUE 6: MODO DEMONIO (segundo plano)
#
# --daemon: inicia el servidor en segundo plano (fork Unix)
#           guarda el PID en rocio.pid
# --stop:   lee rocio.pid y envía SIGTERM al proceso
# ─────────────────────────────────────────────────────────────────

def start_daemon(args):
    """
    Hace fork del proceso actual para ejecutar en segundo plano.
    Solo funciona en sistemas Unix/Linux/macOS.
    """
    if not hasattr(os, "fork"):
        print("ERROR: El modo demonio no está disponible en Windows.")
        print("  Usa: python3 server.py  (sin --daemon)")
        sys.exit(1)

    # Primer fork: desconectar del proceso padre
    pid = os.fork()
    if pid > 0:
        # Proceso padre: mostrar info y salir
        print(f"✅ Servidor Rocio iniciado en segundo plano")
        print(f"   PID: {pid}")
        print(f"   Para detener: python3 server.py --stop")
        print(f"   Log del servidor: {SERVER_LOG}")
        sys.exit(0)

    # Proceso hijo: crear nueva sesión
    os.setsid()

    # Segundo fork: evitar que el daemon adquiera una TTY
    pid2 = os.fork()
    if pid2 > 0:
        sys.exit(0)

    # Guardar PID del demonio
    PID_FILE.write_text(str(os.getpid()))

    # Redirigir stdin/stdout/stderr al log del servidor
    sys.stdout.flush()
    sys.stderr.flush()
    with open(SERVER_LOG, "a") as log_fd:
        fd = log_fd.fileno()
        os.dup2(open(os.devnull, "r").fileno(), sys.stdin.fileno())
        os.dup2(fd, sys.stdout.fileno())
        os.dup2(fd, sys.stderr.fileno())


def stop_daemon():
    """
    Lee el PID de rocio.pid y envía SIGTERM al proceso demonio.
    """
    if not PID_FILE.exists():
        print("ERROR: No se encontró rocio.pid — ¿el servidor está corriendo?")
        sys.exit(1)

    try:
        pid = int(PID_FILE.read_text().strip())
        os.kill(pid, signal.SIGTERM)
        PID_FILE.unlink()
        print(f"✅ Servidor Rocio detenido (PID {pid})")
    except ProcessLookupError:
        print(f"El proceso {pid} ya no existe. Limpiando rocio.pid...")
        PID_FILE.unlink()
    except ValueError:
        print("ERROR: rocio.pid contiene un valor inválido.")
        sys.exit(1)


def cleanup_pid():
    """Elimina rocio.pid al salir limpiamente."""
    try:
        if PID_FILE.exists():
            PID_FILE.unlink()
    except OSError:
        pass


# ─────────────────────────────────────────────────────────────────
# BLOQUE 7: CONFIGURACIÓN DEL LOGGER
# ─────────────────────────────────────────────────────────────────

def setup_logger(daemon_mode: bool = False):
    handlers = [logging.StreamHandler(sys.stdout)]
    if daemon_mode:
        handlers.append(logging.FileHandler(SERVER_LOG, encoding="utf-8"))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=handlers,
    )
    return logging.getLogger("rocio")


# ─────────────────────────────────────────────────────────────────
# BLOQUE 8: INICIALIZACIÓN DE FLASK
# ─────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "rocio-dev-secret")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"]  = "Lax"
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Variables globales (se asignan al arrancar)
MEDIA_ROOT: str = DEFAULT_MEDIA_DIR
CONFIG: configparser.ConfigParser = configparser.ConfigParser()
logger = logging.getLogger("rocio")


# ─────────────────────────────────────────────────────────────────
# BLOQUE 9: DECORADOR DE AUTENTICACIÓN HTTP BASIC
#
# Protege todos los endpoints /api/* con usuario y contraseña.
# Si la solicitud no incluye credenciales válidas → 401 Unauthorized.
# ─────────────────────────────────────────────────────────────────

def require_auth(f):
    """
    Decorador que exige autenticación.
    Acepta sesión de cookie (login web) o HTTP Basic Auth (acceso directo a la API).
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        ip = request.remote_addr or "-"

        # 1) Sesión web (cookie firmada)
        if session.get("user"):
            request.authenticated_user = session["user"]
            return f(*args, **kwargs)

        # 2) HTTP Basic Auth
        auth = request.authorization
        if auth:
            user_data = db_verify_credentials(auth.username, auth.password)
            if user_data:
                request.authenticated_user = auth.username
                return f(*args, **kwargs)

        # No autenticado
        log_connection(ip, request.method, request.path, 401,
                       user=auth.username if auth else "anon")
        logger.warning(f"Auth fallida desde {ip} — usuario: {auth.username if auth else 'ninguno'}")
        return Response(
            json.dumps({"error": "Autenticación requerida"}),
            status=401,
            mimetype="application/json",
            headers={"WWW-Authenticate": 'Basic realm="Rocio Servidor"'},
        )

    return decorated


def require_admin(f):
    """
    Decorador que exige que el usuario autenticado tenga rol 'admin'.
    Debe usarse después de @require_auth.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        username = session.get("user") or getattr(request, "authenticated_user", None)
        if not username:
            return jsonify({"error": "No autenticado"}), 401
        user = db_get_user(username)
        if not user or user.get("role") != "admin":
            return jsonify({"error": "Se requieren privilegios de administrador"}), 403
        return f(*args, **kwargs)
    return decorated


# ─────────────────────────────────────────────────────────────────
# BLOQUE 10: MIDDLEWARE — Registrar cada petición completada
# ─────────────────────────────────────────────────────────────────

@app.after_request
def after_request_log(response):
    """Registra en connections.log cada respuesta enviada."""
    ip   = request.remote_addr or "-"
    user = getattr(request, "authenticated_user", "-")
    log_connection(ip, request.method, request.path, response.status_code, user)
    return response


# ─────────────────────────────────────────────────────────────────
# BLOQUE 11: FUNCIONES AUXILIARES — Sistema de Archivos
# ─────────────────────────────────────────────────────────────────

def get_file_type(path: Path) -> str:
    if path.is_dir():
        return "folder"
    ext = path.suffix.lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    return "file"


def is_media_file(path: Path) -> bool:
    ext = path.suffix.lower()
    return ext in VIDEO_EXTENSIONS or ext in AUDIO_EXTENSIONS


def safe_path(base: str, relative: str) -> Optional[Path]:
    """Previene path traversal (../) validando que la ruta esté dentro del directorio base."""
    base_path = Path(base).resolve()
    target = (base_path / relative.lstrip("/")).resolve()
    try:
        target.relative_to(base_path)
        return target
    except ValueError:
        return None


def build_tree_node(path: Path, base: Path, max_depth: int = 3, depth: int = 0) -> dict:
    """Construye el árbol de directorios de forma recursiva."""
    rel = str(path.relative_to(base))
    node = {
        "id": rel,
        "name": path.name,
        "type": get_file_type(path),
        "path": "/" + rel,
        "checked": False,
    }
    if path.is_dir() and depth < max_depth:
        children = []
        try:
            entries = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
            for entry in entries:
                if entry.name.startswith("."):
                    continue
                if entry.is_file() and not is_media_file(entry):
                    continue
                children.append(build_tree_node(entry, base, max_depth, depth + 1))
        except PermissionError:
            pass
        node["children"] = children
        node["isOpen"] = depth == 0
    return node


# ─────────────────────────────────────────────────────────────────
# BLOQUE 12: RUTAS DE LA API
# ─────────────────────────────────────────────────────────────────

@app.route("/api/login", methods=["POST"])
def api_login():
    """
    POST /api/login
    Body: { "username": "...", "password": "..." }
    Inicia sesión y establece una cookie firmada. Sin autenticación previa.
    Incluye rate limiting: máx. 10 intentos fallidos por IP en 5 minutos.
    """
    data = request.get_json() or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")
    ip = request.remote_addr or "-"

    if is_rate_limited(ip):
        logger.warning(f"Rate limit activado para {ip}")
        return jsonify({"error": "Demasiados intentos fallidos. Espera 5 minutos."}), 429

    user_data = db_verify_credentials(username, password)
    record_login_attempt(ip, username, bool(user_data))

    if user_data:
        session["user"] = username
        session["role"] = user_data.get("role", "user")
        session.permanent = False
        log_connection(ip, "POST", "/api/login", 200, user=username)
        logger.info(f"Login web exitoso: {username} ({user_data['role']}) desde {ip}")
        return jsonify({
            "ok": True,
            "user": username,
            "role": user_data.get("role", "user"),
            "allowed_dirs": json.loads(user_data.get("allowed_dirs", "[]")),
        })

    log_connection(ip, "POST", "/api/login", 401, user=username or "anon")
    logger.warning(f"Login web fallido: {username!r} desde {ip}")
    return jsonify({"error": "Usuario o contraseña incorrectos"}), 401


@app.route("/api/logout", methods=["POST"])
def api_logout():
    """POST /api/logout — cierra la sesión web."""
    user = session.get("user", "-")
    session.clear()
    log_connection(request.remote_addr or "-", "POST", "/api/logout", 200, user=user)
    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"])
@require_auth
def api_me():
    """
    GET /api/me — retorna información del usuario autenticado actual.
    Incluye rol y carpetas permitidas.
    """
    username = session.get("user") or getattr(request, "authenticated_user", None)
    user = db_get_user(username)
    if not user:
        return jsonify({"username": username, "role": "user", "allowed_dirs": []}), 200
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "allowed_dirs": json.loads(user.get("allowed_dirs", "[]")),
        "system_user": bool(user["system_user"]),
        "last_login": user.get("last_login"),
    })


# ─────────────────────────────────────────────────────────────────
# ENDPOINTS DE ADMINISTRACIÓN DE USUARIOS
# Todos requieren @require_auth + @require_admin
# ─────────────────────────────────────────────────────────────────

@app.route("/api/admin/users", methods=["GET"])
@require_auth
@require_admin
def admin_list_users():
    """GET /api/admin/users — lista todos los perfiles de usuario."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, username, role, allowed_dirs, system_user, created_at, last_login "
            "FROM users ORDER BY id"
        ).fetchall()
    return jsonify([{
        "id": r["id"],
        "username": r["username"],
        "role": r["role"],
        "allowed_dirs": json.loads(r["allowed_dirs"] or "[]"),
        "system_user": bool(r["system_user"]),
        "created_at": r["created_at"],
        "last_login": r["last_login"],
    } for r in rows])


@app.route("/api/admin/users", methods=["POST"])
@require_auth
@require_admin
def admin_create_user():
    """
    POST /api/admin/users — crea un nuevo perfil de usuario.
    Body: { username, password, role, allowed_dirs, system_user }
    """
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = data.get("role", "user")
    allowed_dirs = json.dumps(data.get("allowed_dirs", []))
    system_user = 1 if data.get("system_user") else 0

    if not username:
        return jsonify({"error": "El nombre de usuario es obligatorio"}), 400
    if username.lower() == "root":
        return jsonify({"error": "No se puede crear cuenta web para 'root'"}), 403
    if not password and not system_user:
        return jsonify({"error": "Se requiere contraseña (o marcar como usuario del sistema)"}), 400
    if role not in ("admin", "user"):
        return jsonify({"error": "El rol debe ser 'admin' o 'user'"}), 400

    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, role, allowed_dirs, system_user) "
                "VALUES (?, ?, ?, ?, ?)",
                (username, hash_password(password) if password else "", role, allowed_dirs, system_user),
            )
            conn.commit()
        logger.info(f"Nuevo usuario creado: {username} (rol: {role})")
        return jsonify({"ok": True, "username": username}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": f"El usuario '{username}' ya existe"}), 409


@app.route("/api/admin/users/<int:user_id>", methods=["PUT"])
@require_auth
@require_admin
def admin_update_user(user_id):
    """
    PUT /api/admin/users/<id> — actualiza un perfil de usuario.
    Body: { role?, password?, allowed_dirs?, system_user? }
    """
    data = request.get_json() or {}
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return jsonify({"error": "Usuario no encontrado"}), 404

        new_role = data.get("role", row["role"])
        new_dirs = json.dumps(data.get("allowed_dirs", json.loads(row["allowed_dirs"] or "[]")))
        new_sys = 1 if data.get("system_user", row["system_user"]) else 0
        new_hash = hash_password(data["password"]) if data.get("password") else row["password_hash"]

        if new_role not in ("admin", "user"):
            return jsonify({"error": "El rol debe ser 'admin' o 'user'"}), 400

        # No degradar al último admin
        if row["role"] == "admin" and new_role != "admin":
            count = conn.execute(
                "SELECT COUNT(*) FROM users WHERE role='admin'"
            ).fetchone()[0]
            if count <= 1:
                return jsonify({"error": "No se puede quitar el rol al único administrador"}), 403

        conn.execute(
            "UPDATE users SET role=?, allowed_dirs=?, system_user=?, password_hash=? WHERE id=?",
            (new_role, new_dirs, new_sys, new_hash, user_id),
        )
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/admin/users/<int:user_id>", methods=["DELETE"])
@require_auth
@require_admin
def admin_delete_user(user_id):
    """DELETE /api/admin/users/<id> — elimina un perfil de usuario."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT username, role FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row:
            return jsonify({"error": "Usuario no encontrado"}), 404
        if row["role"] == "admin":
            count = conn.execute(
                "SELECT COUNT(*) FROM users WHERE role='admin'"
            ).fetchone()[0]
            if count <= 1:
                return jsonify({"error": "No se puede eliminar el único administrador"}), 403
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        conn.commit()
    logger.info(f"Usuario eliminado: {row['username']}")
    return jsonify({"ok": True})


@app.route("/api/health", methods=["GET"])
def health_check():
    """
    GET /api/health  — sin autenticación.
    Verifica que el servidor está activo y devuelve su estado.
    """
    has_ytdlp = has_ffmpeg = False
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
        "version": "2.0.0",
        "media_root": MEDIA_ROOT,
        "authenticated": bool(session.get("user")),
        "tools": {"yt_dlp": has_ytdlp, "ffmpeg": has_ffmpeg},
    })


@app.route("/api/tree", methods=["GET"])
@require_auth
def get_tree():
    """
    GET /api/tree?path=&depth=3
    Retorna el árbol de directorios desde MEDIA_ROOT.
    Requiere autenticación.
    """
    relative  = request.args.get("path", "")
    max_depth = int(request.args.get("depth", 3))
    target = safe_path(MEDIA_ROOT, relative) if relative else Path(MEDIA_ROOT).resolve()

    if not target or not target.exists() or not target.is_dir():
        return jsonify({"error": "Directorio no encontrado"}), 404

    base = Path(MEDIA_ROOT).resolve()
    tree = build_tree_node(target, base, max_depth=max_depth)
    logger.info(f"Árbol generado: {target}")
    return jsonify({"tree": tree})


@app.route("/api/files", methods=["GET"])
@require_auth
def list_files():
    """
    GET /api/files?path=
    Lista archivos de medios en un directorio específico.
    Requiere autenticación.
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


@app.route("/api/media", methods=["GET"])
@require_auth
def serve_media():
    """
    GET /api/media?path=/Videos/pelicula.mp4
    Sirve archivo de video/audio con soporte HTTP Range (streaming parcial).
    Requiere autenticación.
    """
    relative = request.args.get("path", "")
    if not relative:
        return jsonify({"error": "Parámetro 'path' requerido"}), 400

    target = safe_path(MEDIA_ROOT, relative)
    if not target or not target.exists() or not target.is_file():
        return jsonify({"error": "Archivo no encontrado"}), 404
    if not is_media_file(target):
        return jsonify({"error": "Tipo de archivo no soportado"}), 415

    file_size = target.stat().st_size
    ext = target.suffix.lower()
    mime_map = {
        ".mp4": "video/mp4", ".mkv": "video/x-matroska",
        ".webm": "video/webm", ".avi": "video/x-msvideo",
        ".mov": "video/quicktime", ".ogv": "video/ogg",
        ".mp3": "audio/mpeg", ".wav": "audio/wav",
        ".flac": "audio/flac", ".ogg": "audio/ogg",
        ".m4a": "audio/mp4", ".aac": "audio/aac", ".opus": "audio/opus",
    }
    mime_type = mime_map.get(ext, "application/octet-stream")

    # Procesar HTTP Range para streaming parcial
    range_header = request.headers.get("Range")
    if range_header:
        byte_start, byte_end = 0, file_size - 1
        try:
            parts = range_header.replace("bytes=", "").split("-")
            byte_start = int(parts[0]) if parts[0] else 0
            byte_end   = int(parts[1]) if parts[1] else file_size - 1
        except (ValueError, IndexError):
            pass

        chunk_size = byte_end - byte_start + 1

        def generate_chunk():
            with open(target, "rb") as f:
                f.seek(byte_start)
                remaining = chunk_size
                while remaining > 0:
                    data = f.read(min(65536, remaining))
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        response = Response(
            stream_with_context(generate_chunk()),
            status=206,
            mimetype=mime_type,
        )
        response.headers["Content-Range"]  = f"bytes {byte_start}-{byte_end}/{file_size}"
        response.headers["Accept-Ranges"]  = "bytes"
        response.headers["Content-Length"] = str(chunk_size)
        response.headers["Cache-Control"]  = "no-cache"
        logger.info(f"Stream parcial: {target.name} [{byte_start}–{byte_end}]")
        return response

    logger.info(f"Archivo completo: {target.name} ({file_size} bytes)")
    return send_file(target, mimetype=mime_type)


@app.route("/api/download", methods=["POST"])
@require_auth
def download_video():
    """
    POST /api/download
    Body: { "url": "...", "quality": "best" }
    Descarga un video con yt-dlp al directorio de medios.
    Requiere autenticación.
    """
    data = request.get_json()
    if not data or "url" not in data:
        return jsonify({"error": "Body JSON con campo 'url' requerido"}), 400

    url = data["url"].strip()
    quality = data.get("quality", "best")
    output_dir = data.get("output_dir", MEDIA_ROOT)

    try:
        subprocess.run(["yt-dlp", "--version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return jsonify({"error": "yt-dlp no instalado: pip3 install yt-dlp"}), 503

    output_template = os.path.join(output_dir, "%(title)s.%(ext)s")
    cmd = [
        "yt-dlp", "--format", quality,
        "--output", output_template,
        "--no-playlist", "--restrict-filenames",
        "--print", "filename", url,
    ]

    logger.info(f"Descarga: {url}")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            return jsonify({"error": result.stderr}), 500
        filename = result.stdout.strip().split("\n")[-1]
        file_path = Path(filename)
        return jsonify({
            "success": True,
            "filename": file_path.name,
            "path": filename,
            "size_mb": round(file_path.stat().st_size / (1024 * 1024), 2) if file_path.exists() else None,
        })
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Tiempo agotado (máximo 5 minutos)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/segment", methods=["POST"])
@require_auth
def cut_segment():
    """
    POST /api/segment
    Body: { "path": "...", "start": 30.5, "end": 90.0, "output_name": "clip" }
    Recorta un segmento de video con ffmpeg.
    Requiere autenticación.
    """
    data = request.get_json()
    if not data or "path" not in data:
        return jsonify({"error": "Campos 'path', 'start', 'end' requeridos"}), 400

    relative    = data.get("path", "")
    start_sec   = float(data.get("start", 0))
    end_sec     = float(data.get("end", 0))
    output_name = data.get("output_name", "segmento")

    if end_sec <= start_sec:
        return jsonify({"error": "El tiempo de fin debe ser mayor al de inicio"}), 400

    target = safe_path(MEDIA_ROOT, relative)
    if not target or not target.exists() or not target.is_file():
        return jsonify({"error": "Archivo no encontrado"}), 404

    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return jsonify({"error": "ffmpeg no instalado: sudo apt install ffmpeg"}), 503

    duration = end_sec - start_sec
    suffix = target.suffix
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp_path = tmp.name

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_sec),
        "-i", str(target),
        "-t", str(duration),
        "-c", "copy",
        "-avoid_negative_ts", "1",
        tmp_path,
    ]

    logger.info(f"Segmento: {target.name} [{start_sec}s → {end_sec}s]")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return jsonify({"error": f"ffmpeg error: {result.stderr[-500:]}"}), 500
        download_name = f"{output_name}_{int(start_sec)}s-{int(end_sec)}s{suffix}"
        return send_file(tmp_path, as_attachment=True, download_name=download_name, mimetype="video/mp4")
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Tiempo agotado (máximo 2 minutos)"}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        threading.Thread(
            target=lambda: (os.unlink(tmp_path) if os.path.exists(tmp_path) else None),
            daemon=True
        ).start()


@app.route("/api/connections", methods=["GET"])
@require_auth
def get_connections():
    """
    GET /api/connections?lines=50
    Retorna las últimas N líneas del registro de conexiones.
    Requiere autenticación.
    """
    lines_n = int(request.args.get("lines", 50))
    if not CONN_LOG_FILE.exists():
        return jsonify({"connections": [], "total": 0})

    with open(CONN_LOG_FILE, "r", encoding="utf-8") as f:
        all_lines = f.readlines()

    last_lines = all_lines[-lines_n:]
    return jsonify({
        "connections": [l.strip() for l in last_lines],
        "total": len(all_lines),
        "showing": len(last_lines),
    })


# ─────────────────────────────────────────────────────────────────
# BLOQUE 13: RUTA — Reproductor Web (archivos estáticos)
#
# Sirve el reproductor React compilado desde la carpeta static/.
# El usuario accede directamente en el navegador: http://localhost:5000
#
# Para compilar el reproductor y copiarlo aquí, usa:
#   bash build.sh
# ─────────────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """
    Sirve los archivos estáticos del reproductor web.
    - Cualquier ruta desconocida devuelve index.html (SPA routing).
    - Los assets (JS, CSS, imágenes) se sirven directamente.
    """
    if not STATIC_DIR.exists():
        # Si no existe la carpeta static/, mostrar instrucciones
        return Response(
            """<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Rocio — Servidor</title>
<style>
  body { font-family: monospace; background: #111; color: #eee;
         display: flex; align-items: center; justify-content: center;
         height: 100vh; margin: 0; }
  .box { max-width: 560px; padding: 40px; border: 1px solid #333;
         border-radius: 8px; line-height: 1.8; }
  h1 { color: #00d2dc; margin-top: 0; }
  code { background: #222; padding: 2px 8px; border-radius: 4px;
         color: #7df; display: block; margin: 6px 0; }
  .ok { color: #4f4; } .dim { color: #777; }
</style></head>
<body><div class="box">
  <h1>▶ Rocio — Servidor activo</h1>
  <p>La API está funcionando en este puerto.</p>
  <p>Para ver el reproductor web aquí, compila la interfaz:</p>
  <code>bash build.sh</code>
  <p class="dim">O si ya tienes el reproductor en otra carpeta:</p>
  <code>bash build.sh --player-dir /ruta/al/reproductor</code>
  <p>Endpoints disponibles:</p>
  <code>GET /api/health    <span class="ok">✓ sin autenticación</span></code>
  <code>GET /api/tree      <span class="dim">requiere usuario/clave</span></code>
  <code>GET /api/media     <span class="dim">requiere usuario/clave</span></code>
  <code>POST /api/download <span class="dim">requiere usuario/clave</span></code>
</div></body></html>""",
            status=200,
            mimetype="text/html",
        )

    # Intentar servir el archivo pedido
    if path and (STATIC_DIR / path).is_file():
        return send_from_directory(STATIC_DIR, path)

    # Para cualquier ruta que no sea un archivo, devolver index.html (SPA)
    index = STATIC_DIR / "index.html"
    if index.exists():
        return send_from_directory(STATIC_DIR, "index.html")

    return Response("Archivo no encontrado", status=404)


# ─────────────────────────────────────────────────────────────────
# BLOQUE 13: BANNER DE INICIO
# Muestra toda la información de conexión al arrancar el servidor
# ─────────────────────────────────────────────────────────────────

def get_local_ip() -> str:
    """Obtiene la IP de la red local (LAN) del servidor."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def print_banner(host: str, port: int, media_dir: str, daemon: bool, config: configparser.ConfigParser):
    """Imprime el banner de inicio con toda la información de conexión."""
    local_ip  = get_local_ip()
    username  = config.get("auth", "username", fallback="rocio")
    pid       = os.getpid()
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # URL de acceso
    if host in ("0.0.0.0", ""):
        url_local = f"http://127.0.0.1:{port}"
        url_lan   = f"http://{local_ip}:{port}"
    else:
        url_local = f"http://{host}:{port}"
        url_lan   = f"http://{local_ip}:{port}" if host == "0.0.0.0" else None

    print()
    print("╔══════════════════════════════════════════════════════════╗")
    print("║          ROCIO — Servidor Multimedia Local v2           ║")
    print("╠══════════════════════════════════════════════════════════╣")
    print(f"║  Iniciado:  {timestamp}                   ║")
    print(f"║  PID:       {pid:<46} ║")
    print(f"║  Modo:      {'Segundo plano (demonio)' if daemon else 'Consola (primer plano)':<46} ║")
    print("╠══════════════════════════════════════════════════════════╣")
    print(f"║  URL local: {url_local:<46} ║")
    if url_lan:
        print(f"║  URL LAN:   {url_lan:<46} ║")
    print(f"║  Puerto:    {port:<46} ║")
    print(f"║  Medios:    {media_dir:<46} ║")
    print("╠══════════════════════════════════════════════════════════╣")
    print(f"║  Usuario:   {username:<46} ║")
    print(f"║  Config:    {str(CONFIG_FILE):<46} ║")
    print(f"║  Conexiones:{str(CONN_LOG_FILE):<46} ║")
    if daemon:
        print(f"║  Log:       {str(SERVER_LOG):<46} ║")
        print(f"║  PID file:  {str(PID_FILE):<46} ║")
    print("╠══════════════════════════════════════════════════════════╣")
    print("║  API disponible:                                        ║")
    print(f"║    GET  {url_local}/api/health        (sin auth) ║")
    print(f"║    GET  {url_local}/api/tree                           ║")
    print(f"║    GET  {url_local}/api/media?path=...                 ║")
    print(f"║    POST {url_local}/api/download                       ║")
    print(f"║    POST {url_local}/api/segment                        ║")
    print(f"║    GET  {url_local}/api/connections                    ║")
    print("╠══════════════════════════════════════════════════════════╣")
    if daemon:
        print("║  Para detener:  python3 server.py --stop                ║")
    else:
        print("║  Para detener:  Ctrl+C                                  ║")
    print("╚══════════════════════════════════════════════════════════╝")
    print()


# ─────────────────────────────────────────────────────────────────
# BLOQUE 14: PUNTO DE ENTRADA (main)
# Parsea argumentos y arranca el servidor
# ─────────────────────────────────────────────────────────────────

def main():
    global MEDIA_ROOT, CONFIG, logger

    parser = argparse.ArgumentParser(
        description="Rocio — Servidor Multimedia Local",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python3 server.py                          Iniciar en consola
  python3 server.py --daemon                 Iniciar en segundo plano
  python3 server.py --stop                   Detener el demonio
  python3 server.py --dir /home/user/Videos  Servir directorio específico
  python3 server.py --host 0.0.0.0           Accesible desde la red local
  python3 server.py --set-password           Cambiar contraseña
        """,
    )
    parser.add_argument("--host",         default=None,           help="Interfaz de red (por defecto: 127.0.0.1)")
    parser.add_argument("--port",         type=int, default=None, help="Puerto del servidor (por defecto: 5000)")
    parser.add_argument("--dir",          default=None,           help="Directorio raíz de medios")
    parser.add_argument("--daemon",       action="store_true",    help="Iniciar en segundo plano")
    parser.add_argument("--stop",         action="store_true",    help="Detener el servidor en segundo plano")
    parser.add_argument("--set-password", action="store_true",    help="Cambiar la contraseña del servidor")
    parser.add_argument("--debug",        action="store_true",    help="Modo debug de Flask")
    args = parser.parse_args()

    # ── Cargar configuración ──────────────────────────────────────
    CONFIG = load_config()

    # ── Inicializar base de datos de usuarios ─────────────────────
    init_db()

    # ── Detener demonio ───────────────────────────────────────────
    if args.stop:
        stop_daemon()
        sys.exit(0)

    # ── Cambiar contraseña ────────────────────────────────────────
    if args.set_password:
        import getpass
        new_pass = getpass.getpass("Nueva contraseña: ")
        confirm  = getpass.getpass("Confirmar contraseña: ")
        if new_pass != confirm:
            print("ERROR: Las contraseñas no coinciden.")
            sys.exit(1)
        change_password(new_pass, CONFIG)
        sys.exit(0)

    # ── Resolver host, puerto y directorio ────────────────────────
    host      = args.host or CONFIG.get("server", "host", fallback=DEFAULT_HOST)
    port      = args.port or CONFIG.getint("server", "port", fallback=DEFAULT_PORT)
    media_dir = args.dir  or CONFIG.get("server", "media_dir", fallback=DEFAULT_MEDIA_DIR)

    MEDIA_ROOT = str(Path(media_dir).expanduser().resolve())

    if not Path(MEDIA_ROOT).exists():
        print(f"ERROR: El directorio de medios no existe: {MEDIA_ROOT}")
        sys.exit(1)

    # ── Modo demonio ──────────────────────────────────────────────
    if args.daemon:
        print_banner(host, port, MEDIA_ROOT, daemon=True, config=CONFIG)
        start_daemon(args)
        # El proceso hijo continúa aquí

    # ── Configurar logger ─────────────────────────────────────────
    logger = setup_logger(daemon_mode=args.daemon)

    # ── Limpiar PID al salir ──────────────────────────────────────
    import atexit
    atexit.register(cleanup_pid)

    # ── Banner (solo en modo consola) ─────────────────────────────
    if not args.daemon:
        print_banner(host, port, MEDIA_ROOT, daemon=False, config=CONFIG)

    # ── Iniciar Flask ─────────────────────────────────────────────
    logger.info(f"Iniciando servidor en {host}:{port} | Medios: {MEDIA_ROOT}")
    app.run(
        host=host,
        port=port,
        debug=args.debug,
        use_reloader=False,   # Deshabilitar reloader (conflicto con daemon)
        threaded=True,
    )


if __name__ == "__main__":
    main()
