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

        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date'); // YYYY-MM-DD format expected here for ease

        if (!dateStr) {
            return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
        }

        // Parse date boundaries
        const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
        const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

        const expenses = await prisma.expenseDraft.findMany({
            where: {
                organizationId: session.user.organizationId,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Calculate summaries
        let factCash = 0;
        let factKaspi = 0;
        let factHalyk = 0;

        expenses.forEach(exp => {
            const val = Number(exp.amount) * (exp.isIncome ? 1 : -1);
            if (exp.source === 'CASH') factCash += val;
            if (exp.source === 'KASPI') factKaspi += val;
            if (exp.source === 'HALYK') factHalyk += val;
        });

        // We could also fetch from Poster here to get actual Poster balances
        // for "В Poster" values if requested. For now, returning DB stats.

        return NextResponse.json({
            success: true,
            expenses,
            summary: {
                cash: factCash,
                kaspi: factKaspi,
                halyk: factHalyk
            }
        });

    } catch (error: any) {
        console.error('Error fetching expenses:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
