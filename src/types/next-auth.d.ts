import NextAuth, { DefaultSession } from 'next-auth';

declare module 'next-auth' {
    interface Session {
        user: {
            id: string;
            role: string;
            organizationId: string;
            posterAccountId: number | null;
            label: string | null;
        } & DefaultSession['user'];
    }
}
