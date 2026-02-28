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

        const body = await request.json();
        const draftIds: number[] = body.draft_ids;

        if (!draftIds || !Array.isArray(draftIds) || draftIds.length === 0) {
            return NextResponse.json({ error: 'No draft IDs provided' }, { status: 400 });
        }

        const drafts = await prisma.expenseDraft.findMany({
            where: {
                id: { in: draftIds },
                organizationId: session.user.organizationId
            }
        });

        if (drafts.length === 0) {
            return NextResponse.json({ error: 'Drafts not found' }, { status: 404 });
        }

        // We need PosterAccounts to initialize clients
        const posterAccounts = await prisma.posterAccount.findMany({
            where: { organizationId: session.user.organizationId }
        });

        const posterMap = new Map(posterAccounts.map(p => [p.id, p]));

        let createdCount = 0;
        const errors: string[] = [];

        for (const draft of drafts) {
            try {
                if (draft.completionStatus === 'COMPLETED') {
                    continue; // Already processed
                }

                // If no posterAccountId is defined, fallback to primary
                let pAccountId = draft.posterAccountId;
                if (!pAccountId) {
                    const primary = posterAccounts.find(pa => pa.isPrimary);
                    pAccountId = primary ? primary.id : posterAccounts[0].id;
                }

                const accountInfo = posterMap.get(pAccountId);
                if (!accountInfo) {
                    throw new Error(`Poster account not found for draft ${draft.id}`);
                }

                const client = new PosterClient(accountInfo.posterBaseUrl, accountInfo.posterToken);

                // Need finance accounts to match by source if accountId is missing
                let finalAccountId = draft.accountId;
                if (!finalAccountId) {
                    const financeAccounts: any[] = await client.getAccounts();

                    let matchedAcc = financeAccounts[0]; // fallback
                    const searchSource = draft.source;

                    for (const fa of financeAccounts) {
                        const name = (fa.account_name || fa.name || '').toLowerCase();
                        if (searchSource === ExpenseSource.KASPI && name.includes('kaspi')) {
                            matchedAcc = fa; break;
                        } else if (searchSource === ExpenseSource.HALYK && (name.includes('халык') || name.includes('halyk'))) {
                            matchedAcc = fa; break;
                        } else if (searchSource === ExpenseSource.CASH && (name.includes('закуп') || name.includes('оставил'))) {
                            matchedAcc = fa; break;
                        }
                    }

                    if (matchedAcc) {
                        finalAccountId = matchedAcc.account_id;
                    } else {
                        throw new Error(`No matching finance account found for source ${searchSource}`);
                    }
                }

                let finalCategoryId = 0;
                if (draft.category) {
                    const categories = await client.getCategories();
                    const foundCat = categories.find((c: any) =>
                        (c.category_name || c.name || '').toLowerCase() === draft.category?.toLowerCase()
                    );
                    if (foundCat) finalCategoryId = parseInt(foundCat.category_id || foundCat.id);
                }

                // API transactionType: 0=expense, 1=income
                const txnType = draft.isIncome ? 1 : 0;

                // Format date for Poster createTransaction API
                const timezoneOffset = 5 * 60; // Asia/Almaty is UTC+5
                const localDate = new Date(draft.createdAt.getTime() + timezoneOffset * 60000);
                const apiDate = localDate.toISOString().replace('T', ' ').substring(0, 19);

                // Execute action
                const response = await client.createTransaction({
                    type: txnType,
                    category: finalCategoryId,
                    account_from: finalAccountId,
                    amount: Math.abs(Number(draft.amount)), // in KZT
                    user_id: accountInfo.posterUserId,
                    date: apiDate,
                    comment: draft.description
                });

                const newTxnId = response;
                const compositeId = `${finalAccountId}_${newTxnId}`;

                // Mark successful
                await prisma.expenseDraft.update({
                    where: { id: draft.id },
                    data: {
                        completionStatus: 'COMPLETED',
                        posterTransactionId: compositeId,
                        processedAt: new Date()
                    }
                });
                createdCount++;

            } catch (err: any) {
                console.error(`Error processing draft ${draft.id}:`, err);
                errors.push(`Draft ${draft.id}: ${err.message}`);
            }
        }

        return NextResponse.json({
            success: true,
            created: createdCount,
            errors,
            message: `Создано транзакций: ${createdCount}`
        });

    } catch (error: any) {
        console.error('POST /api/expenses/process Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
