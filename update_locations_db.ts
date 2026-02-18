import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LOCATIONS = [
    {
        name: 'Crystal Caves',
        image: '/locations/crystal_caves.jpg',
        description: 'Glimmering subterranean caverns filled with rare minerals and bioluminescent flora.'
    },
    {
        name: 'Sahara Outpost',
        image: '/locations/sahara.jpg',
        description: 'A remote trading hub in the heart of the desert, known for ancient relics and sand-swept ruins.'
    },
    {
        name: 'Himalayan Peaks',
        image: '/locations/himalayas.jpg',
        description: 'High-altitude monasteries and mining operations hidden among the cloud-piercing summits.'
    },
    {
        name: 'Kyoto Village',
        image: '/locations/kyoto.jpg',
        description: 'A serene settlement where traditional architecture meets advanced robotics in harmony with nature.'
    },
    {
        name: 'Amazon Rainforest',
        image: '/locations/amazon.jpg',
        description: 'Deep jungle research stations studying exotic bio-matter and lost civilizations.'
    }
];

async function main() {
    console.log('Start updating locations...');
    for (const loc of LOCATIONS) {
        const existing = await prisma.location.findFirst({
            where: {
                translations: {
                    some: {
                        name: loc.name,
                        language_id: 1
                    }
                }
            }
        });

        if (existing) {
            await prisma.location.update({
                where: { id: existing.id },
                data: {
                    image: loc.image,
                    translations: {
                        updateMany: {
                            where: { language_id: 1 },
                            data: { description: loc.description }
                        }
                    }
                }
            });
            console.log(`Updated ${loc.name}`);
        } else {
            console.log(`Location ${loc.name} not found in DB`);
        }
    }
    console.log('Update finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
