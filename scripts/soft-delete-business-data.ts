import { PrismaClient } from '@prisma/client';
import { softDeleteAllBusinessData } from '../server/utils/softDelete.ts';

const prisma = new PrismaClient();

async function main() {
    const deletedAt = new Date();
    const summary = await prisma.$transaction((tx) => softDeleteAllBusinessData(tx, deletedAt));
    console.log(JSON.stringify(summary, null, 2));
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
