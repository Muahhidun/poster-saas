import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const resolvedParams = await context.params;
        const draftId = parseInt(resolvedParams.id);
        if (isNaN(draftId)) return NextResponse.json({ error: 'Invalid Draft ID' }, { status: 400 });

        const draft = await prisma.supplyDraft.findUnique({
            where: { id: draftId, organizationId: session.user.organizationId },
            include: { items: true, linkedExpense: true }
        });

        if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
        if (!draft.items || draft.items.length === 0) return NextResponse.json({ error: 'Draft contains no items' }, { status: 400 });

        const posterAccounts = await prisma.posterAccount.findMany({
            where: { organizationId: session.user.organizationId }
        });
        const primaryAcc = posterAccounts.find(pa => pa.isPrimary) || posterAccounts[0];

        if (!primaryAcc) return NextResponse.json({ error: 'No Poster accounts found' }, { status: 400 });

        // Step 1: Group items by poster_account_id
        const itemsByAccount = new Map<number, typeof draft.items>();
        for (const item of draft.items) {
            const accId = item.posterAccountId || primaryAcc.id;
            if (!itemsByAccount.has(accId)) {
                itemsByAccount.set(accId, []);
            }
            itemsByAccount.get(accId)!.push(item);
        }

        const createdSupplies: any[] = [];
        const allCreatedItems: any[] = [];
        const errors: string[] = [];

        // Timezone adjustment for supply date
        let supplyDate = draft.invoiceDate ? draft.invoiceDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        const supplyDateStr = `${supplyDate} 12:00:00`;

        for (const [accId, accountItems] of Array.from(itemsByAccount.entries())) {
            const accInfo = posterAccounts.find(p => p.id === accId);
            if (!accInfo) {
                errors.push(`Account ID ${accId} not found`);
                continue;
            }

            const client = new PosterClient(accInfo.posterBaseUrl, accInfo.posterToken);

            try {
                // Fetch context
                const [suppliers, financeAccounts, storages, ingredients, products] = await Promise.all([
                    client.getSuppliers(),
                    client.getAccounts(),
                    client.getStorages(),
                    client.getIngredients(),
                    client.getProducts()
                ]);

                // Determine Supplier ID
                let supplierId = draft.supplierId;
                if (!supplierId && draft.supplierName) {
                    const match = suppliers.find((s: any) => s.supplier_name.toLowerCase().includes(draft.supplierName!.toLowerCase()));
                    if (match) supplierId = parseInt(match.supplier_id);
                }
                if (!supplierId && suppliers.length > 0) supplierId = parseInt(suppliers[0].supplier_id);
                if (!supplierId) throw new Error('Could not determine supplier_id');

                // Determine Account ID
                let finalAccountId = 0;
                const source = draft.source.toLowerCase();
                for (const fa of financeAccounts) {
                    const name = (fa.account_name || fa.name || '').toLowerCase();
                    if (source === 'kaspi' && name.includes('kaspi')) { finalAccountId = parseInt(fa.account_id); break; }
                    if (source === 'halyk' && (name.includes('халык') || name.includes('halyk'))) { finalAccountId = parseInt(fa.account_id); break; }
                    if (source === 'cash' && (name.includes('закуп') || name.includes('оставил'))) { finalAccountId = parseInt(fa.account_id); break; }
                }
                if (!finalAccountId && financeAccounts.length > 0) finalAccountId = parseInt(financeAccounts[0].account_id);
                if (!finalAccountId) throw new Error('Could not determine finance account');

                // Determine Storage ID (fallback to first from API, override by first found in items)
                let storageId = storages.length > 0 ? parseInt(storages[0].storage_id) : 1;
                for (const item of accountItems) {
                    if (item.storageId) { storageId = item.storageId; break; }
                }

                // Validation dictionaries
                const validIngredients = new Map();
                ingredients.forEach((ing: any) => {
                    if (ing.delete === '1') return;
                    validIngredients.set(parseInt(ing.ingredient_id), {
                        name: ing.ingredient_name,
                        type: ing.type === '2' ? 'semi_product' : 'ingredient'
                    });
                });

                const validProducts = new Map();
                products.forEach((prod: any) => {
                    if (prod.delete === '1') return;
                    validProducts.set(parseInt(prod.product_id), prod.product_name);
                });

                const missingItems: string[] = [];
                const validToShipItems: any[] = [];
                let accountTotalSum = 0;

                for (const item of accountItems) {
                    let itemId = item.posterIngredientId;
                    let specifiedType = item.itemType?.toLowerCase() || 'ingredient';

                    if (!itemId) {
                        missingItems.push(item.itemName);
                        continue;
                    }

                    // Strict validation and type correction logic
                    let resolvedType = specifiedType;

                    if ((specifiedType === 'ingredient' || specifiedType === 'semi_product') && validIngredients.has(itemId)) {
                        resolvedType = validIngredients.get(itemId).type;
                    } else if (specifiedType === 'product' && validProducts.has(itemId)) {
                        resolvedType = 'product';
                    } else if (validIngredients.has(itemId)) {
                        // Type correction to ingredient/semi_product
                        resolvedType = validIngredients.get(itemId).type;
                    } else if (validProducts.has(itemId)) {
                        // Type correction to product
                        resolvedType = 'product';
                    } else {
                        // Could not resolve
                        missingItems.push(item.posterIngredientName || item.itemName);
                        continue;
                    }

                    const num = Number(item.quantity);
                    const price = Number(item.pricePerUnit);
                    accountTotalSum += num * price;

                    validToShipItems.push({
                        id: itemId,
                        num: Number.isInteger(num) ? parseInt(num.toString(), 10) : num, // pass exactly as float if needed
                        price: price, // sum in docs meaning
                        resolvedType: resolvedType,
                        originalItem: item
                    });
                }

                if (missingItems.length > 0) {
                    throw new Error(`В аккаунте ${accInfo.accountName} не найдены ингредиенты: ${missingItems.join(', ')}.`);
                }

                // Strategy executor
                let supply_id_created = null;
                const tryStrategy = async (strategy: 'docs' | 'legacy' | 'mixed') => {
                    let payload: any = {};

                    if (strategy === 'docs') {
                        payload.supply = {
                            date: supplyDateStr,
                            supplier_id: supplierId,
                            storage_id: storageId,
                            supply_comment: `Накладная от ${draft.supplierName}`,
                            account_id: finalAccountId
                        };
                        payload.ingredient = validToShipItems.map(item => ({
                            id: item.id,
                            type: item.resolvedType === 'product' ? 1 : 4,
                            num: item.num,
                            sum: item.price
                        }));
                        payload.transactions = [{
                            account_id: finalAccountId,
                            date: supplyDateStr,
                            amount: accountTotalSum,
                            delete: 0
                        }];
                    } else if (strategy === 'legacy') {
                        payload = {
                            date: supplyDateStr,
                            supplier_id: supplierId,
                            storage_id: storageId,
                            supply_comment: `Накладная от ${draft.supplierName}`,
                            source: 'manage',
                            type: 1
                        };
                        payload.ingredients = validToShipItems.map(item => ({
                            id: item.id,
                            type: item.resolvedType === 'ingredient' ? 1 : item.resolvedType === 'semi_product' ? 2 : 4,
                            num: item.num,
                            price: item.price,
                            ingredient_sum: item.num * item.price,
                            tax_id: 0,
                            packing: 1
                        }));
                        payload.transactions = [{
                            account_id: finalAccountId,
                            date: supplyDateStr,
                            amount: accountTotalSum,
                            delete: 0
                        }];
                    } else if (strategy === 'mixed') {
                        payload.supply = {
                            date: supplyDateStr,
                            supplier_id: supplierId,
                            storage_id: storageId,
                            supply_comment: `Накладная от ${draft.supplierName}`,
                            account_id: finalAccountId
                        };
                        payload.ingredient = validToShipItems.map(item => ({
                            id: item.id,
                            type: item.resolvedType === 'ingredient' ? 1 : item.resolvedType === 'semi_product' ? 2 : 4,
                            num: item.num,
                            sum: item.price
                        }));
                        payload.transactions = [{
                            account_id: finalAccountId,
                            date: supplyDateStr,
                            amount: accountTotalSum,
                            delete: 0
                        }];
                    }

                    const res = await client.createSupply(payload);
                    return res;
                };

                // Fallback loop
                try {
                    supply_id_created = await tryStrategy('docs');
                } catch (e: any) {
                    console.warn(`[Poster] Docs strategy failed for ${accInfo.accountName}: ${e.message}`);
                    try {
                        supply_id_created = await tryStrategy('legacy');
                    } catch (e2: any) {
                        console.warn(`[Poster] Legacy strategy failed for ${accInfo.accountName}: ${e2.message}`);
                        // Last resort
                        supply_id_created = await tryStrategy('mixed');
                    }
                }

                if (!supply_id_created) throw new Error('All 3 fallback strategies failed to create supply');

                createdSupplies.push({
                    supply_id: supply_id_created,
                    account_name: accInfo.accountName,
                    items_count: validToShipItems.length,
                    total: accountTotalSum
                });

                // Prepare metrics to save to Price History
                for (const vItem of validToShipItems) {
                    allCreatedItems.push({
                        ...vItem,
                        supplierId,
                        supplyDateStr,
                        supplyId: supply_id_created
                    });
                }

            } catch (err: any) {
                console.error(`Error processing supply for ${accInfo.accountName}:`, err);
                errors.push(err.message || 'Unknown error');
            }
        }

        if (createdSupplies.length === 0) {
            return NextResponse.json({ success: false, error: errors.join('; ') }, { status: 400 });
        }

        // Post-processing

        // 1. Save history
        for (const item of allCreatedItems) {
            await prisma.ingredientPriceHistory.create({
                data: {
                    organizationId: session.user.organizationId,
                    ingredientId: item.id,
                    ingredientName: item.originalItem.itemName,
                    supplierId: item.supplierId,
                    supplierName: draft.supplierName || '',
                    date: new Date(item.supplyDateStr),
                    price: item.price,
                    quantity: item.num,
                    unit: item.originalItem.unit,
                    supplyId: parseInt(item.supplyId)
                }
            });
        }

        // 2. Mark draft processed
        await prisma.supplyDraft.update({
            where: { id: draftId },
            data: { status: 'processed', processedAt: new Date() }
        });

        // 3. Update related expense draft
        if (draft.linkedExpenseDraftId) {
            const supplyIdsStr = createdSupplies.map(s => s.supply_id).join(',');
            const posterTxnId = `supply_${supplyIdsStr}`;

            await prisma.expenseDraft.update({
                where: { id: draft.linkedExpenseDraftId },
                data: {
                    source: draft.source,
                    posterTransactionId: posterTxnId,
                    completionStatus: 'COMPLETED',
                    processedAt: new Date()
                }
            });
        }

        return NextResponse.json({
            success: true,
            supply_id: createdSupplies[0]?.supply_id,
            supplies: createdSupplies,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('POST /api/supplies/[id]/process Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
