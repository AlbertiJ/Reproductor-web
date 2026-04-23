# Rocio — Servidor Python

Servidor backend para el reproductor multimedia Rocio.

## Credenciales por defecto

> El repositorio incluye estas credenciales de acceso de inicio. **Cámbialas en tu primera sesión.**

| Campo | Valor |
|-------|-------|
| Usuario | `rocio` |
| Contraseña | `rocio123` |

Las credenciales se guardan en `rocio.conf` (creado automáticamente la primera vez).
**Ese archivo no se sube a GitHub** — vive únicamente en tu máquina.

Para cambiar la contraseña:
```bash
python3 server.py --set-password
```

---

## Instalación rápida

```bash
pip install -r requirements.txt
```

Para autenticación con usuarios del sistema operativo (opcional):
```bash
pip install python-pam
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

---

## Gestión de usuarios

Rocio incluye un sistema de perfiles de usuario con base de datos local (`rocio.db`).

- **Admin**: puede ver y navegar cualquier carpeta, crear/editar/eliminar usuarios.
- **Usuario**: solo puede acceder a las carpetas que el admin le asigne.

El panel de administración está disponible en el reproductor web (botón "Usuarios" en el menú superior, visible solo para admins).

### Usuarios del sistema operativo (opt-in)

Para permitir que usuarios del sistema operativo (Linux) se autentiquen en Rocio, agrega esto a `rocio.conf`:

```ini
[auth]
allow_system_users = true
```

> **Advertencia de seguridad**: El usuario `root` **nunca** puede autenticarse via web (bloqueado por código). Si activas esta opción, limita el acceso del servidor a `127.0.0.1` (localhost).

---

## API Endpoints

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/login` | No | Iniciar sesión |
| POST | `/api/logout` | No | Cerrar sesión |
| GET | `/api/me` | Sí | Info del usuario actual |
| GET | `/api/health` | No | Estado del servidor |
| GET | `/api/tree?path=...` | Sí | Árbol de directorios |
| GET | `/api/files?path=...` | Sí | Lista archivos de una carpeta |
| GET | `/api/media?path=...` | Sí | Streaming del archivo |
| POST | `/api/download` | Sí | Descargar video (YouTube/Vimeo) |
| POST | `/api/segment` | Sí | Recortar segmento con ffmpeg |
| GET | `/api/admin/users` | Admin | Listar usuarios |
| POST | `/api/admin/users` | Admin | Crear usuario |
| PUT | `/api/admin/users/<id>` | Admin | Editar usuario |
| DELETE | `/api/admin/users/<id>` | Admin | Eliminar usuario |

---

## Seguridad

- Las contraseñas se almacenan como hash SHA-256 (nunca en texto plano).
- Rate limiting: máx. 10 intentos fallidos por IP en 5 minutos.
- El usuario `root` nunca puede autenticarse via web.
- `rocio.conf` y `rocio.db` están en `.gitignore` — no se suben al repositorio.

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

Para desplegar en la nube (AWS, GCP, Railway, etc.), usa `--host 0.0.0.0` y asegúrate de configurar un proxy reverso (nginx/caddy) con HTTPS.
