import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ExpenseSource } from '@prisma/client';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const dateStr = searchParams.get('date');

        if (!dateStr) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
        const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

        const expenses = await prisma.expenseDraft.findMany({
            where: {
                organizationId: session.user.organizationId,
                createdAt: { gte: startOfDay, lte: endOfDay }
            },
            orderBy: { createdAt: 'desc' }
        });

        const reconciliations = await prisma.shiftReconciliation.findMany({
            where: {
                organizationId: session.user.organizationId,
                date: startOfDay
            }
        });

        // Grouping
        const cashExps = expenses.filter(e => e.source === ExpenseSource.CASH);
        const kaspiExps = expenses.filter(e => e.source === ExpenseSource.KASPI);
        const halykExps = expenses.filter(e => e.source === ExpenseSource.HALYK);

        // Helper
        const buildSection = (title: string, items: any[]) => {
            if (items.length === 0) return { text: `${title}\nПусто\n\n`, net: 0 };

            let lines = `${title}\n`;
            let incTotal = 0;
            let expTotal = 0;

            items.forEach(exp => {
                const amt = Number(exp.amount) || 0;
                const sign = exp.isIncome ? '+' : '-';
                if (exp.isIncome) incTotal += amt; else expTotal += amt;

                const check = exp.completionStatus === 'COMPLETED' ? '[x]' : '[ ]';
                lines += `- ${check} ${sign}${amt} ${exp.description}\n`;
            });

            if (title === 'Наличные') {
                lines += `Расход: -${expTotal}, Приход: +${incTotal}\n`;
            }

            const net = incTotal - expTotal;
            lines += `Итого ${net >= 0 ? '+' : ''}${net}\n\n`;

            return { text: lines, net };
        }

        const kaspiSec = buildSection('Каспий', kaspiExps);
        const cashSec = buildSection('Наличные', cashExps);
        const halykSec = buildSection('Халык', halykExps);

        const grandTotal = kaspiSec.net + cashSec.net + halykSec.net;
        const shortDate = dateStr.slice(8, 10) + '.' + dateStr.slice(5, 7);

        let report = `Закрытие смены ${shortDate}\n\n`;
        report += kaspiSec.text;
        report += cashSec.text;
        report += halykSec.text;
        report += `Всего: ${grandTotal}₸`;

        // Add Notes
        let hasNotes = false;
        let notesText = `\n\nЗаметки:\n`;
        reconciliations.forEach(r => {
            if (r.notes && r.notes.trim()) {
                hasNotes = true;
                notesText += `[${r.source}]: ${r.notes}\n`;
            }
        });

        if (hasNotes) report += notesText;

        return NextResponse.json({
            success: true,
            report,
            date: dateStr,
            counts: {
                cash: cashExps.length,
                kaspi: kaspiExps.length,
                halyk: halykExps.length
            }
        });

    } catch (error: any) {
        console.error('GET /api/expense-report Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
