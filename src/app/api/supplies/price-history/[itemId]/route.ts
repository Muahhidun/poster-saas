import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request, context: { params: Promise<{ itemId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const itemId = parseInt(resolvedParams.itemId);
        if (isNaN(itemId)) {
            return NextResponse.json({ error: 'Invalid item ID' }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const supplierId = searchParams.get('supplierId');

        const query: any = {
            organizationId: session.user.organizationId,
            ingredientId: itemId
        };

        if (supplierId && !isNaN(parseInt(supplierId))) {
            query.supplierId = parseInt(supplierId);
        }

        const history = await prisma.ingredientPriceHistory.findMany({
            where: query,
            orderBy: { date: 'desc' },
            take: 10
        });

        const formatted = history.map((h: any) => ({
            price: Number(h.price),
            quantity: Number(h.quantity || 1),
            date: h.date.toISOString().split('T')[0],
            supplier_name: h.supplierName || 'Неизвестно'
        }));

        return NextResponse.json({ item_id: itemId, history: formatted });

    } catch (error: any) {
        console.error('GET /api/supplies/price-history/[itemId] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
