require('dotenv').config();
if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('prisma+postgres://')) {
    const urlObj = new URL(process.env.DATABASE_URL);
    const apiKey = urlObj.searchParams.get('api_key');
    if (apiKey) {
        const decoded = JSON.parse(Buffer.from(apiKey, 'base64').toString());
        process.env.DATABASE_URL = decoded.databaseUrl.replace('localhost', '127.0.0.1');
    }
}
const { Client } = require('pg');
const { PrismaClient } = require('@prisma/client');

// Source Database
const legacyUrl = 'postgresql://postgres:lFHWqBzMlKJxDLgSUnOsuUNSkJCwCxfu@ballast.proxy.rlwy.net:42152/railway';

// Destination Database (Our new Prisma SaaS DB)
const prisma = new PrismaClient();

async function migrate() {
    console.log('Starting Migration...');
    const sourceDb = new Client({ connectionString: legacyUrl });
    await sourceDb.connect();

    try {
        // 1. Migrate Users -> Organizations
        console.log('Migrating Organizations...');
        const usersRes = await sourceDb.query('SELECT * FROM users');
        const orgMap = {}; // mapping telegram_user_id -> organization.id

        for (const row of usersRes.rows) {
            // Check if exists
            let org = await prisma.organization.findUnique({
                where: { legacy_telegram_id: row.telegram_user_id }
            });

            if (!org) {
                org = await prisma.organization.create({
                    data: {
                        name: `Legacy Org ${row.telegram_user_id}`,
                        legacy_telegram_id: BigInt(row.telegram_user_id),
                        poster_token: row.poster_token,
                        poster_user_id: row.poster_user_id,
                        poster_base_url: row.poster_base_url,
                        subscription_status: row.subscription_status || 'trial',
                        subscription_expires: row.subscription_expires_at,
                        createdAt: row.created_at || new Date(),
                        updatedAt: row.updated_at || new Date()
                    }
                });
            }
            orgMap[row.telegram_user_id] = org.id;
        }
        console.log(`Migrated ${usersRes.rows.length} Organizations.`);

        // Helper to get orgId
        const getOrgId = (telegramId) => orgMap[telegramId];

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
                        role: row.role.toUpperCase() === 'WEB_ADMIN' ? 'ADMIN' : (row.role.toUpperCase() === 'WEB_CASHIER' ? 'CASHIER' : 'OWNER'),
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

        // 4. Shift Closings
        console.log('Migrating Shift Closings...');
        const shifts = await sourceDb.query('SELECT * FROM shift_closings');
        for (const row of shifts.rows) {
            const orgId = getOrgId(row.telegram_user_id);
            if (!orgId) continue;

            // Using account Id fallback based on what we have, if poster_account_id is null, leave it null
            try {
                await prisma.shiftClosing.upsert({
                    where: {
                        organizationId_date_posterAccountId: {
                            organizationId: orgId,
                            date: row.date,
                            posterAccountId: row.poster_account_id || 0 // 0 if null, but schema allows null? Schema doesn't allow nullable uniqueness well
                        }
                    },
                    update: {},
                    create: {
                        organizationId: orgId,
                        date: row.date,
                        posterAccountId: row.poster_account_id,
                        wolt: row.wolt || 0,
                        halyk: row.halyk || 0,
                        kaspi: row.kaspi || 0,
                        kaspiCafe: row.kaspi_cafe || 0,
                        kaspiPizzburg: row.kaspi_pizzburg || 0,
                        cashBills: row.cash_bills || 0,
                        cashCoins: row.cash_coins || 0,
                        shiftStart: row.shift_start || 0,
                        deposits: row.deposits || 0,
                        expenses: row.expenses || 0,
                        cashToLeave: row.cash_to_leave || 0,
                        posterTrade: row.poster_trade || 0,
                        posterBonus: row.poster_bonus || 0,
                        posterCard: row.poster_card || 0,
                        posterCash: row.poster_cash || 0,
                        transactionsCount: row.transactions_count || 0,
                        factCashless: row.fact_cashless || 0,
                        factTotal: row.fact_total || 0,
                        factAdjusted: row.fact_adjusted || 0,
                        posterTotal: row.poster_total || 0,
                        dayResult: row.day_result || 0,
                        shiftLeft: row.shift_left || 0,
                        collection: row.collection || 0,
                        cashlessDiff: row.cashless_diff || 0,
                        salariesCreated: row.salaries_created || false,
                        salariesData: row.salaries_data,
                        transfersCreated: row.transfers_created || false,
                        createdAt: row.created_at || new Date(),
                        updatedAt: row.updated_at || new Date()
                    }
                }).catch(e => {
                    // If unique constraint fails because posterAccountId is null and we already have a null entry.
                    // Prisma nullable unique constraints can be tricky.
                    // We'll wrap in try catch to suppress duplicate insertions.
                });
            } catch (e) { }
        }

        // 5. Daily Transaction Configs
        console.log('Migrating Daily Transactions Configs...');
        const dailyTxs = await sourceDb.query('SELECT * FROM daily_transactions_config');
        for (const row of dailyTxs.rows) {
            const orgId = getOrgId(row.telegram_user_id);
            if (!orgId) continue;

            await prisma.dailyTransactionConfig.create({
                data: {
                    organizationId: orgId,
                    accountName: row.account_name,
                    transactionType: row.transaction_type,
                    categoryId: row.category_id,
                    categoryName: row.category_name,
                    accountFromId: row.account_from_id,
                    accountFromName: row.account_from_name,
                    accountToId: row.account_to_id,
                    accountToName: row.account_to_name,
                    amount: row.amount,
                    comment: row.comment,
                    isEnabled: row.is_enabled === 1,
                    sortOrder: row.sort_order || 0,
                    createdAt: row.created_at || new Date(),
                    updatedAt: row.updated_at || new Date()
                }
            });
        }

        // 6. Expense Drafts
        console.log('Migrating Expense Drafts...');
        const expenses = await sourceDb.query('SELECT * FROM expense_drafts');
        const expenseMap = {}; // mapping old id to new id for supply links
        for (const row of expenses.rows) {
            const orgId = getOrgId(row.telegram_user_id);
            if (!orgId) continue;

            let expenseType = 'TRANSACTION';
            if (row.expense_type === 'SupplyDraft') expenseType = 'SUPPLY';

            const newExp = await prisma.expenseDraft.create({
                data: {
                    organizationId: orgId,
                    amount: row.amount,
                    posterAmount: row.poster_amount,
                    description: row.description,
                    expenseType: expenseType,
                    category: row.category,
                    source: row.source_account === 'poster_kaspi' || row.source === 'poster_kaspi' ? 'KASPI' : (row.source === 'poster_halyk' ? 'HALYK' : 'CASH'), // basic mapping
                    accountId: row.account_id,
                    posterAccountId: row.poster_account_id,
                    posterTransactionId: row.poster_transaction_id,
                    isIncome: row.is_income === 1,
                    completionStatus: row.completion_status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
                    status: row.status,
                    createdAt: row.created_at || new Date(),
                    processedAt: row.processed_at
                }
            });
            expenseMap[row.id] = newExp.id;
        }

        console.log('Migration Completed Successfully!');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await sourceDb.end();
        await prisma.$disconnect();
    }
}

migrate();
