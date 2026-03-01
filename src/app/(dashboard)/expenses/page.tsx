'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCw, PlayCircle, Trash2, CheckSquare, Loader2, ChevronLeft, ChevronRight, X, Copy, Check, Circle, Box, DollarSign } from 'lucide-react';
import styles from './expenses.module.css';

interface Expense {
    id: number;
    amount: string | number;
    posterAmount?: string | number | null;
    description: string;
    category: string;
    source: string;
    status: string;
    expenseType: string;
    isIncome: boolean;
    completionStatus: string;
    posterAccountId?: number;
    posterTransactionId?: string;
    organization?: any; // To get the name
}

interface Reconciliation {
    fact_balance: number | null;
    total_difference: number | null;
    notes: string;
}

export default function ExpensesPage() {
    // 1. Core State
    const [date, setDate] = useState(() => {
        const d = new Date();
        if (d.getHours() < 6) d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });

    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [posterTotals, setPosterTotals] = useState({ cash: 0, kaspi: 0, halyk: 0 });
    const [posterAccounts, setPosterAccounts] = useState<any[]>([]);
    const [recon, setRecon] = useState<Record<string, Reconciliation>>({});

    // UI State
    const [isLoading, setIsLoading] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // Modals
    const [showChecklist, setShowChecklist] = useState(false);
    const [checklistReport, setChecklistReport] = useState('');
    const [checklistLoading, setChecklistLoading] = useState(false);

    // New Row State
    const [newRows, setNewRows] = useState<Record<string, Partial<Expense>>>({
        cash: { amount: '', description: '', expenseType: 'TRANSACTION', category: '', posterAccountId: undefined },
        kaspi: { amount: '', description: '', expenseType: 'TRANSACTION', category: '', posterAccountId: undefined },
        halyk: { amount: '', description: '', expenseType: 'TRANSACTION', category: '', posterAccountId: undefined }
    });

    // Autocomplete & Sorting & Refs
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [openCatId, setOpenCatId] = useState<number | string | null>(null);
    const [catSearch, setCatSearch] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Click outside to close category dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenCatId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch Logic
    const fetchData = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            const [expRes, recRes] = await Promise.all([
                fetch(`/api/expenses?date=${date}`),
                fetch(`/api/shift-reconciliation?date=${date}`)
            ]);

            const expData = await expRes.json();
            const recData = await recRes.json();

            if (expData.success) {
                setExpenses(expData.drafts);
                setCategories(expData.categories);
                setPosterAccounts(expData.poster_accounts || []);
                setPosterTotals(expData.account_totals || { cash: 0, kaspi: 0, halyk: 0 });

                // Initialize new row posterAccountIds if not set
                if (expData.poster_accounts && expData.poster_accounts.length > 0) {
                    const primary = expData.poster_accounts.find((p: any) => p.is_primary) || expData.poster_accounts[0];
                    setNewRows(prev => {
                        const updated = { ...prev };
                        Object.keys(updated).forEach(k => {
                            if (!updated[k].posterAccountId) updated[k].posterAccountId = primary.id;
                        });
                        return updated;
                    });
                }
            }
            if (recData.success) {
                setRecon(recData.reconciliation);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        setSelectedIds(new Set());
    }, [date]);

    // Data grouping
    const { cashDrafts, kaspiDrafts, halykDrafts } = useMemo(() => {
        return {
            cashDrafts: expenses.filter(e => String(e.source).toUpperCase() === 'CASH'),
            kaspiDrafts: expenses.filter(e => String(e.source).toUpperCase() === 'KASPI'),
            halykDrafts: expenses.filter(e => String(e.source).toUpperCase() === 'HALYK')
        };
    }, [expenses]);

    // Handlers
    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/expenses/sync-from-poster', { method: 'POST' });
            await fetchData(true);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.size === 0 || !confirm('Удалить выбранные записи?')) return;
        try {
            for (const id of Array.from(selectedIds)) {
                await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
            }
            setSelectedIds(new Set());
            fetchData(true);
        } catch (e) { console.error(e); }
    };

    const handleProcessSelected = async () => {
        if (selectedIds.size === 0 || !confirm('Провести транзакции в Poster?')) return;
        setIsProcessing(true);
        try {
            await fetch('/api/expenses/process', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ draft_ids: Array.from(selectedIds) })
            });
            setSelectedIds(new Set());
            fetchData(true);
        } catch (e) { console.error(e); } finally {
            setIsProcessing(false);
        }
    };

    // Auto-save logic
    const handleUpdateField = (id: number, field: keyof Expense, value: any) => {
        setExpenses(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const handleBlurSave = async (id: number, field: keyof Expense, value: any) => {
        try {
            await fetch(`/api/expenses/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            if (field === 'amount') fetchData(true); // refresh totals if amount changed
        } catch (e) { console.error(e); }
    };

    const handleToggleType = async (id: number, current: string) => {
        const next = current === 'TRANSACTION' ? 'SUPPLY' : 'TRANSACTION';
        handleUpdateField(id, 'expenseType', next); // optimistic
        try {
            await fetch(`/api/expenses/${id}/toggle-type`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expense_type: next })
            });
        } catch (e) { console.error(e); }
    };

    const handleToggleDept = async (id: number, currentAccId: number | undefined) => {
        if (posterAccounts.length === 0) return;
        const currentIndex = posterAccounts.findIndex(p => p.id === currentAccId);
        const nextIndex = (currentIndex + 1) % posterAccounts.length;
        const nextAcc = posterAccounts[nextIndex];

        handleUpdateField(id, 'posterAccountId', nextAcc.id);
        try {
            await fetch(`/api/expenses/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ posterAccountId: nextAcc.id })
            });
        } catch (e) { console.error(e); }
    };

    // New Row logic
    const handleNewRowChange = (sourceKey: string, field: string, value: any) => {
        setNewRows(prev => ({
            ...prev,
            [sourceKey]: { ...prev[sourceKey], [field]: value }
        }));
    };

    const handleNewRowSubmit = async (sourceKey: string, overrideCategory?: string) => {
        const row = newRows[sourceKey];
        if (!row.amount || !row.description) return; // wait until filled

        try {
            await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: Number(row.amount),
                    description: row.description,
                    expense_type: row.expenseType,
                    category: overrideCategory !== undefined ? overrideCategory : row.category,
                    source: sourceKey.toUpperCase(),
                    poster_account_id: row.posterAccountId,
                    is_income: false
                })
            });
            // Reset row
            setNewRows(prev => ({
                ...prev, [sourceKey]: { ...prev[sourceKey], amount: '', description: '', expenseType: 'TRANSACTION', category: '' }
            }));
            fetchData(true);
        } catch (e) { console.error(e); }
    };

    const handleSaveRecon = async (source: string, val: string) => {
        const num = parseFloat(val);
        const srcLower = source.toLowerCase();
        const posterVal = (posterTotals as any)[srcLower] || 0;
        const diff = !isNaN(num) ? num - posterVal : null;

        await fetch('/api/shift-reconciliation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, source, fact_balance: isNaN(num) ? null : num, total_difference: diff })
        });
        setRecon(prev => ({
            ...prev, [srcLower]: { ...prev[srcLower], fact_balance: isNaN(num) ? null : num, total_difference: diff }
        }));
    };

    const toggleSelect = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelectedIds(next);
    };

    const toggleSelectAll = (drafts: Expense[]) => {
        const allSelected = drafts.every(d => selectedIds.has(d.id));
        const next = new Set(selectedIds);
        if (allSelected) {
            drafts.forEach(d => next.delete(d.id));
        } else {
            drafts.forEach(d => next.add(d.id));
        }
        setSelectedIds(next);
    };

    const shiftDate = (d: number) => {
        const dateObj = new Date(date);
        dateObj.setDate(dateObj.getDate() + d);
        setDate(dateObj.toISOString().split('T')[0]);
    };

    const openChecklist = async () => {
        setShowChecklist(true); setChecklistLoading(true);
        try {
            const res = await fetch(`/api/expense-report?date=${date}`);
            const data = await res.json();
            if (data.success) setChecklistReport(data.report);
        } catch (e) { console.error(e); }
        setChecklistLoading(false);
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ columnKey }: { columnKey: string }) => {
        if (!sortConfig || sortConfig.key !== columnKey) return <span className={styles.sortIcon}>↕</span>;
        return <span className={`${styles.sortIcon} ${styles.active}`}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const renderTable = (drafts: Expense[], sourceKey: string) => {
        let totalRecords = drafts.length;
        let transCount = drafts.filter(d => d.expenseType !== 'SUPPLY').length;
        let suppCount = drafts.filter(d => d.expenseType === 'SUPPLY').length;
        let totalMoney = drafts.reduce((sum, d) => sum + (d.isIncome ? Number(d.amount) : -Number(d.amount)), 0);

        const rowColorClass = sourceKey === 'cash' ? styles.rowCash : sourceKey === 'kaspi' ? styles.rowKaspi : styles.rowHalyk;
        const allRowSelected = drafts.length > 0 && drafts.every(d => selectedIds.has(d.id));

        // Apply Sorting
        let sortedDrafts = [...drafts];
        if (sortConfig) {
            sortedDrafts.sort((a, b) => {
                let valA: any = a[sortConfig.key as keyof Expense];
                let valB: any = b[sortConfig.key as keyof Expense];

                if (sortConfig.key === 'category') {
                    valA = a.category?.toLowerCase() || '';
                    valB = b.category?.toLowerCase() || '';
                } else if (sortConfig.key === 'description') {
                    valA = a.description?.toLowerCase() || '';
                    valB = b.description?.toLowerCase() || '';
                } else if (sortConfig.key === 'amount') {
                    valA = Number(a.amount);
                    valB = Number(b.amount);
                } else if (sortConfig.key === 'expenseType') {
                    valA = a.expenseType;
                    valB = b.expenseType;
                } else if (sortConfig.key === 'posterAccountId') {
                    valA = posterAccounts.find(p => p.id === a.posterAccountId)?.name || '';
                    valB = posterAccounts.find(p => p.id === b.posterAccountId)?.name || '';
                } else if (sortConfig.key === 'selected') {
                    valA = selectedIds.has(a.id) ? 1 : 0;
                    valB = selectedIds.has(b.id) ? 1 : 0;
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return (
            <div>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={`${styles.tdCheckbox} ${styles.sortableHeader}`} onClick={() => handleSort('selected')}>
                                <input type="checkbox" className={styles.customCheckbox} checked={allRowSelected} onChange={(e) => { e.stopPropagation(); toggleSelectAll(drafts); }} />
                            </th>
                            <th className={styles.tdStatus}></th>
                            <th className={styles.sortableHeader} onClick={() => handleSort('amount')}>Сумма <SortIcon columnKey="amount" /></th>
                            <th className={styles.sortableHeader} onClick={() => handleSort('description')}>Описание <SortIcon columnKey="description" /></th>
                            <th className={styles.sortableHeader} onClick={() => handleSort('expenseType')}>Тип <SortIcon columnKey="expenseType" /></th>
                            <th className={styles.sortableHeader} onClick={() => handleSort('category')}>Категория <SortIcon columnKey="category" /></th>
                            <th className={styles.sortableHeader} onClick={() => handleSort('posterAccountId')}>Отдел <SortIcon columnKey="posterAccountId" /></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedDrafts.map(d => (
                            <tr key={d.id} className={`${styles.tableRow} ${rowColorClass} ${d.expenseType === 'SUPPLY' ? styles.bgSupply : styles.bgTransaction}`}>
                                <td className={styles.tdCheckbox}>
                                    <input type="checkbox" className={styles.customCheckbox} checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} />
                                </td>
                                <td className={styles.tdStatus}>
                                    <div className={`${styles.statusIcon} ${d.completionStatus === 'COMPLETED' ? styles.completed : styles.pending}`} title={d.completionStatus === 'COMPLETED' ? "Проведен в Poster" : "Черновик"}>
                                        {d.completionStatus === 'COMPLETED' ? <Check size={14} /> : <Circle size={10} style={{ opacity: 0.2 }} />}
                                    </div>
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        className={`${styles.cellInput} ${styles.inputAmount}`}
                                        value={d.amount}
                                        onChange={e => handleUpdateField(d.id, 'amount', e.target.value)}
                                        onBlur={e => handleBlurSave(d.id, 'amount', Number(e.target.value))}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="text"
                                        className={`${styles.cellInput} ${styles.inputDesc}`}
                                        value={d.description}
                                        onChange={e => handleUpdateField(d.id, 'description', e.target.value)}
                                        onBlur={e => handleBlurSave(d.id, 'description', e.target.value)}
                                    />
                                </td>
                                <td>
                                    <button
                                        className={`${styles.typeToggle} ${d.expenseType === 'SUPPLY' ? styles.isSupply : ''}`}
                                        onClick={() => handleToggleType(d.id, d.expenseType)}
                                    >
                                        {d.expenseType === 'SUPPLY' ? <><Box size={14} /> поставка</> : <><DollarSign size={14} /> транзакция</>}
                                    </button>
                                </td>
                                <td style={{ position: 'relative' }}>
                                    <input
                                        type="text"
                                        className={styles.categorySelect}
                                        placeholder="-- Категория --"
                                        value={openCatId === d.id ? catSearch : (d.category || '')}
                                        onFocus={() => { setOpenCatId(d.id); setCatSearch(d.category || ''); }}
                                        onChange={e => setCatSearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                const matches = categories.filter(c => (c.category_name || c.name || '').toLowerCase().includes(catSearch.toLowerCase()));
                                                if (matches.length > 0) {
                                                    const catName = matches[0].category_name || matches[0].name;
                                                    handleUpdateField(d.id, 'category', catName);
                                                    handleBlurSave(d.id, 'category', catName);
                                                    setOpenCatId(null);
                                                }
                                            }
                                        }}
                                    />
                                    {openCatId === d.id && (
                                        <div className={styles.categoryDropdown} ref={dropdownRef}>
                                            {categories.filter(c => (c.category_name || c.name || '').toLowerCase().includes(catSearch.toLowerCase())).map((c, i) => (
                                                <div
                                                    key={`cat-${c.category_id}-${i}`}
                                                    className={styles.categoryOption}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        const catName = c.category_name || c.name;
                                                        handleUpdateField(d.id, 'category', catName);
                                                        handleBlurSave(d.id, 'category', catName);
                                                        setOpenCatId(null);
                                                    }}
                                                >
                                                    {c.category_name || c.name} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({c.poster_account_name})</span>
                                                </div>
                                            ))}
                                            {categories.filter(c => (c.category_name || c.name || '').toLowerCase().includes(catSearch.toLowerCase())).length === 0 && (
                                                <div className={styles.categoryOption} style={{ opacity: 0.5 }}>Нет совпадений</div>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <button
                                        className={styles.deptPill}
                                        onClick={() => handleToggleDept(d.id, d.posterAccountId)}
                                    >
                                        {posterAccounts.find(p => p.id === d.posterAccountId)?.name || 'Pizzburg'}
                                    </button>
                                </td>
                                <td>
                                    <button className={styles.trashBtn} onClick={async () => {
                                        if (confirm('Удалить?')) {
                                            await fetch(`/api/expenses/${d.id}`, { method: 'DELETE' });
                                            fetchData(true);
                                        }
                                    }}>
                                        <Trash2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}

                        {/* New Row Insert */}
                        <tr className={`${styles.tableRow} ${rowColorClass} ${styles.newRowTemplate}`}>
                            <td className={styles.tdCheckbox}>
                                <input type="checkbox" className={styles.customCheckbox} disabled />
                            </td>
                            <td className={styles.tdStatus}>
                                <div className={`${styles.statusIcon} ${styles.pending}`}><Circle size={10} style={{ opacity: 0.2 }} /></div>
                            </td>
                            <td>
                                <input
                                    type="number"
                                    className={`${styles.cellInput} ${styles.inputAmount}`}
                                    placeholder="0"
                                    value={newRows[sourceKey].amount}
                                    onChange={e => handleNewRowChange(sourceKey, 'amount', e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleNewRowSubmit(sourceKey) }}
                                />
                            </td>
                            <td>
                                <input
                                    type="text"
                                    className={`${styles.cellInput} ${styles.inputDesc}`}
                                    placeholder="Новая запись..."
                                    value={newRows[sourceKey].description}
                                    onChange={e => handleNewRowChange(sourceKey, 'description', e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleNewRowSubmit(sourceKey) }}
                                />
                            </td>
                            <td>
                                <button className={`${styles.typeToggle} ${newRows[sourceKey].expenseType === 'SUPPLY' ? styles.isSupply : ''}`} onClick={() => {
                                    handleNewRowChange(sourceKey, 'expenseType', newRows[sourceKey].expenseType === 'TRANSACTION' ? 'SUPPLY' : 'TRANSACTION');
                                }}>
                                    {newRows[sourceKey].expenseType === 'SUPPLY' ? <><Box size={14} /> поставка</> : <><DollarSign size={14} /> транзакция</>}
                                </button>
                            </td>
                            <td style={{ position: 'relative' }}>
                                <input
                                    type="text"
                                    className={styles.categorySelect}
                                    placeholder="-- Категория --"
                                    value={openCatId === `new_${sourceKey}` ? catSearch : (newRows[sourceKey].category || '')}
                                    onFocus={() => { setOpenCatId(`new_${sourceKey}`); setCatSearch(newRows[sourceKey].category || ''); }}
                                    onChange={e => setCatSearch(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const matches = categories.filter(c => (c.category_name || c.name || '').toLowerCase().includes(catSearch.toLowerCase()));
                                            if (matches.length > 0) {
                                                const catName = matches[0].category_name || matches[0].name;
                                                handleNewRowChange(sourceKey, 'category', catName);
                                                setOpenCatId(null);
                                                handleNewRowSubmit(sourceKey, catName);
                                            } else {
                                                handleNewRowChange(sourceKey, 'category', catSearch);
                                                setOpenCatId(null);
                                                handleNewRowSubmit(sourceKey, catSearch);
                                            }
                                        }
                                    }}
                                />
                                {openCatId === `new_${sourceKey}` && (
                                    <div className={styles.categoryDropdown} ref={dropdownRef}>
                                        {categories.filter(c => (c.category_name || c.name || '').toLowerCase().includes(catSearch.toLowerCase())).map((c, i) => (
                                            <div
                                                key={`new-cat-${c.category_id}-${i}`}
                                                className={styles.categoryOption}
                                                onMouseDown={(e) => {
                                                    e.preventDefault();
                                                    const catName = c.category_name || c.name;
                                                    handleNewRowChange(sourceKey, 'category', catName);
                                                    setOpenCatId(null);
                                                    handleNewRowSubmit(sourceKey, catName);
                                                }}
                                            >
                                                {c.category_name || c.name} <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>({c.poster_account_name})</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </td>
                            <td>
                                <button className={styles.deptPill} onClick={() => {
                                    if (posterAccounts.length === 0) return;
                                    const currentIndex = posterAccounts.findIndex(p => p.id === newRows[sourceKey].posterAccountId);
                                    const nextIndex = (currentIndex + 1) % posterAccounts.length;
                                    handleNewRowChange(sourceKey, 'posterAccountId', posterAccounts[nextIndex].id);
                                }}>
                                    {posterAccounts.find(p => p.id === newRows[sourceKey].posterAccountId)?.name || 'Pizzburg'}
                                </button>
                            </td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>

                {/* Footer Totals */}
                <div className={styles.sectionFooter}>
                    <div className={styles.totalStats}>
                        <span>Всего: {totalRecords} записей</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><DollarSign size={14} /> Транзакций: {transCount}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Box size={14} /> Поставок: {suppCount}</span>
                    </div>
                    <div>
                        <span style={{ color: 'var(--foreground)' }}>Общая сумма: </span>
                        <span className={styles.totalAmount}>{Math.abs(totalMoney).toLocaleString('ru')}₸</span>
                    </div>
                </div>
            </div>
        );
    };

    if (isLoading && expenses.length === 0) {
        return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '4rem' }}><Loader2 size={32} className="animate-spin" style={{ color: 'var(--primary)' }} /></div>;
    }

    return (
        <div className={styles.container}>
            {/* Custom dropdown implies datalist logic not needed anymore here but let's just clear datalist render below optionally to clean DOM */}

            <div className={styles.topNav}>
                <h1 className={styles.pageTitle}>Черновики расходов</h1>
                <div className={styles.dateNav}>
                    <button className={styles.dateBtn} onClick={() => shiftDate(-1)}><ChevronLeft size={18} /></button>
                    <input type="date" className={styles.dateInput} value={date} onChange={e => setDate(e.target.value)} />
                    <button className={styles.dateBtn} onClick={() => shiftDate(1)}><ChevronRight size={18} /></button>
                </div>
            </div>

            <div className={styles.toolbar}>
                <div className={styles.toolbarButtons}>
                    <button className={`${styles.btn} ${styles.btnProcess}`} onClick={handleProcessSelected} disabled={isProcessing || selectedIds.size === 0}>
                        {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckSquare size={16} />}
                        Создать выбранные транзакции
                    </button>
                    <button className={`${styles.btn} ${styles.btnDelete}`} onClick={handleDeleteSelected} disabled={selectedIds.size === 0}>
                        <Trash2 size={16} />
                        Удалить выбранные
                    </button>
                    <button className={`${styles.btn} ${styles.btnSync}`} onClick={handleSync} disabled={isSyncing}>
                        <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        Синхронизировать
                    </button>
                    <button className={`${styles.btn} ${styles.btnChecklist}`} onClick={openChecklist}>
                        <CheckSquare size={16} />
                        Чеклист
                    </button>
                </div>
                <div className={styles.selectedCount}>
                    Выбрано: {selectedIds.size}
                </div>
            </div>

            {/* SECTIONS */}
            <div className={styles.sectionWrapper}>
                <div className={`${styles.sectionHeader} ${styles.cash}`}>
                    <span style={{ fontSize: '1.2rem' }}>💵</span> Наличка
                </div>
                <div className={styles.reconRow}>
                    <div className={styles.reconLeft}>
                        <div className={styles.reconGroup}>
                            Факт:
                            <input
                                type="number"
                                className={styles.reconInputBox}
                                value={recon.cash?.fact_balance === null ? '' : recon.cash?.fact_balance}
                                onChange={e => handleSaveRecon('cash', e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className={styles.reconGroup}>
                            Poster: <span className={styles.reconPosterVal}>{(posterTotals.cash || 0).toLocaleString('ru')}₸</span>
                        </div>
                    </div>
                    <div className={styles.reconRight}>
                        Разница: {' '}
                        <span className={`${styles.reconDiffVal} ${(recon.cash?.total_difference || 0) > 0 ? styles.pos : (recon.cash?.total_difference || 0) < 0 ? styles.neg : styles.zero}`}>
                            {(recon.cash?.total_difference || 0) > 0 ? '+' : ''}{(recon.cash?.total_difference || 0).toLocaleString('ru')}₸
                        </span>
                    </div>
                </div>
                {renderTable(cashDrafts, 'cash')}
            </div>

            <div className={styles.sectionWrapper}>
                <div className={`${styles.sectionHeader} ${styles.kaspi}`}>
                    <span style={{ fontSize: '1.2rem' }}>📱</span> Kaspi Pay
                </div>
                <div className={styles.reconRow}>
                    <div className={styles.reconLeft}>
                        <div className={styles.reconGroup}>
                            Факт:
                            <input
                                type="number"
                                className={styles.reconInputBox}
                                value={recon.kaspi?.fact_balance === null ? '' : recon.kaspi?.fact_balance}
                                onChange={e => handleSaveRecon('kaspi', e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className={styles.reconGroup}>
                            Poster: <span className={styles.reconPosterVal}>{(posterTotals.kaspi || 0).toLocaleString('ru')}₸</span>
                        </div>
                    </div>
                    <div className={styles.reconRight}>
                        Разница: {' '}
                        <span className={`${styles.reconDiffVal} ${(recon.kaspi?.total_difference || 0) > 0 ? styles.pos : (recon.kaspi?.total_difference || 0) < 0 ? styles.neg : styles.zero}`}>
                            {(recon.kaspi?.total_difference || 0) > 0 ? '+' : ''}{(recon.kaspi?.total_difference || 0).toLocaleString('ru')}₸
                        </span>
                    </div>
                </div>
                {renderTable(kaspiDrafts, 'kaspi')}
            </div>

            <div className={styles.sectionWrapper}>
                <div className={`${styles.sectionHeader} ${styles.halyk}`}>
                    <span style={{ fontSize: '1.2rem' }}>🏦</span> Халык
                </div>
                <div className={styles.reconRow}>
                    <div className={styles.reconLeft}>
                        <div className={styles.reconGroup}>
                            Факт:
                            <input
                                type="number"
                                className={styles.reconInputBox}
                                value={recon.halyk?.fact_balance === null ? '' : recon.halyk?.fact_balance}
                                onChange={e => handleSaveRecon('halyk', e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className={styles.reconGroup}>
                            Poster: <span className={styles.reconPosterVal}>{(posterTotals.halyk || 0).toLocaleString('ru')}₸</span>
                        </div>
                    </div>
                    <div className={styles.reconRight}>
                        Разница: {' '}
                        <span className={`${styles.reconDiffVal} ${(recon.halyk?.total_difference || 0) > 0 ? styles.pos : (recon.halyk?.total_difference || 0) < 0 ? styles.neg : styles.zero}`}>
                            {(recon.halyk?.total_difference || 0) > 0 ? '+' : ''}{(recon.halyk?.total_difference || 0).toLocaleString('ru')}₸
                        </span>
                    </div>
                </div>
                {renderTable(halykDrafts, 'halyk')}
            </div>

            {/* Checklist Modal */}
            {showChecklist && (
                <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) setShowChecklist(false); }}>
                    <div className={styles.modalContent}>
                        <div className={styles.modalHeader}>
                            <h2>Чеклист</h2>
                            <button className={styles.dateBtn} style={{ border: 'none' }} onClick={() => setShowChecklist(false)}><X size={20} /></button>
                        </div>
                        <div className={styles.modalBody}>
                            {checklistLoading ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}><Loader2 className="animate-spin" /></div>
                            ) : (
                                <>
                                    <div>
                                        <textarea
                                            readOnly
                                            style={{ width: '100%', minHeight: '200px', fontSize: '14px', fontFamily: 'monospace', lineHeight: 1.5, padding: '1rem', border: '1px solid #cbd5e1', borderRadius: '8px' }}
                                            value={checklistReport}
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={`${styles.btn} ${styles.btnProcess}`} onClick={() => {
                                navigator.clipboard.writeText(checklistReport);
                                alert('Скопировано в буфер обмена!');
                            }}>
                                <Copy size={16} /> Скопировать
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
