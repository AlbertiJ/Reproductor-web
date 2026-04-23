/* ============================================================
 * ROCIO — Reproductor Multimedia v2
 * Página: Player.tsx
 *
 * Layout:
 *   [Panel izquierdo: previews] | [Video central] | [Panel derecho: controles]
 *   [Cola de reproducción desplegable debajo del video]
 *
 * Nuevas características:
 *   - Panel derecho ocultable
 *   - Panel izquierdo con previews estilo YouTube
 *   - Directorios desde raíz del disco + sección Favoritos
 *   - Cola de reproducción paginada (10 por página) con thumbnails
 *   - Toggle de modo oscuro / claro
 * ============================================================ */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  SkipBack, SkipForward, RotateCcw, Link2,
  Folder, FolderOpen, Music, Video, File,
  Share2, Clock, Scissors, ChevronRight, ChevronDown,
  Upload, ExternalLink, Radio, Square, Circle,
  PanelRightClose, PanelRightOpen, PanelLeftClose, PanelLeftOpen,
  Sun, Moon, Star, StarOff, HardDrive, Heart, List,
  ChevronLeft, ChevronUp, Play as PlayIcon, LayoutGrid,
  Ratio, Expand, Shrink, Users, UserPlus, Trash2, Pencil,
  ShieldCheck, ShieldOff, FolderLock, X,
} from "lucide-react";
import { SiWhatsapp, SiTelegram, SiFacebook, SiInstagram } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/* ================================================================
 * TIPOS
 * ================================================================ */

interface UserProfile {
  id: number;
  username: string;
  role: "admin" | "user";
  allowed_dirs: string[];
  system_user: boolean;
  created_at?: string;
  last_login?: string;
}

interface FileNode {
  id: string;
  name: string;
  type: "folder" | "video" | "audio" | "file";
  path: string;
  checked: boolean;
  children?: FileNode[];
  isOpen?: boolean;
  isFavorite?: boolean;
}

interface VideoItem {
  id: string;
  name: string;
  path: string;
  type: "video" | "audio";
  duration: string;
  folder: string;
  color: string; /* color de fondo del thumbnail generado */
}

/* ================================================================
 * API — base URL y helpers de fetch con credenciales de sesión
 * ================================================================ */
const API_BASE = window.location.origin;

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  if (res.status === 401) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown, method: "POST" | "PUT" | "DELETE" = "POST"): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || res.statusText), { status: res.status });
  }
  return res.json() as Promise<T>;
}

/* ================================================================
 * UTILIDADES de color y conversión de nodo a VideoItem
 * ================================================================ */
const PALETTE = [
  "from-blue-900 to-blue-600",
  "from-indigo-900 to-purple-700",
  "from-amber-900 to-orange-600",
  "from-green-900 to-emerald-600",
  "from-gray-800 to-slate-600",
  "from-sky-900 to-cyan-700",
  "from-teal-900 to-green-600",
  "from-red-900 to-rose-600",
  "from-violet-900 to-purple-600",
  "from-pink-900 to-rose-700",
  "from-fuchsia-900 to-pink-600",
  "from-zinc-800 to-neutral-600",
  "from-yellow-800 to-amber-600",
  "from-cyan-900 to-teal-600",
  "from-purple-900 to-violet-700",
];

function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function nodeToVideoItem(node: FileNode): VideoItem {
  const parts = node.path.split("/").filter(Boolean);
  const folder = parts.length > 1 ? parts[parts.length - 2] : "/";
  return {
    id: node.path,
    name: node.name,
    path: node.path,
    type: node.type as "video" | "audio",
    duration: "--:--",
    folder,
    color: PALETTE[strHash(node.name) % PALETTE.length],
  };
}

function extractMediaFiles(nodes: FileNode[]): VideoItem[] {
  const items: VideoItem[] = [];
  for (const node of nodes) {
    if (node.type === "video" || node.type === "audio") {
      items.push(nodeToVideoItem(node));
    }
    if (node.children) items.push(...extractMediaFiles(node.children));
  }
  return items;
}


/* ================================================================
 * UTILIDADES
 * ================================================================ */
function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function detectUrlType(url: string): "youtube" | "vimeo" | "direct" | "unknown" {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  if (url.match(/\.(mp4|webm|ogg|mp3|wav|flac|mkv|avi)(\?.*)?$/i)) return "direct";
  return "unknown";
}

function toYoutubeEmbed(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (match) return `https://www.youtube.com/embed/${match[1]}?autoplay=1`;
  return url;
}

function toVimeoEmbed(url: string): string {
  const match = url.match(/vimeo\.com\/(\d+)/);
  if (match) return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
  return url;
}

/* ================================================================
 * COMPONENTE: VideoThumbnail — thumbnail generado por gradiente
 * ================================================================ */
