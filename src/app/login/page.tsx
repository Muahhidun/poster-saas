'use client';

import { signIn } from 'next-auth/react';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

export default function LoginPage() {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const formData = new FormData(e.currentTarget);
        const username = formData.get('username') as string;
        const password = formData.get('password') as string;

        const res = await signIn('credentials', {
            redirect: false,
            username,
            password,
        });

        if (res?.error) {
            setError('Неверный логин или пароль');
            setLoading(false);
        } else {
            router.push('/');
            router.refresh();
        }
    }

    return (
        <div className={styles.container}>
            <div className={styles.card}>
                <div className={styles.header}>
                    <h1>Poster Helper</h1>
                    <p>Войдите в систему управления</p>
                </div>
                <form className={styles.form} onSubmit={handleSubmit}>
                    {error && <div className={styles.error}>{error}</div>}
                    <div className={styles.inputGroup}>
                        <label htmlFor="username">Логин</label>
                        <input type="text" id="username" name="username" required autoFocus />
                    </div>
                    <div className={styles.inputGroup}>
                        <label htmlFor="password">Пароль</label>
                        <input type="password" id="password" name="password" required />
                    </div>
                    <button type="submit" className={styles.button} disabled={loading}>
                        {loading ? 'Вход...' : 'Войти'}
                    </button>
                </form>
            </div>
        </div>
    );
}
