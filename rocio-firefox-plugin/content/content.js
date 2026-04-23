/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ROCIO Firefox Plugin — content.js                          ║
 * ║  Script inyectado en páginas web: detecta elementos de      ║
 * ║  video/audio y notifica al background script.               ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

/* ─────────────────────────────────────────────────────────────
 * BLOQUE 1: DETECCIÓN DE ELEMENTOS MULTIMEDIA EN LA PÁGINA
 * Encuentra todos los <video> y <audio> en el DOM
 * ───────────────────────────────────────────────────────────── */

// Busca y notifica todos los elementos de video/audio en la página
function detectMediaElements() {
  const videos = document.querySelectorAll("video[src], video source[src]");
  const audios = document.querySelectorAll("audio[src], audio source[src]");

  const found = [];

  // Procesar elementos de video
  videos.forEach(el => {
    const src = el.tagName === "VIDEO" ? el.src : el.src;
    if (src && !found.includes(src)) {
      found.push(src);
      browser.runtime.sendMessage({
        type: "VIDEO_DETECTED",
        url: src,
        title: document.title,
        mediaType: "video",
      });
    }
  });

  // Procesar elementos de audio
  audios.forEach(el => {
    const src = el.tagName === "AUDIO" ? el.src : el.src;
    if (src && !found.includes(src)) {
      found.push(src);
      browser.runtime.sendMessage({
        type: "VIDEO_DETECTED",
        url: src,
        title: document.title,
        mediaType: "audio",
      });
    }
  });

  return found.length;
}


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 2: OBSERVER — Detectar videos añadidos dinámicamente
 * Usa MutationObserver para capturar videos cargados por JS
 * ───────────────────────────────────────────────────────────── */

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      // Solo procesar nodos de tipo Element
      if (node.nodeType !== Node.ELEMENT_NODE) continue;

      // Verificar si el nodo mismo es un video/audio
      if (node.tagName === "VIDEO" || node.tagName === "AUDIO") {
        if (node.src) {
          browser.runtime.sendMessage({
            type: "VIDEO_DETECTED",
            url: node.src,
            title: document.title,
            mediaType: node.tagName.toLowerCase(),
          });
        }
      }

      // También buscar en los hijos del nodo añadido
      const mediaEls = node.querySelectorAll?.("video[src], audio[src]");
      mediaEls?.forEach(el => {
        if (el.src) {
          browser.runtime.sendMessage({
            type: "VIDEO_DETECTED",
            url: el.src,
            title: document.title,
            mediaType: el.tagName.toLowerCase(),
          });
        }
      });
    }
  }
});

// Iniciar observación del cuerpo del documento
observer.observe(document.body || document.documentElement, {
  childList: true,
  subtree: true,
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 3: INICIALIZACIÓN — Escaneo inicial de la página
 * ───────────────────────────────────────────────────────────── */

// Escanear inmediatamente cuando el contenido esté listo
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", detectMediaElements);
} else {
  detectMediaElements();
}

// También escanear tras carga completa (iframes, lazy-load)
window.addEventListener("load", detectMediaElements);
