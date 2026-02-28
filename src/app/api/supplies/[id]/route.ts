import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ExpenseSource } from '@prisma/client';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const draftId = parseInt(resolvedParams.id);
        if (isNaN(draftId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

        const body = await request.json();

        const updateData: any = {};
        if (body.supplier_name !== undefined) updateData.supplierName = body.supplier_name;
        if (body.supplier_id !== undefined) updateData.supplierId = body.supplier_id ? parseInt(body.supplier_id) : null;
        if (body.invoice_date !== undefined) updateData.invoiceDate = body.invoice_date ? new Date(body.invoice_date) : null;

        if (body.source !== undefined) {
            const sourceMap: Record<string, ExpenseSource> = {
                'cash': ExpenseSource.CASH,
                'kaspi': ExpenseSource.KASPI,
                'halyk': ExpenseSource.HALYK
            };
            updateData.source = sourceMap[body.source as string || 'cash'];
        }

        if (body.linked_expense_draft_id !== undefined) {
            updateData.linkedExpenseDraftId = body.linked_expense_draft_id ? parseInt(body.linked_expense_draft_id) : null;
        }

        // Perform the update
        const draft = await prisma.supplyDraft.update({
            where: { id: draftId, organizationId: session.user.organizationId },
            data: updateData
        });

        // Trigger ExpenseDraft update if the linked draft source needs to match
        // and we have a linked_expense_draft_id
        if (body.source !== undefined && draft.linkedExpenseDraftId) {
            try {
                await prisma.expenseDraft.update({
                    where: { id: draft.linkedExpenseDraftId, organizationId: session.user.organizationId },
                    data: { source: updateData.source }
                });
            } catch (e) {
                console.warn('Failed to sync source to linked expense draft', e);
            }
        }

        return NextResponse.json({ success: true, draft });

    } catch (error: any) {
        console.error('PUT /api/supplies/[id] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const draftId = parseInt(resolvedParams.id);
        if (isNaN(draftId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });

        await prisma.supplyDraft.delete({
            where: { id: draftId, organizationId: session.user.organizationId }
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('DELETE /api/supplies/[id] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
