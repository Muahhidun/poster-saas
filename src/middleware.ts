import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default function middleware() {
    return NextResponse.next();
}

/*
export default withAuth(
    function middleware(req) {
        const token = req.nextauth.token;
        const path = req.nextUrl.pathname;

        if (!token) return NextResponse.redirect(new URL('/login', req.url));

        const role = token.role as string;

        // Role-based routing matrix logic
        if (path === '/') {
            if (role === 'OWNER') return NextResponse.redirect(new URL('/expenses', req.url));
            if (role === 'ADMIN') return NextResponse.redirect(new URL('/cafe/shift-closing', req.url));
            if (role === 'CASHIER') return NextResponse.redirect(new URL('/cashier/shift-closing', req.url));
        }

        // Owner only routes
        if (path.startsWith('/expenses') || path.startsWith('/supplies') || path.startsWith('/daily-transactions') || path === '/shift-closing') {
            if (role !== 'OWNER') return NextResponse.redirect(new URL('/', req.url));
        }

        // Admin & Owner routes
        if (path.startsWith('/cafe')) {
            if (role !== 'OWNER' && role !== 'ADMIN') return NextResponse.redirect(new URL('/', req.url));
        }

        // Cashier & Owner routes
        if (path.startsWith('/cashier')) {
            if (role !== 'OWNER' && role !== 'CASHIER') return NextResponse.redirect(new URL('/', req.url));
        }

        return NextResponse.next();
    },
    {
        callbacks: {
            authorized: ({ token }) => !!token,
        },
        pages: {
            signIn: '/login',
        },
    }
);

*/

export const config = {
    // Apply to all routes except API, static files, login page, and health/webhook
    matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|login|health|telegram-webhook).*)'],
};
