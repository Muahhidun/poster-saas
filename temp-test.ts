import { PosterClient } from './src/lib/poster/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const acc = await prisma.posterAccount.findFirst();
    if (!acc) return;
    const client = new PosterClient(acc.posterBaseUrl, acc.posterToken);
    const txns = await client.getTransactions('20260228', '20260228');
    const accs = await client.getAccounts();
    console.log("Txn example:", txns[0]);
    console.log("Acc example:", accs[0]);
}
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
