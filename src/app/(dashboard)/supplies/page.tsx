'use client';

import { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Save, Send, Trash, RefreshCw, Calendar, RefreshCcw } from 'lucide-react';
import styles from './supplies.module.css';

interface SupplyItem {
    id: number;
    ingredient_id: number | null;
    ingredient_name: string;
    quantity: number;
    unit: string;
    price: number;
    total: number;
    item_type: string;
    poster_account_id: number | null;
    poster_account_name: string | null;
    storage_id: number | null;
    storage_name: string | null;
}

interface SupplyDraft {
    id: number;
    supplier_name: string;
    supplier_id: number | null;
    invoice_date: string;
    total_sum: number;
    source: string;
    linked_expense_draft_id: number | null;
    linked_expense_amount: number;
    linked_expense_source: string;
    items: SupplyItem[];
}

export default function SuppliesPage() {
    const [drafts, setDrafts] = useState<SupplyDraft[]>([]);
    const [pendingExpenses, setPendingExpenses] = useState<any[]>([]);
    const [posterAccounts, setPosterAccounts] = useState<any[]>([]);
    const [catalogItems, setCatalogItems] = useState<any[]>([]);
    const [suppliers, setSuppliers] = useState<any[]>([]);

    // UI states
    const [isSaving, setIsSaving] = useState<Record<number, boolean>>({});
    const [isProcessing, setIsProcessing] = useState<Record<number, boolean>>({});
    const [errorMsg, setErrorMsg] = useState('');

    // Autocomplete states
    const [openSupplierId, setOpenSupplierId] = useState<number | null>(null);
    const [supplierSearch, setSupplierSearch] = useState('');

    // Ingredient Autocomplete mapping: draftId_itemId -> true/false
    const [openItemId, setOpenItemId] = useState<string | null>(null);
    const [itemSearch, setItemSearch] = useState('');

    const fetchData = async () => {
        try {
            const res = await fetch('/api/supplies');
            const data = await res.json();
            if (data.drafts) setDrafts(data.drafts);
            if (data.pending_supplies) setPendingExpenses(data.pending_supplies);
            if (data.poster_accounts) setPosterAccounts(data.poster_accounts);
        } catch (e) {
            console.error(e);
        }
    };

    const fetchDicts = async () => {
        try {
            const [itemsRes, supRes] = await Promise.all([
                fetch('/api/supplies/search-items'),
                fetch('/api/supplies/suppliers')
            ]);
            const itemsData = await itemsRes.json();
            const supData = await supRes.json();
            if (itemsData.items) setCatalogItems(itemsData.items);
            if (supData.suppliers) setSuppliers(supData.suppliers);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        fetchData();
        fetchDicts();
    }, []);

    // -------- DRAFT CRUD --------

    const handleCreateDraft = async () => {
        try {
            const res = await fetch('/api/supplies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: 'cash' })
            });
            if (res.ok) {
                fetchData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteDraft = async (id: number) => {
        if (!confirm('Удалить этот черновик?')) return;
        try {
            await fetch(`/api/supplies/${id}`, { method: 'DELETE' });
            setDrafts(prev => prev.filter(d => d.id !== id));
        } catch (e) {
            console.error(e);
        }
    };

    const updateDraftField = async (draftId: number, field: string, value: any) => {
        // Optimistic update
        setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, [field]: value } : d));

        try {
            await fetch(`/api/supplies/${draftId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });

            // If changing supplier, let's also try to auto-map supplier_id if it matches catalog
            if (field === 'supplier_name') {
                const matched = suppliers.find(s => s.name.toLowerCase() === value.toLowerCase());
                if (matched) {
                    await fetch(`/api/supplies/${draftId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ supplier_id: matched.id })
                    });
                    setDrafts(prev => prev.map(d => d.id === draftId ? { ...d, supplier_id: matched.id } : d));
                }
            }
        } catch (e) {
            console.error(e);
        }
    };

    // -------- MATH PARSER --------
    const parseMath = (val: string | number): number => {
        if (typeof val === 'number') return val;
        try {
            const sanitized = val.toString().replace(/,/g, '.').replace(/[^0-9.\+\-\*\/\(\)\s]/g, '');
            if (!sanitized) return 0;
            // eslint-disable-next-line no-new-func
            const result = new Function('return ' + sanitized)();
            return isNaN(result) ? 0 : Number(result);
        } catch {
            return Number(val) || 0;
        }
    };

    // -------- ITEMS CRUD --------

    const handleItemUpdate = async (draftId: number, itemId: number, field: string, value: any) => {
        // Optimistic
        setDrafts(prev => prev.map(d => {
            if (d.id !== draftId) return d;
            return {
                ...d,
                items: d.items.map(i => i.id === itemId ? { ...i, [field]: value } : i)
            };
        }));

        try {
            const payload: any = { [field]: value };

            // If updating name, auto-link ingredient_id if matching catalog exactly
            if (field === 'ingredient_name' || field === 'item_name') {
                const matched = catalogItems.find(c => c.name.toLowerCase() === value.toLowerCase());
                if (matched) {
                    payload.ingredient_id = matched.id;
                    payload.poster_account_id = matched.poster_account_id;
                    payload.poster_account_name = matched.poster_account_name;
                    payload.item_type = matched.type;

                    // Optimistic update for these
                    setDrafts(prev => prev.map(d => d.id === draftId ? {
                        ...d,
                        items: d.items.map(i => i.id === itemId ? {
                            ...i,
                            ingredient_id: matched.id,
                            poster_account_id: matched.poster_account_id,
                            poster_account_name: matched.poster_account_name,
                            item_type: matched.type
                        } : i)
                    } : d));
                }
            }

            const res = await fetch(`/api/supplies/items/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok && (field === 'price' || field === 'quantity')) {
                // Total recalculates on server, refresh data to get correct draft total
                fetchData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDeleteItem = async (draftId: number, itemId: number) => {
        try {
            await fetch(`/api/supplies/items/${itemId}`, { method: 'DELETE' });
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    // -------- ADVANCED COMMANDS --------

    const handleRepeatLast = async (draftId: number, supplierId: number | null) => {
        if (!supplierId) return alert('Выберите поставщика из выпадающего списка!');

        setIsSaving(prev => ({ ...prev, [draftId]: true }));
        try {
            const res = await fetch(`/api/supplies/last/${supplierId}`);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                // Add all as new items
                for (const hItem of data.items) {
                    const matched = catalogItems.find(c => c.id === hItem.id) ||
                        catalogItems.find(c => c.name.toLowerCase() === hItem.name.toLowerCase());

                    const payload = {
                        ingredient_name: hItem.name,
                        quantity: 1, // Repeat usually wants manual quantity adjust, but we can put 1 
                        price: hItem.price,
                        ingredient_id: matched?.id || hItem.id,
                        poster_account_id: matched?.poster_account_id,
                        poster_account_name: matched?.poster_account_name,
                        item_type: matched?.type
                    };

                    await fetch(`/api/supplies/${draftId}/items`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }
                fetchData();
            } else {
                alert('Нет истории поставок для этого поставщика.');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(prev => ({ ...prev, [draftId]: false }));
        }
    };

    const handleProcess = async (draftId: number) => {
        setErrorMsg('');
        setIsProcessing(prev => ({ ...prev, [draftId]: true }));
        try {
            const res = await fetch(`/api/supplies/${draftId}/process`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                alert(`Успешно! Поставка проведена в Poster (${data.supplies.length} док-тов)`);
                fetchData();
            } else {
                setErrorMsg(data.error || 'Ошибка при проведении накладной');
                alert(data.error || 'Ошибка при проведении накладной');
            }
        } catch (e) {
            console.error(e);
            alert('Сбой сети при проведении.');
        } finally {
            setIsProcessing(prev => ({ ...prev, [draftId]: false }));
        }
    };

    return (
        <div className={styles.container}>
            <datalist id="catalog-list">
                {catalogItems.map(c => (
                    <option key={c.id + c.poster_account_name} value={c.name}>
                        {c.type === 'product' ? '🥤' : '🍔'} {c.poster_account_name}
                    </option>
                ))}
            </datalist>

            <header className={styles.topNav}>
                <h1 className={styles.pageTitle}>Поставки</h1>
                <button className={styles.primaryBtn} onClick={handleCreateDraft}>
                    <Plus size={18} />
                    Новая поставка
                </button>
            </header>

            {errorMsg && (
                <div style={{ background: '#fef2f2', color: '#ef4444', padding: '1rem', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                    {errorMsg}
                </div>
            )}

            {drafts.length === 0 && (
                <div style={{ textAlign: 'center', color: '#6b7280', marginTop: '4rem' }}>
                    <Package size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>Нет открытых черновиков поставок за сегодня.<br />Нажмите "Новая поставка" чтобы начать.</p>
                </div>
            )}

            {drafts.map(draft => (
                <div key={draft.id} className={styles.draftCard}>

                    {/* Header: Meta */}
                    <div className={styles.draftHeader}>
                        <div className={styles.draftMeta}>
                            <div className={styles.inputGroup} style={{ flex: '1', minWidth: '250px' }}>
                                <label>Поставщик</label>
                                <div style={{ display: 'flex', gap: '0.5rem', position: 'relative' }}>
                                    <div className={styles.supplierWrapper}>
                                        <input
                                            type="text"
                                            className={`${styles.controlInput} ${draft.supplier_name && suppliers.some(s => s.name.toLowerCase() === draft.supplier_name.toLowerCase()) ? styles.inputSuccess : (draft.supplier_name ? styles.inputWarning : '')}`}
                                            placeholder="Название..."
                                            value={openSupplierId === draft.id ? supplierSearch : (draft.supplier_name || '')}
                                            onFocus={() => { setOpenSupplierId(draft.id); setSupplierSearch(draft.supplier_name || ''); }}
                                            onChange={e => setSupplierSearch(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    const exactMatch = suppliers.find(s => s.name.toLowerCase() === supplierSearch.toLowerCase());
                                                    updateDraftField(draft.id, 'supplier_name', exactMatch ? exactMatch.name : supplierSearch);
                                                    setOpenSupplierId(null);
                                                }
                                            }}
                                            onBlur={(e) => {
                                                // Small delay to allow click on option to register first
                                                setTimeout(() => {
                                                    if (openSupplierId === draft.id) {
                                                        updateDraftField(draft.id, 'supplier_name', supplierSearch);
                                                        setOpenSupplierId(null);
                                                    }
                                                }, 150);
                                            }}
                                            style={{ width: '100%' }}
                                        />
                                        {openSupplierId === draft.id && (
                                            <div className={styles.supplierDropdown}>
                                                {suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).map((s) => (
                                                    <div
                                                        key={`sup-${s.id}`}
                                                        className={styles.supplierOption}
                                                        onMouseDown={(e) => {
                                                            e.preventDefault();
                                                            updateDraftField(draft.id, 'supplier_name', s.name);
                                                            setOpenSupplierId(null);
                                                        }}
                                                    >
                                                        {s.name}
                                                    </div>
                                                ))}
                                                {suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).length === 0 && (
                                                    <div className={styles.supplierOption} style={{ opacity: 0.5 }}>Нет совпадений (будет создан)</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleRepeatLast(draft.id, draft.supplier_id)}
                                        title="Повторить последнюю накладную"
                                        style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0 0.8rem', cursor: 'pointer', color: '#4b5563', height: '40px' }}
                                    >
                                        <RefreshCcw size={16} />
                                    </button>
                                </div>
                            </div>

                            <div className={styles.inputGroup} style={{ maxWidth: '160px' }}>
                                <label>Оплата с</label>
                                <select
                                    className={styles.controlInput}
                                    value={draft.source}
                                    onChange={(e) => updateDraftField(draft.id, 'source', e.target.value)}
                                >
                                    <option value="cash">Наличные (Сейф)</option>
                                    <option value="kaspi">Kaspi</option>
                                    <option value="halyk">Halyk</option>
                                </select>
                            </div>
                        </div>

                        <div className={styles.draftTotal}>
                            <div className={styles.totalLabel}>Итого</div>
                            <div className={styles.totalValue}>
                                {draft.total_sum.toLocaleString('ru')} <span style={{ fontSize: '1.2rem', color: '#9ca3af' }}>₸</span>
                            </div>
                            {draft.linked_expense_draft_id && (
                                <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px' }}>
                                    <span title="Связано с расходом">🔗 Из расхода</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Table */}
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th style={{ width: '35%' }}>Позиция</th>
                                    <th style={{ width: '15%' }}>Кабинет</th>
                                    <th style={{ width: '15%' }}>Кол-во</th>
                                    <th style={{ width: '15%' }}>Цена</th>
                                    <th style={{ width: '15%' }}>Сумма</th>
                                    <th style={{ width: '5%' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {draft.items.map(item => (
                                    <tr key={item.id} className={styles.tableRow}>
                                        <td data-label="Позиция">
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    className={`${styles.cellInput} ${styles.inputName}`}
                                                    placeholder="Поиск ингредиента..."
                                                    value={openItemId === `${draft.id}_${item.id}` ? itemSearch : (item.ingredient_name || '')}
                                                    onFocus={() => { setOpenItemId(`${draft.id}_${item.id}`); setItemSearch(item.ingredient_name || ''); }}
                                                    onChange={e => setItemSearch(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            const exactMatch = catalogItems.find(c => c.name.toLowerCase() === itemSearch.toLowerCase());
                                                            handleItemUpdate(draft.id, item.id, 'ingredient_name', exactMatch ? exactMatch.name : itemSearch);
                                                            setOpenItemId(null);
                                                        }
                                                    }}
                                                    onBlur={(e) => {
                                                        setTimeout(() => {
                                                            if (openItemId === `${draft.id}_${item.id}`) {
                                                                handleItemUpdate(draft.id, item.id, 'ingredient_name', itemSearch);
                                                                setOpenItemId(null);
                                                            }
                                                        }, 150);
                                                    }}
                                                />
                                                {openItemId === `${draft.id}_${item.id}` && (
                                                    <div className={styles.supplierDropdown}>
                                                        {catalogItems.filter(c => c.name.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 30).map((c) => (
                                                            <div
                                                                key={`cat-item-${c.id}-${c.poster_account_name}`}
                                                                className={styles.supplierOption}
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    handleItemUpdate(draft.id, item.id, 'ingredient_name', c.name);
                                                                    setOpenItemId(null);
                                                                }}
                                                            >
                                                                <span style={{ marginRight: '8px' }}>{c.type === 'product' ? '🥤' : '🍔'}</span>
                                                                {c.name}
                                                                <span style={{ opacity: 0.5, fontSize: '0.75rem', marginLeft: '6px' }}>({c.poster_account_name})</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td data-label="Кабинет">
                                            <span style={{ color: '#9ca3af', fontSize: '0.8rem', fontWeight: 500 }}>
                                                {item.poster_account_name || 'Авто'}
                                            </span>
                                        </td>
                                        <td data-label="Кол-во">
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                                <input
                                                    type="text"
                                                    className={`${styles.cellInput} ${styles.inputQty}`}
                                                    defaultValue={item.quantity}
                                                    onFocus={e => {
                                                        if (e.target.value === '1' || e.target.value === '0') e.target.value = '';
                                                        e.target.select();
                                                    }}
                                                    onBlur={(e) => {
                                                        let val = e.target.value;
                                                        if (val === '') val = '1';
                                                        const num = parseMath(val);
                                                        e.target.value = num.toString();
                                                        handleItemUpdate(draft.id, item.id, 'quantity', num);
                                                    }}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.8rem', color: '#9ca3af', width: '20px' }}>{item.unit}</span>
                                            </div>
                                        </td>
                                        <td data-label="Цена">
                                            <input
                                                type="text"
                                                className={`${styles.cellInput} ${styles.inputPrice}`}
                                                defaultValue={item.price}
                                                onFocus={e => {
                                                    if (e.target.value === '0') e.target.value = '';
                                                    e.target.select();
                                                }}
                                                onBlur={(e) => {
                                                    let val = e.target.value;
                                                    if (val === '') val = '0';
                                                    const num = Math.round(parseMath(val));
                                                    e.target.value = num.toString();
                                                    handleItemUpdate(draft.id, item.id, 'price', num);
                                                }}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') e.currentTarget.blur();
                                                }}
                                            />
                                            {item.ingredient_id && (
                                                <span className={styles.priceHint} onClick={async () => {
                                                    // Quick fetch last price
                                                    const res = await fetch(`/api/supplies/price-history/${item.ingredient_id}`);
                                                    const hist = await res.json();
                                                    if (hist.history && hist.history.length > 0) {
                                                        const p = hist.history[0].price;
                                                        handleItemUpdate(draft.id, item.id, 'price', p);
                                                    }
                                                }}>
                                                    Цены...
                                                </span>
                                            )}
                                        </td>
                                        <td data-label="Сумма" style={{ textAlign: 'right' }}>
                                            <span className={styles.readonlySum}>{(item.quantity * item.price).toLocaleString('ru')}</span>
                                        </td>
                                        <td>
                                            <button className={styles.trashBtn} onClick={() => handleDeleteItem(draft.id, item.id)}>
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}

                                {/* Remove newRowTemplate implicit row here */}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ padding: '0 1.5rem', marginTop: '1rem' }}>
                        <button
                            className={styles.addItemBtn}
                            onClick={async () => {
                                await fetch(`/api/supplies/${draft.id}/items`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ ingredient_name: '', quantity: 1, price: 0 })
                                });
                                fetchData();
                            }}
                        >
                            <Plus size={18} />
                            Добавить позицию
                        </button>
                    </div>

                    {/* Footer buttons */}
                    <div className={styles.footerActions}>
                        <button className={`${styles.btn} ${styles.btnDelete}`} onClick={() => handleDeleteDraft(draft.id)}>
                            <Trash size={16} />
                            Удалить черновик
                        </button>
                        <button
                            className={`${styles.btn} ${styles.btnProcess}`}
                            onClick={() => handleProcess(draft.id)}
                            disabled={isProcessing[draft.id] || draft.items.length === 0}
                        >
                            {isProcessing[draft.id] ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                            Провести в Poster
                        </button>
                    </div>

                </div>
            ))}
        </div>
    );
}
