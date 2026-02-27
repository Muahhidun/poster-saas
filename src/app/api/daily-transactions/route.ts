import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const configs = await prisma.dailyTransactionConfig.findMany({
            where: {
                organizationId: session.user.organizationId
            },
            orderBy: {
                sortOrder: 'asc'
            }
        });

        // Map Prisma camelCase to API snake_case for frontend
        const mappedConfigs = configs.map(c => ({
            id: c.id,
            account_name: c.accountName,
            transaction_type: c.transactionType,
            category_id: c.categoryId,
            category_name: c.categoryName,
            account_from_id: c.accountFromId,
            account_from_name: c.accountFromName,
            account_to_id: c.accountToId,
            account_to_name: c.accountToName,
            amount: c.amount,
            comment: c.comment,
            is_enabled: c.isEnabled,
            sort_order: c.sortOrder
        }));

        return NextResponse.json({ success: true, configs: mappedConfigs });

    } catch (error: any) {
        console.error('Error fetching daily transactions:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        const newConfig = await prisma.dailyTransactionConfig.create({
            data: {
                organizationId: session.user.organizationId,
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
                sortOrder: body.sort_order || 0,
                isEnabled: body.is_enabled ?? true
            }
        });

        return NextResponse.json({ success: true, config: newConfig });

    } catch (error: any) {
        console.error('Error creating daily transaction config:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
