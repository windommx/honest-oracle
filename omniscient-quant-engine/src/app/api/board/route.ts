import { NextResponse } from 'next/server';
import { getBoard } from '@/lib/quant/engine/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const board = await getBoard();
    return NextResponse.json(board);
  } catch (e) {
    console.error('board error', e);
    return NextResponse.json({ error: 'board failed', detail: String(e) }, { status: 500 });
  }
}