function VideoThumbnail({
  item,
  size = "md",
}: {
  item: VideoItem;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "w-20 h-12",
    md: "w-full h-full",
    lg: "w-full h-32",
  };
  return (
    <div className={`relative ${sizes[size]} bg-gradient-to-br ${item.color} rounded overflow-hidden flex items-center justify-center group-hover:opacity-90 transition-opacity`}>
      {item.type === "audio"
        ? <Music className="w-5 h-5 text-white/60" />
        : <Video className="w-5 h-5 text-white/40" />
      }
      {/* Overlay de play */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
        <Play className="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity" />
      </div>
      {/* Duración */}
      <span className="absolute bottom-1 right-1 text-[10px] bg-black/70 text-white px-1 rounded font-mono">
        {item.duration}
      </span>
    </div>
  );
}

/* ================================================================
 * COMPONENTE: FileTreeNode — árbol de directorios
 * ================================================================ */
function FileTreeNode({
  node,
  onToggleCheck,
  onToggleOpen,
  onSelectFile,
  onAddFavorite,
  depth = 0,
}: {
  node: FileNode;
  onToggleCheck: (id: string) => void;
  onToggleOpen: (id: string) => void;
  onSelectFile: (node: FileNode) => void;
  onAddFavorite: (node: FileNode) => void;
  depth?: number;
}) {
  const Icon = () => {
    if (node.type === "folder") return node.isOpen
      ? <FolderOpen className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
      : <Folder className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
    if (node.type === "video") return <Video className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />;
    if (node.type === "audio") return <Music className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
    return <File className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />;
  };

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 px-1 rounded hover:bg-secondary/40 cursor-pointer group"
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {/* Checkbox */}
        <Checkbox
          checked={node.checked}
          onCheckedChange={() => onToggleCheck(node.id)}
          className="border-border w-3.5 h-3.5 flex-shrink-0"
        />

        {/* Expandir carpeta */}
        {node.type === "folder" && node.children?.length ? (
          <button onClick={() => onToggleOpen(node.id)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
            {node.isOpen
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : <span className="w-3 flex-shrink-0" />}

        <Icon />

        {/* Nombre */}
        <span
          className="text-xs truncate flex-1 min-w-0 text-foreground/75 group-hover:text-foreground"
          onClick={() => node.type !== "folder" ? onSelectFile(node) : onToggleOpen(node.id)}
        >
          {node.name}
        </span>

        {/* Botón favorito (solo en carpetas) */}
        {node.type === "folder" && (
          <button
            onClick={() => onAddFavorite(node)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-yellow-400 flex-shrink-0"
            title="Añadir a Favoritos"
          >
            <Star className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Hijos */}
      {node.type === "folder" && node.isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode
              key={child.id}
              node={child}
              onToggleCheck={onToggleCheck}
              onToggleOpen={onToggleOpen}
              onSelectFile={onSelectFile}
              onAddFavorite={onAddFavorite}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
 * COMPONENTE: HoverVideoPreview — miniatura flotante al pasar el mouse
 * Se carga solo cuando el usuario hace hover sobre un ítem del panel
 * ================================================================ */
function HoverVideoPreview({ item }: { item: VideoItem }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = `${API_BASE}/api/media?path=${encodeURIComponent(item.path)}`;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      v.currentTime = Math.min(5, (v.duration || 10) * 0.08);
      v.play().catch(() => {});
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.pause();
    };
  }, []);

  return (
    <div>
      <div className="relative h-28">
        <video
          ref={videoRef}
          src={src}
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-white text-xs font-semibold truncate leading-tight">{item.name}</p>
          <p className="text-white/60 text-[10px] font-mono">{item.duration}</p>
        </div>
      </div>
      <div className="px-2.5 py-1.5 flex items-center gap-1.5 border-t border-border/50">
        <Video className="w-3 h-3 text-cyan-400 flex-shrink-0" />
        <p className="text-[10px] text-muted-foreground truncate">{item.folder}</p>
      </div>
    </div>
  );
}

/* ================================================================
 * COMPONENTE: VideoListItem — fila del panel izquierdo
 * Muestra miniatura flotante al pasar el mouse sobre el ítem
 * ================================================================ */
function VideoListItem({
  item,
  isActive,
  isFav,
  onClick,
  onToggleFav,
}: {
  item: VideoItem;
  isActive: boolean;
  isFav: boolean;
  onClick: () => void;
  onToggleFav: (id: string) => void;
}) {
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (item.type === "file") return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      hoverTimerRef.current = setTimeout(() => {
        setHoverPos({ top: rect.top, left: rect.right + 10 });
      }, 280);
    }
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHoverPos(null);
  };

  return (
    <>
      <div
        ref={containerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`w-full flex gap-2.5 p-2 rounded-lg text-left group transition-all hover:bg-secondary/60 relative ${
          isActive ? "bg-secondary border border-border" : ""
        }`}
      >
        {/* Thumbnail pequeño — clic para reproducir */}
        <button
          onClick={onClick}
          data-testid={`video-item-${item.id}`}
          className="w-20 h-12 flex-shrink-0 rounded overflow-hidden"
        >
          <VideoThumbnail item={item} size="sm" />
        </button>

        {/* Info — clic para reproducir */}
        <button onClick={onClick} className="flex-1 min-w-0 text-left">
          <p className={`text-xs font-medium truncate leading-tight ${isActive ? "text-primary" : "text-foreground/90"}`}>
            {item.name}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{item.folder}</p>
          <p className="text-[10px] text-muted-foreground font-mono">{item.duration}</p>
        </button>

        {/* Botón estrella — favorito */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFav(item.id); }}
          data-testid={`fav-btn-${item.id}`}
          title={isFav ? "Quitar de Favoritos" : "Agregar a Favoritos"}
          className={`absolute top-1.5 right-1.5 p-0.5 rounded transition-all opacity-0 group-hover:opacity-100 ${
            isFav
              ? "opacity-100 text-yellow-400 hover:text-yellow-300"
              : "text-muted-foreground hover:text-yellow-400"
          }`}
        >
          <Star className={`w-3 h-3 ${isFav ? "fill-yellow-400" : ""}`} />
        </button>
      </div>

      {/* Preview flotante — aparece a la derecha del panel */}
      {hoverPos && (
        <div
          className="fixed z-[100] w-52 bg-card border border-border rounded-xl shadow-2xl overflow-hidden pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150"
          style={{ top: hoverPos.top, left: hoverPos.left }}
        >
          {item.type === "video" ? (
            <HoverVideoPreview item={item} />
          ) : (
            <div className="p-3 flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/30 to-indigo-500/30 flex items-center justify-center border border-purple-500/20 flex-shrink-0">
                <Music className="w-6 h-6 text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">{item.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{item.folder}</p>
                <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{item.duration}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

/* ================================================================
 * COMPONENTE PRINCIPAL: Player
 * ================================================================ */
export default function Player() {
  const { toast } = useToast();

  /* ── Tema ── */
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  /* ── Layout: paneles visibles ── */
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showLeftPanel, setShowLeftPanel] = useState(true);

  /* ── Aspecto / relación del video ── */
  const [videoFit, setVideoFit] = useState<"contain" | "cover" | "fill">("contain");
  const fitLabels: Record<string, string> = { contain: "Ajustado", cover: "Rellenar", fill: "Estirar" };
  const fitCycle = { contain: "cover", cover: "fill", fill: "contain" } as const;
  const cycleVideoFit = () => setVideoFit(prev => fitCycle[prev]);

  /* ── Reproductor ── */
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  /* ── Fuente activa ── */
  const [mediaSource, setMediaSource] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"video" | "audio" | "embed" | null>(null);
  const [mediaName, setMediaName] = useState<string>("");
  const [embedUrl, setEmbedUrl] = useState<string>("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);

  /* ── URL externa ── */
  const [externalUrl, setExternalUrl] = useState("");
  const [urlType, setUrlType] = useState<"youtube" | "vimeo" | "direct" | "unknown" | null>(null);

  /* ── Auth: sesión web ── */
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  /* ── Perfil del usuario actual ── */
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const isAdmin = currentUser?.role === "admin";

  /* ── Gestión de usuarios (solo admin) ── */
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userFormData, setUserFormData] = useState({
    username: "", password: "", role: "user", allowed_dirs: "", system_user: false,
  });
  const [userFormError, setUserFormError] = useState("");
  const [isSavingUser, setIsSavingUser] = useState(false);

  /* ── Datos reales desde el servidor ── */
  const [videoList, setVideoList] = useState<VideoItem[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  /* ── Árbol de directorios (cargado desde /api/tree) ── */
  const [diskTree, setDiskTree] = useState<FileNode[]>([]);

  /* ── Favoritos: carpetas marcadas como favoritas (panel derecho) ── */
  const [favorites, setFavorites] = useState<FileNode[]>([]);

  /* ── Favoritos de videos individuales (panel izquierdo) ── */
  const [favoriteVideoIds, setFavoriteVideoIds] = useState<Set<string>>(new Set());

  /* ── Pestaña del panel izquierdo: biblioteca o favoritos de video ── */
  const [leftTab, setLeftTab] = useState<"library" | "favorites">("library");

  /* ── Pestaña activa del panel derecho ── */
  const [rightTab, setRightTab] = useState<"library" | "favorites" | "url" | "segment" | "share">("library");

  /* ── Pestaña del explorador de directorios ── */
  const [libraryTab, setLibraryTab] = useState<"disk" | "favorites">("disk");

  /* ── Filtro de carpeta activo en la Biblioteca izquierda (null = todas) ── */
  const [folderFilter, setFolderFilter] = useState<string | null>(null);

  /* ── Filtro de subcarpeta en pestaña Favoritos izquierda (null = todos) ── */
  const [favFolderFilter, setFavFolderFilter] = useState<string | null>(null);

  /* ── Grabación ── */
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(0);
  const [isSegmentMode, setIsSegmentMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  /* ── Lista de videos activa (panel izquierdo) ── */
  const [videoListFilter, setVideoListFilter] = useState<"all" | "video" | "audio">("all");
  const filteredVideos = useMemo(() => {
    let list = videoList;
    if (folderFilter) list = list.filter(v => v.path.startsWith(folderFilter + "/") || v.path === folderFilter);
    if (videoListFilter !== "all") list = list.filter(v => v.type === videoListFilter);
    return list;
  }, [videoList, videoListFilter, folderFilter]);

  /* ── Videos favoritos del panel izquierdo (derivado de favoriteVideoIds) ── */
  const favoriteVideos = useMemo(
    () => videoList.filter(v => favoriteVideoIds.has(v.id)),
    [videoList, favoriteVideoIds]
  );

  /* ── Favoritos filtrados por subcarpeta (pestaña ★ del panel izquierdo) ── */
  const filteredFavoriteVideos = useMemo(() => {
    if (!favFolderFilter) return favoriteVideos;
    return favoriteVideos.filter(v => v.folder === favFolderFilter);
  }, [favoriteVideos, favFolderFilter]);

  /* ── Nombres de carpeta únicos entre los archivos favoritos ── */
  const favFolderNames = useMemo(
    () => [...new Set(favoriteVideos.map(v => v.folder))].sort(),
    [favoriteVideos]
  );


  /* ================================================================
   * EFECTO: verificar sesión activa al cargar la app
   * ================================================================ */
  useEffect(() => {
    apiGet<{ status: string; authenticated?: boolean }>("/api/health")
      .then(data => { if (data.authenticated) setIsLoggedIn(true); })
      .catch(() => {}); // servidor no disponible — mostrar login
  }, []);

  /* ================================================================
   * EFECTO: cargar árbol real al iniciar sesión
   * ================================================================ */
  useEffect(() => {
    if (!isLoggedIn) return;
    setIsLoadingTree(true);
    apiGet<{ tree: FileNode }>("/api/tree")
      .then(({ tree }) => {
        const children = tree.children || [];
        setDiskTree(children);
        setVideoList(extractMediaFiles(children));
      })
      .catch(() => toast({ title: "Error", description: "No se pudo cargar el árbol de archivos", variant: "destructive" }))
      .finally(() => setIsLoadingTree(false));
  }, [isLoggedIn]);

  /* ================================================================
   * EFECTO: sincronizar tiempo del video
   * ================================================================ */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [mediaSource]);

  /* ================================================================
   * EFECTO: modo segmento — bucle automático
   * ================================================================ */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isSegmentMode) return;
    const checkSegment = () => {
      if (video.currentTime >= segmentEnd && segmentEnd > segmentStart) {
        video.pause();
        video.currentTime = segmentStart;
      }
    };
    video.addEventListener("timeupdate", checkSegment);
    return () => video.removeEventListener("timeupdate", checkSegment);
  }, [isSegmentMode, segmentStart, segmentEnd]);

  /* ================================================================
   * FUNCIONES DE REPRODUCCIÓN
   * ================================================================ */
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || mediaType === "embed") return;
    if (isPlaying) video.pause(); else video.play();
  }, [isPlaying, mediaType]);

  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value[0];
    setCurrentTime(value[0]);
  }, []);

  const handleVolume = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;
    const v = value[0];
    video.volume = v;
    setVolume(v);
    setIsMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const next = !isMuted;
    video.muted = next;
    setIsMuted(next);
  }, [isMuted]);

  const skip = useCallback((sec: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(duration, video.currentTime + sec));
  }, [duration]);

  const handleRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = playerContainerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  /* ================================================================
   * CARGAR ARCHIVO LOCAL INDIVIDUAL
   * ================================================================ */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const type = file.type.startsWith("audio") ? "audio" : "video";
    setMediaSource(url);
    setMediaType(type);
    setMediaName(file.name);
    setEmbedUrl("");
    setActiveVideoId(null);
    toast({ title: "Archivo cargado", description: file.name });
  };

  /* ================================================================
   * SELECCIONAR VIDEO DE LA LISTA / ÁRBOL
   * ================================================================ */
  /* ── Login / Logout ── */
  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const result = await apiPost<{ ok: boolean; role: string; allowed_dirs: string[] }>(
        "/api/login", { username: loginUser, password: loginPass }
      );
      setIsLoggedIn(true);
      setCurrentUser({
        id: 0,
        username: loginUser,
        role: (result.role as "admin" | "user") || "user",
        allowed_dirs: result.allowed_dirs || [],
        system_user: false,
      });
    } catch (err: unknown) {
      setLoginError((err as Error).message || "Error de conexión con el servidor");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await apiPost("/api/logout", {}).catch(() => {});
    setIsLoggedIn(false);
    setCurrentUser(null);
    setVideoList([]);
    setDiskTree([]);
    setMediaSource(null);
    setActiveVideoId(null);
    setMediaName("");
  };

  /* ── Gestión de usuarios (solo admin) ── */
  const fetchUsers = async () => {
    try {
      const data = await apiGet<UserProfile[]>("/api/admin/users");
      setUsersList(data);
    } catch {
      toast({ title: "Error", description: "No se pudo cargar la lista de usuarios", variant: "destructive" });
    }
  };

  const openUsersModal = () => {
    fetchUsers();
    setShowUsersModal(true);
    setEditingUser(null);
    setUserFormData({ username: "", password: "", role: "user", allowed_dirs: "", system_user: false });
    setUserFormError("");
  };

  const startEditUser = (u: UserProfile) => {
    setEditingUser(u);
    setUserFormData({
      username: u.username,
      password: "",
      role: u.role,
      allowed_dirs: u.allowed_dirs.join("\n"),
      system_user: u.system_user,
    });
    setUserFormError("");
  };

  const handleSaveUser = async () => {
    setIsSavingUser(true);
    setUserFormError("");
    try {
      const body = {
        username: userFormData.username.trim(),
        password: userFormData.password,
        role: userFormData.role,
        allowed_dirs: userFormData.allowed_dirs.split("\n").map(d => d.trim()).filter(Boolean),
        system_user: userFormData.system_user,
      };
      if (editingUser) {
        await apiPost(`/api/admin/users/${editingUser.id}`, body, "PUT");
      } else {
        await apiPost("/api/admin/users", body);
      }
      await fetchUsers();
      setEditingUser(null);
      setUserFormData({ username: "", password: "", role: "user", allowed_dirs: "", system_user: false });
      toast({ title: editingUser ? "Usuario actualizado" : "Usuario creado" });
    } catch (err: unknown) {
      setUserFormError((err as Error).message || "Error al guardar");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDeleteUser = async (u: UserProfile) => {
    if (!confirm(`¿Eliminar al usuario "${u.username}"?`)) return;
    try {
      await apiPost(`/api/admin/users/${u.id}`, {}, "DELETE");
      await fetchUsers();
      if (editingUser?.id === u.id) {
        setEditingUser(null);
        setUserFormData({ username: "", password: "", role: "user", allowed_dirs: "", system_user: false });
      }
      toast({ title: "Usuario eliminado" });
    } catch (err: unknown) {
      toast({ title: "Error", description: (err as Error).message, variant: "destructive" });
    }
  };

  const selectVideoItem = useCallback((item: VideoItem) => {
    setActiveVideoId(item.id);
    setMediaName(item.name);
    setMediaType(item.type);
    setMediaSource(`${API_BASE}/api/media?path=${encodeURIComponent(item.path)}`);
    setEmbedUrl("");
    toast({ title: "Reproduciendo", description: `${item.folder} / ${item.name}` });
  }, []);

  const handleSelectFromTree = (node: FileNode) => {
    setMediaName(node.name);
    setMediaType(node.type === "audio" ? "audio" : "video");
    setMediaSource(`${API_BASE}/api/media?path=${encodeURIComponent(node.path)}`);
    setEmbedUrl("");
    setActiveVideoId(node.path);
    toast({ title: "Archivo seleccionado", description: node.path });
  };

  /* ================================================================
   * CARGAR URL EXTERNA
   * ================================================================ */
  const handleLoadExternalUrl = () => {
    if (!externalUrl.trim()) {
      toast({ title: "Error", description: "Ingresa una URL válida", variant: "destructive" });
      return;
    }
    const type = detectUrlType(externalUrl);
    setUrlType(type);
    if (type === "youtube") {
      setEmbedUrl(toYoutubeEmbed(externalUrl));
      setMediaType("embed");
      setMediaName("Video de YouTube");
      setMediaSource(null);
    } else if (type === "vimeo") {
      setEmbedUrl(toVimeoEmbed(externalUrl));
      setMediaType("embed");
      setMediaName("Video de Vimeo");
      setMediaSource(null);
    } else if (type === "direct") {
      setMediaSource(externalUrl);
      setEmbedUrl("");
      setMediaType("video");
      setMediaName(externalUrl.split("/").pop() || "Video");
    } else {
      toast({ title: "URL no soportada", description: "Usa YouTube, Vimeo o un enlace directo", variant: "destructive" });
      return;
    }
    setActiveVideoId(null);
    toast({ title: "URL cargada", description: `Tipo: ${type}` });
  };

  /* ================================================================
   * ÁRBOL DE DIRECTORIOS — toggle checkbox y open
   * ================================================================ */
  const toggleNodeCheck = (id: string) => {
    const toggle = (nodes: FileNode[]): FileNode[] =>
      nodes.map(n => {
        if (n.id === id) {
          const next = { ...n, checked: !n.checked };
          if (n.children) next.children = n.children.map(c => ({ ...c, checked: next.checked }));
          return next;
        }
        if (n.children) return { ...n, children: toggle(n.children) };
        return n;
      });
    setDiskTree(toggle(diskTree));
  };

  const toggleNodeOpen = (id: string) => {
    const toggle = (nodes: FileNode[]): FileNode[] =>
      nodes.map(n => {
        if (n.id === id) return { ...n, isOpen: !n.isOpen };
        if (n.children) return { ...n, children: toggle(n.children) };
        return n;
      });
    setDiskTree(toggle(diskTree));
  };

  /* ================================================================
   * FAVORITOS — agregar carpeta a favoritos
   * ================================================================ */
  const addToFavorites = (node: FileNode) => {
    if (!favorites.find(f => f.id === node.id)) {
      setFavorites(prev => [...prev, { ...node, isFavorite: true }]);
    }
    /* Navegar: panel derecho → pestaña Favoritos;
       panel izquierdo → Biblioteca filtrada por esta carpeta */
    setLibraryTab("favorites");
    setFolderFilter(node.path);
    setVideoListFilter("all");
    setLeftTab("library");
    toast({ title: "★ Favorito", description: node.name });
  };

  const removeFromFavorites = (id: string) => {
    setFavorites(prev => prev.filter(f => f.id !== id));
  };

  /* ================================================================
   * FAVORITOS DE VIDEOS — panel izquierdo
   * Toggle individual: agregar o quitar un video de favoritos
   * ================================================================ */
  const toggleVideoFavorite = useCallback((id: string) => {
    setFavoriteVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        const item = videoList.find(v => v.id === id);
        toast({ title: "Quitado de Favoritos", description: item?.name });
      } else {
        next.add(id);
        const item = videoList.find(v => v.id === id);
        toast({ title: "Agregado a Favoritos", description: item?.name });
      }
      return next;
    });
  }, [toast, videoList]);

  /* ================================================================
   * GRABACIÓN POR SEGMENTO
   * ================================================================ */
  const markSegmentStart = () => {
    const t = videoRef.current?.currentTime ?? 0;
    setSegmentStart(t);
    toast({ title: "Inicio marcado", description: formatTime(t) });
  };

  const markSegmentEnd = () => {
    const t = videoRef.current?.currentTime ?? duration;
    setSegmentEnd(t);
    toast({ title: "Fin marcado", description: formatTime(t) });
  };

  const startSegmentRecording = async () => {
    const video = videoRef.current;
    if (!video) { toast({ title: "Error", description: "No hay video cargado", variant: "destructive" }); return; }
    try {
      const stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `segmento_${formatTime(segmentStart)}-${formatTime(segmentEnd)}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Segmento guardado", description: "Descargado correctamente" });
      };
      mediaRecorderRef.current = recorder;
      video.currentTime = segmentStart;
      await video.play();
      recorder.start();
      setIsRecording(true);
      toast({ title: "Grabando...", description: `${formatTime(segmentStart)} → ${formatTime(segmentEnd)}` });
    } catch (err) {
      toast({ title: "Error de grabación", description: String(err), variant: "destructive" });
    }
  };

  const stopSegmentRecording = () => {
    mediaRecorderRef.current?.stop();
    videoRef.current?.pause();
    setIsRecording(false);
  };

  /* ================================================================
   * COMPARTIR
   * ================================================================ */
  const shareUrl = window.location.href;
  const shareText = encodeURIComponent(`Reproduciendo: ${mediaName || "Rocio Player"}`);
  const socialLinks = {
    whatsapp: `https://api.whatsapp.com/send?text=${shareText}%20${encodeURIComponent(shareUrl)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${shareText}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    instagram: null,
  };
  const openShare = (url: string | null, platform: string) => {
    if (!url) { toast({ title: platform, description: "Copia el enlace y compártelo manualmente en Instagram" }); return; }
    window.open(url, "_blank", "width=600,height=400");
  };

  /* ================================================================
   * RENDER — Pantalla de Login (si no hay sesión)
   * ================================================================ */
  if (!isLoggedIn) {
    return (
      <div className={`h-screen bg-background flex items-center justify-center ${isDark ? "dark" : ""}`}>
        <div className="w-full max-w-sm px-6">
          <div className="flex flex-col items-center mb-8 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
              <Radio className="w-8 h-8 text-primary/70" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Rocio</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Reproductor Multimedia</p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Usuario</label>
              <Input
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                placeholder="rocio"
                autoComplete="username"
                autoFocus
                disabled={isLoggingIn}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Contraseña</label>
              <Input
                type="password"
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={isLoggingIn}
              />
            </div>

            {loginError && (
              <p className="text-sm text-destructive text-center">{loginError}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoggingIn || !loginUser || !loginPass}
            >
              {isLoggingIn ? "Conectando..." : "Iniciar sesión"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Credenciales configuradas en <code className="text-foreground/70">rocio.conf</code>
          </p>
        </div>
      </div>
    );
  }

  /* ================================================================
   * RENDER — Reproductor principal
   * ================================================================ */
  return (
    <div className={`h-screen bg-background flex flex-col overflow-hidden ${isDark ? "dark" : ""}`}>

      {/* ============================================================
       * ENCABEZADO
       * ============================================================ */}
      <header className="border-b border-border px-4 py-2.5 flex items-center justify-between bg-card/60 backdrop-blur-sm sticky top-0 z-50 gap-3">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Radio className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="hidden sm:block">
            <h1 className="font-bold text-foreground text-sm tracking-tight leading-none">Rocio</h1>
            <p className="text-[10px] text-muted-foreground">Reproductor Multimedia</p>
          </div>
        </div>

        {/* Nombre de media activa */}
        {mediaName && (
          <Badge variant="secondary" className="text-xs max-w-[200px] truncate hidden md:flex" data-testid="badge-media-name">
            {mediaName}
          </Badge>
        )}

        {/* REC badge */}
        {isRecording && (
          <Badge className="bg-destructive text-destructive-foreground animate-pulse gap-1 flex-shrink-0">
            <Circle className="w-2 h-2 fill-current" /> REC
          </Badge>
        )}

        <div className="flex items-center gap-1 ml-auto">
          {/* Indicador de usuario actual */}
          {currentUser && (
            <div className="hidden sm:flex items-center gap-1.5 mr-1 px-2 py-1 rounded-md bg-secondary/50 text-xs text-muted-foreground">
              {currentUser.role === "admin"
                ? <ShieldCheck className="w-3 h-3 text-primary" />
                : <ShieldOff className="w-3 h-3" />}
              <span className="font-medium text-foreground">{currentUser.username}</span>
            </div>
          )}

          {/* Gestión de usuarios (solo admin) */}
          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="icon"
                  onClick={openUsersModal}
                  className="h-8 w-8"
                  data-testid="button-users-admin"
                >
                  <Users className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gestión de usuarios</TooltipContent>
            </Tooltip>
          )}

          {/* Cerrar sesión */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                onClick={handleLogout}
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                data-testid="button-logout"
                title="Cerrar sesión"
              >
                <ExternalLink className="w-4 h-4 rotate-180" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Cerrar sesión</TooltipContent>
          </Tooltip>

          {/* Toggle modo oscuro/claro */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                onClick={() => setIsDark(!isDark)}
                className="h-8 w-8"
                data-testid="button-toggle-theme"
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isDark ? "Modo claro" : "Modo oscuro"}</TooltipContent>
          </Tooltip>

          {/* Toggle panel izquierdo */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                onClick={() => setShowLeftPanel(!showLeftPanel)}
                className="h-8 w-8"
                data-testid="button-toggle-left"
              >
                {showLeftPanel ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{showLeftPanel ? "Ocultar biblioteca" : "Mostrar biblioteca"}</TooltipContent>
          </Tooltip>

          {/* Toggle panel derecho */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="icon"
                onClick={() => setShowRightPanel(!showRightPanel)}
                className="h-8 w-8"
                data-testid="button-toggle-right"
              >
                {showRightPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{showRightPanel ? "Ocultar controles" : "Mostrar controles"}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* ============================================================
       * CUERPO PRINCIPAL: [Left] [Center] [Right]
       * ============================================================ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ─────────────────────────────────────────────────────────
         * PANEL IZQUIERDO — Biblioteca + Favoritos de archivos
         * ───────────────────────────────────────────────────────── */}
        {showLeftPanel && (
          <aside className="w-64 border-r border-border bg-sidebar flex flex-col overflow-hidden flex-shrink-0">

            {/* ── Pestañas principales: Biblioteca / Favoritos ── */}
            <div className="flex border-b border-border flex-shrink-0">
              <button
                onClick={() => setLeftTab("library")}
                data-testid="left-tab-library"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
                  leftTab === "library"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="w-3 h-3" /> Biblioteca
              </button>
              <button
                onClick={() => setLeftTab("favorites")}
                data-testid="left-tab-favorites"
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold transition-colors border-b-2 ${
                  leftTab === "favorites"
                    ? "border-yellow-400 text-yellow-400"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Star className={`w-3 h-3 ${leftTab === "favorites" ? "fill-yellow-400" : ""}`} />
                Favoritos
                {favoriteVideoIds.size > 0 && (
                  <span className={`text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                    leftTab === "favorites"
                      ? "bg-yellow-400 text-black"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {favoriteVideoIds.size}
                  </span>
                )}
              </button>
            </div>

            {/* ══════════════ PESTAÑA: BIBLIOTECA ══════════════ */}
            {leftTab === "library" && (
              <>
                {/* Chip de carpeta activa — aparece cuando hay folderFilter */}
                {folderFilter && (
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-primary/10 border-b border-primary/20 flex-shrink-0">
                    <FolderOpen className="w-3 h-3 text-primary flex-shrink-0" />
                    <span className="text-[10px] text-primary font-medium truncate flex-1">
                      {folderFilter.split("/").filter(Boolean).pop() ?? folderFilter}
                    </span>
                    <button
                      onClick={() => setFolderFilter(null)}
                      title="Mostrar toda la biblioteca"
                      className="text-primary/60 hover:text-primary flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Filtro de tipo */}
                <div className="flex border-b border-border px-2 py-1.5 gap-1 flex-shrink-0">
                  {(["all", "video", "audio"] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setVideoListFilter(f)}
                      data-testid={`filter-${f}`}
                      className={`flex-1 text-[11px] py-1 rounded transition-colors font-medium ${
                        videoListFilter === f
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                      }`}
                    >
                      {f === "all" ? "Todo" : f === "video" ? "Video" : "Audio"}
                    </button>
                  ))}
                </div>

                {/* Lista de videos */}
                <div className="flex-1 overflow-y-auto no-scrollbar">
                  <div className="p-2 space-y-0.5">
                    {filteredVideos.map(item => (
                      <VideoListItem
                        key={item.id}
                        item={item}
                        isActive={activeVideoId === item.id}
                        isFav={favoriteVideoIds.has(item.id)}
                        onClick={() => selectVideoItem(item)}
                        onToggleFav={toggleVideoFavorite}
                      />
                    ))}
                  </div>
                </div>

                {/* Pie: total */}
                <div className="px-3 py-2 border-t border-border flex-shrink-0">
                  <p className="text-[10px] text-muted-foreground text-center">
                    {filteredVideos.length} {filteredVideos.length === 1 ? "archivo" : "archivos"}
                    {favoriteVideoIds.size > 0 && (
                      <span className="ml-1 text-yellow-400">· ★ {favoriteVideoIds.size}</span>
                    )}
                  </p>
                </div>
              </>
            )}

            {/* ══════════════ PESTAÑA: FAVORITOS ══════════════ */}
            {leftTab === "favorites" && (
              <>
                {/* Filtro de subcarpeta — solo si hay archivos favoritos de más de una carpeta */}
                {favFolderNames.length > 1 && (
                  <div className="flex gap-1 px-2 py-1.5 border-b border-border flex-shrink-0 overflow-x-auto no-scrollbar">
                    <button
                      onClick={() => setFavFolderFilter(null)}
                      className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full transition-colors font-medium ${
                        favFolderFilter === null
                          ? "bg-yellow-400 text-black"
                          : "text-muted-foreground hover:text-foreground bg-secondary/50"
                      }`}
                    >
                      Todos
                    </button>
                    {favFolderNames.map(folder => (
                      <button
                        key={folder}
                        onClick={() => setFavFolderFilter(folder)}
                        className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full transition-colors font-medium truncate max-w-[100px] ${
                          favFolderFilter === folder
                            ? "bg-yellow-400 text-black"
                            : "text-muted-foreground hover:text-foreground bg-secondary/50"
                        }`}
                        title={folder}
                      >
                        {folder}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto no-scrollbar">
                  {favoriteVideos.length === 0 ? (
                    /* Estado vacío */
                    <div className="flex flex-col items-center justify-center h-full gap-3 px-4 text-center">
                      <div className="w-14 h-14 rounded-full bg-yellow-400/10 flex items-center justify-center border border-yellow-400/20">
                        <Star className="w-7 h-7 text-yellow-400/40" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground/70 mb-1">Sin favoritos aún</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Pasa el cursor sobre cualquier archivo en Biblioteca y haz clic en ★ para guardarlo aquí.
                        </p>
                      </div>
                      <button
                        onClick={() => setLeftTab("library")}
                        className="text-[11px] text-primary hover:underline"
                      >
                        Ir a Biblioteca
                      </button>
                    </div>
                  ) : filteredFavoriteVideos.length === 0 ? (
                    /* Subfiltro activo sin resultados */
                    <div className="flex flex-col items-center justify-center h-full gap-2 px-4 text-center">
                      <Star className="w-6 h-6 text-yellow-400/30" />
                      <p className="text-xs text-muted-foreground">
                        No hay favoritos en <span className="font-medium text-foreground/70">{favFolderFilter}</span>
                      </p>
                      <button onClick={() => setFavFolderFilter(null)} className="text-[10px] text-primary hover:underline">
                        Ver todos
                      </button>
                    </div>
                  ) : (
                    /* Lista de favoritos filtrada */
                    <div className="p-2 space-y-0.5">
                      {filteredFavoriteVideos.map(item => (
                        <VideoListItem
                          key={item.id}
                          item={item}
                          isActive={activeVideoId === item.id}
                          isFav={true}
                          onClick={() => selectVideoItem(item)}
                          onToggleFav={toggleVideoFavorite}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Pie: conteo + limpiar */}
                {favoriteVideos.length > 0 && (
                  <div className="px-3 py-2 border-t border-border flex-shrink-0 flex items-center justify-between">
                    <p className="text-[10px] text-yellow-400 font-medium">
                      ★ {filteredFavoriteVideos.length}
                      {favFolderFilter ? ` en ${favFolderFilter}` : ` de ${favoriteVideos.length}`}
                    </p>
                    <button
                      onClick={() => setFavoriteVideoIds(new Set())}
                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                      data-testid="clear-all-favs"
                    >
                      Limpiar todo
                    </button>
                  </div>
                )}
              </>
            )}

          </aside>
        )}

        {/* ─────────────────────────────────────────────────────────
         * CENTRO — Reproductor de video + controles + cola
         * ───────────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* Área de video */}
          <div
            ref={playerContainerRef}
            className="relative bg-black flex items-center justify-center player-glow"
            style={{ flex: "1 1 0", minHeight: 0 }}
          >
            {mediaType === "embed" && embedUrl ? (
              <iframe
                src={embedUrl}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Video embebido"
                data-testid="iframe-embed"
              />
            ) : mediaSource && mediaType === "video" ? (
              <video
                ref={videoRef}
                src={mediaSource}
                className="w-full h-full"
                style={{ objectFit: videoFit }}
                onClick={togglePlay}
                data-testid="video-player"
              />
            ) : mediaSource && mediaType === "audio" ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-36 h-36 rounded-full bg-gradient-to-br from-primary/30 to-purple-500/30 flex items-center justify-center border border-primary/20 shadow-2xl">
                  <Music className="w-16 h-16 text-primary/60" />
                </div>
                <p className="text-muted-foreground text-sm font-medium">{mediaName}</p>
                <audio ref={videoRef as unknown as React.RefObject<HTMLAudioElement>} src={mediaSource} data-testid="audio-player" />
              </div>
            ) : activeVideoId && isLoadingTree ? (
              <div className="flex flex-col items-center gap-3 text-center px-8">
                <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">Cargando archivos...</p>
              </div>
            ) : (
              /* Pantalla de bienvenida */
              <div className="flex flex-col items-center gap-5 text-center px-8">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
                    <Radio className="w-10 h-10 text-primary/50" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary/20 animate-ping" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-foreground mb-1">Rocio</h2>
                  <p className="text-muted-foreground text-sm max-w-xs">
                    Selecciona un archivo del panel izquierdo, carga uno desde tu disco, o pega una URL.
                  </p>
                </div>
                <div className="flex gap-2 flex-wrap justify-center">
                  <Button variant="outline" size="sm" onClick={() => { setShowLeftPanel(true); }} data-testid="button-open-library">
                    <LayoutGrid className="w-4 h-4 mr-1.5" /> Biblioteca
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowRightPanel(true); setRightTab("url"); }} data-testid="button-open-url">
                    <Link2 className="w-4 h-4 mr-1.5" /> URL
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* ── BARRA DE CONTROLES ── */}
          <div className="bg-card/80 backdrop-blur-md border-t border-border px-4 py-2.5 space-y-2">
            {/* Barra de progreso */}
            {mediaType !== "embed" && (
              <div className="space-y-1">
                {/* Slider de posición + rango de segmento superpuesto */}
                <div className="relative">
                  <Slider
                    min={0} max={duration || 100} step={0.1}
                    value={[currentTime]}
                    onValueChange={handleSeek}
                    disabled={!mediaSource && !activeVideoId}
                    data-testid="slider-progress"
                  />
                  {isSegmentMode && duration > 0 && segmentEnd > segmentStart && (
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 pointer-events-none">
                      <div
                        className="absolute h-full bg-red-500/40 rounded-full"
                        style={{
                          left: `${(segmentStart / duration) * 100}%`,
                          width: `${Math.max(0, (segmentEnd - segmentStart) / duration) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Controles de segmento inline */}
                {isSegmentMode && (
                  <div className="flex items-center gap-1 px-0.5">
                    {/* Marcar inicio */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline" size="sm"
                          onClick={markSegmentStart}
                          className="h-6 px-2 text-[10px] font-mono border-red-500/50 text-red-400 hover:bg-red-500/10"
                          data-testid="button-mark-start"
                        >
                          A: {formatTime(segmentStart)}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Marcar inicio en tiempo actual</TooltipContent>
                    </Tooltip>

                    {/* Rango visual expandido */}
                    <div className="flex-1 relative h-2 bg-secondary/40 rounded-full overflow-hidden">
                      {duration > 0 && segmentEnd > segmentStart && (
                        <div
                          className="absolute h-full bg-red-500/60 rounded-full"
                          style={{
                            left: `${(segmentStart / duration) * 100}%`,
                            width: `${Math.max(0, (segmentEnd - segmentStart) / duration) * 100}%`,
                          }}
                        />
                      )}
                    </div>

                    {/* Marcar fin */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline" size="sm"
                          onClick={markSegmentEnd}
                          className="h-6 px-2 text-[10px] font-mono border-red-500/50 text-red-400 hover:bg-red-500/10"
                          data-testid="button-mark-end"
                        >
                          B: {formatTime(segmentEnd)}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Marcar fin en tiempo actual</TooltipContent>
                    </Tooltip>

                    {/* Grabar / Detener */}
                    {!isRecording ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="icon"
                            onClick={startSegmentRecording}
                            disabled={segmentEnd <= segmentStart}
                            className="h-6 w-6 text-red-400 hover:bg-red-500/10"
                            data-testid="button-record-start"
                          >
                            <Circle className="w-3 h-3 fill-red-500 text-red-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Grabar segmento seleccionado</TooltipContent>
                      </Tooltip>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="icon"
                            onClick={stopSegmentRecording}
                            className="h-6 w-6 text-red-400 animate-pulse hover:bg-red-500/10"
                            data-testid="button-record-stop"
                          >
                            <Square className="w-3 h-3 fill-red-500 text-red-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Detener grabación</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}

                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                  <span data-testid="text-current-time">{formatTime(currentTime)}</span>
                  <span data-testid="text-duration">{formatTime(duration)}</span>
                </div>
              </div>
            )}

            {/* Controles */}
            <div className="flex items-center justify-between gap-2">
              {/* Izquierda: controles de reproducción */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => skip(-10)} disabled={mediaType === "embed"} className="h-8 w-8" data-testid="button-skip-back">
                      <SkipBack className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>-10s</TooltipContent>
                </Tooltip>

                <Button variant="default" size="icon" onClick={togglePlay} disabled={mediaType === "embed" && !mediaSource} className="h-9 w-9 rounded-full" data-testid="button-play-pause">
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={() => skip(10)} disabled={mediaType === "embed"} className="h-8 w-8" data-testid="button-skip-forward">
                      <SkipForward className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>+10s</TooltipContent>
                </Tooltip>

                <Button variant="ghost" size="icon" onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; }} disabled={mediaType === "embed"} className="h-8 w-8" data-testid="button-restart">
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Centro: velocidades */}
              <div className="flex items-center gap-0.5 hidden sm:flex">
                {[0.5, 1, 1.5, 2].map(rate => (
                  <button
                    key={rate}
                    onClick={() => handleRate(rate)}
                    data-testid={`button-rate-${rate}`}
                    className={`px-1.5 py-0.5 rounded text-[11px] font-mono transition-colors ${
                      playbackRate === rate
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {/* Derecha: volumen + cola + pantalla completa */}
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={toggleMute} disabled={mediaType === "embed"} className="h-8 w-8" data-testid="button-mute">
                  {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                </Button>
                <Slider
                  min={0} max={1} step={0.01}
                  value={[isMuted ? 0 : volume]}
                  onValueChange={handleVolume}
                  disabled={mediaType === "embed"}
                  className="w-16 hidden sm:block"
                  data-testid="slider-volume"
                />

                {/* Modo segmento */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isSegmentMode ? "secondary" : "ghost"}
                      size="icon"
                      onClick={() => setIsSegmentMode(!isSegmentMode)}
                      disabled={mediaType === "embed"}
                      className={`h-8 w-8 ${isSegmentMode ? "text-red-400" : ""}`}
                      data-testid="button-toggle-segment"
                    >
                      <Scissors className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isSegmentMode ? "Desactivar selección de segmento" : "Seleccionar segmento para grabar"}</TooltipContent>
                </Tooltip>

                {/* Aspecto / relación de video */}
                {mediaType === "video" && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cycleVideoFit}
                        className="h-8 px-2 text-[10px] font-medium text-muted-foreground hover:text-foreground hidden sm:flex"
                        data-testid="button-video-fit"
                      >
                        {videoFit === "contain" && <Shrink className="w-3 h-3 mr-1" />}
                        {videoFit === "cover" && <Expand className="w-3 h-3 mr-1" />}
                        {videoFit === "fill" && <Ratio className="w-3 h-3 mr-1" />}
                        {fitLabels[videoFit]}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Ajustado = preserva proporción · Rellenar = recorta · Estirar = sin proporción
                    </TooltipContent>
                  </Tooltip>
                )}

                <Button variant="ghost" size="icon" onClick={toggleFullscreen} disabled={mediaType === "embed"} className="h-8 w-8" data-testid="button-fullscreen">
                  {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </div>
          </div>

        </main>

        {/* ─────────────────────────────────────────────────────────
         * PANEL DERECHO — Controles (ocultable)
         * ───────────────────────────────────────────────────────── */}
        {showRightPanel && (
          <aside className="w-72 border-l border-border bg-sidebar flex flex-col overflow-hidden flex-shrink-0">

            {/* Pestañas del panel derecho */}
            <div className="flex border-b border-border overflow-x-auto no-scrollbar">
              {([
                { key: "library", label: "Dirs" },
                { key: "url", label: "URL" },
                { key: "segment", label: "Segmento" },
                { key: "share", label: "Compartir" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setRightTab(key)}
                  data-testid={`tab-${key}`}
                  className={`flex-1 py-2 text-[11px] font-medium transition-colors border-b-2 whitespace-nowrap ${
                    rightTab === key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="p-3 space-y-3">

                {/* ─────────────────────────────────────────────
                 * SECCIÓN: DIRECTORIOS
                 * ───────────────────────────────────────────── */}
                {rightTab === "library" && (
                  <div className="space-y-3">
                    {/* Sub-pestañas: Disco / Favoritos */}
                    <div className="flex rounded-lg border border-border overflow-hidden">
                      <button
                        onClick={() => setLibraryTab("disk")}
                        data-testid="tab-disk"
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                          libraryTab === "disk"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground bg-transparent"
                        }`}
                      >
                        <HardDrive className="w-3 h-3" /> Disco
                      </button>
                      <button
                        onClick={() => setLibraryTab("favorites")}
                        data-testid="tab-favorites"
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                          libraryTab === "favorites"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground bg-transparent"
                        }`}
                      >
                        <Star className="w-3 h-3" /> Favoritos
                        {favorites.length > 0 && (
                          <span className="ml-0.5 bg-primary/20 text-primary text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                            {favorites.length}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* ÁRBOL DE DISCO */}
                    {libraryTab === "disk" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <HardDrive className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs font-medium">Raíz del disco</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Marca las carpetas o archivos. Haz clic en ★ en una carpeta para añadirla a Favoritos.
                        </p>
                        <div className="rounded-lg border border-border bg-card/40 overflow-hidden py-1">
                          {diskTree.map(node => (
                            <FileTreeNode
                              key={node.id}
                              node={node}
                              onToggleCheck={toggleNodeCheck}
                              onToggleOpen={toggleNodeOpen}
                              onSelectFile={handleSelectFromTree}
                              onAddFavorite={addToFavorites}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* FAVORITOS */}
                    {libraryTab === "favorites" && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Star className="w-3.5 h-3.5 text-yellow-400" />
                          <span className="text-xs font-medium">Carpetas Favoritas</span>
                        </div>
                        {favorites.length === 0 ? (
                          <div className="rounded-lg border border-dashed border-border p-6 text-center">
                            <Star className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-xs text-muted-foreground">
                              Haz clic en ★ en cualquier carpeta del árbol de disco para añadirla aquí.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {favorites.map(fav => (
                              <div
                                key={fav.id}
                                className={`flex items-center gap-2 p-2 rounded-lg border group transition-all cursor-pointer hover:border-primary/40 hover:bg-primary/5 ${
                                  folderFilter === fav.path
                                    ? "bg-primary/10 border-primary/40"
                                    : "bg-card border-border"
                                }`}
                                onClick={() => {
                                  setFolderFilter(fav.path);
                                  setVideoListFilter("all");
                                  setLeftTab("library");
                                }}
                                title={`Cargar archivos de ${fav.name} en Biblioteca`}
                              >
                                <FolderOpen className={`w-4 h-4 flex-shrink-0 ${folderFilter === fav.path ? "text-primary" : "text-yellow-400"}`} />
                                <div className="flex-1 min-w-0">
                                  <p className={`text-xs font-medium truncate ${folderFilter === fav.path ? "text-primary" : ""}`}>{fav.name}</p>
                                  <p className="text-[10px] text-muted-foreground truncate font-mono">{fav.path}</p>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); removeFromFavorites(fav.id); if (folderFilter === fav.path) setFolderFilter(null); }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive flex-shrink-0"
                                  title="Quitar de Favoritos"
                                  data-testid={`remove-fav-${fav.id}`}
                                >
                                  <StarOff className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* CARGAR ARCHIVO INDIVIDUAL */}
                    <Separator />
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Upload className="w-3 h-3" /> Cargar archivo individual
                      </Label>
                      <label
                        htmlFor="file-upload"
                        className="flex items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg py-3 px-2 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                        data-testid="label-file-upload"
                      >
                        <Upload className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">Seleccionar archivo</span>
                        <input
                          id="file-upload"
                          type="file"
                          accept="video/*,audio/*"
                          className="hidden"
                          onChange={handleFileUpload}
                          data-testid="input-file-upload"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* ─────────────────────────────────────────────
                 * SECCIÓN: URL EXTERNA
                 * ───────────────────────────────────────────── */}
                {rightTab === "url" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">URL Externa</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Pega una URL de YouTube, Vimeo o un enlace directo a video/audio.
                    </p>
                    <div className="space-y-2">
                      <Input
                        placeholder="https://youtube.com/watch?v=..."
                        value={externalUrl}
                        onChange={(e) => setExternalUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleLoadExternalUrl()}
                        className="text-sm bg-card border-border"
                        data-testid="input-external-url"
                      />
                      <Button onClick={handleLoadExternalUrl} className="w-full" size="sm" data-testid="button-load-url">
                        <ExternalLink className="w-3.5 h-3.5 mr-2" /> Cargar URL
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {["YouTube", "Vimeo", "MP4", "MP3", "WebM"].map(p => (
                        <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                      ))}
                    </div>
                    {urlType && (
                      <div className={`rounded-md px-3 py-2 text-xs ${
                        urlType === "unknown"
                          ? "bg-destructive/10 text-destructive border border-destructive/20"
                          : "bg-primary/10 text-primary border border-primary/20"
                      }`}>
                        Detectado: <span className="font-semibold capitalize">{urlType}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* ─────────────────────────────────────────────
                 * SECCIÓN: SEGMENTO
                 * ───────────────────────────────────────────── */}
                {rightTab === "segment" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Scissors className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Grabación por Segmento</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Marca inicio y fin mientras el video reproduce, luego grábalo.
                    </p>

                    {/* Modo bucle */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-card border border-border">
                      <Checkbox
                        id="segment-mode"
                        checked={isSegmentMode}
                        onCheckedChange={(v) => setIsSegmentMode(!!v)}
                        data-testid="checkbox-segment-mode"
                      />
                      <Label htmlFor="segment-mode" className="text-xs cursor-pointer">Modo bucle del segmento</Label>
                    </div>

                    {/* Info del segmento */}
                    <div className="segment-highlight rounded-lg p-3 space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Inicio:</span>
                        <span className="font-mono text-primary font-semibold" data-testid="text-segment-start">{formatTime(segmentStart)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Fin:</span>
                        <span className="font-mono text-primary font-semibold" data-testid="text-segment-end">{formatTime(segmentEnd)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Duración:</span>
                        <span className="font-mono text-muted-foreground">{formatTime(Math.max(0, segmentEnd - segmentStart))}</span>
                      </div>
                    </div>

                    {/* Botones de marcado */}
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" onClick={markSegmentStart} className="gap-1 text-xs" data-testid="button-mark-start">
                        <Clock className="w-3 h-3 text-green-400" /> Marcar Inicio
                      </Button>
                      <Button variant="outline" size="sm" onClick={markSegmentEnd} className="gap-1 text-xs" data-testid="button-mark-end">
                        <Clock className="w-3 h-3 text-red-400" /> Marcar Fin
                      </Button>
                    </div>

                    <Separator />
                    {!isRecording ? (
                      <Button
                        onClick={startSegmentRecording}
                        className="w-full gap-2" size="sm"
                        disabled={segmentEnd <= segmentStart}
                        data-testid="button-start-recording"
                      >
                        <Circle className="w-3 h-3 fill-destructive text-destructive" /> Grabar Segmento
                      </Button>
                    ) : (
                      <Button
                        onClick={stopSegmentRecording}
                        variant="destructive"
                        className="w-full gap-2 animate-pulse" size="sm"
                        data-testid="button-stop-recording"
                      >
                        <Square className="w-3 h-3" /> Detener Grabación
                      </Button>
                    )}
                    <p className="text-[10px] text-muted-foreground text-center">El segmento se descargará en formato WebM</p>
                  </div>
                )}

                {/* ─────────────────────────────────────────────
                 * SECCIÓN: COMPARTIR
                 * ───────────────────────────────────────────── */}
                {rightTab === "share" && (
                  <div className="space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">Compartir</span>
                    </div>

                    <button onClick={() => openShare(socialLinks.whatsapp, "WhatsApp")} className="social-btn w-full flex items-center gap-3 p-3 rounded-lg bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/20 transition-all" data-testid="button-share-whatsapp">
                      <SiWhatsapp className="w-5 h-5 text-[#25D366]" />
                      <div className="text-left">
                        <p className="text-sm font-medium">WhatsApp</p>
                        <p className="text-[10px] text-muted-foreground">Compartir enlace</p>
                      </div>
                    </button>

                    <button onClick={() => openShare(socialLinks.telegram, "Telegram")} className="social-btn w-full flex items-center gap-3 p-3 rounded-lg bg-[#2CA5E0]/10 hover:bg-[#2CA5E0]/20 border border-[#2CA5E0]/20 transition-all" data-testid="button-share-telegram">
                      <SiTelegram className="w-5 h-5 text-[#2CA5E0]" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Telegram</p>
                        <p className="text-[10px] text-muted-foreground">Compartir enlace</p>
                      </div>
                    </button>

                    <button onClick={() => openShare(socialLinks.facebook, "Facebook")} className="social-btn w-full flex items-center gap-3 p-3 rounded-lg bg-[#1877F2]/10 hover:bg-[#1877F2]/20 border border-[#1877F2]/20 transition-all" data-testid="button-share-facebook">
                      <SiFacebook className="w-5 h-5 text-[#1877F2]" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Facebook</p>
                        <p className="text-[10px] text-muted-foreground">Compartir en muro</p>
                      </div>
                    </button>

                    <button onClick={() => openShare(socialLinks.instagram, "Instagram")} className="social-btn w-full flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-[#E1306C]/10 to-[#F77737]/10 hover:from-[#E1306C]/20 hover:to-[#F77737]/20 border border-[#E1306C]/20 transition-all" data-testid="button-share-instagram">
                      <SiInstagram className="w-5 h-5 text-[#E1306C]" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Instagram</p>
                        <p className="text-[10px] text-muted-foreground">Copiar enlace</p>
                      </div>
                    </button>

                    <Separator />
                    <Button
                      variant="outline" size="sm" className="w-full gap-2"
                      onClick={() => { navigator.clipboard.writeText(window.location.href); toast({ title: "Enlace copiado" }); }}
                      data-testid="button-copy-link"
                    >
                      <Link2 className="w-4 h-4" /> Copiar enlace
                    </Button>
                  </div>
                )}

              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ================================================================
       * DIÁLOGO DE GESTIÓN DE USUARIOS (solo admins)
       * ================================================================ */}
      <Dialog open={showUsersModal} onOpenChange={setShowUsersModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Gestión de usuarios
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ── Lista de usuarios ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Usuarios ({usersList.length})
                </h3>
                <Button variant="outline" size="sm" className="h-7 gap-1 text-xs"
                  onClick={() => { setEditingUser(null); setUserFormData({ username: "", password: "", role: "user", allowed_dirs: "", system_user: false }); setUserFormError(""); }}>
                  <UserPlus className="w-3 h-3" /> Nuevo
                </Button>
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {usersList.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin usuarios</p>
                )}
                {usersList.map(u => (
                  <div key={u.id}
                    className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${editingUser?.id === u.id ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/40"}`}
                    onClick={() => startEditUser(u)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {u.role === "admin"
                          ? <ShieldCheck className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          : <ShieldOff className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
                        <span className="text-sm font-medium truncate">{u.username}</span>
                        {u.system_user && (
                          <Badge variant="secondary" className="text-[9px] px-1 py-0">SO</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant={u.role === "admin" ? "default" : "outline"} className="text-[9px] px-1 py-0">
                          {u.role === "admin" ? "Admin" : "Usuario"}
                        </Badge>
                        {u.allowed_dirs.length > 0 && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <FolderLock className="w-2.5 h-2.5" />
                            {u.allowed_dirs.length} carpeta{u.allowed_dirs.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      {u.last_login && (
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          Último acceso: {new Date(u.last_login).toLocaleString("es")}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10 flex-shrink-0"
                      onClick={e => { e.stopPropagation(); handleDeleteUser(u); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Formulario crear / editar ── */}
            <div className="space-y-3 border-l border-border pl-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" />
                {editingUser ? `Editar: ${editingUser.username}` : "Nuevo usuario"}
              </h3>

              {/* Nombre de usuario */}
              <div className="space-y-1">
                <Label className="text-xs">Nombre de usuario</Label>
                <Input
                  value={userFormData.username}
                  onChange={e => setUserFormData(p => ({ ...p, username: e.target.value }))}
                  disabled={!!editingUser}
                  placeholder="usuario123"
                  className="h-8 text-sm"
                  data-testid="input-user-username"
                />
                {editingUser && (
                  <p className="text-[10px] text-muted-foreground">El nombre de usuario no se puede cambiar</p>
                )}
              </div>

              {/* Contraseña */}
              <div className="space-y-1">
                <Label className="text-xs">
                  {editingUser ? "Nueva contraseña (dejar vacío para no cambiar)" : "Contraseña"}
                </Label>
                <Input
                  type="password"
                  value={userFormData.password}
                  onChange={e => setUserFormData(p => ({ ...p, password: e.target.value }))}
                  disabled={userFormData.system_user}
                  placeholder={userFormData.system_user ? "Usa clave del sistema" : "••••••••"}
                  className="h-8 text-sm"
                  data-testid="input-user-password"
                />
              </div>

              {/* Rol */}
              <div className="space-y-1">
                <Label className="text-xs">Rol</Label>
                <Select
                  value={userFormData.role}
                  onValueChange={v => setUserFormData(p => ({ ...p, role: v }))}
                >
                  <SelectTrigger className="h-8 text-sm" data-testid="select-user-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuario — acceso según carpetas asignadas</SelectItem>
                    <SelectItem value="admin">Admin — acceso completo + gestión de usuarios</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Carpetas permitidas */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <FolderLock className="w-3 h-3" />
                  Carpetas permitidas
                  <span className="text-muted-foreground">(una por línea, vacío = todas)</span>
                </Label>
                <Textarea
                  value={userFormData.allowed_dirs}
                  onChange={e => setUserFormData(p => ({ ...p, allowed_dirs: e.target.value }))}
                  placeholder={"/home/usuario/Videos\n/media/Series"}
                  className="text-xs font-mono resize-none h-20"
                  data-testid="textarea-user-dirs"
                />
              </div>

              {/* Usuario del sistema operativo */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30 border border-border">
                <Checkbox
                  id="chk-system-user"
                  checked={userFormData.system_user}
                  onCheckedChange={v => setUserFormData(p => ({ ...p, system_user: !!v, password: v ? "" : p.password }))}
                  data-testid="checkbox-system-user"
                />
                <div>
                  <Label htmlFor="chk-system-user" className="text-xs font-medium cursor-pointer">
                    Usuario del sistema operativo (Linux)
                  </Label>
                  <p className="text-[10px] text-muted-foreground">
                    Requiere <code>allow_system_users = true</code> en rocio.conf y python-pam instalado. Root bloqueado.
                  </p>
                </div>
              </div>

              {/* Error */}
              {userFormError && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded px-2 py-1.5" data-testid="text-user-form-error">
                  {userFormError}
                </p>
              )}

              <Button
                onClick={handleSaveUser}
                disabled={isSavingUser || (!editingUser && !userFormData.username)}
                className="w-full h-8 text-sm"
                data-testid="button-save-user"
              >
                {isSavingUser ? "Guardando…" : editingUser ? "Guardar cambios" : "Crear usuario"}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowUsersModal(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
