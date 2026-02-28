import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PosterClient } from '@/lib/poster/client';

export async function GET(request: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const query = (searchParams.get('q') || '').toLowerCase();

        // Check if we have organization ID
        const orgId = session.user.organizationId;

        const posterAccounts = await prisma.posterAccount.findMany({
            where: { organizationId: orgId }
        });

        if (posterAccounts.length === 0) {
            return NextResponse.json({ items: [] });
        }

        let allItems: any[] = [];

        await Promise.all(posterAccounts.map(async (acc) => {
            const client = new PosterClient(acc.posterBaseUrl, acc.posterToken);

            try {
                const [ingredients, products] = await Promise.all([
                    client.getIngredients(),
                    client.getProducts()
                ]);

                // Map Ingredients
                ingredients.forEach((ing: any) => {
                    if (ing.delete === '1') return; // skip deleted

                    const typeStr = ing.type === '2' ? 'semi_product' : 'ingredient';
                    allItems.push({
                        id: parseInt(ing.ingredient_id),
                        name: ing.ingredient_name,
                        type: typeStr,
                        poster_account_id: acc.id,
                        poster_account_name: acc.accountName,
                        price: 0, // Will be filled dynamically if needed
                        unit: ing.ingredient_unit || 'шт'
                    });
                });

                // Map Products (Only category starting with "Напитки")
                products.forEach((prod: any) => {
                    if (prod.delete === '1') return;
                    if (!(prod.category_name || '').toLowerCase().startsWith('напитки')) return;

                    allItems.push({
                        id: parseInt(prod.product_id),
                        name: prod.product_name,
                        type: 'product',
                        poster_account_id: acc.id,
                        poster_account_name: acc.accountName,
                        price: 0,
                        unit: 'шт'
                    });
                });

            } catch (err: any) {
                console.error(`Error loading items from poster account ${acc.accountName}:`, err.message);
                // Fallback mechanics could read from CSV here
            }
        }));

        // Sort by name
        allItems.sort((a, b) => a.name.localeCompare(b.name));

        // In a real scenario, returning all might be large, but Poster item lists for cafes are usually < 5000 items (maybe ~500kb).
        return NextResponse.json({ items: allItems });

    } catch (error: any) {
        console.error('GET /api/supplies/search-items Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
