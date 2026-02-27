import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // Required inputs
        const requiredFields = [
            'date', 'wolt', 'halyk', 'kaspi', 'kaspi_cafe',
            'cash_bills', 'cash_coins', 'shift_start', 'expenses', 'cash_to_leave',
            'poster_trade', 'poster_bonus', 'poster_card'
        ];

        for (const field of requiredFields) {
            if (body[field] === undefined) {
                return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 });
            }
        }

        // Parse inputs as numbers (assuming they come in as KZT, not tiyins)
        const wolt = Number(body.wolt);
        const halyk = Number(body.halyk);
        const kaspi = Number(body.kaspi);
        const kaspi_cafe = Number(body.kaspi_cafe);
        const cash_bills = Number(body.cash_bills);
        const cash_coins = Number(body.cash_coins);

        const shift_start = Number(body.shift_start);
        const expenses = Number(body.expenses);
        const cash_to_leave = Number(body.cash_to_leave);

        const poster_trade = Number(body.poster_trade);
        const poster_bonus = Number(body.poster_bonus);
        const poster_card = Number(body.poster_card);

        // --- Core Calculations per specification ---

        // 1. Безнал факт = Wolt + Halyk + (Kaspi - Kaspi от Cafe)
        const fact_cashless = wolt + halyk + (kaspi - kaspi_cafe);

        // 2. Фактический = безнал + наличка
        const fact_total = fact_cashless + cash_bills + cash_coins;

        // 3. Итого фактический = Фактический - Смена + Расходы
        const fact_adjusted = fact_total - shift_start + expenses;

        // 4. Итого Poster = Торговля - Бонусы
        const poster_total = poster_trade - poster_bonus;

        // 5. ИТОГО ДЕНЬ = Итого фактический - Итого Poster
        const day_result = fact_adjusted - poster_total; // >0 излишек, <0 недостача

        // 6. Смена оставили = оставить бумажными + мелочь
        const shift_left = cash_to_leave + cash_coins;

        // 7. Разница безнала = факт безнал - Poster карта
        const cashless_diff = fact_cashless - poster_card;

        // 8. Сбор (Инкассация) = Оставить сегодня на завтра (shift_left) - Вчерашний конец смены (shift_start) + Наличные из расчёта
        // Note: calculation algorithm assumes "cash_from_total = fact_total - fact_cashless" equivalent to (cash_bills + cash_coins)
        const collection = shift_left - shift_start + cash_bills + cash_coins;

        const result = {
            success: true,
            calculations: {
                fact_cashless,
                fact_total,
                fact_adjusted,
                poster_total,
                day_result,
                shift_left,
                cashless_diff,
                collection
            }
        };

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error calculating shift totals:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
