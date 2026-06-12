import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
    const contents = await fs.readFile(filePath, 'utf8');
    return new NextResponse(contents, {
      headers: {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to serve PDF worker.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

