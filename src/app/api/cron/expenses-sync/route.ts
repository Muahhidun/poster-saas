import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';
import { ExpenseSource } from '@prisma/client';

// This endpoint should be protected by a cron secret in production
// E.g. ?key=SECRET_CRON_KEY

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        // Basic protection check (you can configure CRON_SECRET in Railway)
        const secret = process.env.CRON_SECRET || 'dev-secret';
        if (searchParams.get('key') !== secret && process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'Unauthorized CRON endpoint' }, { status: 401 });
        }

        const dateObj = new Date();
        if (dateObj.getHours() < 6) dateObj.setDate(dateObj.getDate() - 1);
        const dateStr = dateObj.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

        const startOfDay = new Date(`${dateObj.toISOString().split('T')[0]}T00:00:00.000Z`);
        const endOfDay = new Date(`${dateObj.toISOString().split('T')[0]}T23:59:59.999Z`);

        // Get ALL PosterAccounts globally from all organizations
        const allPosterAccounts = await prisma.posterAccount.findMany({
            include: { organization: true }
        });

        const orgIds = Array.from(new Set(allPosterAccounts.map(pa => pa.organizationId)));

        // Pre-fetch all drafts for today to do merges efficiently without DB spam
        const allExistingDrafts = await prisma.expenseDraft.findMany({
            where: {
                organizationId: { in: orgIds },
                createdAt: { gte: startOfDay, lte: endOfDay }
            }
        });

        let totalSynced = 0, totalUpdated = 0, totalDeleted = 0;
        const processedTxnIds = new Set<string>();

        // We process sequentially or chunks depending on the scale to not overwhelm connections,
        // but Promise.all is fine for a few tenants.
        await Promise.all(allPosterAccounts.map(async (acc) => {
            try {
                if (!acc.posterToken) return;
                const client = new PosterClient(acc.posterBaseUrl, acc.posterToken);

                const [transactions, accounts] = await Promise.all([
                    client.getTransactions(dateStr, dateStr),
                    client.getAccounts()
                ]);

                if (!transactions || !Array.isArray(transactions)) return;

                const accountMap = new Map();
                if (Array.isArray(accounts)) {
                    accounts.forEach((a: any) => accountMap.set(String(a.account_id), a));
                }

                const orgDrafts = allExistingDrafts.filter(d => d.organizationId === acc.organizationId);

                for (const txn of transactions) {
                    if (String(txn.type) === '2') continue; // transfers

                    const catName = (txn.category_name || '').toLowerCase();
                    if (catName.includes('перевод') || catName.includes('кассовые смены') || catName.includes('актуализац')) {
                        continue;
                    }

                    const accFromId = String(txn.account_from_id || txn.account_from);
                    const compositeId = `${accFromId}_${txn.transaction_id}`;
                    processedTxnIds.add(compositeId);

                    const rawAmount = Math.abs(parseFloat(txn.amount_from || txn.amount || '0')) / 100;
                    const description = txn.comment || txn.category_name || 'Неизвестно';

                    const isSupply = /поставка\s*[n#]\s*(\d+)/i.test(description);
                    if (isSupply) continue;

                    const existing = orgDrafts.find(d =>
                        d.posterTransactionId === compositeId ||
                        d.posterTransactionId === String(txn.transaction_id)
                    );

                    if (existing) {
                        const oldPosterAmt = existing.posterAmount || 0;
                        let newAmountParam = Number(existing.amount);
                        let needsUpdate = false;

                        if (Math.abs(oldPosterAmt - rawAmount) >= 0.01) {
                            needsUpdate = true;
                            if (Math.abs(Number(existing.amount) - oldPosterAmt) < 0.01) {
                                newAmountParam = rawAmount;
                            }
                        }

                        if (existing.description !== description) needsUpdate = true;

                        if (needsUpdate) {
                            await prisma.expenseDraft.update({
                                where: { id: existing.id },
                                data: {
                                    posterAmount: rawAmount,
                                    amount: newAmountParam,
                                    description
                                }
                            });
                            totalUpdated++;
                        }
                    } else {
                        const financeAcc = accountMap.get(accFromId);
                        const accName = (financeAcc?.account_name || financeAcc?.name || '').toLowerCase();

                        let source: ExpenseSource = ExpenseSource.CASH;
                        if (accName.includes('kaspi')) source = ExpenseSource.KASPI;
                        else if (accName.includes('халык') || accName.includes('halyk')) source = ExpenseSource.HALYK;

                        const isIncome = String(txn.type) === '1' || catName.includes('приход') || catName.includes('поступлен');

                        await prisma.expenseDraft.create({
                            data: {
                                organizationId: acc.organizationId,
                                amount: rawAmount,
                                posterAmount: rawAmount,
                                description,
                                expenseType: 'TRANSACTION',
                                category: txn.category_name,
                                source,
                                accountId: accFromId ? parseInt(accFromId) : null,
                                posterAccountId: acc.id,
                                posterTransactionId: compositeId,
                                isIncome,
                                completionStatus: 'COMPLETED',
                                status: 'pending'
                            }
                        });
                        totalSynced++;
                    }
                }
            } catch (err) {
                console.error(`Cron Sync Error for account ${acc.accountName}`, err);
            }
        }));

        // Clean orphaned global drafts
        const orphaned = allExistingDrafts.filter(d =>
            d.status === 'pending' &&
            d.posterTransactionId &&
            !d.posterTransactionId.startsWith('supply_') &&
            !processedTxnIds.has(d.posterTransactionId) &&
            d.posterTransactionId.includes('_')
        );

        if (orphaned.length > 0) {
            await prisma.expenseDraft.deleteMany({
                where: { id: { in: orphaned.map(o => o.id) } }
            });
            totalDeleted += orphaned.length;
        }

        return NextResponse.json({
            success: true,
            totalSynced,
            totalUpdated,
            totalDeleted,
            message: `Global Background Sync Completed`
        });

    } catch (error: any) {
        console.error('CRON /api/cron/expenses-sync Error:', error);
        return NextResponse.json({ error: error.message || 'Internal CRON Error' }, { status: 500 });
    }
}
