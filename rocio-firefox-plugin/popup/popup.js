/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ROCIO Firefox Plugin — popup.js                            ║
 * ║  Lógica del popup de la extensión: reproductor, URL,        ║
 * ║  segmentos de grabación y compartir en redes sociales.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

/* ─────────────────────────────────────────────────────────────
 * BLOQUE 1: CONSTANTES Y REFERENCIAS AL DOM
 * ───────────────────────────────────────────────────────────── */

// URL del servidor Python local
const SERVER_URL = "http://localhost:5000";

// URL del reproductor web completo (página web del reproductor)
const FULL_PLAYER_URL = "http://localhost:22900"; // Ajusta al puerto de tu reproductor web

// Referencias al video element y controles
const video = document.getElementById("video-player");
const videoPlaceholder = document.getElementById("video-placeholder");
const btnPlayPause = document.getElementById("btn-play-pause");
const btnRewind = document.getElementById("btn-rewind");
const btnForward = document.getElementById("btn-forward");
const fileInput = document.getElementById("file-input");

// Segmento
let segmentStart = 0;
let segmentEnd = 0;
let mediaRecorder = null;
let recordedChunks = [];


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 2: NAVEGACIÓN POR PESTAÑAS
 * Activa/desactiva la pestaña seleccionada y su panel
 * ───────────────────────────────────────────────────────────── */

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    // Desactivar todas las pestañas y paneles
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));

    // Activar la pestaña y panel seleccionados
    tab.classList.add("active");
    const panelId = `tab-${tab.dataset.tab}`;
    document.getElementById(panelId)?.classList.add("active");
  });
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 3: VERIFICAR ESTADO DEL SERVIDOR LOCAL
 * Pinta el indicador verde/rojo según respuesta del servidor
 * ───────────────────────────────────────────────────────────── */

async function checkServerStatus() {
  const dot = document.getElementById("server-status");
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      dot.className = "status-dot status-ok";
      dot.title = "Servidor local activo";
    } else {
      dot.className = "status-dot status-error";
      dot.title = "Servidor respondió con error";
    }
  } catch {
    dot.className = "status-dot status-error";
    dot.title = "Servidor local no encontrado. Ejecuta server.py";
  }
}

// Verificar al abrir el popup
checkServerStatus();

// Enlace al servidor local
document.getElementById("server-link").addEventListener("click", (e) => {
  e.preventDefault();
  browser.tabs.create({ url: SERVER_URL });
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 4: REPRODUCTOR — Carga de archivo local
 * Muestra el video cuando el usuario selecciona un archivo
 * ───────────────────────────────────────────────────────────── */

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  // Crear URL temporal del archivo del disco
  const url = URL.createObjectURL(file);
  video.src = url;
  video.style.display = "block";
  videoPlaceholder.style.display = "none";

  // Actualizar nombre en segmento
  updateSegmentDisplay();
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 5: REPRODUCTOR — Controles de Reproducción
 * Play, pausa, saltar ±10 segundos, velocidad
 * ───────────────────────────────────────────────────────────── */

// Play / Pausa
btnPlayPause.addEventListener("click", () => {
  if (!video.src) return;
  if (video.paused) {
    video.play();
    btnPlayPause.textContent = "⏸";
  } else {
    video.pause();
    btnPlayPause.textContent = "▶";
  }
});

// Sincronizar botón con eventos nativos del video
video.addEventListener("play", () => { btnPlayPause.textContent = "⏸"; });
video.addEventListener("pause", () => { btnPlayPause.textContent = "▶"; });

// Retroceder 10 segundos
btnRewind.addEventListener("click", () => {
  video.currentTime = Math.max(0, video.currentTime - 10);
});

// Adelantar 10 segundos
btnForward.addEventListener("click", () => {
  video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
});

// Velocidad de reproducción
document.querySelectorAll(".speed-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".speed-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    video.playbackRate = parseFloat(btn.dataset.rate);
  });
});

