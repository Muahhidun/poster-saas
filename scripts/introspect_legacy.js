const { Client } = require('pg');

const legacyUrl = 'postgresql://postgres:lFHWqBzMlKJxDLgSUnOsuUNSkJCwCxfu@ballast.proxy.rlwy.net:42152/railway';

async function introspect() {
    const client = new Client({ connectionString: legacyUrl });
    try {
        await client.connect();

        // 1. Get all public tables
        const tablesRes = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        const tables = tablesRes.rows.map(r => r.table_name);
        console.log('--- TABLES ---');
        console.log(tables.join(', '));

        // 2. Sample columns for a few key tables to understand the schema
        for (const table of tables) {
            console.log(`\n--- SCHEMA: ${table} ---`);
            const colsRes = await client.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            console.log(colsRes.rows.map(r => `${r.column_name} (${r.data_type})`).join(', '));

            // 3. Count rows
            const countRes = await client.query(`SELECT COUNT(*) FROM "${table}"`);
            console.log(`Row count: ${countRes.rows[0].count}`);
        }

    } catch (err) {
        console.error('Error introspecting DB:', err);
    } finally {
        await client.end();
    }
}

introspect();
