import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getServerSession(authOptions);
        if (!session || !session.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: paramId } = await params;
        const id = parseInt(paramId, 10);
        const body = await request.json();

        if (typeof body.is_enabled !== 'boolean') {
            return NextResponse.json({ error: 'Invalid is_enabled value' }, { status: 400 });
        }

        const updatedConfig = await prisma.dailyTransactionConfig.updateMany({
            where: {
                id,
                organizationId: session.user.organizationId
            },
            data: {
                isEnabled: body.is_enabled
            }
        });

        if (updatedConfig.count === 0) {
            return NextResponse.json({ error: 'Config not found or unauthorized' }, { status: 404 });
        }

        return NextResponse.json({ success: true, is_enabled: body.is_enabled });

    } catch (error: any) {
        console.error('Error toggling daily transaction config:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