// Abrir reproductor completo en nueva pestaña
document.getElementById("btn-open-full").addEventListener("click", () => {
  browser.tabs.create({ url: FULL_PLAYER_URL });
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 6: PANEL URL — Cargar desde URL externa
 * Detecta YouTube, Vimeo o URL directa
 * ───────────────────────────────────────────────────────────── */

// Detectar tipo de URL
function detectUrlType(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  if (/\.(mp4|webm|ogg|mp3|wav|flac|mkv|avi)(\?.*)?$/i.test(url)) return "direct";
  return "unknown";
}

// Convertir URL de YouTube a embed
function toYoutubeEmbed(url) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=1` : url;
}

// Convertir URL de Vimeo a embed
function toVimeoEmbed(url) {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? `https://player.vimeo.com/video/${match[1]}?autoplay=1` : url;
}

// Cargar URL al hacer clic
document.getElementById("btn-load-url").addEventListener("click", () => {
  const url = document.getElementById("url-input").value.trim();
  const statusEl = document.getElementById("url-status");
  if (!url) { statusEl.textContent = "Ingresa una URL válida"; return; }

  const type = detectUrlType(url);
  statusEl.textContent = `Tipo detectado: ${type}`;

  if (type === "youtube") {
    // Abrir YouTube embed en nueva pestaña para reproducción
    browser.tabs.create({ url: toYoutubeEmbed(url) });
  } else if (type === "vimeo") {
    browser.tabs.create({ url: toVimeoEmbed(url) });
  } else if (type === "direct") {
    // Cargar URL directa en el reproductor del popup
    video.src = url;
    video.style.display = "block";
    videoPlaceholder.style.display = "none";
    // Cambiar a pestaña de reproductor
    document.querySelector('[data-tab="player"]').click();
  } else {
    statusEl.textContent = "URL no soportada. Usa YouTube, Vimeo o un enlace directo";
  }
});

// Capturar URL de la pestaña activa del navegador
document.getElementById("btn-capture-tab").addEventListener("click", async () => {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      document.getElementById("url-input").value = tab.url;
      document.getElementById("url-status").textContent = `URL capturada de: ${tab.title || tab.url}`;
    }
  } catch (e) {
    document.getElementById("url-status").textContent = "Error al capturar URL";
  }
});

// Pegar desde portapapeles
document.getElementById("btn-paste-clip").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById("url-input").value = text;
    document.getElementById("url-status").textContent = "Pegado desde portapapeles";
  } catch {
    document.getElementById("url-status").textContent = "Sin acceso al portapapeles";
  }
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 7: PANEL SEGMENTO — Marcado y grabación
 * ───────────────────────────────────────────────────────────── */

