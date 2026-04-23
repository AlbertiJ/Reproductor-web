# Rocio — Reproductor Multimedia

## Overview

Reproductor multimedia completo para navegador con:
- Reproducción de video y audio (archivos locales y URLs externas)
- Árbol de directorios con checkboxes para seleccionar fuentes
- Grabación por segmento de tiempo (inicio/fin marcable)
- Carga de URLs externas (YouTube, Vimeo, MP4/MP3 directo)
- Compartir en WhatsApp, Telegram, Facebook e Instagram
- Plugin para Firefox
- Servidor backend en Python con código comentado

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS (tema oscuro)
- **Componentes**: shadcn/ui, lucide-react, react-icons
- **API framework**: Express 5 (servidor API compartido)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

- **rocio-player** (`/`) — Reproductor multimedia React+Vite
- **api-server** (`/api`) — API Express compartida

## Extra Files (fuera del monorepo)

- **`rocio-python-server/server.py`** — Servidor Python (Flask) para uso local/nube
  - `pip install -r rocio-python-server/requirements.txt`
  - `python rocio-python-server/server.py --dir /ruta/a/videos`
- **`rocio-firefox-plugin/`** — Plugin para Firefox (Manifest V3)
  - Cargar en Firefox: `about:debugging` → Este Firefox → Cargar complemento temporal

## Features

- Reproductor HTML5 nativo con controles: play, pausa, volumen, velocidad, pantalla completa, ±10s
- Árbol de directorios estilo checkbox/rama para seleccionar carpetas y archivos
- Segmento: marcar inicio/fin y grabar/descargar el clip en WebM
- URL externa: YouTube embed, Vimeo embed, archivos directos MP4/MP3
- Compartir: WhatsApp, Telegram, Facebook, Instagram
- Servidor Python: streaming con Range, descarga yt-dlp, recorte ffmpeg
- Plugin Firefox: popup con reproductor, URL, segmento, compartir y detección de videos en páginas

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
