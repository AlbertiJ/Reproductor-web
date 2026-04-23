#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  ROCIO — Script de compilación del reproductor web              ║
# ║                                                                  ║
# ║  Compila la interfaz React y la copia a static/ para que        ║
# ║  el servidor Python la sirva en http://localhost:5000            ║
# ╚══════════════════════════════════════════════════════════════════╝
#
# Uso:
#   bash build.sh
#
# Ejecutar DESDE la carpeta rocio-python-server/ o desde la raíz del repo.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATIC_DIR="$SCRIPT_DIR/static"

# La raíz del repositorio está un nivel arriba de rocio-python-server/
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLAYER_DIR="$REPO_ROOT/artifacts/rocio-player"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ROCIO — Compilando reproductor web                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Raíz del repo: $REPO_ROOT"
echo "  Reproductor:   $PLAYER_DIR"
echo "  Destino:       $STATIC_DIR"
echo ""

# ── Verificar Node.js ─────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ Node.js no está instalado."
  echo ""
  echo "   Instálalo con:"
  echo "     Ubuntu/Debian:  sudo apt install nodejs npm"
  echo "     macOS:          brew install node"
  echo "     O descárgalo:   https://nodejs.org"
  exit 1
fi
NODE_VER=$(node --version)
echo "✓ Node.js $NODE_VER"

# ── Instalar pnpm si no está ──────────────────────────────────────
# Este proyecto usa pnpm por su sistema de catálogo de versiones.
# npm no puede resolverlo — necesitamos pnpm obligatoriamente.
if ! command -v pnpm &>/dev/null; then
  echo ""
  echo "  pnpm no encontrado. Instalando automáticamente..."
  npm install -g pnpm --silent
  if ! command -v pnpm &>/dev/null; then
    echo "❌ No se pudo instalar pnpm. Intenta manualmente:"
    echo "     npm install -g pnpm"
    exit 1
  fi
fi
PNPM_VER=$(pnpm --version)
echo "✓ pnpm $PNPM_VER"

# ── Verificar que existe el reproductor ──────────────────────────
if [ ! -f "$PLAYER_DIR/package.json" ]; then
  echo ""
  echo "❌ No se encontró $PLAYER_DIR/package.json"
  echo "   Asegúrate de clonar el repositorio completo:"
  echo "     git clone https://github.com/AlbertiJ/Reproductor-web.git"
  exit 1
fi

# ── Instalar dependencias desde la RAÍZ del workspace ────────────
# pnpm debe correr desde la raíz para resolver los catalog: y workspace:
echo ""
echo "Instalando dependencias del workspace (puede tardar la primera vez)..."
(cd "$REPO_ROOT" && pnpm install --no-frozen-lockfile)

# ── Compilar el reproductor con Vite ─────────────────────────────
echo ""
echo "Compilando la interfaz React..."
(cd "$REPO_ROOT" && BASE_PATH=/ PORT=5000 pnpm --filter @workspace/rocio-player build)

# ── Detectar carpeta de salida del build ──────────────────────────
if [ -d "$PLAYER_DIR/dist/public" ]; then
  BUILD_OUT="$PLAYER_DIR/dist/public"
elif [ -d "$PLAYER_DIR/dist" ]; then
  BUILD_OUT="$PLAYER_DIR/dist"
else
  echo ""
  echo "❌ No se generó la carpeta dist/. Revisa los errores anteriores."
  exit 1
fi

echo "  Build generado en: $BUILD_OUT"

# ── Copiar al directorio static/ del servidor ─────────────────────
echo ""
echo "Copiando archivos al servidor..."
rm -rf "$STATIC_DIR"
cp -r "$BUILD_OUT" "$STATIC_DIR"

# ── Listo ─────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ✅ Compilación completada                              ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Ahora inicia el servidor:                              ║"
echo "║                                                         ║"
echo "║    python3 server.py                                    ║"
echo "║                                                         ║"
echo "║  Abre el reproductor en:                                ║"
echo "║    http://localhost:5000                                 ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
