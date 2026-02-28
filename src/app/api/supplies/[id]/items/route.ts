import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const draftId = parseInt(resolvedParams.id);
        if (isNaN(draftId)) return NextResponse.json({ error: 'Invalid Draft ID' }, { status: 400 });

        // Ensure draft belongs to org
        const draft = await prisma.supplyDraft.findUnique({
            where: { id: draftId, organizationId: session.user.organizationId }
        });

        if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

        const body = await request.json();

        const quantity = body.quantity ? parseFloat(body.quantity) : 1;
        const price = body.price ? parseFloat(body.price) : 0;
        const total = quantity * price;

        const item = await prisma.supplyDraftItem.create({
            data: {
                supplyDraftId: draftId,
                itemName: body.item_name || body.ingredient_name,
                quantity: quantity,
                pricePerUnit: price,
                total: total,
                unit: body.unit || 'шт',
                posterIngredientId: body.ingredient_id ? parseInt(body.ingredient_id) : null,
                posterIngredientName: body.ingredient_name,
                itemType: body.item_type?.toUpperCase() || 'INGREDIENT', // mapped from 'ingredient'
                posterAccountId: body.poster_account_id ? parseInt(body.poster_account_id) : null,
                posterAccountName: body.poster_account_name,
                storageId: body.storage_id ? parseInt(body.storage_id) : null,
                storageName: body.storage_name
            }
        });

        // Recalculate total sum for the draft
        const allItems = await prisma.supplyDraftItem.findMany({ where: { supplyDraftId: draftId } });
        const newTotal = allItems.reduce((acc: number, i: any) => acc + Number(i.total), 0);
        await prisma.supplyDraft.update({ where: { id: draftId }, data: { totalSum: newTotal } });

        return NextResponse.json({ success: true, id: item.id, item });

    } catch (error: any) {
        console.error('POST /api/supplies/[id]/items Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
