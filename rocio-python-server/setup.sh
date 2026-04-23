#!/bin/bash
# ╔══════════════════════════════════════════════════╗
# ║  ROCIO — Script de instalación (Linux / macOS)   ║
# ╚══════════════════════════════════════════════════╝

set -e

echo "=== Rocio — Instalación del servidor Python ==="
echo ""

# Verificar Python 3
if ! command -v python3 &>/dev/null; then
  echo "ERROR: Python 3 no está instalado."
  echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
  exit 1
fi

PYTHON_VER=$(python3 --version)
echo "✓ $PYTHON_VER encontrado"

# Instalar dependencias Python con pip3
echo ""
echo "Instalando dependencias Python..."
pip3 install -r requirements.txt

# Verificar ffmpeg
echo ""
if command -v ffmpeg &>/dev/null; then
  echo "✓ ffmpeg encontrado"
else
  echo "⚠ ffmpeg no encontrado. Para recorte de segmentos instálalo:"
  echo "    Ubuntu/Debian: sudo apt install ffmpeg"
  echo "    macOS:         brew install ffmpeg"
fi

echo ""
echo "=== Instalación completa ==="
echo ""
echo "Para iniciar el servidor:"
echo "  python3 server.py"
echo "  python3 server.py --dir /ruta/a/tus/videos"
echo "  python3 server.py --port 8080 --host 0.0.0.0"
