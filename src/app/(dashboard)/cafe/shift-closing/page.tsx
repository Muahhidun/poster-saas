'use client';

import { useState } from 'react';
import { Coffee, Save } from 'lucide-react';

export default function CafeShiftPage() {
    const [date, setDate] = useState(() => {
        const d = new Date();
        if (d.getHours() < 6) d.setDate(d.getDate() - 1);
        return d.toISOString().split('T')[0];
    });

    const [kaspiCafe, setKaspiCafe] = useState('0');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/cashier/shift-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'CAFE',
                    date, kaspiCafe
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('Данные Кафе успешно сохранены и отправлены Владельцу!');
            } else {
                alert('Ошибка: ' + data.error);
            }
        } catch (e) {
            alert('Сетевая ошибка');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Сдача Смены (Кафе)</h1>
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)' }}
                />
            </div>

            <section style={{ background: 'var(--card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '1.5rem' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem', marginBottom: '1rem' }}>
                    <Coffee size={20} style={{ color: 'var(--primary)' }} />
                    Продажи Кафе
                </h2>
                <div>
                    <label style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--muted)', fontSize: '0.9rem' }}>Переводы Kaspi (Кафе)</label>
                    <input type="number" value={kaspiCafe} onChange={e => setKaspiCafe(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--background)', color: 'var(--foreground)' }} />
                </div>
            </section>

            <button
                onClick={handleSave}
                disabled={isSaving}
                style={{ width: '100%', padding: '1rem', background: 'var(--primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1.1rem', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', transition: 'opacity 0.2s' }}
            >
                <Save size={20} />
                {isSaving ? 'Сохранение...' : 'Отправить отчёт'}
            </button>
        </div>
    );
}
