import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, context: { params: Promise<{ supplierId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const supplierId = parseInt(resolvedParams.supplierId);
        if (isNaN(supplierId)) {
            return NextResponse.json({ error: 'Invalid supplier ID' }, { status: 400 });
        }

        // We want the last unique items supplied by this supplier
        // A simple way in SQL/Prisma is to group by ingredientId, get the max(date)
        // But since Prisma doesn't support full "greatest-n-per-group" easily,
        // we can fetch recent records and deduplicate in memory.
        const recentHistory = await prisma.ingredientPriceHistory.findMany({
            where: {
                organizationId: session.user.organizationId,
                supplierId: supplierId
            },
            orderBy: { date: 'desc' },
            take: 200 // Assumed enough
        });

        const uniqueItemsMap = new Map();
        for (const item of recentHistory) {
            if (!uniqueItemsMap.has(item.ingredientId)) {
                uniqueItemsMap.set(item.ingredientId, item);
            }
            if (uniqueItemsMap.size >= 50) break; // Limit to 50 unique items
        }

        const items = Array.from(uniqueItemsMap.values()).map(h => ({
            id: h.ingredientId,
            name: h.ingredientName,
            price: Number(h.price),
            quantity: Number(h.quantity || 1),
            unit: h.unit || 'шт',
            date: h.date.toISOString().split('T')[0]
        }));

        return NextResponse.json({ supplier_id: supplierId, items });

    } catch (error: any) {
        console.error('GET /api/supplies/last/[supplierId] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
