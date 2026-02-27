import { PosterClient } from './client';
import { prisma } from '../prisma';

export async function syncMasterData(organizationId: string) {
    const accounts = await prisma.posterAccount.findMany({
        where: { organizationId }
    });

    for (const account of accounts) {
        const client = new PosterClient(account.posterBaseUrl, account.posterToken);

        // 1. Ingredients
        const ingredients = await client.getIngredients();
        if (ingredients && Array.isArray(ingredients)) {
            for (const ing of ingredients) {
                if (!ing.ingredient_id) continue;
                await prisma.ingredientCache.upsert({
                    where: {
                        organizationId_posterAccountId_posterIngredientId: {
                            organizationId,
                            posterAccountId: account.id,
                            posterIngredientId: parseInt(ing.ingredient_id)
                        }
                    },
                    update: {
                        name: ing.ingredient_name,
                        unit: ing.unit,
                        type: parseInt(ing.type || '1'),
                    },
                    create: {
                        organizationId,
                        posterAccountId: account.id,
                        posterIngredientId: parseInt(ing.ingredient_id),
                        name: ing.ingredient_name,
                        unit: ing.unit,
                        type: parseInt(ing.type || '1'),
                    }
                });
            }
        }

        // 2. Products
        const products = await client.getProducts();
        if (products && Array.isArray(products)) {
            for (const prod of products) {
                if (!prod.product_id) continue;
                await prisma.productCache.upsert({
                    where: {
                        organizationId_posterAccountId_posterProductId: {
                            organizationId,
                            posterAccountId: account.id,
                            posterProductId: parseInt(prod.product_id)
                        }
                    },
                    update: {
                        name: prod.product_name,
                        categoryName: prod.category_name,
                    },
                    create: {
                        organizationId,
                        posterAccountId: account.id,
                        posterProductId: parseInt(prod.product_id),
                        name: prod.product_name,
                        categoryName: prod.category_name,
                    }
                });
            }
        }

        // 3. Suppliers
        const suppliers = await client.getSuppliers();
        if (suppliers && Array.isArray(suppliers)) {
            for (const sup of suppliers) {
                if (!sup.supplier_id) continue;
                await prisma.supplierCache.upsert({
                    where: {
                        organizationId_posterSupplierId: {
                            organizationId,
                            posterSupplierId: parseInt(sup.supplier_id)
                        }
                    },
                    update: {
                        name: sup.supplier_name
                    },
                    create: {
                        organizationId,
                        posterSupplierId: parseInt(sup.supplier_id),
                        name: sup.supplier_name
                    }
                });
            }
        }
    }
}
