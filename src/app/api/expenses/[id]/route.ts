import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ExpenseSource, CompletionStatus } from '@prisma/client';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: paramId } = await params;
        const id = parseInt(paramId, 10);
        const body = await request.json();

        // Build dynamic update object
        const updateData: any = {};
        if (body.amount !== undefined) updateData.amount = body.amount;
        if (body.description !== undefined) updateData.description = body.description;
        if (body.category !== undefined) updateData.category = body.category;
        if (body.source !== undefined) updateData.source = body.source as ExpenseSource;
        if (body.account_id !== undefined) updateData.accountId = parseInt(body.account_id);
        if (body.poster_account_id !== undefined) updateData.posterAccountId = parseInt(body.poster_account_id);
        if (body.completion_status !== undefined) updateData.completionStatus = body.completion_status as CompletionStatus;
        if (body.status !== undefined) updateData.status = body.status;

        const updated = await prisma.expenseDraft.updateMany({
            where: {
                id,
                organizationId: session.user.organizationId
            },
            data: updateData
        });

        if (updated.count === 0) {
            return NextResponse.json({ error: 'Draft not found or unauthorized' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Expense draft updated' });

    } catch (error: any) {
        console.error('PUT /api/expenses/[id] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: paramId } = await params;
        const id = parseInt(paramId, 10);

        const deleted = await prisma.expenseDraft.deleteMany({
            where: {
                id,
                organizationId: session.user.organizationId
            }
        });

        if (deleted.count === 0) {
            return NextResponse.json({ error: 'Draft not found or unauthorized' }, { status: 404 });
        }

        return NextResponse.json({ success: true, message: 'Expense draft deleted' });

    } catch (error: any) {
        console.error('DELETE /api/expenses/[id] Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
