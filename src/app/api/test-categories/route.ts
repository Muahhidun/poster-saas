import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';

export async function GET() {
    try {
        const acc = await prisma.posterAccount.findFirst();
        if (!acc) return NextResponse.json({ error: 'No account' });

        const client = new PosterClient(acc.posterBaseUrl, acc.posterToken);
        const categories = await client.getCategories();

        return NextResponse.json({ categories });
    } catch (e: any) {
        return NextResponse.json({ error: e.message });
    }
}
