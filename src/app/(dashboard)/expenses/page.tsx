'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, Plus, Wallet, FileText, Banknote, Edit2, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import styles from './expenses.module.css';

interface Expense {
    id: number;
    amount: string;
    description: string;
    category: string;
    source: string;
    status: string;
    isIncome: boolean;
}

export default function ExpensesPage() {
    const [date, setDate] = useState(() => {
        const d = new Date();
        if (d.getHours() < 6) d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [summary, setSummary] = useState({ cash: 0, kaspi: 0, halyk: 0 });
    const [isLoading, setIsLoading] = useState(false);

    const fetchExpenses = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/expenses?date=${date}`);
            const data = await res.json();
            if (data.success) {
                setExpenses(data.expenses);
                setSummary(data.summary);
            }
        } catch (e) {
            console.error('Failed to fetch expenses', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchExpenses();
    }, [date]);

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <h1 className={styles.title}>Расходы</h1>

                <div className={styles.controls}>
                    <input
                        type="date"
                        className={styles.datePicker}
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                    />
                    <button className={styles.syncBtn} onClick={fetchExpenses} disabled={isLoading}>
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                        Синхронизировать
                    </button>
                    <button className={styles.primaryBtn}>
                        <Plus size={18} />
                        Добавить
                    </button>
                </div>
            </header>

            {/* Summary Cards */}
            <div className={styles.summaryGrid}>
                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <Banknote size={20} className={styles.icon} />
                        Сверка Наличные
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>Фактический</span>
                        <span className={styles.balanceValue}>{summary.cash.toLocaleString('ru')} ₸</span>
                    </div>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <Wallet size={20} className={styles.icon} />
                        Сверка Kaspi
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>Фактический</span>
                        <span className={styles.balanceValue}>{summary.kaspi.toLocaleString('ru')} ₸</span>
                    </div>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <FileText size={20} className={styles.icon} />
                        Сверка Halyk
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>Фактический</span>
                        <span className={styles.balanceValue}>{summary.halyk.toLocaleString('ru')} ₸</span>
                    </div>
                </div>
            </div>

            {/* Transactions Table */}
            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Сумма</th>
                            <th>Описание</th>
                            <th>Категория</th>
                            <th>Источник</th>
                            <th>Статус</th>
                            <th style={{ textAlign: 'right' }}>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                                    <Loader2 className="animate-spin" style={{ margin: '0 auto', color: 'var(--primary)' }} />
                                </td>
                            </tr>
                        ) : expenses.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                                    Нет транзакций за выбранный день
                                </td>
                            </tr>
                        ) : (
                            expenses.map(exp => (
                                <tr key={exp.id}>
                                    <td data-label="Сумма">
                                        <span className={`${styles.amount} ${exp.isIncome ? styles.income : ''}`}>
                                            {exp.isIncome ? '+' : '-'} {Number(exp.amount).toLocaleString('ru')} ₸
                                        </span>
                                    </td>
                                    <td data-label="Описание" style={{ fontWeight: 500 }}>{exp.description}</td>
                                    <td data-label="Категория" style={{ color: 'var(--primary)' }}>{exp.category || 'Без категории'}</td>
                                    <td data-label="Источник">
                                        <span className={`${styles.badge} ${styles.source}`}>{exp.source}</span>
                                    </td>
                                    <td data-label="Статус">
                                        <span className={`${styles.badge} ${exp.status === 'completed' ? styles.statusCompleted : styles.statusPending}`}>
                                            {exp.status === 'completed' ? (
                                                <><CheckCircle2 size={14} style={{ marginRight: '4px' }} /> Проведён</>
                                            ) : (
                                                'Черновик'
                                            )}
                                        </span>
                                    </td>
                                    <td data-label="Действия">
                                        <div className={styles.rowActions}>
                                            <button className={styles.actionBtn}>
                                                <Edit2 size={16} />
                                            </button>
                                            <button className={`${styles.actionBtn} ${styles.delete}`}>
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

        </div>
    );
}
