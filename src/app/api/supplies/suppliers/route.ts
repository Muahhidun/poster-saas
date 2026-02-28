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
        const primaryAcc = await prisma.posterAccount.findFirst({
            where: { organizationId: orgId, isPrimary: true }
        });

        if (!primaryAcc) {
            return NextResponse.json({ suppliers: [] });
        }

        const client = new PosterClient(primaryAcc.posterBaseUrl, primaryAcc.posterToken);
        const suppliers = await client.getSuppliers();

        const formatted = suppliers.map((s: any) => ({
            id: parseInt(s.supplier_id),
            name: s.supplier_name,
            aliases: [] // In future, could merge from supplierAlias table
        }));

        return NextResponse.json({ suppliers: formatted });

    } catch (error: any) {
        console.error('GET /api/supplies/suppliers Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
