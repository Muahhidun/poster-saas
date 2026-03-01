const { PrismaClient } = require('@prisma/client');
const https = require('https');

const prisma = new PrismaClient();

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function run() {
    const acc = await prisma.posterAccount.findFirst();
    if (!acc) return console.log('No acc');

    console.log(`Testing storage.getSuppliers...`);
    const res1 = await fetchJson(`${acc.posterBaseUrl}/api/v2/storage.getSuppliers?token=${acc.posterToken}`);
    console.log(`storage.getSuppliers:`, res1.response ? res1.response.length : res1);

    console.log(`Testing suppliers.getSuppliers...`);
    const res2 = await fetchJson(`${acc.posterBaseUrl}/api/v2/suppliers.getSuppliers?token=${acc.posterToken}`);
    console.log(`suppliers.getSuppliers:`, res2.response ? res2.response.length : res2);
}
run();
