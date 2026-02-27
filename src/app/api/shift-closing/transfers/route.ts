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
        const { date, collection, wolt, halyk, cashless_diff, is_cafe, poster_account_id } = body;

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
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
        const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

        // Account Maps based on Spec
        // Main: {'kaspi': 1, 'inkassacia': 2, 'cash_left': 4, 'halyk': 2, 'wolt': ?}
        // Cafe: {'kaspi': 1, 'inkassacia': 2, 'cash_left': 5, 'wolt': 7}
        const kaspi_acc = 1;
        const inkassacia_acc = 2;
        const cash_left_acc = is_cafe ? 5 : 4;
        const halyk_acc = 2; // In Main, spec says Halyk goes to 2
        const wolt_acc = is_cafe ? 7 : 8; // Assuming 8 for Main Wolt if not specified, 7 for Cafe.

        const createTransfer = async (from: number, to: number, amount: number, comment: string) => {
            if (amount <= 0) return null;

            const payload = {
                type: 2, // 2 = Transfer
                account_id: from,
                account_to_id: to,
                amount_from: amount,
                amount_to: amount,
                date: dateStr,
                comment: comment
            };

            try {
                const res = await poster.createTransaction(payload);
                return { comment, success: true, transaction_id: res.transaction_id, amount };
            } catch (err: any) {
                return { comment, success: false, error: err.message, amount };
            }
        };

        // 1. Инкассация → Оставил
        if (collection > 0) {
            const res = await createTransfer(inkassacia_acc, cash_left_acc, collection, 'Инкассация');
            if (res) results.push(res);
        }

        // 2. Каспий → Вольт
        if (wolt > 0) {
            const res = await createTransfer(kaspi_acc, wolt_acc, wolt, 'Вывод Wolt');
            if (res) results.push(res);
        }

        // 3. Каспий → Халык (Main Only)
        if (!is_cafe && halyk > 0) {
            const res = await createTransfer(kaspi_acc, halyk_acc, halyk, 'Вывод Halyk');
            if (res) results.push(res);
        }

        // 4. Корректировка безнала
        if (Math.abs(cashless_diff) > 0.5) {
            if (cashless_diff < 0) {
                // Недостача: Каспий → Оставил
                const res = await createTransfer(kaspi_acc, cash_left_acc, Math.abs(cashless_diff), 'Корректировка безнала (Недостача)');
                if (res) results.push(res);
            } else {
                // Излишек: Оставил → Каспий
                const res = await createTransfer(cash_left_acc, kaspi_acc, Math.abs(cashless_diff), 'Корректировка безнала (Излишек)');
                if (res) results.push(res);
            }
        }

        return NextResponse.json({ success: true, results });

    } catch (error: any) {
        console.error('Error executing transfers:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
