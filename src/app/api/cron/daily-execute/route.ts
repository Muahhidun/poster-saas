import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';

// Security: this endpoint should only be triggered by an authorized CRON service
// requiring a matching CRON_SECRET from the environment variables.

export async function GET(request: Request) {
    try {
        const authHeader = request.headers.get('authorization');
        const expectedSecret = process.env.CRON_SECRET;

        // Basic security check to ensure it's not publicly triggerable
        // If CRON_SECRET is set, require it.
        if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
            return NextResponse.json({ error: 'Unauthorized CRON Request' }, { status: 401 });
        }

        const dateStr = new Date().toISOString().substring(0, 10); // YYYY-MM-DD
        const dateObj = new Date(dateStr);

        // Fetch all active configurations across all organizations
        const activeConfigs = await prisma.dailyTransactionConfig.findMany({
            where: {
                isEnabled: true,
                amount: { gt: 1 } // Spec: Skip if amount is 0 or 1
            },
            include: {
                organization: {
                    include: {
                        posterAccounts: true
                    }
                }
            }
        });

        const results = [];

        // Group by organization
        const orgConfigs = activeConfigs.reduce((acc, config) => {
            if (!acc[config.organizationId]) {
                acc[config.organizationId] = { org: config.organization, configs: [] };
            }
            acc[config.organizationId].configs.push(config);
            return acc;
        }, {} as Record<string, { org: any, configs: any[] }>);

        for (const [orgId, orgData] of Object.entries(orgConfigs)) {
            // Check if we already ran for this org today to prevent duplicates
            const existingLog = await prisma.dailyTransactionLog.findFirst({
                where: {
                    organizationId: orgId,
                    date: dateObj
                }
            });

            if (existingLog) {
                results.push({ orgId, status: 'skipped', reason: 'Already executed today' });
                continue; // Skip this org
            }

            let successCount = 0;
            // Iterate over each organization's configured Poster accounts if needed.
            // For MVP, if config points to a specific account Name, we find the matching account token.
            // Assume single Primary account if accountName not explicitly matched.
            const primaryAccount = orgData.org.posterAccounts.find((a: any) => a.isPrimary);

            for (const config of orgData.configs) {
                // Find correct account (fallback to primary)
                const targetAccount = orgData.org.posterAccounts.find((a: any) => a.accountName === config.accountName) || primaryAccount;

                if (!targetAccount) {
                    results.push({ configId: config.id, status: 'failed', error: 'No poster account found' });
                    continue;
                }

                const poster = new PosterClient(targetAccount.posterToken, targetAccount.posterBaseUrl);

                const payload = {
                    type: config.transactionType, // 0 = Expense, 2 = Transfer
                    category_id: config.transactionType === 0 ? config.categoryId : undefined,
                    account_id: config.accountFromId,
                    account_to_id: config.transactionType === 2 ? config.accountToId : undefined,
                    amount_from: config.amount,
                    amount_to: config.amount,
                    date: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    comment: config.comment
                };

                // Remove undefined keys
                Object.keys(payload).forEach(key => (payload as any)[key] === undefined && delete (payload as any)[key]);

                try {
                    const res = await poster.createTransaction(payload);
                    results.push({ configId: config.id, status: 'success', transaction_id: res.transaction_id });
                    successCount++;
                } catch (err: any) {
                    results.push({ configId: config.id, status: 'failed', error: err.message });
                }
            }

            // Log execution to prevent double charge
            if (successCount > 0) {
                await prisma.dailyTransactionLog.create({
                    data: {
                        organizationId: orgId,
                        date: dateObj,
                        count: successCount
                    }
                });
            }
        }

        return NextResponse.json({ success: true, processed: results.length, details: results });

    } catch (error: any) {
        console.error('Error in daily CRON execution:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
