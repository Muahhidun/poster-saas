import { NextResponse } from 'next/server';
import { Client } from 'pg';
import { prisma } from '@/lib/prisma';

export async function GET() {
    console.log('Starting API Migration endpoint...');

    // Legacy DB URL
    const legacyUrl = 'postgresql://postgres:lFHWqBzMlKJxDLgSUnOsuUNSkJCwCxfu@ballast.proxy.rlwy.net:42152/railway';
    const sourceDb = new Client({ connectionString: legacyUrl });

    try {
        await sourceDb.connect();

        // 1. Migrate Users -> Organizations
        console.log('Migrating Organizations...');
        const usersRes = await sourceDb.query('SELECT * FROM users');
        const orgMap: Record<string, string> = {}; // mapping telegram_user_id -> organization.id

        for (const row of usersRes.rows) {
            let org = await prisma.organization.findUnique({
                where: { legacyTelegramId: BigInt(row.telegram_user_id) }
            });

            if (!org) {
                org = await prisma.organization.create({
                    data: {
                        name: `Legacy Org ${row.telegram_user_id}`,
                        legacyTelegramId: BigInt(row.telegram_user_id),
                        posterToken: row.poster_token,
                        posterUserId: row.poster_user_id,
                        posterBaseUrl: row.poster_base_url,
                        subscriptionStatus: row.subscription_status || 'trial',
                        subscriptionExpires: row.subscription_expires_at,
                        createdAt: row.created_at || new Date(),
                        updatedAt: row.updated_at || new Date()
                    }
                });
            }
            orgMap[row.telegram_user_id] = org.id;
        }

        // Helper
        const getOrgId = (telegramId: string) => orgMap[telegramId];

        // 2. Web Users -> User
        console.log('Migrating Web Users...');
        const webUsersRes = await sourceDb.query('SELECT * FROM web_users');
        for (const row of webUsersRes.rows) {
            const orgId = getOrgId(row.telegram_user_id);
            if (!orgId) continue;

            const exists = await prisma.user.findUnique({ where: { username: row.username } });
            if (!exists) {
                await prisma.user.create({
                    data: {
                        organizationId: orgId,
                        username: row.username,
                        passwordHash: row.password_hash,
                        role: row.role?.toUpperCase() === 'WEB_ADMIN' ? 'ADMIN' : (row.role?.toUpperCase() === 'WEB_CASHIER' ? 'CASHIER' : 'OWNER'),
                        label: row.label,
                        posterAccountId: row.poster_account_id,
                        isActive: row.is_active,
                        lastLogin: row.last_login,
                        createdAt: row.created_at || new Date()
                    }
                });
            }
        }

        // 3. Poster Accounts
        console.log('Migrating Poster Accounts...');
        const posterAccs = await sourceDb.query('SELECT * FROM poster_accounts');
        for (const row of posterAccs.rows) {
            const orgId = getOrgId(row.telegram_user_id);
            if (!orgId) continue;

            await prisma.posterAccount.upsert({
                where: { organizationId_accountName: { organizationId: orgId, accountName: row.account_name } },
                update: {},
                create: {
                    organizationId: orgId,
                    accountName: row.account_name,
                    posterToken: row.poster_token,
                    posterUserId: row.poster_user_id,
                    posterBaseUrl: row.poster_base_url,
                    isPrimary: row.is_primary,
                    createdAt: row.created_at || new Date(),
                    updatedAt: row.updated_at || new Date()
                }
            });
        }

        // 5. Daily Transaction Configs
        console.log('Migrating Daily Transactions Configs...');
        const dailyTxs = await sourceDb.query('SELECT * FROM daily_transactions_config');
        for (const row of dailyTxs.rows) {
            const orgId = getOrgId(row.telegram_user_id);
            if (!orgId) continue;

            // Only insert if missing or clear approach. Let's just create them for MVP.
            await prisma.dailyTransactionConfig.create({
                data: {
                    organizationId: orgId,
                    accountName: row.account_name || 'Main',
                    transactionType: row.transaction_type,
                    categoryId: row.category_id,
                    categoryName: row.category_name,
                    accountFromId: row.account_from_id,
                    accountFromName: row.account_from_name,
                    accountToId: row.account_to_id,
                    accountToName: row.account_to_name,
                    amount: row.amount,
                    comment: String(row.comment || ''),
                    isEnabled: row.is_enabled === 1,
                    sortOrder: row.sort_order || 0,
                    createdAt: row.created_at || new Date(),
                    updatedAt: row.updated_at || new Date()
                }
            });
        }

        return NextResponse.json({ success: true, message: 'Migration complete' });

    } catch (error: any) {
        console.error('Migration failed:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    } finally {
        await sourceDb.end();
    }
}
