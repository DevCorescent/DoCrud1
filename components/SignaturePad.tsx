'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface SignaturePadProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SignaturePad({ value, onChange }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastEmittedRef = useRef<string>('');

  const exportTrimmedPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return '';
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < 0 || maxY < 0) return '';

    const pad = Math.max(6, Math.round(Math.min(width, height) * 0.02));
    const cropX = Math.max(0, minX - pad);
    const cropY = Math.max(0, minY - pad);
    const cropW = Math.min(width - cropX, (maxX - minX + 1) + pad * 2);
    const cropH = Math.min(height - cropY, (maxY - minY + 1) + pad * 2);

    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const outCtx = out.getContext('2d');
    if (!outCtx) return canvas.toDataURL('image/png');
    outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    return out.toDataURL('image/png');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.strokeStyle = '#0f172a';
    // Keep the canvas pixels transparent for premium stamps (no background).
    // The visible white background comes from CSS only.
    if (drawingRef.current) return;

    // If the incoming value is the same trimmed image we just emitted, do not clear/redraw.
    // Clearing here would make the signature "disappear" right after drawing.
    if (value && value === lastEmittedRef.current) return;

    context.clearRect(0, 0, canvas.width, canvas.height);

    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = value;
    }
  }, [value]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    drawingRef.current = true;
    const point = getPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!drawingRef.current || !canvas || !context) return;

    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const stopDrawing = () => {
    const canvas = canvasRef.current;
    if (!drawingRef.current || !canvas) return;
    drawingRef.current = false;
    // Do not replace the visible canvas with the trimmed export (that feels like "zooming").
    // Only send the trimmed PNG upstream for PDF stamping.
    const next = exportTrimmedPng() || canvas.toDataURL('image/png');
    lastEmittedRef.current = next;
    onChange(next);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    lastEmittedRef.current = '';
    onChange('');
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={600}
        height={180}
        className="w-full rounded-2xl border border-slate-200 bg-white touch-none"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
      />
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={clear}>Clear Signature</Button>
      </div>
    </div>
  );
}
