import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

        const updatedConfig = await prisma.dailyTransactionConfig.updateMany({
            where: {
                id,
                organizationId: session.user.organizationId
            },
            data: {
                accountName: body.account_name,
                transactionType: body.transaction_type,
                categoryId: body.category_id,
                categoryName: body.category_name,
                accountFromId: body.account_from_id,
                accountFromName: body.account_from_name,
                accountToId: body.account_to_id || null,
                accountToName: body.account_to_name || null,
                amount: body.amount,
                comment: body.comment,
                sortOrder: body.sort_order,
                isEnabled: body.is_enabled
            }
        });

        if (updatedConfig.count === 0) {
            return NextResponse.json({ error: 'Config not found or unauthorized' }, { status: 404 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error updating daily transaction config:', error);
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

        const deletedConfig = await prisma.dailyTransactionConfig.deleteMany({
            where: {
                id,
                organizationId: session.user.organizationId
            }
        });

        if (deletedConfig.count === 0) {
            return NextResponse.json({ error: 'Config not found or unauthorized' }, { status: 404 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error deleting daily transaction config:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
