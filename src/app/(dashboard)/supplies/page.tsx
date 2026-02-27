'use client';

import { useState } from 'react';
import { Package, Plus, Trash2, Save, Send } from 'lucide-react';
import styles from './supplies.module.css';

interface SupplyItem {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    price: number;
}

export default function SuppliesPage() {
    const [items, setItems] = useState<SupplyItem[]>([
        { id: '1', name: 'Сироп Ваниль 1л', quantity: 2, unit: 'шт', price: 2500 },
        { id: '2', name: 'Молоко 3.2%', quantity: 12, unit: 'л', price: 450 },
    ]);

    const totalSum = items.reduce((acc, item) => acc + (item.quantity * item.price), 0);

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Поставки</h1>
                <div className={styles.controls}>
                    <button className={styles.primaryBtn}>
                        <Plus size={18} />
                        Новая поставка
                    </button>
                </div>
            </header>

            <div className={styles.draftCard}>
                {/* Draft Header / Meta */}
                <div className={styles.draftHeader}>
                    <div className={styles.draftMeta}>
                        <div className={styles.inputGroup}>
                            <label>Поставщик</label>
                            <input type="text" placeholder="Название или код..." defaultValue="ТОО КофеТрейд" />
                        </div>
                        <div className={styles.inputGroup}>
                            <label>Склад поступления</label>
                            <select defaultValue="1">
                                <option value="1">Основной склад</option>
                                <option value="2">Кафе</option>
                            </select>
                        </div>
                        <div className={styles.inputGroup}>
                            <label>Источник оплаты</label>
                            <select defaultValue="kaspi">
                                <option value="cash">Наличные (Сейф)</option>
                                <option value="kaspi">Kaspi</option>
                                <option value="halyk">Halyk</option>
                            </select>
                        </div>
                    </div>

                    <div className={styles.draftTotal}>
                        <div className={styles.totalLabel}>Итого</div>
                        <div className={styles.totalValue}>{totalSum.toLocaleString('ru')} <span style={{ fontSize: '1.5rem', color: '#64748b' }}>₸</span></div>
                    </div>
                </div>

                {/* Items Table */}
                <div className={styles.itemsSection}>
                    <h3 className={styles.sectionTitle}>
                        <Package size={20} className={styles.icon} />
                        Состав накладной
                    </h3>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ width: '40%' }}>Ингредиент / Товар</th>
                                <th style={{ width: '20%' }}>Кол-во (шт/кг)</th>
                                <th style={{ width: '20%' }}>Цена за ед.</th>
                                <th style={{ width: '15%' }}>Сумма</th>
                                <th style={{ width: '5%' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id}>
                                    <td data-label="Ингредиент / Товар">
                                        <input type="text" className={styles.itemInput} defaultValue={item.name} />
                                    </td>
                                    <td data-label="Кол-во (шт/кг)">
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                            <input type="number" className={styles.itemInput} defaultValue={item.quantity} />
                                            <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{item.unit}</span>
                                        </div>
                                    </td>
                                    <td data-label="Цена за ед.">
                                        <input type="number" className={styles.itemInput} defaultValue={item.price} />
                                    </td>
                                    <td data-label="Сумма" style={{ justifyContent: 'flex-start' }}>
                                        <div style={{ fontWeight: 600 }}>
                                            {(item.quantity * item.price).toLocaleString('ru')} ₸
                                        </div>
                                    </td>
                                    <td>
                                        <button className={styles.actionBtn}>
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <button className={styles.addItemBtn}>
                        <Plus size={18} />
                        Добавить позицию
                    </button>
                </div>

                {/* Actions */}
                <div className={styles.footerActions}>
                    <button className={styles.secondaryBtn}>
                        <Save size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                        Сохранить черновик
                    </button>
                    <button className={styles.successBtn}>
                        <Send size={18} style={{ display: 'inline', marginRight: '8px', verticalAlign: 'middle' }} />
                        Провести в Poster
                    </button>
                </div>

            </div>
        </div>
    );
}
