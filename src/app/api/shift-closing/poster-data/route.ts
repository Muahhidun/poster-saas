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

        // 1. Get user's poster account
        const account = await prisma.posterAccount.findFirst({
            where: {
                organizationId: session.user.organizationId
            },
            orderBy: {
                isPrimary: 'desc'
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

        // 5. Fetch saved data for the date from DB
        // Format date string from YYYYMMDD to Date object
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(4, 6)) - 1;
        const day = parseInt(dateStr.substring(6, 8));
        const targetDate = new Date(Date.UTC(year, month, day));

        const savedShift = await prisma.shiftClosing.findFirst({
            where: {
                organizationId: session.user.organizationId,
                date: targetDate
            }
        });

        const cashierData = await prisma.cashierShiftData.findFirst({
            where: {
                organizationId: session.user.organizationId,
                date: targetDate
            }
        });

        const responseData = {
            success: true,
            date: dateStr,
            transactions_count: closedOrders.length,
            trade_total: trade_total,
            bonus: bonus,
            poster_card: payed_card,
            poster_cash: payed_cash,
            poster_prev_shift_left: savedShift?.shiftStart || 1500000, // 15,000 KZT
            cafe_kaspi_pizzburg: savedShift?.kaspiCafe || cashierData?.kaspiCafe || 0,
            cashier_wolt: savedShift?.wolt || cashierData?.wolt || 0,
            cashier_halyk: savedShift?.halyk || cashierData?.halyk || 0,
            cashier_kaspi: savedShift?.kaspi || 0,
            cashier_cash_bills: savedShift?.cashBills || cashierData?.cashBills || 0,
            cashier_cash_coins: savedShift?.cashCoins || cashierData?.cashCoins || 0,
            cashier_expenses: savedShift?.expenses || cashierData?.expenses || 0,
            cash_to_leave: savedShift?.cashToLeave || 15000,
            cashier_data_submitted: !!cashierData?.shiftDataSubmitted
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
