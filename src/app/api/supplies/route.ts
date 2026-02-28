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

        const orgId = session.user.organizationId;

        // Timezone adjustment for Asia/Almaty (UTC+5)
        const now = new Date();
        const offsetMs = 5 * 60 * 60 * 1000;
        const localDate = new Date(now.getTime() + offsetMs);
        const startOfDay = new Date(localDate.toISOString().split('T')[0] + 'T00:00:00.000Z');
        startOfDay.setTime(startOfDay.getTime() - offsetMs); // Back to UTC

        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);

        // Fetch drafts
        const draftsData = await prisma.supplyDraft.findMany({
            where: {
                organizationId: orgId,
                status: 'pending',
                createdAt: { gte: startOfDay, lte: endOfDay }
            },
            include: {
                items: true,
                linkedExpense: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const formattedDrafts = draftsData.map(d => ({
            id: d.id,
            supplier_name: d.supplierName || '',
            supplier_id: d.supplierId,
            source: d.source.toLowerCase(),
            invoice_date: d.invoiceDate ? d.invoiceDate.toISOString().split('T')[0] : '',
            total_sum: Number(d.totalSum || 0),
            linked_expense_draft_id: d.linkedExpenseDraftId,
            linked_expense_amount: d.linkedExpense ? Number(d.linkedExpense.amount) : 0,
            linked_expense_source: d.linkedExpense ? d.linkedExpense.source.toLowerCase() : '',
            items: d.items.map(i => ({
                id: i.id,
                ingredient_id: i.posterIngredientId,
                ingredient_name: i.itemName, // original name
                quantity: Number(i.quantity),
                price: Number(i.pricePerUnit),
                unit: i.unit,
                total: Number(i.total),
                item_type: i.itemType?.toLowerCase() || 'ingredient',
                poster_account_id: i.posterAccountId,
                poster_account_name: i.posterAccountName,
                storage_id: i.storageId,
                storage_name: i.storageName
            }))
        }));

        // Fetch pending expenses that are designated as supply but not linked to any supply draft
        const pendingExpenses = await prisma.expenseDraft.findMany({
            where: {
                organizationId: orgId,
                expenseType: 'SUPPLY',
                status: 'pending',
                supplyDrafts: { none: {} } // Has no linked supply drafts
            },
            orderBy: { createdAt: 'desc' }
        });

        // Fetch poster accounts
        const posterAccounts = await prisma.posterAccount.findMany({
            where: { organizationId: orgId }
        });

        return NextResponse.json({
            drafts: formattedDrafts,
            pending_supplies: pendingExpenses.map(e => ({
                id: e.id,
                amount: Number(e.amount),
                description: e.description,
                source: e.source.toLowerCase()
            })),
            poster_accounts: posterAccounts.map(pa => ({ id: pa.id, name: pa.accountName, is_primary: pa.isPrimary }))
        });

    } catch (error: any) {
        console.error('GET /api/supplies Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const sourceMap: Record<string, ExpenseSource> = {
            'cash': ExpenseSource.CASH,
            'kaspi': ExpenseSource.KASPI,
            'halyk': ExpenseSource.HALYK
        };

        const draft = await prisma.supplyDraft.create({
            data: {
                organizationId: session.user.organizationId,
                supplierName: body.supplier_name || '',
                supplierId: body.supplier_id ? parseInt(body.supplier_id) : null,
                invoiceDate: body.invoice_date ? new Date(body.invoice_date) : null,
                source: sourceMap[body.source as string || 'cash'],
                linkedExpenseDraftId: body.linked_expense_draft_id ? parseInt(body.linked_expense_draft_id) : null,
                status: 'pending',
                totalSum: 0
            }
        });

        return NextResponse.json({ success: true, id: draft.id });

    } catch (error: any) {
        console.error('POST /api/supplies Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
