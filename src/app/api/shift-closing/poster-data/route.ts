import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date');

        if (!dateStr) {
            return NextResponse.json({ error: 'Date is required (YYYYMMDD)' }, { status: 400 });
        }

        // 1. Get user's primary poster account
        const account = await prisma.posterAccount.findFirst({
            where: {
                organizationId: session.user.organizationId,
                isPrimary: true
            }
        });

        if (!account) {
            return NextResponse.json({ error: 'Primary Poster account not found' }, { status: 404 });
        }

        const poster = new PosterClient(account.posterToken, account.posterBaseUrl);

        // 2. Fetch transactions for the day
        const transactions: any[] = await poster.getDashTransactions(dateStr, dateStr);

        // 3. Filter closed orders (status = 2)
        const closedOrders = transactions.filter(t => t.status === 2 || t.status === '2');

        let payed_cash = 0;
        let payed_card = 0;
        let payed_sum = 0;

        closedOrders.forEach(order => {
            payed_cash += parseInt(order.payed_cash || '0', 10);
            payed_card += parseInt(order.payed_card || '0', 10);
            payed_sum += parseInt(order.payed_sum || '0', 10);
        });

        // 4. Calculate Poster totals (in tiyins)
        const bonus = payed_sum - payed_cash - payed_card;
        const trade_total = payed_cash + payed_card;

        // 5. Build response based on spec
        // TODO: Get previous shift left amount via getCashShifts. Using mock for now.
        // TODO: Get cashier input data from CashierShiftData. Using mock for now.
        const responseData = {
            success: true,
            date: dateStr,
            transactions_count: closedOrders.length,
            trade_total: trade_total,
            bonus: bonus,
            poster_card: payed_card,
            poster_cash: payed_cash,
            poster_prev_shift_left: 1500000, // 15,000 KZT
            cafe_kaspi_pizzburg: 0,
            cashier_wolt: 0,
            cashier_halyk: 0,
            cashier_cash_bills: 0,
            cashier_cash_coins: 0,
            cashier_expenses: 0,
            cashier_data_submitted: false
        };

        return NextResponse.json(responseData);

    } catch (error: any) {
        console.error('Error fetching poster shift data:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
