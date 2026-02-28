const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { PosterClient } = require('./src/lib/poster/client.js'); // Assuming client.js works in CJS? No... it's ts.
