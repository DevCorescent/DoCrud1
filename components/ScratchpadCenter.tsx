'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  Eraser, PenLine, MousePointer2, Type, Square, Circle, Minus,
  ArrowRight, StickyNote, Highlighter, ZoomIn, ZoomOut, Undo2, Redo2,
  Download, Share2, Copy, Trash2, Plus, Hand, Link2, Users, X,
  Check, Pen, ChevronDown, Maximize2, Minimize2, Layers, Lock, QrCode,
  ChevronUp, Settings2, Palette, MoreHorizontal,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';


// ─── Types ────────────────────────────────────────────────────────────────────

type Tool =
  | 'select' | 'pan'
  | 'pen' | 'marker' | 'highlighter' | 'eraser'
  | 'line' | 'arrow' | 'rect' | 'circle' | 'triangle'
  | 'text' | 'sticky';

type BgType = 'white' | 'dark' | 'grid' | 'dots' | 'lines';
type Pt = { x: number; y: number; p: number };

type DrawElement = {
  id: string;
  ownerId?: string;
  tool: Tool;
  color: string;
  width: number;
  opacity: number;
  pts?: Pt[];
  x1?: number; y1?: number; x2?: number; y2?: number;
  text?: string; fontSize?: number;
  x?: number; y?: number;
  noteColor?: string;
  filled?: boolean;
};

type Board = {
  id: string;
  name: string;
  elements: DrawElement[];
  bg: BgType;
  createdAt: number;
  updatedAt: number;
};

type CollabUser = {
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  online: boolean;
};

type RealtimeEvent =
  | { event: 'stroke_add';   payload: { element: DrawElement } }
  | { event: 'stroke_undo';  payload: { userId: string } }
  | { event: 'board_clear';  payload: { userId: string } }
  | { event: 'board_sync';   payload: { elements: DrawElement[]; from: string; seq: number } }
  | { event: 'cursor_move';  payload: { userId: string; x: number; y: number } }
  | { event: 'cursor_leave'; payload: { userId: string } };

// ─── Constants ────────────────────────────────────────────────────────────────

const COLLAB_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#3b82f6','#8b5cf6','#ec4899','#14b8a6',
];

const COLOURS = [
  '#0f0f0f','#ffffff','#ef4444','#f97316','#eab308',
  '#22c55e','#3b82f6','#8b5cf6','#ec4899','#14b8a6',
  '#f59e0b','#6366f1',
];

const STICKY_COLOURS = ['#fef08a','#bbf7d0','#bae6fd','#fecaca','#e9d5ff','#fed7aa'];

// Primary draw tools shown in mobile bottom bar
const PRIMARY_TOOLS: { id: Tool; icon: React.ReactNode; tip: string }[] = [
  { id: 'select',      icon: <MousePointer2 size={18} />, tip: 'Select' },
  { id: 'pen',         icon: <Pen size={18} />,           tip: 'Pen' },
  { id: 'marker',      icon: <PenLine size={18} />,       tip: 'Marker' },
  { id: 'highlighter', icon: <Highlighter size={18} />,   tip: 'Highlight' },
  { id: 'eraser',      icon: <Eraser size={18} />,        tip: 'Eraser' },
  { id: 'text',        icon: <Type size={18} />,          tip: 'Text' },
  { id: 'sticky',      icon: <StickyNote size={18} />,    tip: 'Sticky' },
];

const ALL_TOOL_GROUPS: { label: string; tools: { id: Tool; icon: React.ReactNode; tip: string }[] }[] = [
  {
    label: 'Selection',
    tools: [
      { id: 'select', icon: <MousePointer2 size={15} />, tip: 'Select (V)' },
      { id: 'pan',    icon: <Hand size={15} />,           tip: 'Pan (H)' },
    ],
  },
  {
    label: 'Draw',
    tools: [
      { id: 'pen',         icon: <Pen size={15} />,         tip: 'Pen (P)' },
      { id: 'marker',      icon: <PenLine size={15} />,     tip: 'Marker (M)' },
      { id: 'highlighter', icon: <Highlighter size={15} />, tip: 'Highlight (L)' },
      { id: 'eraser',      icon: <Eraser size={15} />,      tip: 'Eraser (E)' },
    ],
  },
  {
    label: 'Shapes',
    tools: [
      { id: 'line',     icon: <Minus size={15} />,      tip: 'Line (1)' },
      { id: 'arrow',    icon: <ArrowRight size={15} />, tip: 'Arrow (2)' },
      { id: 'rect',     icon: <Square size={15} />,     tip: 'Rect (3)' },
      { id: 'circle',   icon: <Circle size={15} />,     tip: 'Ellipse (4)' },
      {
        id: 'triangle',
        icon: (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M8 2 L14 13 H2 Z" />
          </svg>
        ),
        tip: 'Triangle (5)',
      },
    ],
  },
  {
    label: 'Content',
    tools: [
      { id: 'text',   icon: <Type size={15} />,       tip: 'Text (T)' },
      { id: 'sticky', icon: <StickyNote size={15} />, tip: 'Sticky (N)' },
    ],
  },
];

const KEY_MAP: Record<string, Tool> = {
  v:'select', h:'pan', p:'pen', m:'marker', l:'highlighter', e:'eraser',
  '1':'line','2':'arrow','3':'rect','4':'circle','5':'triangle',
  t:'text', n:'sticky',
};

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 10); }

function makeBoard(name: string): Board {
  return { id: uid(), name, elements: [], bg: 'dots', createdAt: Date.now(), updatedAt: Date.now() };
}

function screenToCanvas(x: number, y: number, pan: { x: number; y: number }, zoom: number) {
  return { x: (x - pan.x) / zoom, y: (y - pan.y) / zoom };
}

function canvasToScreen(x: number, y: number, pan: { x: number; y: number }, zoom: number) {
  return { x: x * zoom + pan.x, y: y * zoom + pan.y };
}

function drawFreehand(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  if (!pts.length) return;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2;
    const my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.stroke();
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const hLen = Math.max(w * 4, 16);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hLen * Math.cos(angle - Math.PI / 6), y2 - hLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - hLen * Math.cos(angle + Math.PI / 6), y2 - hLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}

