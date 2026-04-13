import { PrismaClient } from '@prisma/client';
import { buildSerialNumber, looksLikeLegacyItemSerial } from '../server/utils/collectionWorkflow.ts';

const prisma = new PrismaClient();
const shouldApply = process.argv.includes('--apply');

type RepairPlanEntry = {
    id: string;
    current: string;
    next: string;
    batchId: string;
};

type SkippedEntry = {
    id: string;
    current: string;
    reason: string;
    batchId: string;
};

const printEntries = (title: string, entries: Array<RepairPlanEntry | SkippedEntry>) => {
    if (entries.length === 0) {
        return;
    }

    console.log(`\n${title}:`);
    for (const entry of entries) {
        console.log(`- ${entry.id} (${entry.batchId}) ${entry.current} -> ${'next' in entry ? entry.next : entry.reason}`);
    }
};

async function main() {
    const items = await prisma.item.findMany({
        include: {
            batch: {
                select: {
                    id: true,
                    product_id: true,
                    collected_date: true,
                    daily_batch_seq: true,
                    product: {
                        select: {
                            id: true,
                            country_code: true,
                            location_code: true,
                            item_code: true,
                        }
                    }
                }
            },
            product: {
                select: {
                    id: true,
                    country_code: true,
                    location_code: true,
                    item_code: true,
                }
            }
        },
        orderBy: { created_at: 'asc' }
    });

    const currentOwnersBySerial = new Map<string, string>();
    const legacyItemIds = new Set<string>();
    for (const item of items) {
        if (!item.serial_number) {
            continue;
        }

        currentOwnersBySerial.set(item.serial_number.toUpperCase(), item.id);
        if (looksLikeLegacyItemSerial(item.serial_number)) {
            legacyItemIds.add(item.id);
        }
    }

    const plan: RepairPlanEntry[] = [];
    const skipped: SkippedEntry[] = [];
    const plannedOwnersBySerial = new Map<string, string>();

    for (const item of items) {
        const currentSerial = item.serial_number;
        if (!looksLikeLegacyItemSerial(currentSerial)) {
            continue;
        }

        const collectedDate = item.batch.collected_date ?? item.collected_date;
        const dailyBatchSeq = item.batch.daily_batch_seq ?? 1;
        const product = item.product ?? item.batch.product;

        if (!product || !collectedDate || item.item_seq == null) {
            skipped.push({
                id: item.id,
                current: currentSerial || '',
                reason: 'missing product/date/item_seq',
                batchId: item.batch_id,
            });
            continue;
        }

        const nextSerial = buildSerialNumber(product, collectedDate, item.item_seq, dailyBatchSeq);
        const normalizedNextSerial = nextSerial.toUpperCase();
        const currentOwner = currentOwnersBySerial.get(normalizedNextSerial);
        const plannedOwner = plannedOwnersBySerial.get(normalizedNextSerial);

        const occupiedByNonMigratingItem = currentOwner && currentOwner !== item.id && !legacyItemIds.has(currentOwner);
        if (occupiedByNonMigratingItem || (plannedOwner && plannedOwner !== item.id)) {
            skipped.push({
                id: item.id,
                current: currentSerial || '',
                reason: `collision on ${nextSerial}`,
                batchId: item.batch_id,
            });
            continue;
        }

        plan.push({
            id: item.id,
            current: currentSerial || '',
            next: nextSerial,
            batchId: item.batch_id,
        });
        plannedOwnersBySerial.set(normalizedNextSerial, item.id);
    }

    console.log(`Legacy-like serials found: ${plan.length + skipped.length}`);
    console.log(`Repairable with current data: ${plan.length}`);
    console.log(`Skipped for manual review: ${skipped.length}`);

    printEntries('Planned updates', plan.slice(0, 20));
    printEntries('Skipped entries', skipped.slice(0, 20));

    if (!shouldApply || plan.length === 0) {
        if (!shouldApply) {
            console.log('\nDry run only. Re-run with --apply to persist the repairable updates.');
        }
        return;
    }

    await prisma.$transaction(
        plan.map((entry) => prisma.item.update({
            where: { id: entry.id },
            data: { serial_number: entry.next }
        }))
    );

    console.log(`\nUpdated serial_number for ${plan.length} item(s).`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
