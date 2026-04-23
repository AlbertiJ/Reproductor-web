/*
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  ROCIO Firefox Plugin — background.js                       ║
 * ║  Script de fondo: maneja mensajes del content script,       ║
 * ║  detecta videos en las páginas y gestiona el almacenamiento  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

/* ─────────────────────────────────────────────────────────────
 * BLOQUE 1: GESTIÓN DEL ALMACENAMIENTO
 * Guarda y recupera URLs de medios recientes
 * ───────────────────────────────────────────────────────────── */

// Guardar una URL de medio en el historial reciente (máximo 20)
async function saveRecentMedia(url, title) {
  const storage = await browser.storage.local.get("recentMedia");
  const recent = storage.recentMedia || [];

  // Evitar duplicados
  const filtered = recent.filter(item => item.url !== url);

  // Agregar al inicio y limitar a 20 elementos
  filtered.unshift({ url, title, timestamp: Date.now() });
  const trimmed = filtered.slice(0, 20);

  await browser.storage.local.set({ recentMedia: trimmed });
}


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 2: LISTENERS DE MENSAJES
 * Recibe mensajes del content script y del popup
 * ───────────────────────────────────────────────────────────── */

browser.runtime.onMessage.addListener(async (message, sender) => {
  /* ── Mensaje: video detectado en la página ── */
  if (message.type === "VIDEO_DETECTED") {
    await saveRecentMedia(message.url, message.title || "Video detectado");

    // Mostrar badge con contador de videos detectados
    try {
      const storage = await browser.storage.local.get("videoCount");
      const count = (storage.videoCount || 0) + 1;
      await browser.storage.local.set({ videoCount: count });
      await browser.action.setBadgeText({
        text: count > 9 ? "9+" : String(count),
        tabId: sender.tab?.id,
      });
      await browser.action.setBadgeBackgroundColor({ color: "#00d2dc" });
    } catch {}

    return { success: true };
  }

  /* ── Mensaje: obtener medios recientes ── */
  if (message.type === "GET_RECENT") {
    const storage = await browser.storage.local.get("recentMedia");
    return { media: storage.recentMedia || [] };
  }

  /* ── Mensaje: limpiar contador de la pestaña activa ── */
  if (message.type === "CLEAR_BADGE") {
    try {
      await browser.action.setBadgeText({ text: "", tabId: sender.tab?.id });
    } catch {}
    return { success: true };
  }
});


/* ─────────────────────────────────────────────────────────────
 * BLOQUE 3: LIMPIAR BADGE AL CAMBIAR DE PESTAÑA
 * ───────────────────────────────────────────────────────────── */

browser.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await browser.action.setBadgeText({ text: "", tabId });
  } catch {}
});