function renderElement(ctx: CanvasRenderingContext2D, el: DrawElement) {
  ctx.save();
  const isEraser = el.tool === 'eraser';
  ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
  ctx.globalAlpha = isEraser ? 1 : (el.tool === 'highlighter' ? Math.min(el.opacity, 0.38) : el.opacity);
  const col = isEraser ? 'rgba(0,0,0,1)' : el.color;
  ctx.strokeStyle = col; ctx.fillStyle = col;
  ctx.lineWidth = el.width;
  ctx.lineCap = el.tool === 'marker' ? 'butt' : 'round';
  ctx.lineJoin = el.tool === 'marker' ? 'miter' : 'round';

  switch (el.tool) {
    case 'pen': case 'marker': case 'highlighter': case 'eraser':
      drawFreehand(ctx, el.pts || []); break;
    case 'line':
      if (el.x1 !== undefined) { ctx.beginPath(); ctx.moveTo(el.x1, el.y1!); ctx.lineTo(el.x2!, el.y2!); ctx.stroke(); } break;
    case 'arrow':
      if (el.x1 !== undefined) drawArrowHead(ctx, el.x1, el.y1!, el.x2!, el.y2!, el.width); break;
    case 'rect':
      if (el.x1 !== undefined) {
        const rx = Math.min(el.x1, el.x2!), ry = Math.min(el.y1!, el.y2!);
        const rw = Math.abs(el.x2! - el.x1), rh = Math.abs(el.y2! - el.y1!);
        ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 4);
        if (el.filled) { ctx.globalAlpha *= 0.15; ctx.fill(); ctx.globalAlpha /= 0.15; }
        ctx.stroke();
      } break;
    case 'circle':
      if (el.x1 !== undefined) {
        const cx = (el.x1 + el.x2!) / 2, cy = (el.y1! + el.y2!) / 2;
        const rx2 = Math.abs(el.x2! - el.x1) / 2, ry2 = Math.abs(el.y2! - el.y1!) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx2, ry2, 0, 0, Math.PI * 2);
        if (el.filled) { ctx.globalAlpha *= 0.15; ctx.fill(); ctx.globalAlpha /= 0.15; }
        ctx.stroke();
      } break;
    case 'triangle':
      if (el.x1 !== undefined) {
        ctx.beginPath();
        ctx.moveTo((el.x1 + el.x2!) / 2, el.y1!);
        ctx.lineTo(el.x2!, el.y2!); ctx.lineTo(el.x1, el.y2!);
        ctx.closePath();
        if (el.filled) { ctx.globalAlpha *= 0.15; ctx.fill(); ctx.globalAlpha /= 0.15; }
        ctx.stroke();
      } break;
    case 'text':
      if (el.text && el.x !== undefined) {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = el.opacity;
        ctx.font = `${el.fontSize || 18}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = el.color;
        ctx.fillText(el.text, el.x, el.y!);
      } break;
    case 'sticky': {
      if (el.x === undefined) break;
      const sw = 200, sh = 160;
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = el.opacity;
      ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
      ctx.fillStyle = el.noteColor || '#fef08a';
      ctx.beginPath(); ctx.roundRect(el.x, el.y!, sw, sh, 6); ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.beginPath(); ctx.moveTo(el.x + sw - 24, el.y!); ctx.lineTo(el.x + sw, el.y! + 24); ctx.lineTo(el.x + sw - 24, el.y! + 24); ctx.closePath(); ctx.fill();
      if (el.text) {
        ctx.fillStyle = '#1a1a1a';
        ctx.font = `13px -apple-system, BlinkMacSystemFont, sans-serif`;
        el.text.split('\n').forEach((line, i) => ctx.fillText(line, el.x! + 14, el.y! + 30 + i * 18));
      }
      break;
    }
  }
  ctx.restore();
}

function renderBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bg: BgType, zoom: number, pan: { x: number; y: number }) {
  ctx.clearRect(0, 0, w, h);
  const dark = bg === 'dark';
  ctx.fillStyle = dark ? '#111113' : '#fafafa';
  ctx.fillRect(0, 0, w, h);
  const gs = 28 * zoom;
  const ox = ((pan.x % gs) + gs) % gs, oy = ((pan.y % gs) + gs) % gs;
  if (bg === 'grid') {
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; ctx.lineWidth = 0.5;
    for (let x = ox - gs; x < w + gs; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = oy - gs; y < h + gs; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  } else if (bg === 'dots') {
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';
    for (let x = ox - gs; x < w + gs; x += gs)
      for (let y = oy - gs; y < h + gs; y += gs) { ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill(); }
  } else if (bg === 'lines') {
    const lg = 32 * zoom, lo = ((pan.y % lg) + lg) % lg;
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'; ctx.lineWidth = 0.5;
    for (let y = lo - lg; y < h + lg; y += lg) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScratchpadCenter() {
  const [boards, setBoards] = useState<Board[]>(() => {
    try { const s = localStorage.getItem('scratchpad:boards'); if (s) return JSON.parse(s); } catch { /**/ }
    return [makeBoard('Board 1')];
  });
  const [activeBoardId, setActiveBoardId] = useState<string>(() => boards[0]?.id || '');
  const [undoStack, setUndoStack] = useState<DrawElement[][]>([]);
  const [redoStack, setRedoStack] = useState<DrawElement[][]>([]);

  const [tool, setTool]             = useState<Tool>('pen');
  const [color, setColor]           = useState('#0f0f0f');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [opacity, setOpacity]       = useState(1);
  const [filled, setFilled]         = useState(false);
  const [fontSize, setFontSize]     = useState(18);
  const [stickyColor, setStickyColor] = useState('#fef08a');

  const [zoom, setZoom] = useState(1);
  const [pan, setPan]   = useState({ x: 0, y: 0 });

  const [isDrawing, setIsDrawing] = useState(false);
  const currentElRef   = useRef<DrawElement | null>(null);
  const spaceRef       = useRef(false);
  const panStartRef    = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const isPanningRef   = useRef(false);

  const [textInput, setTextInput] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const [stickyInput, setStickyInput] = useState<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const [stickyValue, setStickyValue] = useState('');

  const myUserId  = useRef(uid());
  const myColor   = useRef(COLLAB_COLORS[Math.floor(Math.random() * COLLAB_COLORS.length)]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const collabRoomIdRef = useRef<string | null>(null);
  const [collabRoomId, setCollabRoomId] = useState<string | null>(null);
  const [collabActive, setCollabActive] = useState(false);
  const [collabUsers, setCollabUsers] = useState<CollabUser[]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Record<string, { x: number; y: number; name: string; color: string }>>({});
  const [collabStatus, setCollabStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncSeqRef    = useRef(0);

  const [shareOpen, setShareOpen]     = useState(false);
  const [collabOpen, setCollabOpen]   = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [editingBoardName, setEditingBoardName] = useState<string | null>(null);
  const [boardNameDraft, setBoardNameDraft]     = useState('');
  const [showBoardPanel, setShowBoardPanel]     = useState(false);
  const [copied, setCopied] = useState(false);
  const [joinRoomInput, setJoinRoomInput] = useState('');

  // Mobile-specific state
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [showMobileProps, setShowMobileProps] = useState(false);
  const [showBgMenu, setShowBgMenu] = useState(false);

  const bgCanvasRef   = useRef<HTMLCanvasElement>(null);
  const fgCanvasRef   = useRef<HTMLCanvasElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const rafRef        = useRef<number>(0);
  const dirtyRef      = useRef(true);

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) || boards[0],
    [boards, activeBoardId],
  );

  useEffect(() => {
    try { localStorage.setItem('scratchpad:boards', JSON.stringify(boards)); } catch { /**/ }
  }, [boards]);

  const updateBoard = useCallback((id: string, patch: Partial<Board>) => {
    setBoards((prev) => prev.map((b) => b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b));
    dirtyRef.current = true;
  }, []);

  const pushElements = useCallback((elements: DrawElement[]) => {
    setUndoStack((prev) => [...prev.slice(-49), activeBoard.elements]);
    setRedoStack([]);
    updateBoard(activeBoard.id, { elements });
  }, [activeBoard, updateBoard]);

  const sendEvent = useCallback((event: string, payload: unknown) => {
    const roomId = collabRoomIdRef.current;
    if (!roomId) return;
    fetch(`/api/collab/${roomId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: myUserId.current, event, payload }),
    }).catch(() => {});
  }, []);

  const undo = useCallback(() => {
    if (!undoStack.length) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, activeBoard.elements]);
    setUndoStack((u) => u.slice(0, -1));
    updateBoard(activeBoard.id, { elements: prev });
    sendEvent('stroke_undo', { userId: myUserId.current });
  }, [undoStack, activeBoard, updateBoard, sendEvent]);

  const redo = useCallback(() => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, activeBoard.elements]);
    setRedoStack((r) => r.slice(0, -1));
    updateBoard(activeBoard.id, { elements: next });
  }, [redoStack, activeBoard, updateBoard]);

  const clearBoard = useCallback(() => {
    pushElements([]);
    sendEvent('board_clear', { userId: myUserId.current });
  }, [pushElements, sendEvent]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      [bgCanvasRef, fgCanvasRef].forEach((ref) => {
        const c = ref.current;
        if (!c) return;
        c.width = el.offsetWidth;
        c.height = el.offsetHeight;
      });
      dirtyRef.current = true;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const renderAll = useCallback(() => {
    const bgC = bgCanvasRef.current, fgC = fgCanvasRef.current;
    if (!bgC || !fgC) return;
    const bgCtx = bgC.getContext('2d')!;
    const fgCtx = fgC.getContext('2d')!;
    const w = bgC.width, h = bgC.height;
    renderBackground(bgCtx, w, h, activeBoard.bg, zoom, pan);
    fgCtx.clearRect(0, 0, w, h);
    fgCtx.save();
    fgCtx.translate(pan.x, pan.y);
    fgCtx.scale(zoom, zoom);
    for (const el of activeBoard.elements) renderElement(fgCtx, el);
    if (currentElRef.current) renderElement(fgCtx, currentElRef.current);
    fgCtx.restore();
    dirtyRef.current = false;
  }, [activeBoard, zoom, pan]);

  useEffect(() => { dirtyRef.current = true; }, [activeBoard, zoom, pan]);

  useEffect(() => {
    const loop = () => { if (dirtyRef.current) renderAll(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderAll]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); spaceRef.current = true; return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }
      const t = KEY_MAP[e.key.toLowerCase()];
      if (t) setTool(t);
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [undo, redo]);

  const getCoords = (e: React.PointerEvent) => {
    const rect = fgCanvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
    return { screen: { x: sx, y: sy }, canvas: screenToCanvas(sx, sy, pan, zoom), pressure: e.pressure || 0.5 };
  };

  const isFreehand = (t: Tool) => ['pen','marker','highlighter','eraser'].includes(t);
  const isShape    = (t: Tool) => ['line','arrow','rect','circle','triangle'].includes(t);

  const broadcastCursor = useCallback((cx: number, cy: number) => {
    if (!collabActive) return;
    if (cursorThrottleRef.current) return;
    cursorThrottleRef.current = setTimeout(() => {
      cursorThrottleRef.current = null;
      sendEvent('cursor_move', { userId: myUserId.current, x: cx, y: cy });
    }, 40);
  }, [collabActive, sendEvent]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    fgCanvasRef.current?.setPointerCapture(e.pointerId);
    if (spaceRef.current || tool === 'pan' || e.button === 1) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y };
      return;
    }
    if (tool === 'text') {
      const { screen, canvas } = getCoords(e);
      setTextInput({ x: canvas.x, y: canvas.y, cx: screen.x, cy: screen.y });
      setTextValue('');
      return;
    }
    if (tool === 'sticky') {
      const { screen, canvas } = getCoords(e);
      setStickyInput({ x: canvas.x, y: canvas.y, cx: screen.x, cy: screen.y });
      setStickyValue('');
      return;
    }
    const { canvas, pressure } = getCoords(e);
    const newEl: DrawElement = {
      id: uid(), ownerId: myUserId.current, tool, color, width: strokeWidth, opacity, filled,
      ...(isFreehand(tool) ? { pts: [{ x: canvas.x, y: canvas.y, p: pressure }] } : {}),
      ...(isShape(tool)    ? { x1: canvas.x, y1: canvas.y, x2: canvas.x, y2: canvas.y } : {}),
    };
    currentElRef.current = newEl;
    setIsDrawing(true);
    dirtyRef.current = true;
  }, [tool, color, strokeWidth, opacity, filled, pan]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const { canvas, pressure } = getCoords(e);
    broadcastCursor(canvas.x, canvas.y);
    if (isPanningRef.current) {
      const dx = e.clientX - panStartRef.current.x, dy = e.clientY - panStartRef.current.y;
      setPan({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
      dirtyRef.current = true;
      return;
    }
    if (!isDrawing || !currentElRef.current) return;
    const el = currentElRef.current;
    if (isFreehand(el.tool)) {
      currentElRef.current = { ...el, pts: [...(el.pts || []), { x: canvas.x, y: canvas.y, p: pressure }] };
    } else if (isShape(el.tool)) {
      currentElRef.current = { ...el, x2: canvas.x, y2: canvas.y };
    }
    dirtyRef.current = true;
  }, [isDrawing, broadcastCursor]);

  const onPointerUp = useCallback(() => {
    isPanningRef.current = false;
    if (!isDrawing || !currentElRef.current) return;
    setIsDrawing(false);
    const el = currentElRef.current;
    const next = [...activeBoard.elements, el];
    pushElements(next);
    sendEvent('stroke_add', { element: el });
    currentElRef.current = null;
    dirtyRef.current = true;
  }, [isDrawing, activeBoard.elements, pushElements, sendEvent]);

  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = fgCanvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      setZoom((z) => {
        const nz = Math.min(Math.max(z * factor, 0.1), 8);
        setPan((p) => ({ x: mx - (mx - p.x) * (nz / z), y: my - (my - p.y) * (nz / z) }));
        return nz;
      });
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
    dirtyRef.current = true;
  }, []);

  const commitText = useCallback(() => {
    if (!textInput || !textValue.trim()) { setTextInput(null); return; }
    const el: DrawElement = {
      id: uid(), ownerId: myUserId.current, tool: 'text', color, width: 1, opacity,
      text: textValue, x: textInput.x, y: textInput.y, fontSize,
    };
    pushElements([...activeBoard.elements, el]);
    sendEvent('stroke_add', { element: el });
    setTextInput(null); setTextValue('');
  }, [textInput, textValue, color, opacity, fontSize, activeBoard.elements, pushElements, sendEvent]);

  const commitSticky = useCallback(() => {
    if (!stickyInput) { setStickyInput(null); return; }
    const el: DrawElement = {
      id: uid(), ownerId: myUserId.current, tool: 'sticky', color: '#1a1a1a', width: 1, opacity,
      text: stickyValue || 'Write something…', x: stickyInput.x, y: stickyInput.y, noteColor: stickyColor,
    };
    pushElements([...activeBoard.elements, el]);
    sendEvent('stroke_add', { element: el });
    setStickyInput(null); setStickyValue('');
  }, [stickyInput, stickyValue, stickyColor, opacity, activeBoard.elements, pushElements, sendEvent]);

  // ── Real-time Collaboration ──────────────────────────────────────────────────

  const startCollaboration = useCallback(async (roomId: string, myName: string) => {
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    setCollabStatus('connecting');
    setCollabRoomId(roomId);
    collabRoomIdRef.current = roomId;

    const es = new EventSource(`/api/collab/${roomId}?userId=${encodeURIComponent(myUserId.current)}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      fetch(`/api/collab/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: myUserId.current, event: 'join', name: myName, color: myColor.current }),
      }).catch(() => {});
      setCollabStatus('connected');
      setCollabActive(true);
    };

    es.onmessage = (e) => {
      let parsed: { event: string; payload: any };
      try { parsed = JSON.parse(e.data); } catch { return; }
      const { event, payload } = parsed;

      if (event === 'snapshot' || event === 'presence') {
        setCollabUsers((payload.users as CollabUser[]).map((u) => ({ ...u, cursor: null, online: true })));
        if (event === 'snapshot' && payload.elements?.length > 0) {
          setBoards((prev) => prev.map((b) =>
            b.id === activeBoardId && b.elements.length < payload.elements.length
              ? { ...b, elements: payload.elements, updatedAt: Date.now() } : b
          ));
        }
        return;
      }
      if (event === 'board_sync') {
        if (payload.from === myUserId.current || payload.seq <= lastSyncSeqRef.current) return;
        lastSyncSeqRef.current = payload.seq;
        setBoards((prev) => prev.map((b) =>
          b.id === activeBoardId && b.elements.length < payload.elements.length
            ? { ...b, elements: payload.elements, updatedAt: Date.now() } : b
        ));
        dirtyRef.current = true;
        return;
      }
      if (event === 'stroke_add') {
        setBoards((prev) => prev.map((b) =>
          b.id === activeBoardId ? { ...b, elements: [...b.elements, payload.element], updatedAt: Date.now() } : b
        ));
        dirtyRef.current = true;
        return;
      }
      if (event === 'stroke_undo') {
        setBoards((prev) => prev.map((b) => {
          if (b.id !== activeBoardId) return b;
          const idx = [...b.elements].reverse().findIndex((el) => el.ownerId === payload.userId);
          if (idx === -1) return b;
          return { ...b, elements: b.elements.filter((_, i) => i !== b.elements.length - 1 - idx), updatedAt: Date.now() };
        }));
        dirtyRef.current = true;
        return;
      }
      if (event === 'board_clear') {
        setBoards((prev) => prev.map((b) =>
          b.id === activeBoardId ? { ...b, elements: [], updatedAt: Date.now() } : b
        ));
        dirtyRef.current = true;
        return;
      }
      if (event === 'cursor_move') {
        setRemoteCursors((prev) => ({
          ...prev,
          [payload.userId]: { x: payload.x, y: payload.y, name: prev[payload.userId]?.name || 'User', color: prev[payload.userId]?.color || '#6366f1' },
        }));
        return;
      }
      if (event === 'cursor_leave') {
        setRemoteCursors((prev) => { const n = { ...prev }; delete n[payload.userId]; return n; });
        return;
      }
    };

    es.onerror = () => {
      setCollabStatus('error');
      es.close();
      if (eventSourceRef.current === es) { eventSourceRef.current = null; }
    };
  }, [activeBoardId]);

  const stopCollaboration = useCallback(() => {
    const roomId = collabRoomIdRef.current;
    if (roomId) {
      fetch(`/api/collab/${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: myUserId.current, event: 'leave' }),
      }).catch(() => {});
    }
    if (eventSourceRef.current) { eventSourceRef.current.close(); eventSourceRef.current = null; }
    collabRoomIdRef.current = null;
    setCollabActive(false); setCollabRoomId(null); setCollabUsers([]); setRemoteCursors({}); setCollabStatus('idle');
  }, []);

  useEffect(() => {
    if (!collabUsers.length) return;
    setRemoteCursors((prev) => {
      const updated = { ...prev };
      collabUsers.forEach((u) => { if (updated[u.userId]) updated[u.userId] = { ...updated[u.userId], name: u.name, color: u.color }; });
      return updated;
    });
  }, [collabUsers]);

  useEffect(() => () => { stopCollaboration(); }, []);

  const exportPng = useCallback(() => {
    const bgC = bgCanvasRef.current, fgC = fgCanvasRef.current;
    if (!bgC || !fgC) return;
    const m = document.createElement('canvas');
    m.width = bgC.width; m.height = bgC.height;
    const ctx = m.getContext('2d')!;
    ctx.drawImage(bgC, 0, 0); ctx.drawImage(fgC, 0, 0);
    const a = document.createElement('a');
    a.href = m.toDataURL('image/png'); a.download = `${activeBoard.name}.png`; a.click();
  }, [activeBoard.name]);

  const copyImage = useCallback(async () => {
    const bgC = bgCanvasRef.current, fgC = fgCanvasRef.current;
    if (!bgC || !fgC) return;
    const m = document.createElement('canvas');
    m.width = bgC.width; m.height = bgC.height;
    const ctx = m.getContext('2d')!;
    ctx.drawImage(bgC, 0, 0); ctx.drawImage(fgC, 0, 0);
    m.toBlob(async (blob) => {
      if (!blob) return;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true); setTimeout(() => setCopied(false), 2000);
      } catch { /**/ }
    });
  }, []);

  const shareLink = useMemo(() => {
    try {
      const data = JSON.stringify({ elements: activeBoard.elements, bg: activeBoard.bg });
      return `${typeof window !== 'undefined' ? window.location.origin : ''}/workspace?tab=scratchpad&pad=${btoa(encodeURIComponent(data))}`;
    } catch { return ''; }
  }, [activeBoard.elements, activeBoard.bg]);

  const collabLink = useMemo(() =>
    collabRoomId ? `${typeof window !== 'undefined' ? window.location.origin : ''}/workspace?tab=scratchpad&collab=${collabRoomId}` : '',
    [collabRoomId]);

  const addBoard = () => {
    const b = makeBoard(`Board ${boards.length + 1}`);
    setBoards((prev) => [...prev, b]);
    setActiveBoardId(b.id);
    setUndoStack([]); setRedoStack([]);
  };

  const deleteBoard = (id: string) => {
    if (boards.length === 1) return;
    const idx = boards.findIndex((b) => b.id === id);
    const next = boards[idx === 0 ? 1 : idx - 1];
    setBoards((prev) => prev.filter((b) => b.id !== id));
    if (activeBoardId === id) setActiveBoardId(next.id);
  };

  const renameBoardCommit = (id: string) => {
    if (boardNameDraft.trim()) updateBoard(id, { name: boardNameDraft.trim() });
    setEditingBoardName(null);
  };

  const zoomTo = (factor: number) => {
    const bgC = bgCanvasRef.current; if (!bgC) return;
    const cx = bgC.width / 2, cy = bgC.height / 2;
    setZoom((z) => { const nz = Math.min(Math.max(z * factor, 0.1), 8); setPan((p) => ({ x: cx - (cx - p.x) * (nz / z), y: cy - (cy - p.y) * (nz / z) })); return nz; });
    dirtyRef.current = true;
  };

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); dirtyRef.current = true; };

  const BG_OPTIONS: { value: BgType; label: string; icon: string }[] = [
    { value: 'white', label: 'White', icon: '□' },
    { value: 'dark',  label: 'Dark',  icon: '■' },
    { value: 'grid',  label: 'Grid',  icon: '⊞' },
    { value: 'dots',  label: 'Dots',  icon: '⁚' },
    { value: 'lines', label: 'Lines', icon: '≡' },
  ];

  const isDark = activeBoard.bg === 'dark';
  const cursor = spaceRef.current || tool === 'pan' ? 'grab' : tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair';

  // Glass/surface tokens
  const glass = isDark
    ? 'bg-white/8 backdrop-blur-xl border-white/10 text-white'
    : 'bg-white/90 backdrop-blur-xl border-black/8 text-slate-900';
  const glassBtn = isDark
    ? 'hover:bg-white/12 active:bg-white/20 text-white/80 hover:text-white'
    : 'hover:bg-black/6 active:bg-black/10 text-slate-600 hover:text-slate-900';
  const activeTool = isDark
    ? 'bg-white text-slate-900 shadow-sm'
    : 'bg-slate-900 text-white shadow-sm';

  return (
    <div className={`flex flex-col ${fullscreen ? 'fixed inset-0 z-[60]' : 'h-[calc(100dvh-110px)] min-h-[500px]'} rounded-2xl overflow-hidden`}
      style={{ background: isDark ? '#111113' : '#f5f5f7' }}>

      {/* ── BOARD TABS (top, thin strip) ────────────────────────────────────── */}
      <div className={`flex items-center gap-1 px-2 pt-2 pb-0 shrink-0 overflow-x-auto scrollbar-none`}>
        {boards.map((b) => (
          <div key={b.id} className="flex items-center shrink-0">
            {editingBoardName === b.id ? (
              <input autoFocus
                className={`text-xs font-medium px-3 py-1.5 rounded-t-xl w-32 focus:outline-none ${isDark ? 'bg-white/15 text-white border border-white/20' : 'bg-white text-slate-900 border border-slate-300'}`}
                value={boardNameDraft}
                onChange={(e) => setBoardNameDraft(e.target.value)}
                onBlur={() => renameBoardCommit(b.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') renameBoardCommit(b.id); if (e.key === 'Escape') setEditingBoardName(null); }} />
            ) : (
              <button
                onClick={() => { setActiveBoardId(b.id); setUndoStack([]); setRedoStack([]); }}
                onDoubleClick={() => { setEditingBoardName(b.id); setBoardNameDraft(b.name); }}
                className={`group flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-t-xl transition-all ${
                  b.id === activeBoardId
                    ? isDark ? 'bg-white/12 text-white border-t border-x border-white/10' : 'bg-white text-slate-900 border-t border-x border-slate-200 shadow-sm'
                    : isDark ? 'text-white/40 hover:text-white/70 hover:bg-white/6' : 'text-slate-400 hover:text-slate-600 hover:bg-black/5'
                }`}>
                {b.name}
                {boards.length > 1 && (
                  <span onClick={(e) => { e.stopPropagation(); deleteBoard(b.id); }}
                    className={`opacity-0 group-hover:opacity-100 transition-opacity rounded-full p-0.5 ${isDark ? 'hover:bg-white/20' : 'hover:bg-slate-200'}`}>
                    <X size={9} />
                  </span>
                )}
              </button>
            )}
          </div>
        ))}
        <button onClick={addBoard}
          className={`shrink-0 flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-t-xl transition-all ${isDark ? 'text-white/40 hover:text-white/70 hover:bg-white/6' : 'text-slate-400 hover:text-slate-600 hover:bg-black/5'}`}>
          <Plus size={12} /> New
        </button>
      </div>

      {/* ── MAIN WORK AREA ──────────────────────────────────────────────────── */}
      <div className={`flex flex-1 min-h-0 relative rounded-b-2xl overflow-hidden ${isDark ? 'border border-white/8' : 'border border-slate-200'} ${!isDark ? 'border-t-0' : 'border-t-0'}`}
        style={{ borderTop: 'none' }}>

        {/* ── LEFT SIDEBAR TOOLBAR (desktop) ─────────────────────────────── */}
        <div className={`hidden md:flex w-14 shrink-0 flex-col items-center gap-1 py-3 border-r z-10 overflow-y-auto ${isDark ? 'border-white/8 bg-white/5' : 'border-slate-100 bg-white/80'} backdrop-blur-sm`}>
          {ALL_TOOL_GROUPS.map((group, gi) => (
            <div key={gi} className="flex flex-col items-center gap-0.5 w-full">
              {gi > 0 && <div className={`w-7 h-px my-1.5 ${isDark ? 'bg-white/10' : 'bg-slate-100'}`} />}
              {group.tools.map(({ id, icon, tip }) => (
                <button key={id} title={tip}
                  onClick={() => { setTool(id); setTextInput(null); setStickyInput(null); }}
                  className={`w-10 h-10 flex items-center justify-center rounded-xl transition-all mx-auto ${
                    tool === id ? activeTool : `${glassBtn} transition-colors`
                  }`}>
                  {icon}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ── CANVAS ──────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 relative">

          {/* Floating top-right toolbar */}
          <div className={`absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2 py-1.5 rounded-2xl border shadow-lg ${glass}`}>
            {/* Undo / Redo */}
            <button onClick={undo} disabled={!undoStack.length} title="Undo (⌘Z)"
              className={`p-2 rounded-xl transition-all disabled:opacity-30 ${glassBtn}`}><Undo2 size={14} /></button>
            <button onClick={redo} disabled={!redoStack.length} title="Redo (⌘Y)"
              className={`p-2 rounded-xl transition-all disabled:opacity-30 ${glassBtn}`}><Redo2 size={14} /></button>

            <div className={`w-px h-5 ${isDark ? 'bg-white/12' : 'bg-slate-200'}`} />

            {/* Zoom */}
            <button onClick={() => zoomTo(0.8)} className={`p-2 rounded-xl transition-all ${glassBtn}`}><ZoomOut size={14} /></button>
            <button onClick={resetView} className={`text-[11px] font-mono px-2 py-1 rounded-xl transition-all min-w-[44px] text-center ${glassBtn}`}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => zoomTo(1.25)} className={`p-2 rounded-xl transition-all ${glassBtn}`}><ZoomIn size={14} /></button>

            <div className={`w-px h-5 ${isDark ? 'bg-white/12' : 'bg-slate-200'}`} />

            {/* BG picker */}
            <div className="relative">
              <button onClick={() => setShowBgMenu((v) => !v)}
                className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-xl transition-all ${glassBtn}`}>
                <Layers size={13} />
                <span className="hidden sm:inline">BG</span>
              </button>
              {showBgMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowBgMenu(false)} />
                  <div className={`absolute top-full right-0 mt-2 z-20 rounded-2xl shadow-2xl border p-1.5 min-w-[130px] ${isDark ? 'bg-[#1c1c1e] border-white/12' : 'bg-white border-slate-200'}`}>
                    {BG_OPTIONS.map((opt) => (
                      <button key={opt.value}
                        onClick={() => { updateBoard(activeBoard.id, { bg: opt.value }); setShowBgMenu(false); }}
                        className={`flex items-center gap-2.5 w-full text-xs px-3 py-2 rounded-xl transition-all ${
                          activeBoard.bg === opt.value
                            ? isDark ? 'bg-white/15 text-white font-semibold' : 'bg-slate-900 text-white font-semibold'
                            : isDark ? 'text-white/70 hover:bg-white/8' : 'text-slate-700 hover:bg-slate-50'
                        }`}>
                        <span className="font-mono text-base leading-none">{opt.icon}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {isShape(tool) && (
              <button onClick={() => setFilled((f) => !f)}
                className={`text-xs px-2.5 py-1.5 rounded-xl transition-all border ${
                  filled
                    ? isDark ? 'bg-white text-slate-900 border-transparent' : 'bg-slate-900 text-white border-transparent'
                    : isDark ? 'border-white/15 text-white/70 hover:bg-white/8' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}>Fill</button>
            )}

            <div className={`w-px h-5 ${isDark ? 'bg-white/12' : 'bg-slate-200'}`} />

            {/* Collab badge */}
            {collabActive && (
              <div className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden sm:inline">{collabUsers.length} live</span>
              </div>
            )}

            {/* Remote user avatars */}
            {collabUsers.length > 0 && (
              <div className="flex -space-x-1.5">
                {collabUsers.slice(0, 4).map((u) => (
                  <div key={u.userId} title={u.name}
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-white text-[9px] font-bold shadow-sm"
                    style={{ background: u.color, borderColor: isDark ? '#111113' : '#f5f5f7' }}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setCollabOpen(true)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all font-medium ${
                collabActive
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-violet-600 hover:bg-violet-700 text-white'
              }`}>
              <Users size={12} />
              <span className="hidden sm:inline">{collabActive ? 'Live' : 'Collab'}</span>
            </button>

            <button onClick={() => setShareOpen(true)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl transition-all font-medium ${isDark ? 'bg-white text-slate-900 hover:bg-white/90' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
              <Share2 size={12} />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button onClick={clearBoard} title="Clear board"
              className={`p-2 rounded-xl transition-all ${isDark ? 'hover:bg-red-500/20 hover:text-red-400 text-white/50' : 'hover:bg-red-50 hover:text-red-600 text-slate-400'}`}>
              <Trash2 size={14} />
            </button>

            <button onClick={() => setFullscreen((f) => !f)}
              className={`p-2 rounded-xl transition-all ${glassBtn}`}>
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>

          {/* Canvas container */}
          <div ref={containerRef} className="flex-1 relative overflow-hidden"
            style={{ background: isDark ? '#111113' : '#f5f5f7' }}>
            <canvas ref={bgCanvasRef} className="absolute inset-0" />
            <canvas ref={fgCanvasRef} className="absolute inset-0"
              style={{ cursor, touchAction: 'none' }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                onPointerUp();
                sendEvent('cursor_leave', { userId: myUserId.current });
              }}
              onWheel={onWheel}
            />

            {/* Remote cursors */}
            {Object.entries(remoteCursors).map(([userId, cur]) => {
              const screen = canvasToScreen(cur.x, cur.y, pan, zoom);
              return (
                <div key={userId} className="pointer-events-none absolute z-20 flex flex-col items-start" style={{ left: screen.x, top: screen.y, transform: 'translate(4px,-4px)' }}>
                  <svg width="16" height="16" viewBox="0 0 16 16">
                    <path d="M0 0 L0 12 L3.5 9 L6.5 15 L8 14.5 L5 8.5 L9 8.5 Z" fill={cur.color} stroke="white" strokeWidth="1" />
                  </svg>
                  <div className="px-2 py-0.5 rounded-lg text-white text-[10px] font-semibold whitespace-nowrap shadow-md" style={{ background: cur.color }}>
                    {cur.name}
                  </div>
                </div>
              );
            })}

            {/* Text input overlay */}
            {textInput && (
              <div className="absolute z-20" style={{ left: textInput.cx, top: textInput.cy - fontSize }}>
                <input autoFocus value={textValue} onChange={(e) => setTextValue(e.target.value)}
                  onBlur={commitText}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) commitText(); if (e.key === 'Escape') setTextInput(null); }}
                  className="outline-none bg-transparent border-b-2 border-blue-500 min-w-[140px]"
                  style={{ fontSize: `${fontSize * zoom}px`, color, fontFamily: 'sans-serif', lineHeight: 1 }}
                  placeholder="Type here…" />
              </div>
            )}

            {/* Sticky input overlay */}
            {stickyInput && (
              <div className="absolute z-20 rounded-2xl shadow-2xl overflow-hidden" style={{ left: Math.min(stickyInput.cx, (fgCanvasRef.current?.offsetWidth || 400) - 220), top: Math.min(stickyInput.cy, (fgCanvasRef.current?.offsetHeight || 400) - 200), width: 210 }}>
                <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold" style={{ background: stickyColor }}>
                  <span className="text-slate-800">Sticky Note</span>
                  <div className="flex gap-1">
                    {STICKY_COLOURS.map((c) => (
                      <button key={c} onClick={() => setStickyColor(c)}
                        className={`w-4 h-4 rounded-full border-2 transition-transform ${stickyColor === c ? 'scale-125 border-slate-700' : 'border-transparent hover:scale-110'}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                </div>
                <textarea autoFocus value={stickyValue} onChange={(e) => setStickyValue(e.target.value)}
                  onBlur={commitSticky}
                  onKeyDown={(e) => { if (e.key === 'Escape') setStickyInput(null); }}
                  className="w-full p-3 text-sm resize-none outline-none bg-white text-slate-800" rows={4} placeholder="Write a note…" />
                <div className="flex items-center justify-end gap-2 px-3 py-2 bg-white border-t border-slate-100">
                  <button onClick={() => setStickyInput(null)} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">Cancel</button>
                  <button onClick={commitSticky} className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-medium">Add</button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!activeBoard.elements.length && !isDrawing && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center select-none">
                  <div className={`text-5xl mb-4 ${isDark ? 'opacity-20' : 'opacity-30'}`}>✦</div>
                  <p className={`text-sm font-medium ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Start drawing</p>
                  <p className={`text-xs mt-1 ${isDark ? 'text-white/15' : 'text-slate-300'}`}>⌘+scroll to zoom · Space+drag to pan</p>
                </div>
              </div>
            )}
          </div>

          {/* ── BOTTOM PROPERTY BAR (desktop) ──────────────────────────────── */}
          <div className={`hidden md:flex items-center gap-3 px-4 py-2.5 border-t shrink-0 flex-wrap ${isDark ? 'bg-white/5 border-white/8' : 'bg-white/80 border-slate-100'} backdrop-blur-sm`}>
            {/* Color swatches */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {COLOURS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full transition-all border-2 ${color === c ? 'scale-125 shadow-md' : 'border-transparent hover:scale-110'}`}
                  style={{ background: c, borderColor: color === c ? (isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)') : 'transparent', boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px #cbd5e1' : undefined }} />
              ))}
              <label className="w-5 h-5 rounded-full overflow-hidden cursor-pointer hover:scale-110 transition-transform relative border border-slate-300" title="Custom color">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }} />
              </label>
            </div>

            <div className={`w-px h-5 ${isDark ? 'bg-white/12' : 'bg-slate-200'}`} />

            <div className="flex items-center gap-2">
              <span className={`text-[11px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Size</span>
              <input type="range" min={1} max={tool === 'highlighter' ? 60 : tool === 'eraser' ? 80 : 40}
                value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-20 accent-violet-600 h-1.5" />
              <span className={`text-[11px] font-mono w-5 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{strokeWidth}</span>
            </div>

            <div className={`w-px h-5 ${isDark ? 'bg-white/12' : 'bg-slate-200'}`} />

            <div className="flex items-center gap-2">
              <span className={`text-[11px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Opacity</span>
              <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                className="w-16 accent-violet-600 h-1.5" />
              <span className={`text-[11px] font-mono w-8 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{Math.round(opacity * 100)}%</span>
            </div>

            {tool === 'text' && (
              <>
                <div className={`w-px h-5 ${isDark ? 'bg-white/12' : 'bg-slate-200'}`} />
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Font</span>
                  <input type="range" min={10} max={96} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-16 accent-violet-600 h-1.5" />
                  <span className={`text-[11px] font-mono w-6 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>{fontSize}</span>
                </div>
              </>
            )}

            {tool === 'sticky' && (
              <>
                <div className={`w-px h-5 ${isDark ? 'bg-white/12' : 'bg-slate-200'}`} />
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] ${isDark ? 'text-white/40' : 'text-slate-400'}`}>Note</span>
                  {STICKY_COLOURS.map((c) => (
                    <button key={c} onClick={() => setStickyColor(c)}
                      className={`w-5 h-5 rounded border-2 transition-all ${stickyColor === c ? 'scale-125' : 'border-transparent hover:scale-110'}`}
                      style={{ background: c, borderColor: stickyColor === c ? '#64748b' : 'transparent' }} />
                  ))}
                </div>
              </>
            )}

            <div className="flex-1" />
            <span className={`text-[11px] ${isDark ? 'text-white/20' : 'text-slate-300'}`}>⌘Z undo · ⌘Y redo · Space+drag pan</span>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MOBILE BOTTOM TOOLBAR                                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}

      {/* Mobile properties sheet */}
      {showMobileProps && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMobileProps(false)} />
          <div className={`fixed bottom-[76px] left-2 right-2 z-50 md:hidden rounded-2xl border p-4 shadow-2xl ${isDark ? 'bg-[#1c1c1e] border-white/12' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-slate-400'}`}>Properties</span>
              <button onClick={() => setShowMobileProps(false)} className={`p-1.5 rounded-xl ${glassBtn}`}><X size={14} /></button>
            </div>
            {/* Colors */}
            <div className="flex flex-wrap gap-2 mb-4">
              {COLOURS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition-all border-2 ${color === c ? 'scale-110 shadow-lg' : 'border-transparent'}`}
                  style={{ background: c, borderColor: color === c ? (isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)') : 'transparent', boxShadow: c === '#ffffff' ? 'inset 0 0 0 1.5px #cbd5e1' : undefined }} />
              ))}
              <label className="w-8 h-8 rounded-full overflow-hidden cursor-pointer border-2 border-slate-200 relative" title="Custom">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' }} />
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={`text-xs w-14 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Size</span>
                <input type="range" min={1} max={tool === 'highlighter' ? 60 : tool === 'eraser' ? 80 : 40}
                  value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="flex-1 accent-violet-600 h-2" />
                <span className={`text-xs font-mono w-7 text-right ${isDark ? 'text-white/70' : 'text-slate-700'}`}>{strokeWidth}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs w-14 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Opacity</span>
                <input type="range" min={5} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                  className="flex-1 accent-violet-600 h-2" />
                <span className={`text-xs font-mono w-7 text-right ${isDark ? 'text-white/70' : 'text-slate-700'}`}>{Math.round(opacity * 100)}%</span>
              </div>
              {tool === 'text' && (
                <div className="flex items-center gap-3">
                  <span className={`text-xs w-14 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Font</span>
                  <input type="range" min={10} max={96} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
                    className="flex-1 accent-violet-600 h-2" />
                  <span className={`text-xs font-mono w-7 text-right ${isDark ? 'text-white/70' : 'text-slate-700'}`}>{fontSize}</span>
                </div>
              )}
              {isShape(tool) && (
                <div className="flex items-center gap-3">
                  <span className={`text-xs w-14 ${isDark ? 'text-white/50' : 'text-slate-500'}`}>Fill</span>
                  <button onClick={() => setFilled((f) => !f)}
                    className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${filled ? 'bg-violet-600 text-white' : isDark ? 'bg-white/10 text-white/70' : 'bg-slate-100 text-slate-600'}`}>
                    {filled ? 'Filled' : 'Outline'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Mobile all tools sheet */}
      {showMobileTools && (
        <>
          <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMobileTools(false)} />
          <div className={`fixed bottom-[76px] left-2 right-2 z-50 md:hidden rounded-2xl border p-3 shadow-2xl ${isDark ? 'bg-[#1c1c1e] border-white/12' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center justify-between mb-2.5">
              <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-white/50' : 'text-slate-400'}`}>All Tools</span>
              <button onClick={() => setShowMobileTools(false)} className={`p-1.5 rounded-xl ${glassBtn}`}><X size={14} /></button>
            </div>
            {ALL_TOOL_GROUPS.map((group, gi) => (
              <div key={gi} className="mb-3">
                <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>{group.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {group.tools.map(({ id, icon, tip }) => (
                    <button key={id}
                      onClick={() => { setTool(id); setTextInput(null); setStickyInput(null); setShowMobileTools(false); }}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                        tool === id
                          ? isDark ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
                          : isDark ? 'bg-white/8 text-white/70 hover:bg-white/15' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}>
                      {icon} {tip.replace(/ \(.\)$/, '')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Mobile bottom toolbar */}
      <div className={`md:hidden flex items-center gap-1 px-2 py-2 shrink-0 border-t ${isDark ? 'bg-[#1a1a1c] border-white/10' : 'bg-white border-slate-200'}`}>
        {/* Primary tools */}
        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {PRIMARY_TOOLS.map(({ id, icon, tip }) => (
            <button key={id}
              onClick={() => { setTool(id); setTextInput(null); setStickyInput(null); }}
              title={tip}
              className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-all ${
                tool === id
                  ? isDark ? 'bg-white text-slate-900 shadow-md' : 'bg-slate-900 text-white shadow-md'
                  : isDark ? 'text-white/60 hover:bg-white/10 active:bg-white/20' : 'text-slate-500 hover:bg-slate-100 active:bg-slate-200'
              }`}>
              {icon}
            </button>
          ))}
        </div>

        <div className={`w-px h-8 mx-1 shrink-0 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />

        {/* Actions */}
        <button onClick={undo} disabled={!undoStack.length}
          className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl disabled:opacity-30 transition-all ${isDark ? 'text-white/60 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Undo2 size={18} />
        </button>
        <button onClick={() => setShowMobileProps((v) => !v)}
          className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-all ${
            showMobileProps
              ? isDark ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
              : isDark ? 'text-white/60 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'
          }`}>
          <Palette size={18} />
        </button>
        <button onClick={() => setShowMobileTools((v) => !v)}
          className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl transition-all ${
            showMobileTools
              ? isDark ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
              : isDark ? 'text-white/60 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'
          }`}>
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* ── SHARE MODAL ─────────────────────────────────────────────────────── */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-0 shadow-2xl">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-white">
                <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center"><Share2 size={16} className="text-white" /></div>
                Share Scratchpad
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Share Link</label>
              <div className="flex gap-2">
                <input readOnly value={shareLink} className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 font-mono truncate focus:outline-none" />
                <button onClick={() => { navigator.clipboard.writeText(shareLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className={`flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl transition-all shrink-0 font-medium ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-700'}`}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 p-4 bg-slate-50">
              <p className="text-xs font-semibold text-slate-600 mb-3">Export</p>
              <div className="flex gap-2">
                <button onClick={exportPng} className="flex-1 flex items-center justify-center gap-2 text-xs py-2.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition-all font-medium text-slate-700">
                  <Download size={14} /> Download PNG
                </button>
                <button onClick={copyImage} className="flex-1 flex items-center justify-center gap-2 text-xs py-2.5 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition-all font-medium text-slate-700">
                  <Copy size={14} /> Copy Image
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── COLLABORATE MODAL ───────────────────────────────────────────────── */}
      <Dialog open={collabOpen} onOpenChange={setCollabOpen}>
        <DialogContent className="max-w-[480px] w-[calc(100vw-32px)] rounded-3xl p-0 overflow-hidden border-0 shadow-[0_32px_80px_rgba(0,0,0,0.22)]">

          {/* Header */}
          <div className="relative px-6 pt-7 pb-6 overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)' }}>
            {/* Subtle noise texture overlay */}
            <div className="absolute inset-0 opacity-[0.03]"
              style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }} />
            {/* Glow orbs */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #a78bfa, transparent)' }} />
            <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full opacity-15" style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />

            <DialogHeader className="relative">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.15)' }}>
                    <Users size={18} className="text-white" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-semibold text-white leading-tight">
                      {collabActive ? 'Live Session' : 'Collaborate'}
                    </DialogTitle>
                    <p className="text-[13px] text-violet-300 mt-0.5 font-normal">
                      {collabActive ? `${collabUsers.length} participant${collabUsers.length !== 1 ? 's' : ''} connected` : 'Real-time canvas sharing'}
                    </p>
                  </div>
                </div>
                {collabActive && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold text-emerald-300"
                    style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </div>
                )}
              </div>
            </DialogHeader>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-3 bg-white">
            {collabActive ? (
              <>
                {/* Invite link */}
                <div>
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2">Invite Link</p>
                  <div className="flex gap-2 p-1 rounded-2xl bg-slate-50 border border-slate-200">
                    <input readOnly value={collabLink}
                      className="flex-1 text-xs px-3 py-2 bg-transparent font-mono text-slate-600 truncate focus:outline-none" />
                    <button
                      onClick={() => { navigator.clipboard.writeText(collabLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className={`flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-semibold transition-all shrink-0 ${
                        copied ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-slate-700'
                      }`}>
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>

                {/* Participants */}
                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50/80 border-b border-slate-100">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Participants</span>
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {collabUsers.length} online
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50 max-h-44 overflow-y-auto">
                    {collabUsers.map((u, i) => (
                      <div key={u.userId} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shadow-sm"
                            style={{ background: u.color }}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {u.userId === myUserId.current ? `${u.name} (you)` : u.name}
                          </p>
                        </div>
                        <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                          {u.userId === myUserId.current ? 'HOST' : `#${i + 1}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* End session */}
                <button onClick={() => { stopCollaboration(); setCollabOpen(false); }}
                  className="w-full text-sm py-2.5 rounded-2xl font-medium transition-all text-red-500 hover:bg-red-50 border border-red-100 hover:border-red-200">
                  End session
                </button>
              </>
            ) : (
              <>
                {/* Status banners */}
                {collabStatus === 'connecting' && (
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium"
                    style={{ background: 'linear-gradient(135deg, #ede9fe, #f5f3ff)', border: '1px solid #ddd6fe' }}>
                    <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse shrink-0" />
                    <span className="text-violet-700">Setting up your room…</span>
                  </div>
                )}
                {collabStatus === 'error' && (
                  <div className="flex items-center gap-3 rounded-2xl px-4 py-3 bg-red-50 border border-red-100 text-sm text-red-600">
                    <span className="shrink-0">⚠</span> Could not connect — check your network or try again.
                  </div>
                )}

                {/* Create room card */}
                <div className="relative rounded-2xl overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)', border: '1px solid #ddd6fe' }}>
                  <div className="absolute top-0 right-0 w-32 h-32 opacity-10"
                    style={{ background: 'radial-gradient(circle, #7c3aed, transparent)', transform: 'translate(30%, -30%)' }} />
                  <div className="relative p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}>
                        <Users size={15} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900 leading-tight">Start a new room</p>
                        <p className="text-xs text-slate-500 mt-0.5">Share the link — anyone can join instantly</p>
                      </div>
                    </div>
                    <button
                      onClick={() => startCollaboration(uid() + uid(), 'You')}
                      disabled={collabStatus === 'connecting'}
                      className="w-full text-sm py-2.5 rounded-xl font-semibold text-white transition-all disabled:opacity-50 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', boxShadow: '0 4px 16px rgba(109,40,217,0.3)' }}>
                      {collabStatus === 'connecting' ? 'Creating room…' : 'Create collaboration room'}
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">or join existing</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>

                {/* Join room */}
                <div className="flex gap-2 p-1 rounded-2xl bg-slate-50 border border-slate-200 focus-within:border-violet-300 focus-within:bg-violet-50/30 transition-colors">
                  <input
                    placeholder="Paste room ID or invite link…"
                    value={joinRoomInput}
                    onChange={(e) => setJoinRoomInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && joinRoomInput.trim()) {
                        const raw = joinRoomInput.trim();
                        const match = raw.match(/collab=([a-z0-9]+)/);
                        const roomId = match ? match[1] : raw;
                        if (roomId) { startCollaboration(roomId, 'You'); setJoinRoomInput(''); }
                      }
                    }}
                    className="flex-1 text-sm px-3 py-2 bg-transparent text-slate-700 placeholder:text-slate-400 focus:outline-none" />
                  <button
                    onClick={() => {
                      const raw = joinRoomInput.trim();
                      const match = raw.match(/collab=([a-z0-9]+)/);
                      const roomId = match ? match[1] : raw;
                      if (roomId) { startCollaboration(roomId, 'You'); setJoinRoomInput(''); }
                    }}
                    disabled={!joinRoomInput.trim() || collabStatus === 'connecting'}
                    className="text-sm px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-700 disabled:opacity-35 transition-all active:scale-95 shrink-0">
                    Join
                  </button>
                </div>

                {/* Feature pills */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {[
                    { icon: '⚡', title: 'Real-time cursors', desc: 'See every stroke live' },
                    { icon: '🔒', title: 'Private by default', desc: 'Link-only access' },
                    { icon: '🎨', title: 'Independent strokes', desc: 'Non-destructive editing' },
                    { icon: '🔗', title: 'One-click invite', desc: 'No sign-up needed' },
                  ].map((f) => (
                    <div key={f.title}
                      className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-colors">
                      <span className="text-base leading-none mt-0.5 shrink-0">{f.icon}</span>
                      <div>
                        <p className="text-[12px] font-semibold text-slate-700 leading-tight">{f.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
