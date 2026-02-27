import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { date, cashier_count, assistant_start_time, poster_account_id } = body;

        if (!date || !cashier_count) {
            return NextResponse.json({ error: 'Date and cashier_count are required' }, { status: 400 });
        }

        // 1. Fetch Poster Account
        const accountCondition = poster_account_id
            ? { id: poster_account_id }
            : { isPrimary: true, organizationId: session.user.organizationId };

        const account = await prisma.posterAccount.findFirst({
            where: accountCondition
        });

        if (!account) {
            return NextResponse.json({ error: 'Poster account not found' }, { status: 404 });
        }

        const poster = new PosterClient(account.posterToken, account.posterBaseUrl);

        // Remove hyphens for API format YYYYMMDD
        const formattedDate = date.replace(/-/g, '');

        // 2. Fetch Dashboard Sales Data from Poster
        const dashSales = await poster.getDashTransactions(formattedDate, formattedDate);
        const transactions: any[] = dashSales || [];

        // Use logic from spec: Trade total is (payed_cash + payed_card) of closed orders (status 2)
        const closedOrders = transactions.filter(t => t.status === 2 || t.status === '2');

        let payed_cash = 0;
        let payed_card = 0;
        closedOrders.forEach(order => {
            payed_cash += parseInt(order.payed_cash || '0', 10);
            payed_card += parseInt(order.payed_card || '0', 10);
        });

        const trade_total_tiyins = payed_cash + payed_card;
        const trade_total = trade_total_tiyins / 100; // Expected to be in KZT

        // 3. Perform Calculations per spec 

        // Base constants
        const BASE_DONER_SALARY = 10000;
        const BASE_CASHIER_DAILY = 8000;
        const BASE_CASHIER_NIGHT_HOURLY = 1000;

        const RATE_CASHIER_TWO = 0.07; // 7% for 2 cashiers
        const RATE_CASHIER_THREE = 0.105; // 10.5% for 3 cashiers

        // Cashier Salary Logic
        let cashier_salary = 0;

        if (cashier_count === 2) {
            // Option 1: Base (8000) or 7% of trade, whichever is higher
            const percentage_salary = trade_total * RATE_CASHIER_TWO;
            cashier_salary = Math.max(BASE_CASHIER_DAILY, percentage_salary);

        } else if (cashier_count === 3) {
            // Option 2: Base (8000 + 1000/hr) or 10.5% of trade, whichever is higher
            // Night cashier gets 8000 + (hours * 1000). Max 12000.
            // For auto-calculate without explicit hours, spec says:
            // "If 3 cashiers: Total budget = max(20000, 10.5% of trade). Divide by 2.5."
            // Assuming average night cashier gets 12000, so base budget = 8000 + 8000 + 12000?
            // Actually spec: "Расчет: max(тройная ставка, 10.5%)"
            const percentage_salary = trade_total * RATE_CASHIER_THREE;

            // For now, let's assume total daily base for 3 people = 8000 + 8000 + 4000 (half night shift)
            // Or roughly 20000. Let's use 20000 base total.
            const total_pool = Math.max(20000, percentage_salary);
            cashier_salary = total_pool / 2.5; // Roughly 8000 if base.
        } else {
            // Fallback for 1 cashier
            cashier_salary = BASE_CASHIER_DAILY;
        }

        // Round to nearest 100
        cashier_salary = Math.round(cashier_salary / 100) * 100;


        // Donermakher / Kitchen Logic
        let doner_salary = BASE_DONER_SALARY;
        let assistant_salary = 0;

        // If trade > 350k, 1% bonus
        if (trade_total > 350000) {
            doner_salary += trade_total * 0.01;
        }
        doner_salary = Math.round(doner_salary / 100) * 100;

        // Form results
        return NextResponse.json({
            success: true,
            salaries: {
                cashier_salary,
                doner_salary,
                assistant_salary: assistant_salary || null
            },
            metrics: {
                trade_total,
                cashier_count
            }
        });

    } catch (error: any) {
        console.error('Error calculating salaries:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
