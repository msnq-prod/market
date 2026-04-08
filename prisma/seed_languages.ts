import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const languages = [
        { id: 1, name: 'English', code: 'en', available: true, is_default: false },
        { id: 2, name: 'Русский', code: 'ru', available: true, is_default: true },
        { id: 3, name: 'Deutsch', code: 'de', available: false, is_default: false },
        { id: 4, name: '中文', code: 'zh', available: false, is_default: false },
        { id: 5, name: 'Français', code: 'fr', available: false, is_default: false },
    ];

    console.log('Seeding languages...');

    for (const lang of languages) {
        await prisma.language.upsert({
            where: { id: lang.id },
            update: {
                name: lang.name,
                code: lang.code,
                available: lang.available,
                is_default: lang.is_default
            },
            create: {
                id: lang.id,
                name: lang.name,
                code: lang.code,
                available: lang.available,
                is_default: lang.is_default
            },
        });
    }

    console.log('Languages seeded successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