// Formatear segundos → mm:ss
function formatTime(sec) {
  if (isNaN(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Actualizar displays de tiempo
function updateSegmentDisplay() {
  document.getElementById("seg-start-display").textContent = formatTime(segmentStart);
  document.getElementById("seg-end-display").textContent = formatTime(segmentEnd);
  const dur = Math.max(0, segmentEnd - segmentStart);
  document.getElementById("seg-duration-display").textContent = formatTime(dur);
}

// Marcar inicio del segmento en el tiempo actual del video
document.getElementById("btn-mark-start").addEventListener("click", () => {
  segmentStart = video.currentTime || 0;
  document.getElementById("seg-start-input").value = segmentStart.toFixed(1);
  updateSegmentDisplay();
});

// Marcar fin del segmento
document.getElementById("btn-mark-end").addEventListener("click", () => {
  segmentEnd = video.currentTime || 0;
  document.getElementById("seg-end-input").value = segmentEnd.toFixed(1);
  updateSegmentDisplay();
});

// Actualizar desde inputs manuales
document.getElementById("seg-start-input").addEventListener("input", (e) => {
  segmentStart = parseFloat(e.target.value) || 0;
  updateSegmentDisplay();
});
document.getElementById("seg-end-input").addEventListener("input", (e) => {
  segmentEnd = parseFloat(e.target.value) || 0;
  updateSegmentDisplay();
});

// Modo bucle de segmento
document.getElementById("loop-segment").addEventListener("change", (e) => {
  if (e.target.checked) {
    video.addEventListener("timeupdate", enforceLoop);
  } else {
    video.removeEventListener("timeupdate", enforceLoop);
  }
});

function enforceLoop() {
  if (video.currentTime >= segmentEnd && segmentEnd > segmentStart) {
    video.currentTime = segmentStart;
  }
}

// Grabar segmento usando MediaRecorder
document.getElementById("btn-record-segment").addEventListener("click", async () => {
  if (!video.src) {
    showNotification("Sin video", "Carga un video antes de grabar un segmento");
    return;
  }
  if (segmentEnd <= segmentStart) {
    showNotification("Error", "El tiempo de fin debe ser mayor al de inicio");
    return;
  }

  try {
    // Capturar stream del elemento video
    const stream = video.captureStream();
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType: "video/webm" });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      // Crear blob y disparar descarga
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rocio_segmento_${formatTime(segmentStart)}-${formatTime(segmentEnd)}.webm`.replace(/:/g, "-");
      a.click();
      URL.revokeObjectURL(url);
      document.getElementById("btn-record-segment").textContent = "● Grabar segmento";
      document.getElementById("btn-record-segment").classList.remove("recording");
      showNotification("Segmento listo", "El segmento fue descargado");
    };

    // Ir al inicio y comenzar grabación
    video.currentTime = segmentStart;
    await video.play();
    mediaRecorder.start();

    // Detener automáticamente al llegar al fin
    const checkStop = setInterval(() => {
      if (video.currentTime >= segmentEnd) {
        clearInterval(checkStop);
        mediaRecorder.stop();
        video.pause();
      }
    }, 100);

    document.getElementById("btn-record-segment").textContent = "■ Detener grabación";
    document.getElementById("btn-record-segment").classList.add("recording");

  } catch (err) {
    showNotification("Error de grabación", err.message);
  }
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 8: PANEL COMPARTIR — Redes sociales
 * ───────────────────────────────────────────────────────────── */

// Obtener URL de la pestaña activa o del reproductor
async function getShareUrl() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab?.url || window.location.href;
  } catch {
    return window.location.href;
  }
}

// Inicializar el campo de URL de compartir
getShareUrl().then(url => {
  document.getElementById("share-url-display").value = url;
});

// WhatsApp
document.getElementById("share-whatsapp").addEventListener("click", async () => {
  const url = await getShareUrl();
  const text = encodeURIComponent(`Mira esto en Rocio Player: ${url}`);
  browser.tabs.create({ url: `https://api.whatsapp.com/send?text=${text}` });
});

// Telegram
document.getElementById("share-telegram").addEventListener("click", async () => {
  const url = await getShareUrl();
  browser.tabs.create({
    url: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Reproduciendo en Rocio Player")}`
  });
});

// Facebook
document.getElementById("share-facebook").addEventListener("click", async () => {
  const url = await getShareUrl();
  browser.tabs.create({ url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` });
});

// Instagram — no soporta compartir por URL, copiar al portapapeles
document.getElementById("share-instagram").addEventListener("click", async () => {
  const url = await getShareUrl();
  await navigator.clipboard.writeText(url);
  showNotification("Instagram", "Enlace copiado. Pégalo manualmente en Instagram Stories o DM.");
});

// Copiar enlace
document.getElementById("btn-copy-link").addEventListener("click", async () => {
  const url = document.getElementById("share-url-display").value;
  await navigator.clipboard.writeText(url);
  showNotification("Copiado", "Enlace copiado al portapapeles");
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 9: UTILIDADES — Notificaciones
 * ───────────────────────────────────────────────────────────── */

function showNotification(title, message) {
  browser.notifications.create({
    type: "basic",
    title: `Rocio — ${title}`,
    message: message,
  });
}
