#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  ROCIO — Script de compilación del reproductor web              ║
# ║                                                                  ║
# ║  Compila la interfaz React y la copia a static/ para que        ║
# ║  el servidor Python la sirva directamente en http://localhost    ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# Uso:
#   bash build.sh                              # Busca el reproductor automáticamente
#   bash build.sh --player-dir /ruta/completa  # Ruta explícita al reproductor React
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATIC_DIR="$SCRIPT_DIR/static"

# ── Parsear argumentos ────────────────────────────────────────────
PLAYER_DIR=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --player-dir)
      PLAYER_DIR="$2"
      shift 2
      ;;
    *)
      echo "Argumento desconocido: $1"
      echo "Uso: bash build.sh [--player-dir /ruta/al/reproductor]"
      exit 1
      ;;
  esac
done

# ── Encontrar el directorio del reproductor ───────────────────────
if [ -z "$PLAYER_DIR" ]; then
  # Buscar de forma relativa al script (estructura del repo)
  CANDIDATE_1="$(dirname "$SCRIPT_DIR")/artifacts/rocio-player"
  CANDIDATE_2="$SCRIPT_DIR/../artifacts/rocio-player"
  CANDIDATE_3="$HOME/Documentos/Reproductor-web/artifacts/rocio-player"

  for DIR in "$CANDIDATE_1" "$CANDIDATE_2" "$CANDIDATE_3"; do
    if [ -f "$DIR/package.json" ]; then
      PLAYER_DIR="$(cd "$DIR" && pwd)"
      break
    fi
  done

  if [ -z "$PLAYER_DIR" ]; then
    echo ""
    echo "❌ No se encontró el directorio del reproductor React."
    echo "   Indica la ruta con: bash build.sh --player-dir /ruta/al/reproductor"
    exit 1
  fi
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ROCIO — Compilando reproductor web                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Reproductor: $PLAYER_DIR"
echo "  Destino:     $STATIC_DIR"
echo ""

# ── Verificar que existe package.json ────────────────────────────
if [ ! -f "$PLAYER_DIR/package.json" ]; then
  echo "❌ No se encontró package.json en: $PLAYER_DIR"
  exit 1
fi

# ── Detectar gestor de paquetes (pnpm, npm, yarn) ─────────────────
if command -v pnpm &>/dev/null; then
  PKG_MGR="pnpm"
elif command -v npm &>/dev/null; then
  PKG_MGR="npm"
elif command -v yarn &>/dev/null; then
  PKG_MGR="yarn"
else
  echo "❌ No se encontró pnpm, npm ni yarn. Instala Node.js primero."
  exit 1
fi
echo "  Gestor de paquetes: $PKG_MGR"
echo ""

# ── Instalar dependencias si no existen ──────────────────────────
if [ ! -d "$PLAYER_DIR/node_modules" ]; then
  echo "Instalando dependencias..."
  (cd "$PLAYER_DIR" && $PKG_MGR install)
fi

# ── Compilar con Vite (BASE_PATH=/ para servir desde raíz) ────────
echo "Compilando la interfaz React..."
(cd "$PLAYER_DIR" && BASE_PATH=/ PORT=5000 $PKG_MGR run build)

# ── Detectar carpeta de salida del build ──────────────────────────
# Vite puede generar dist/ o dist/public/ según la config
if [ -d "$PLAYER_DIR/dist/public" ]; then
  BUILD_OUT="$PLAYER_DIR/dist/public"
elif [ -d "$PLAYER_DIR/dist" ]; then
  BUILD_OUT="$PLAYER_DIR/dist"
else
  echo "❌ No se encontró carpeta de build (dist/ o dist/public/)."
  exit 1
fi

echo "  Build generado en: $BUILD_OUT"

# ── Copiar al directorio static/ del servidor ─────────────────────
echo ""
echo "Copiando archivos al servidor..."
rm -rf "$STATIC_DIR"
cp -r "$BUILD_OUT" "$STATIC_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Compilación completada                              ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Ahora inicia el servidor:                              ║"
echo "║    python3 server.py                                    ║"
echo "║                                                         ║"
echo "║  Abre el reproductor en:                                ║"
echo "║    http://localhost:5000                                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
