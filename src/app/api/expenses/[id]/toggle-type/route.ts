import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ExpenseType } from '@prisma/client';

export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: paramId } = await params;
        const draftId = parseInt(paramId, 10);

        const body = await request.json();
        const targetType = body.expense_type as ExpenseType;

        if (!targetType || !['TRANSACTION', 'SUPPLY'].includes(targetType)) {
            return NextResponse.json({ error: 'Invalid expense type specified' }, { status: 400 });
        }

        // Fetch existing draft
        const draft = await prisma.expenseDraft.findFirst({
            where: {
                id: draftId,
                organizationId: session.user.organizationId
            }
        });

        if (!draft) {
            return NextResponse.json({ error: 'Expense draft not found' }, { status: 404 });
        }

        let supplyDraftId = null;

        if (targetType === 'SUPPLY' && draft.expenseType !== 'SUPPLY') {
            // Switching to SUPPLY -> Create associated supply_draft
            const supply = await prisma.supplyDraft.create({
                data: {
                    organizationId: session.user.organizationId,
                    linkedExpenseDraftId: draftId,
                    supplierName: draft.description,
                    totalSum: draft.amount,
                    source: draft.source,
                    status: 'pending' // explicit status field
                }
            });
            supplyDraftId = supply.id;
        } else if (targetType === 'TRANSACTION' && draft.expenseType === 'SUPPLY') {
            // Switching to TRANSACTION -> Delete associated supply_draft
            await prisma.supplyDraft.deleteMany({
                where: {
                    linkedExpenseDraftId: draftId,
                    organizationId: session.user.organizationId
                }
            });
        }

        // Finally update the draft's type
        await prisma.expenseDraft.update({
            where: { id: draftId },
            data: { expenseType: targetType }
        });

        return NextResponse.json({
            success: true,
            message: 'Expense type toggled',
            supply_draft_id: supplyDraftId
        });

    } catch (error: any) {
        console.error('POST /api/expenses/[id]/toggle-type Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
