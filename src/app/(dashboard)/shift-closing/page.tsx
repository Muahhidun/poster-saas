'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './shift-closing.module.css';
import { CreditCard, Banknote, Calculator, FileCheck2, Loader2 } from 'lucide-react';

export default function ShiftClosingPage() {
    // Top-level inputs
    const [date, setDate] = useState(() => {
        // Default to today, or yesterday if before 6 AM (business day logic per spec)
        const d = new Date();
        if (d.getHours() < 6) d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });

    // Cashless Inputs
    const [wolt, setWolt] = useState('0');
    const [halyk, setHalyk] = useState('0');
    const [kaspi, setKaspi] = useState('0');
    const [kaspiCafe, setKaspiCafe] = useState('0');

    // Cash Inputs
    const [cashBills, setCashBills] = useState('0');
    const [cashCoins, setCashCoins] = useState('0');

    // Adjustments
    const [shiftStart, setShiftStart] = useState('15000');
    const [expenses, setExpenses] = useState('0');
    const [cashToLeave, setCashToLeave] = useState('15000');

    // Poster Data (Fetched from API)
    const [posterData, setPosterData] = useState({
        trade_total: 0,
        bonus: 0,
        poster_card: 0,
        poster_cash: 0
    });
    const [isFetchingPoster, setIsFetchingPoster] = useState(false);

    // Calculated Results
    const [results, setResults] = useState({
        fact_cashless: 0,
        fact_total: 0,
        fact_adjusted: 0,
        poster_total: 0,
        day_result: 0,
        shift_left: 0,
        cashless_diff: 0,
        collection: 0
    });
    const [isCalculating, setIsCalculating] = useState(false);

    // 1. Fetch Poster Data when Date changes
    useEffect(() => {
        async function fetchPosterData() {
            setIsFetchingPoster(true);
            try {
                // Remove hyphens for API format YYYYMMDD
                const formattedDate = date.replace(/-/g, '');
                const res = await fetch(`/api/shift-closing/poster-data?date=${formattedDate}`);
                const data = await res.json();

                if (data.success) {
                    setPosterData({
                        trade_total: data.trade_total / 100, // Converting tiyins to KZT
                        bonus: data.bonus / 100,
                        poster_card: data.poster_card / 100,
                        poster_cash: data.poster_cash / 100
                    });

                    // Auto-fill from cashier/cafe if available
                    if (data.cashier_wolt) setWolt(String(data.cashier_wolt));
                    if (data.cashier_halyk) setHalyk(String(data.cashier_halyk));
                    if (data.cashier_cash_bills) setCashBills(String(data.cashier_cash_bills));
                    if (data.cashier_cash_coins) setCashCoins(String(data.cashier_cash_coins));
                    if (data.cashier_expenses) setExpenses(String(data.cashier_expenses));
                    if (data.cafe_kaspi_pizzburg) setKaspiCafe(String(data.cafe_kaspi_pizzburg));
                    if (data.poster_prev_shift_left) setShiftStart(String(data.poster_prev_shift_left / 100));
                }
            } catch (error) {
                console.error("Error fetching poster data:", error);
            } finally {
                setIsFetchingPoster(false);
            }
        }
        fetchPosterData();
    }, [date]);

    // 2. Trigger Calculation when inputs change
    const calculateTotals = useCallback(async () => {
        setIsCalculating(true);
        try {
            const payload = {
                date,
                wolt: wolt || 0,
                halyk: halyk || 0,
                kaspi: kaspi || 0,
                kaspi_cafe: kaspiCafe || 0,
                cash_bills: cashBills || 0,
                cash_coins: cashCoins || 0,
                shift_start: shiftStart || 0,
                expenses: expenses || 0,
                cash_to_leave: cashToLeave || 15000,
                poster_trade: posterData.trade_total,
                poster_bonus: posterData.bonus,
                poster_card: posterData.poster_card
            };

            const res = await fetch('/api/shift-closing/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                setResults(data.calculations);
            }
        } catch (error) {
            console.error("Error calculating:", error);
        } finally {
            setIsCalculating(false);
        }
    }, [date, wolt, halyk, kaspi, kaspiCafe, cashBills, cashCoins, shiftStart, expenses, cashToLeave, posterData]);

    useEffect(() => {
        // Add a small debounce to prevent spamming the calculation API on every keystroke
        const timer = setTimeout(() => {
            calculateTotals();
        }, 300);
        return () => clearTimeout(timer);
    }, [calculateTotals]);

    // Save Data Handler
    const handleSave = async () => {
        setIsCalculating(true);
        try {
            const payload = {
                date,
                wolt: Number(wolt), halyk: Number(halyk), kaspi: Number(kaspi), kaspi_cafe: Number(kaspiCafe),
                cash_bills: Number(cashBills), cash_coins: Number(cashCoins),
                shift_start: Number(shiftStart), expenses: Number(expenses), cash_to_leave: Number(cashToLeave),
                poster_trade: posterData.trade_total, poster_bonus: posterData.bonus, poster_card: posterData.poster_card,
                fact_cashless: results.fact_cashless, fact_total: results.fact_total,
                fact_adjusted: results.fact_adjusted, poster_total: results.poster_total,
                day_result: results.day_result, shift_left: results.shift_left, collection: results.collection,
                cashless_diff: results.cashless_diff
            };

            // 1. Save Shift Closing Data
            const res = await fetch('/api/shift-closing/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!data.success) {
                alert(`Ошибка сохранения в БД: ${data.error}`);
                return;
            }

            // 2. Auto-Calculate Salaries 
            // Mock: hardcoding 2 cashiers for MVP, ideally this comes from a UI selector
            const calcSalariesRes = await fetch('/api/cashier/salaries/calculate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, cashier_count: 2 })
            });

            const salaryData = await calcSalariesRes.json();
            if (salaryData.success) {
                // 3. Fire transactions to Poster
                await fetch('/api/cashier/salaries/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        salaries: [
                            { role: 'Кассир', name: 'Кассир 1', amount: salaryData.salaries.cashier_salary },
                            { role: 'Кассир', name: 'Кассир 2', amount: salaryData.salaries.cashier_salary },
                            { role: 'Донерщик', name: 'Донерщик 1', amount: salaryData.salaries.doner_salary }
                        ]
                    })
                });
            }

            // 4. Create financial transfers (Collection, Wolt, Kaspi diffs)
            await fetch('/api/shift-closing/transfers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    date,
                    collection: results.collection,
                    wolt: Number(wolt),
                    halyk: Number(halyk),
                    cashless_diff: results.cashless_diff,
                    is_cafe: false
                })
            });

            // 5. Generate copyable report
            const reportText = `Закрытие смены (${date})\n\n` +
                `Торговля Постер: ${posterData.trade_total.toLocaleString('ru')} ₸\n` +
                `Безнал факт: ${results.fact_cashless.toLocaleString('ru')} ₸\n` +
                `Разница безнал: ${results.cashless_diff.toLocaleString('ru')} ₸\n` +
                `Инкассация: ${results.collection.toLocaleString('ru')} ₸\n\n` +
                `Итог дня: ${results.day_result > 0 ? '+' : ''}${results.day_result.toLocaleString('ru')} ₸\n` +
                `Оставили на завтра: ${cashToLeave} ₸\n\nАвтопереводы и зарплаты созданы в Poster. ✅`;

            await navigator.clipboard.writeText(reportText);

            alert('Смена успешно закрыта, переводы созданы, отчёт скопирован в буфер обмена!');
        } catch (e) {
            alert('Сетевая ошибка при сохранении');
        } finally {
            setIsCalculating(false);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <h1 className={styles.title}>Закрытие смены</h1>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }} />
                </div>
                <div className={styles.statusBadges}>
                    <div className={`${styles.badge} ${styles.ready}`}>
                        <span className={styles.dot}>●</span> Кассир сдал
                    </div>
                    <div className={`${styles.badge} ${styles.pending}`}>
                        <span className={styles.dot}>●</span> Кафе ожидается
                    </div>
                </div>
            </header>

            <div className={styles.grid}>
                {/* Cashless Block */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>
                        <CreditCard size={20} className={styles.icon} />
                        Безналичные
                    </h2>
                    <div className={styles.row}>
                        <div className={styles.inputGroup}>
                            <label>Wolt</label>
                            <input type="number" value={wolt} onChange={e => setWolt(e.target.value)} />
                        </div>
                        <div className={styles.inputGroup}>
                            <label>Halyk</label>
                            <input type="number" value={halyk} onChange={e => setHalyk(e.target.value)} />
                        </div>
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Kaspi (Терминал)</label>
                        <input type="number" value={kaspi} onChange={e => setKaspi(e.target.value)} />
                    </div>
                    <div className={styles.inputGroup}>
                        <label style={{ color: 'var(--danger)' }}>- Kaspi Cafe</label>
                        <input type="number" value={kaspiCafe} onChange={e => setKaspiCafe(e.target.value)} style={{ color: 'var(--danger)', borderColor: 'rgba(239, 68, 68, 0.3)' }} />
                    </div>
                </section>

                {/* Cash Block */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>
                        <Banknote size={20} className={styles.icon} />
                        Наличные
                    </h2>
                    <div className={styles.row}>
                        <div className={styles.inputGroup}>
                            <label>Бумажные</label>
                            <input type="number" value={cashBills} onChange={e => setCashBills(e.target.value)} />
                        </div>
                        <div className={styles.inputGroup}>
                            <label>Мелочь</label>
                            <input type="number" value={cashCoins} onChange={e => setCashCoins(e.target.value)} />
                        </div>
                    </div>

                    <div className={styles.resultBlock}>
                        <span className={styles.resultLabel}>Фактический</span>
                        <span className={styles.resultValue}>{results.fact_total.toLocaleString('ru')} ₸</span>
                    </div>
                </section>

                {/* Adjustments Block */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>
                        <Calculator size={20} className={styles.icon} />
                        Корректировки
                    </h2>
                    <div className={styles.row}>
                        <div className={styles.inputGroup}>
                            <label>Смена (Начало)</label>
                            <input type="number" value={shiftStart} onChange={e => setShiftStart(e.target.value)} />
                        </div>
                        <div className={styles.inputGroup}>
                            <label>Расходы с кассы</label>
                            <input type="number" value={expenses} onChange={e => setExpenses(e.target.value)} />
                        </div>
                    </div>
                    <div className={styles.resultBlock} style={{ borderColor: 'var(--primary)' }}>
                        <span className={styles.resultLabel}>Итого фактич.</span>
                        <span className={styles.resultValue}>{results.fact_adjusted.toLocaleString('ru')} ₸</span>
                    </div>
                </section>

                {/* Poster Data Block */}
                <section className={`${styles.card} ${styles.posterCard}`}>
                    <h2 className={styles.cardTitle}>
                        <FileCheck2 size={20} className={styles.icon} />
                        POSTER {isFetchingPoster && <Loader2 size={16} className="animate-spin" style={{ marginLeft: '8px', color: '#94a3b8' }} />}
                    </h2>
                    <div className={styles.posterRow}>
                        <span className={styles.posterLabel}>Безнал факт</span>
                        <span className={styles.posterValue}>{results.fact_cashless.toLocaleString('ru')} ₸</span>
                    </div>
                    <div className={styles.posterRow}>
                        <span className={styles.posterLabel}>Безнал Poster</span>
                        <span className={styles.posterValue}>{posterData.poster_card.toLocaleString('ru')} ₸</span>
                    </div>

                    <div className={styles.posterRow} style={{ background: results.cashless_diff !== 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent', padding: results.cashless_diff !== 0 ? '0.5rem 0.75rem' : '0.25rem 0', borderRadius: '8px', margin: '0.25rem 0' }}>
                        <span className={styles.posterLabel} style={{ color: results.cashless_diff !== 0 ? '#fca5a5' : 'inherit' }}>Разница безнал</span>
                        <span className={styles.posterValue} style={{ color: results.cashless_diff !== 0 ? '#fca5a5' : 'inherit' }}>
                            {results.cashless_diff > 0 ? '+' : ''} {results.cashless_diff.toLocaleString('ru')} ₸
                        </span>
                    </div>

                    <div className={styles.posterRow} style={{ marginTop: '0.5rem' }}>
                        <span className={styles.posterLabel}>Торговля</span>
                        <span className={styles.posterValue}>{posterData.trade_total.toLocaleString('ru')} ₸</span>
                    </div>
                    <div className={styles.posterRow}>
                        <span className={styles.posterLabel} style={{ color: '#fca5a5' }}>Бонусы</span>
                        <span className={styles.posterValue} style={{ color: '#fca5a5' }}>- {posterData.bonus.toLocaleString('ru')} ₸</span>
                    </div>

                    <div className={styles.resultBlock} style={{ background: 'rgba(59, 130, 246, 0.1)', borderColor: 'rgba(59, 130, 246, 0.3)' }}>
                        <span className={styles.resultLabel} style={{ color: '#60a5fa' }}>Итого Poster</span>
                        <span className={styles.resultValue} style={{ color: '#60a5fa' }}>{results.poster_total.toLocaleString('ru')} ₸</span>
                    </div>
                </section>

                {/* Grand Total */}
                <section className={styles.grandTotal} style={{ background: results.day_result < 0 ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)', borderColor: results.day_result < 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)' }}>
                    <div className={styles.grandTotalLabel} style={{ color: '#94a3b8', textTransform: 'uppercase', fontSize: '0.9rem' }}>ИТОГО ДЕНЬ</div>
                    <div className={styles.grandTotalValue} style={{ color: results.day_result < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {results.day_result > 0 ? '+' : ''} {results.day_result.toLocaleString('ru')} ₸
                    </div>
                    <p style={{ color: results.day_result < 0 ? 'var(--danger)' : 'var(--success)', marginTop: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                        {results.day_result < 0 ? 'недостача' : results.day_result === 0 ? 'сошлось идеально' : 'излишек в кассе'}
                    </p>
                </section>

                {/* Encashment */}
                <section className={`${styles.card} ${styles.encashmentCard}`}>
                    <div className={styles.encashmentLeft}>
                        <h2 className={styles.cardTitle} style={{ marginBottom: '0.5rem' }}>Инкассация</h2>
                        <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Сумма, которую изымает инкассатор</p>
                        <div className={styles.inputGroup}>
                            <label>Оставить на смену (бумажными)</label>
                            <input type="number" value={cashToLeave} onChange={e => setCashToLeave(e.target.value)} />
                        </div>
                    </div>
                    <div className={styles.encashmentRight}>
                        <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--foreground)' }}>
                            {results.collection.toLocaleString('ru')} ₸
                        </div>
                        <button className={styles.buttonPrimary} onClick={handleSave} disabled={isFetchingPoster || isCalculating}>
                            {isCalculating ? 'Расчёт...' : 'Сохранить отчёт'}
                        </button>
                    </div>
                </section>

            </div>
        </div>
    );
}
