'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import {
    Receipt,
    Package,
    Clock,
    Settings,
    LogOut,
    Coffee,
    Calculator
} from 'lucide-react';
import styles from './Sidebar.module.css';

export default function Sidebar() {
    const pathname = usePathname();
    const { data: session } = useSession();
    const role = session?.user?.role as string | undefined;

    const navItems = [
        { label: 'Расходы', href: '/expenses', icon: Receipt, roles: ['OWNER'] },
        { label: 'Поставки', href: '/supplies', icon: Package, roles: ['OWNER'] },
        { label: 'Смена', href: '/shift-closing', icon: Clock, roles: ['OWNER'] },
        { label: 'Кассир', href: '/cashier/shift-closing', icon: Calculator, roles: ['OWNER', 'CASHIER'] },
        { label: 'Кафе', href: '/cafe/shift-closing', icon: Coffee, roles: ['OWNER', 'ADMIN'] },
        { label: 'Авто', href: '/daily-transactions', icon: Settings, roles: ['OWNER'] },
    ];

    const visibleItems = navItems.filter(item => item.roles.includes((role || '').toUpperCase()));

    return (
        <aside className={styles.sidebar}>
            <div className={styles.logo}>
                <div className={styles.logoIcon}>PH</div>
                <span>PosterHelper</span>
            </div>

            <nav className={styles.nav}>
                {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                        >
                            <Icon size={20} className={styles.icon} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className={styles.footer}>
                <div className={styles.user}>
                    <div className={styles.avatar}>
                        {session?.user?.name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className={styles.userInfo}>
                        <span className={styles.userName}>{session?.user?.label || session?.user?.name}</span>
                        <span className={styles.userRole}>{role === 'OWNER' ? 'Владелец' : role === 'ADMIN' ? 'Админ' : 'Кассир'}</span>
                    </div>
                </div>
                <button className={styles.logoutBtn} onClick={() => signOut()}>
                    <LogOut size={18} />
                    <span>Выйти</span>
                </button>
            </div>
        </aside>
    );
}
