import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';
import { ExpenseType, ExpenseSource, CompletionStatus } from '@prisma/client';

// Simple in-memory cache for Serverless environments (will reset on cold start, but better than nothing)
const posterCache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date'); // YYYY-MM-DD
        const statusStr = searchParams.get('status') || 'pending';

        if (!dateStr) {
            return NextResponse.json({ error: 'Date is required (YYYY-MM-DD)' }, { status: 400 });
        }

        const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
        const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

        // 1. Fetch Drafts from DB
        const draftQuery: any = {
            organizationId: session.user.organizationId,
            createdAt: { gte: startOfDay, lte: endOfDay }
        };
        if (statusStr !== 'all') {
            draftQuery.status = statusStr;
        }

        const drafts = await prisma.expenseDraft.findMany({
            where: draftQuery,
            orderBy: { createdAt: 'asc' }
        });

        // 2. Fetch Poster Accounts
        const posterAccounts = await prisma.posterAccount.findMany({
            where: { organizationId: session.user.organizationId }
        });

        const categories: any[] = [];
        const accounts: any[] = [];
        const posterTransactions: any[] = [];
        const accountTotals = { kaspi: 0, halyk: 0, cash: 0 };

        // 3. Parallel fetch from all Poster Accounts
        const posterDate = dateStr.replace(/-/g, ''); // YYYYMMDD

        await Promise.all(posterAccounts.map(async (acc) => {
            const client = new PosterClient(acc.posterBaseUrl, acc.posterToken);
            const cacheKey = `cats_accs_${acc.id}`;
            let cached = posterCache.get(cacheKey);

            let accData: any[] = [];
            let catData: any[] = [];

            if (cached && cached.expiry > Date.now()) {
                accData = cached.data.accounts;
                catData = cached.data.categories;
            } else {
                try {
                    const [fetchedAccs, fetchedCats] = await Promise.all([
                        client.getAccounts(),
                        client.getCategories()
                    ]);
                    accData = fetchedAccs;
                    catData = fetchedCats;

                    posterCache.set(cacheKey, {
                        data: { accounts: fetchedAccs, categories: fetchedCats },
                        expiry: Date.now() + CACHE_TTL
                    });
                } catch (e) {
                    console.error(`Failed to fetch poster data for ${acc.accountName}`, e);
                }
            }

            // Append account name to categories and accounts for UI context
            catData.forEach((c: any) => {
                categories.push({ ...c, poster_account_id: acc.id, poster_account_name: acc.accountName });
            });

            accData.forEach((a: any) => {
                accounts.push({ ...a, poster_account_id: acc.id, poster_account_name: acc.accountName });

                // Calculate account totals
                const name = (a.account_name || a.name || '').toLowerCase();
                const balance = parseFloat(a.balance || '0') / 100; // tiyins to KZT

                if (name.includes('kaspi')) accountTotals.kaspi += balance;
                else if (name.includes('халык') || name.includes('halyk')) accountTotals.halyk += balance;
                else if (name.includes('оставил')) accountTotals.cash += balance;
            });

            // Always fresh transactions
            try {
                const txns = await client.getTransactions(posterDate, posterDate);
                txns.forEach((t: any) => {
                    posterTransactions.push({ ...t, poster_account_id: acc.id, poster_account_name: acc.accountName });
                });
            } catch (e) {
                console.error(`Failed to fetch transactions for ${acc.accountName}`, e);
            }
        }));

        return NextResponse.json({
            success: true,
            drafts,
            categories,
            accounts,
            poster_accounts: posterAccounts.map(pa => ({ id: pa.id, name: pa.accountName, is_primary: pa.isPrimary })),
            poster_transactions: posterTransactions,
            account_totals: accountTotals
        });

    } catch (error: any) {
        console.error('GET /api/expenses Error:', error);
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

        // Find default primary account if none provided
        let posterAccountId = body.poster_account_id;
        if (!posterAccountId) {
            const primaryAcc = await prisma.posterAccount.findFirst({
                where: { organizationId: session.user.organizationId, isPrimary: true }
            });
            if (primaryAcc) posterAccountId = primaryAcc.id;
        }

        const draft = await prisma.expenseDraft.create({
            data: {
                organizationId: session.user.organizationId,
                amount: body.amount,
                posterAmount: body.amount,
                description: body.description,
                expenseType: body.expense_type as ExpenseType || 'TRANSACTION',
                category: body.category,
                source: body.source as ExpenseSource || 'CASH',
                accountId: body.account_id ? parseInt(body.account_id) : null,
                posterAccountId: posterAccountId ? parseInt(posterAccountId) : null,
                isIncome: body.is_income === 1 || body.is_income === true,
                completionStatus: 'PENDING',
                status: 'pending'
            }
        });

        return NextResponse.json({ success: true, id: draft.id, draft });

    } catch (error: any) {
        console.error('POST /api/expenses Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
