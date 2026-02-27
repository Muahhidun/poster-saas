'use client';

import { useState } from 'react';
import { RefreshCw, Plus, Wallet, FileText, Banknote, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import styles from './expenses.module.css';

const MOCK_EXPENSES = [
    { id: 1, amount: 5000, desc: 'Канцы', cat: 'Канцелярия', source: 'Cash', status: 'completed', isIncome: false },
    { id: 2, amount: 25000, desc: 'Поставка кола', cat: 'Закуп продуктов', source: 'Halyk', status: 'pending', isIncome: false },
    { id: 3, amount: 4000, desc: 'Размен из сейфа', cat: 'Поступления', source: 'Cash', status: 'completed', isIncome: true },
];

export default function ExpensesPage() {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

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
                    <button className={styles.syncBtn}>
                        <RefreshCw size={18} />
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
                        <span className={styles.balanceValue}>145 000 ₸</span>
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>В Poster</span>
                        <span className={styles.balanceValue}>141 000 ₸</span>
                    </div>
                    <div className={styles.balanceRow} style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--border)', paddingTop: '1rem' }}>
                        <span className={styles.balanceLabel}>Разница</span>
                        <span className={`${styles.balanceValue} ${styles.positive}`}>+ 4 000 ₸</span>
                    </div>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <Wallet size={20} className={styles.icon} />
                        Сверка Kaspi
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>Фактический</span>
                        <span className={styles.balanceValue}>412 500 ₸</span>
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>В Poster</span>
                        <span className={styles.balanceValue}>412 500 ₸</span>
                    </div>
                    <div className={styles.balanceRow} style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--border)', paddingTop: '1rem' }}>
                        <span className={styles.balanceLabel}>Разница</span>
                        <span className={styles.balanceValue}>0 ₸</span>
                    </div>
                </div>

                <div className={styles.summaryCard}>
                    <div className={styles.cardHeader}>
                        <FileText size={20} className={styles.icon} />
                        Сверка Halyk
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>Фактический</span>
                        <span className={styles.balanceValue}>85 000 ₸</span>
                    </div>
                    <div className={styles.balanceRow}>
                        <span className={styles.balanceLabel}>В Poster</span>
                        <span className={styles.balanceValue}>100 000 ₸</span>
                    </div>
                    <div className={styles.balanceRow} style={{ marginTop: '0.5rem', borderTop: '1px dashed var(--border)', paddingTop: '1rem' }}>
                        <span className={styles.balanceLabel}>Разница</span>
                        <span className={`${styles.balanceValue} ${styles.negative}`}>- 15 000 ₸</span>
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
                        {MOCK_EXPENSES.map(exp => (
                            <tr key={exp.id}>
                                <td data-label="Сумма">
                                    <span className={`${styles.amount} ${exp.isIncome ? styles.income : ''}`}>
                                        {exp.isIncome ? '+' : '-'} {exp.amount.toLocaleString('ru')} ₸
                                    </span>
                                </td>
                                <td data-label="Описание" style={{ fontWeight: 500 }}>{exp.desc}</td>
                                <td data-label="Категория" style={{ color: 'var(--primary)' }}>{exp.cat}</td>
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
                        ))}
                    </tbody>
                </table>
            </div>

        </div>
    );
}
