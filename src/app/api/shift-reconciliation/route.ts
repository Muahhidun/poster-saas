import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ExpenseSource } from '@prisma/client';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date');

        if (!dateStr) {
            return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
        }

        const targetDate = new Date(`${dateStr}T00:00:00.000Z`);

        const reconciliations = await prisma.shiftReconciliation.findMany({
            where: {
                organizationId: session.user.organizationId,
                date: targetDate
            }
        });

        const result: Record<string, any> = {
            cash: { fact_balance: null, total_difference: null, notes: '' },
            kaspi: { fact_balance: null, total_difference: null, notes: '' },
            halyk: { fact_balance: null, total_difference: null, notes: '' },
        };

        for (const r of reconciliations) {
            const key = String(r.source).toLowerCase();
            if (result[key]) {
                result[key] = {
                    fact_balance: r.openingBalance,
                    total_difference: r.totalDifference,
                    notes: r.notes || ''
                };
            }
        }

        return NextResponse.json({
            success: true,
            date: dateStr,
            reconciliation: result
        });

    } catch (error: any) {
        console.error('GET /api/shift-reconciliation Error:', error);
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
        const { source, fact_balance, total_difference, notes, date } = body;

        if (!date || !source) {
            return NextResponse.json({ error: 'Date and source are required' }, { status: 400 });
        }

        const targetDate = new Date(`${date}T00:00:00.000Z`);
        const expenseSource = String(source).toUpperCase() as ExpenseSource;

        // Upsert reconciliation
        // Prisma doesn't support multiple field upserts perfectly when there's no combined ID sometimes,
        // Wait, the schema has: @@unique([organizationId, date, source])
        // Let's check `src/app/api/shift-reconciliation/route.ts` - wait, the schema doesn't have an ID that we know yet.
        // I will use a custom findFirst and create/update to be safe.

        const existing = await prisma.shiftReconciliation.findFirst({
            where: {
                organizationId: session.user.organizationId,
                date: targetDate,
                source: expenseSource
            }
        });

        if (existing) {
            await prisma.shiftReconciliation.update({
                where: { id: existing.id },
                data: {
                    openingBalance: fact_balance !== undefined ? fact_balance : existing.openingBalance,
                    totalDifference: total_difference !== undefined ? total_difference : existing.totalDifference,
                    notes: notes !== undefined ? notes : existing.notes
                }
            });
        } else {
            await prisma.shiftReconciliation.create({
                data: {
                    organizationId: session.user.organizationId,
                    date: targetDate,
                    source: expenseSource,
                    openingBalance: fact_balance || null,
                    totalDifference: total_difference || null,
                    notes: notes || ''
                }
            });
        }

        return NextResponse.json({ success: true, message: 'Reconciliation saved' });

    } catch (error: any) {
        console.error('POST /api/shift-reconciliation Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
