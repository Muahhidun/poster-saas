import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';

const POSTER_CATEGORIES_MAP: Record<string, string> = {
    'book_category_action_actualization': 'Актуализация',
    'book_category_action_banking_services': 'Банковские услуги и комиссии',
    'book_category_action_household_expenses': 'Хозяйственные расходы',
    'book_category_action_labour_cost': 'Зарплата',
    'book_category_action_marketing': 'Маркетинг',
    'book_category_action_rent': 'Аренда',
    'book_category_action_supplies': 'Поставки',
    'book_category_action_taxes': 'Налоги',
    'book_category_action_taxes_on_wage': 'Налоги с ЗП',
    'book_category_action_encashment': 'Инкассация',
    'book_category_action_withdraw_cash': 'Изъятие наличности',
    'book_category_action_deposit_cash': 'Внесение наличности'
};

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accounts = await prisma.posterAccount.findMany({
            where: {
                organizationId: session.user.organizationId
            }
        });

        if (!accounts || accounts.length === 0) {
            return NextResponse.json({ error: 'No Poster accounts found' }, { status: 404 });
        }

        const allCategories: any[] = [];
        const allFinanceAccounts: any[] = [];
        const posterAccountsMap: any[] = [];

        for (const account of accounts) {
            posterAccountsMap.push({
                id: account.id,
                account_name: account.accountName
            });

            // If we have local caches, we could use them, but fetching fresh is safer for config
            const poster = new PosterClient(account.posterToken, account.posterBaseUrl);

            try {
                const cats = await poster.getCategories();
                if (cats && Array.isArray(cats)) {
                    cats.forEach((c: any) => {
                        const rawName = c.name || c.category_name;
                        const mappedName = POSTER_CATEGORIES_MAP[rawName] || rawName;
                        allCategories.push({
                            id: c.category_id,
                            name: mappedName,
                            category_name: mappedName,
                            account_name: account.accountName,
                            poster_account_id: account.id
                        });
                    });
                }

                // 2. Fetch Finance Accounts
                const finAccs = await poster.getAccounts();
                if (finAccs && Array.isArray(finAccs)) {
                    finAccs.forEach((a: any) => {
                        allFinanceAccounts.push({
                            id: a.account_id,
                            name: a.account_name,
                            account_name: account.accountName,
                            poster_account_id: account.id
                        });
                    });
                }
            } catch (err) {
                console.error(`Error fetching poster data for account ${account.accountName}:`, err);
                // Continue with other accounts even if one fails
            }
        }

        return NextResponse.json({
            success: true,
            categories: allCategories,
            finance_accounts: allFinanceAccounts,
            poster_accounts: posterAccountsMap
        });

    } catch (error: any) {
        console.error('Error fetching poster data:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
