import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const users = await prisma.user.findMany({ select: { username: true, role: true }});
    console.log(users);
}
run();
