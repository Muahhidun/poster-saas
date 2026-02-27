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
        const { date, poster_account_id, ...shiftData } = body;

        if (!date) {
            return NextResponse.json({ error: 'Date is required' }, { status: 400 });
        }

        // Determine if this is a primary (main hall) or secondary (cafe) shift
        const accountCondition = poster_account_id
            ? { poster_account_id: poster_account_id }
            : { posterAccount: { is_primary: true } };

        // Save or update the shift closing record
        const savedShift = await prisma.shiftClosing.upsert({
            where: {
                organizationId_date_posterAccountId: {
                    organizationId: session.user.organizationId,
                    date: new Date(date),
                    posterAccountId: poster_account_id || null // Adjust based on your schema's unique constraint
                }
            },
            update: {
                ...shiftData,
                updatedAt: new Date(),
            },
            create: {
                organizationId: session.user.organizationId,
                date: new Date(date),
                posterAccountId: poster_account_id || null,
                ...shiftData,
            }
        });

        // 2. Here we would trigger salary creation logic if it's the main hall and 'salaries_created' flag is passed

        // 3. Here we would trigger daily transactions / transfer logic

        return NextResponse.json({ success: true, shift: savedShift });

    } catch (error: any) {
        console.error('Error saving shift data:', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
