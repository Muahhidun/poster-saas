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
        const { salaries, poster_account_id } = body;

        if (!salaries || !Array.isArray(salaries)) {
            return NextResponse.json({ error: 'Salaries array is required' }, { status: 400 });
        }

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

        const results = [];

        // As per SPEC, these transactions go out of Account "Оставил в кассе" (ID=4 for Main, 5 for Cafe) 
        // We will default to 4 for Main, or passed in ID.
        const account_from_id = account.isPrimary ? 4 : 5;

        for (const salary of salaries) {
            // Category: Category 16 for Cashiers, 19 for Donermakers
            let category_id = 16;
            if (salary.role === 'Донерщик' || salary.role === 'Помощник') {
                category_id = 19;
            } else if (salary.role === 'Сушист') {
                category_id = 17; // Spec says Sushi=17
            }

            const transactionPayload = {
                type: 0, // 0 = Expense
                category_id: category_id,
                account_id: account_from_id,
                amount_from: salary.amount, // in KZT or tiyins? Poster API accepts KZT for amount_from/to
                amount_to: salary.amount,
                date: new Date().toISOString().replace('T', ' ').substring(0, 19),
                comment: `${salary.role} - ${salary.name}`
            };

            try {
                const res = await poster.createTransaction(transactionPayload);
                results.push({ ...salary, success: true, transaction_id: res.transaction_id });
            } catch (err: any) {
                results.push({ ...salary, success: false, error: err.message });
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error('Error creating salaries:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
