import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request, context: { params: Promise<{ itemId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const itemId = parseInt(resolvedParams.itemId);
        if (isNaN(itemId)) return NextResponse.json({ error: 'Invalid Item ID' }, { status: 400 });

        const item = await prisma.supplyDraftItem.findUnique({
            where: { id: itemId },
            include: { supplyDraft: true }
        });

        if (!item || item.supplyDraft.organizationId !== session.user.organizationId) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        const body = await request.json();
        const updateData: any = {};

        // Recalculate total if price or quantity changes
        let q = Number(item.quantity);
        let p = Number(item.pricePerUnit);
        let recalc = false;

        if (body.quantity !== undefined) {
            q = parseFloat(body.quantity);
            updateData.quantity = q;
            recalc = true;
        }
        if (body.price !== undefined) {
            p = parseFloat(body.price);
            updateData.pricePerUnit = p;
            recalc = true;
        }

        if (recalc) {
            updateData.total = q * p;
        }

        if (body.unit !== undefined) updateData.unit = body.unit;
        if (body.ingredient_id !== undefined) updateData.posterIngredientId = body.ingredient_id ? parseInt(body.ingredient_id) : null;
        if (body.ingredient_name !== undefined) {
            updateData.posterIngredientName = body.ingredient_name;
            updateData.itemName = body.ingredient_name;
        }
        if (body.poster_account_id !== undefined) {
            updateData.posterAccountId = body.poster_account_id ? parseInt(body.poster_account_id) : null;
            updateData.posterAccountName = body.poster_account_name;
        }

        await prisma.supplyDraftItem.update({
            where: { id: itemId },
            data: updateData
        });

        // Recalculate draft total
        if (recalc) {
            const draftId = item.supplyDraftId;
            const allItems = await prisma.supplyDraftItem.findMany({ where: { supplyDraftId: draftId } });
            const newTotal = allItems.reduce((acc: number, i: any) => acc + Number(i.total), 0);
            await prisma.supplyDraft.update({ where: { id: draftId }, data: { totalSum: newTotal } });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('PUT /api/supplies/items/[itemId] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ itemId: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const itemId = parseInt(resolvedParams.itemId);
        if (isNaN(itemId)) return NextResponse.json({ error: 'Invalid Item ID' }, { status: 400 });

        const item = await prisma.supplyDraftItem.findUnique({
            where: { id: itemId },
            include: { supplyDraft: true }
        });

        if (!item || item.supplyDraft.organizationId !== session.user.organizationId) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        await prisma.supplyDraftItem.delete({ where: { id: itemId } });

        // Recalculate draft total
        const draftId = item.supplyDraftId;
        const allItems = await prisma.supplyDraftItem.findMany({ where: { supplyDraftId: draftId } });
        const newTotal = allItems.reduce((acc: number, i: any) => acc + Number(i.total), 0);
        await prisma.supplyDraft.update({ where: { id: draftId }, data: { totalSum: newTotal } });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('DELETE /api/supplies/items/[itemId] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
