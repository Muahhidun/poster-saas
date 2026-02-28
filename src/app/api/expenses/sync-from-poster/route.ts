import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';
import { ExpenseSource } from '@prisma/client';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const orgId = session.user.organizationId;

        // Use today in Asia/Almaty logic per spec
        const dateObj = new Date();
        if (dateObj.getHours() < 6) dateObj.setDate(dateObj.getDate() - 1);
        const dateStr = dateObj.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD

        const startOfDay = new Date(`${dateObj.toISOString().split('T')[0]}T00:00:00.000Z`);
        const endOfDay = new Date(`${dateObj.toISOString().split('T')[0]}T23:59:59.999Z`);

        const posterAccounts = await prisma.posterAccount.findMany({
            where: { organizationId: orgId }
        });

        const existingDrafts = await prisma.expenseDraft.findMany({
            where: {
                organizationId: orgId,
                createdAt: { gte: startOfDay, lte: endOfDay }
            }
        });

        let synced = 0, updated = 0, skipped = 0, deleted = 0;
        const processedPosterTxnIds = new Set<string>();

        // Parallel processing of all accounts
        await Promise.all(posterAccounts.map(async (acc) => {
            try {
                const client = new PosterClient(acc.posterBaseUrl, acc.posterToken);

                const [transactions, accounts] = await Promise.all([
                    client.getTransactions(dateStr, dateStr),
                    client.getAccounts()
                ]);

                // Map finance accounts for fast lookup
                const accountMap = new Map();
                accounts.forEach((a: any) => accountMap.set(String(a.account_id), a));

                for (const txn of transactions) {
                    if (String(txn.type) === '2') continue; // skip transfers

                    const catName = (txn.category_name || '').toLowerCase();
                    if (catName.includes('перевод') || catName.includes('кассовые смены') || catName.includes('актуализац')) {
                        continue;
                    }

                    const accFromId = String(txn.account_id || txn.account_from_id || txn.account_from);
                    const compositeId = `${accFromId}_${txn.transaction_id}`;
                    processedPosterTxnIds.add(compositeId);

                    const rawAmount = Math.abs(parseFloat(txn.amount_from || txn.amount || '0')) / 100;
                    const description = txn.comment || txn.category_name || 'Неизвестно';

                    const isSupply = /поставка\s*[n#]\s*(\d+)/i.test(description);
                    if (isSupply) {
                        skipped++;
                        continue;
                    }

                    // Find existing draft
                    const existing = existingDrafts.find(d =>
                        d.posterTransactionId === compositeId ||
                        d.posterTransactionId === String(txn.transaction_id)
                    );

                    if (existing) {
                        // Update Logic
                        const oldPosterAmt = existing.posterAmount || 0;
                        let newAmountParam = Number(existing.amount);

                        let needsUpdate = false;
                        if (Math.abs(oldPosterAmt - rawAmount) >= 0.01) {
                            needsUpdate = true;
                            // If user hasn't manually tweaked amount yet, sync amount too
                            if (Math.abs(Number(existing.amount) - oldPosterAmt) < 0.01) {
                                newAmountParam = rawAmount;
                            }
                        }

                        if (existing.description !== description) {
                            needsUpdate = true;
                        }

                        if (needsUpdate) {
                            await prisma.expenseDraft.update({
                                where: { id: existing.id },
                                data: {
                                    posterAmount: rawAmount,
                                    amount: newAmountParam,
                                    description: description
                                }
                            });
                            updated++;
                        } else {
                            skipped++;
                        }
                    } else {
                        // Create new draft
                        const financeAcc = accountMap.get(accFromId);
                        const accName = (financeAcc?.account_name || financeAcc?.name || '').toLowerCase();

                        let source: ExpenseSource = ExpenseSource.CASH;
                        if (accName.includes('kaspi')) source = ExpenseSource.KASPI;
                        else if (accName.includes('халык') || accName.includes('halyk')) source = ExpenseSource.HALYK;

                        const isIncome = String(txn.type) === '1' || catName.includes('приход') || catName.includes('поступлен');

                        await prisma.expenseDraft.create({
                            data: {
                                organizationId: orgId,
                                amount: rawAmount,
                                posterAmount: rawAmount,
                                description: description,
                                expenseType: 'TRANSACTION',
                                category: txn.category_name,
                                source: source,
                                accountId: accFromId ? parseInt(accFromId) : null,
                                posterAccountId: acc.id,
                                posterTransactionId: compositeId,
                                isIncome: isIncome,
                                completionStatus: 'COMPLETED', // Came from Poster, so it's completed
                                status: 'pending' // Still visible in UI for auth check
                            }
                        });
                        synced++;
                    }
                }
            } catch (err) {
                console.error(`Error syncing account ${acc.accountName}`, err);
            }
        }));

        // Cleanup orphaned drafts
        // Only delete if they are COMPLETED, are from today, and weren't in the transactions loop (and not supply)
        // Note: The spec mentioned deleting 'pending' orphaned drafts
        const orphaned = existingDrafts.filter(d =>
            d.status === 'pending' &&
            d.posterTransactionId &&
            !d.posterTransactionId.startsWith('supply_') &&
            !processedPosterTxnIds.has(d.posterTransactionId) &&
            // Check if it's a composite ID we would have parsed
            d.posterTransactionId.includes('_')
        );

        if (orphaned.length > 0) {
            await prisma.expenseDraft.deleteMany({
                where: {
                    id: { in: orphaned.map(o => o.id) }
                }
            });
            deleted += orphaned.length;
        }

        return NextResponse.json({
            success: true,
            synced,
            updated,
            deleted,
            skipped,
            message: `Синхронизация: новых: ${synced}, обновлено: ${updated}, удалено: ${deleted}, без изменений: ${skipped}`
        });

    } catch (error: any) {
        console.error('POST /api/expenses/sync-from-poster Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
