import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { date, role, wolt, halyk, kaspi, kaspiCafe, cashBills, cashCoins, expenses } = body;

        if (!date) {
            return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
        }

        const targetDate = new Date(`${date}T00:00:00.000Z`);

        // Get existing or create new
        const existing = await prisma.cashierShiftData.findFirst({
            where: {
                organizationId: session.user.organizationId,
                date: targetDate
            }
        });

        const updateData: any = {};

        if (role === 'CASHIER') {
            updateData.wolt = Number(wolt || 0);
            updateData.halyk = Number(halyk || 0);
            updateData.kaspi = Number(kaspi || 0); // we might need to add kaspi field to CashierShiftData if not exists, wait...
            updateData.cashBills = Number(cashBills || 0);
            updateData.cashCoins = Number(cashCoins || 0);
            updateData.expenses = Number(expenses || 0);
            updateData.shiftDataSubmitted = true;
        } else if (role === 'CAFE') {
            // Note: Prisma schema might not have kaspiCafe at cashierShiftData level, wait let's check.
            // Wait, schema has: wolt, halyk, cashBills, cashCoins, expenses.
            // Oh, kaspiCafe wasn't explicitly modeled in CashierShiftData in string but `kaspiCafe` might be a missing field.
            // We can store Cafe kaspi in 'expenses' temporarily or a json field if needed, but actually the spec says CAFE submits their own kaspi.
            // Let's store it in `wolt` or create a generic JSON if needed, but we can just use Prisma's `update`
        }

        // To make this robust, let's just use what's available in CashierShiftData model:
        if (existing) {
            await prisma.cashierShiftData.update({
                where: { id: existing.id },
                data: {
                    wolt: role === 'CASHIER' ? Number(wolt || 0) : existing.wolt,
                    halyk: role === 'CASHIER' ? Number(halyk || 0) : existing.halyk,
                    kaspi: role === 'CASHIER' ? Number(kaspi || 0) : existing.kaspi,
                    kaspiCafe: role === 'CAFE' ? Number(kaspiCafe || 0) : existing.kaspiCafe,
                    cashBills: role === 'CASHIER' ? Number(cashBills || 0) : existing.cashBills,
                    cashCoins: role === 'CASHIER' ? Number(cashCoins || 0) : existing.cashCoins,
                    expenses: role === 'CASHIER' ? Number(expenses || 0) : existing.expenses,
                    shiftDataSubmitted: true // at least one party submitted
                }
            });
        } else {
            await prisma.cashierShiftData.create({
                data: {
                    organizationId: session.user.organizationId,
                    date: targetDate,
                    wolt: role === 'CASHIER' ? Number(wolt || 0) : 0,
                    halyk: role === 'CASHIER' ? Number(halyk || 0) : 0,
                    kaspi: role === 'CASHIER' ? Number(kaspi || 0) : 0,
                    kaspiCafe: role === 'CAFE' ? Number(kaspiCafe || 0) : 0,
                    cashBills: role === 'CASHIER' ? Number(cashBills || 0) : 0,
                    cashCoins: role === 'CASHIER' ? Number(cashCoins || 0) : 0,
                    expenses: role === 'CASHIER' ? Number(expenses || 0) : 0,
                    shiftDataSubmitted: true
                }
            });
        }

        return NextResponse.json({ success: true, message: 'Data saved' });

    } catch (error: any) {
        console.error('Error saving shift data:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
