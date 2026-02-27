'use client';

import { useState, useEffect } from 'react';
import { Plus, GripVertical, Info, Trash2, ArrowRightLeft, CreditCard, Save, X } from 'lucide-react';
import styles from './daily.module.css';

interface TransactionConfig {
    id: number;
    account_name: string;
    transaction_type: number;
    category_id: number;
    category_name: string;
    account_from_id: number;
    account_from_name: string;
    account_to_id: number | null;
    account_to_name: string | null;
    amount: number;
    comment: string;
    is_enabled: boolean;
    sort_order: number;
}

export default function DailyTransactionsPage() {
    const [configs, setConfigs] = useState<TransactionConfig[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Poster Data for Dropdowns
    const [posterData, setPosterData] = useState<any>({ categories: [], finance_accounts: [], poster_accounts: [] });

    // Modals & Editing
    const [isAdding, setIsAdding] = useState(false);
    const [editModeId, setEditModeId] = useState<number | null>(null);

    // Form State (used for both Add and Edit)
    const [formData, setFormData] = useState<Partial<TransactionConfig>>({});

    useEffect(() => {
        fetchConfigs();
        fetchPosterData();
    }, []);

    const fetchConfigs = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/daily-transactions');
            const data = await res.json();
            if (data.success) {
                setConfigs(data.configs);
            }
        } catch (error) {
            console.error("Failed to load configs", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPosterData = async () => {
        try {
            const res = await fetch('/api/daily-transactions/poster-data');
            const data = await res.json();
            if (data.success) {
                setPosterData(data);
            }
        } catch (error) {
            console.error("Failed to load poster data", error);
        }
    };

    const handleToggle = async (id: number, currentStatus: boolean) => {
        const newStatus = !currentStatus;
        // Optimistic UI update
        setConfigs(configs.map(c => c.id === id ? { ...c, is_enabled: newStatus } : c));

        try {
            await fetch(`/api/daily-transactions/${id}/toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_enabled: newStatus })
            });
        } catch (error) {
            // Revert on failure
            setConfigs(configs.map(c => c.id === id ? { ...c, is_enabled: currentStatus } : c));
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Удалить этот шаблон?')) return;

        try {
            const res = await fetch(`/api/daily-transactions/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setConfigs(configs.filter(c => c.id !== id));
            }
        } catch (error) {
            alert('Ошибка при удалении');
        }
    };

    const handleSave = async () => {
        try {
            if (isAdding) {
                // Determine names based on IDs selected
                const catName = posterData.categories.find((c: any) => String(c.id) === String(formData.category_id))?.name || '';
                const fromName = posterData.finance_accounts.find((a: any) => String(a.id) === String(formData.account_from_id))?.name || '';
                const toName = formData.account_to_id ? posterData.finance_accounts.find((a: any) => String(a.id) === String(formData.account_to_id))?.name : null;
                const accName = posterData.poster_accounts[0]?.account_name || 'Main'; // Simplify for MVP

                const payload = {
                    ...formData,
                    category_name: catName,
                    account_from_name: fromName,
                    account_to_name: toName || null,
                    account_name: accName,
                    amount: Number(formData.amount) || 0,
                    transaction_type: Number(formData.transaction_type) || 0,
                };

                const res = await fetch('/api/daily-transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    setIsAdding(false);
                    fetchConfigs();
                }
            } else if (editModeId) {
                const payload = {
                    ...configs.find(c => c.id === editModeId),
                    ...formData,
                    amount: Number(formData.amount),
                };

                const res = await fetch(`/api/daily-transactions/${editModeId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    setEditModeId(null);
                    fetchConfigs();
                }
            }
        } catch (e) {
            alert("Ошибка сохранения");
        }
    };

    const startAdd = () => {
        setFormData({
            transaction_type: 0,
            amount: 0,
            is_enabled: true
        });
        setIsAdding(true);
        setEditModeId(null);
    };

    const startEdit = (config: TransactionConfig) => {
        setFormData({ ...config });
        setEditModeId(config.id);
        setIsAdding(false);
    };

    const cancelForm = () => {
        setIsAdding(false);
        setEditModeId(null);
    };

    return (
        <div className={styles.container}>
            {/* Header */}
            <header className={styles.header}>
                <h1 className={styles.title}>Ежедневные (Авто)</h1>
                <div className={styles.controls}>
                    <button className={styles.primaryBtn} onClick={startAdd} disabled={isAdding || editModeId !== null}>
                        <Plus size={18} />
                        Добавить шаблон
                    </button>
                </div>
            </header>

            {/* Main Card */}
            <div className={styles.configCard}>
                <div className={styles.infoBanner}>
                    <Info size={20} style={{ flexShrink: 0 }} />
                    <span>
                        Эти транзакции будут автоматически создаваться каждый день в 12:00 в Poster.
                        Если сумма равна 0 или 1 ₸, она будет пропущена как шаблон-пустышка.
                    </span>
                </div>

                {isLoading && <p style={{ color: 'var(--muted-foreground)', padding: '1rem' }}>Загрузка...</p>}

                {/* Form Row for Add / Edit */}
                {(isAdding || editModeId !== null) && (
                    <div className={styles.formCard} style={{ background: 'var(--muted)', marginTop: '1rem', marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{isAdding ? 'Новый шаблон' : 'Редактировать шаблон'}</h3>
                        <div className={styles.formGrid}>
                            <div className={styles.inputGroup}>
                                <label>Тип</label>
                                <select
                                    className={styles.select}
                                    value={formData.transaction_type}
                                    onChange={e => setFormData({ ...formData, transaction_type: Number(e.target.value) })}
                                >
                                    <option value={0}>Расход</option>
                                    <option value={2}>Перевод</option>
                                </select>
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Счёт списания</label>
                                <select
                                    className={styles.select}
                                    value={formData.account_from_id || ''}
                                    onChange={e => setFormData({ ...formData, account_from_id: Number(e.target.value) })}
                                >
                                    <option value="">Выберите счёт</option>
                                    {posterData.finance_accounts?.map((acc: any) => (
                                        <option key={acc.id} value={acc.id}>{acc.name}</option>
                                    ))}
                                </select>
                            </div>

                            {formData.transaction_type === 2 ? (
                                <div className={styles.inputGroup}>
                                    <label>Счёт пополнения</label>
                                    <select
                                        className={styles.select}
                                        value={formData.account_to_id || ''}
                                        onChange={e => setFormData({ ...formData, account_to_id: Number(e.target.value) })}
                                    >
                                        <option value="">Выберите счёт</option>
                                        {posterData.finance_accounts?.map((acc: any) => (
                                            <option key={`to-${acc.id}`} value={acc.id}>{acc.name}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div className={styles.inputGroup}>
                                    <label>Категория расхода</label>
                                    <select
                                        className={styles.select}
                                        value={formData.category_id || ''}
                                        onChange={e => setFormData({ ...formData, category_id: Number(e.target.value) })}
                                    >
                                        <option value="">Выберите категорию</option>
                                        {posterData.categories?.map((cat: any) => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className={styles.inputGroup}>
                                <label>Сумма по умолчанию</label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    value={formData.amount || ''}
                                    onChange={e => setFormData({ ...formData, amount: Number(e.target.value) })}
                                />
                            </div>

                            <div className={styles.inputGroup}>
                                <label>Комментарий / Название</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={formData.comment || ''}
                                    onChange={e => setFormData({ ...formData, comment: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className={styles.formActions}>
                            <button className={styles.cancelBtn} onClick={cancelForm}>Отмена</button>
                            <button className={styles.primaryBtn} onClick={handleSave}>Сохранить</button>
                        </div>
                    </div>
                )}

                <div className={styles.transactionList}>
                    {configs.map((t) => (
                        <div key={t.id} className={`${styles.transactionItem} ${!t.is_enabled ? styles.itemDisabled : ''}`}>
                            <div className={styles.dragHandle}>
                                <GripVertical size={20} />
                            </div>

                            <div className={styles.transactionDetails} onClick={() => startEdit(t)} style={{ cursor: 'pointer' }}>
                                <div className={styles.categoryName}>
                                    {t.transaction_type === 2 ? <ArrowRightLeft size={16} color="var(--primary)" /> : <CreditCard size={16} color="var(--success)" />}
                                    {t.transaction_type === 2 ? 'Перевод' : t.category_name}
                                </div>
                                <div className={styles.accountInfo}>
                                    {t.account_from_name} {t.account_to_name ? ` → ${t.account_to_name}` : ''}
                                </div>
                            </div>

                            <div className={styles.amountWrap}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontWeight: 600, fontSize: '1.2rem', color: t.is_enabled ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                                        {t.amount?.toLocaleString('ru')} ₸
                                    </span>
                                </div>
                            </div>

                            <div className={styles.commentWrap}>
                                <span style={{ color: 'var(--muted-foreground)', fontSize: '0.9rem' }}>{t.comment}</span>
                            </div>

                            <div className={styles.switchWrap}>
                                <label className={styles.switch}>
                                    <input type="checkbox" checked={t.is_enabled} onChange={() => handleToggle(t.id, t.is_enabled)} />
                                    <span className={styles.slider}></span>
                                </label>
                            </div>

                            <div className={styles.actionsWrap}>
                                <button className={`${styles.actionBtn} ${styles.delete}`} onClick={() => handleDelete(t.id)}>
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {!isLoading && configs.length === 0 && (
                        <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>Нет настроенных шаблонов.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
