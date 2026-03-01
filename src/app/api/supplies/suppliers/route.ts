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

        const orgId = session.user.organizationId;
        const allAccs = await prisma.posterAccount.findMany({
            where: { organizationId: orgId }
        });

        if (allAccs.length === 0) {
            return NextResponse.json({ suppliers: [] });
        }

        const suppliersMap = new Map();

        // Fetch suppliers from all connected accounts
        await Promise.all(allAccs.map(async (acc: any) => {
            try {
                const client = new PosterClient(acc.posterBaseUrl, acc.posterToken);
                const suppliers = await client.getSuppliers();
                suppliers.forEach((s: any) => {
                    const idText = s.supplier_id;
                    if (!suppliersMap.has(idText)) {
                        suppliersMap.set(idText, {
                            id: parseInt(idText),
                            name: s.supplier_name,
                            poster_account_id: acc.id,
                            poster_account_name: acc.name,
                            aliases: []
                        });
                    }
                });
            } catch (e) {
                console.error(`Error fetching suppliers for account ${acc.id}:`, e);
            }
        }));

        const formatted = Array.from(suppliersMap.values());

        return NextResponse.json({ suppliers: formatted });

    } catch (error: any) {
        console.error('GET /api/supplies/suppliers Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
