import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function main() {
    console.log('Start seeding ...');

    // 1. Languages (already seeded by seed_languages.ts, but let's make sure they are here)
    const en = await db.language.findUnique({ where: { id: 1 } });
    const ru = await db.language.findUnique({ where: { id: 2 } });

    if (!en || !ru) {
        // If languages missing, we might need to create them or warn. 
        // For simplicity, let's assume they exist or create if not found (basic fallback)
        console.warn('Languages not found. Ensure seed_languages.ts is run or languages exist.');
        // In a real scenario, we'd handle this better. Continuing...
    }

    if (en && ru) {
        // 2. Categories
        const categoriesData = [
            { slug: 'gemstones', en: 'Gemstones', ru: 'Драгоценные камни' },
            { slug: 'artifacts', en: 'Artifacts', ru: 'Артефакты' },
            { slug: 'spices', en: 'Spices', ru: 'Специи' },
            { slug: 'ceramics', en: 'Ceramics', ru: 'Керамика' },
            { slug: 'art', en: 'Art', ru: 'Искусство' },
        ];

        const categories: Record<string, { id: string }> = {};

        for (const cat of categoriesData) {
            const existing = await db.category.findUnique({ where: { slug: cat.slug } });
            if (existing) {
                categories[cat.slug] = existing;
            } else {
                categories[cat.slug] = await db.category.create({
                    data: {
                        slug: cat.slug,
                        translations: {
                            create: [
                                { language_id: en.id, name: cat.en },
                                { language_id: ru.id, name: cat.ru },
                            ]
                        }
                    }
                });
            }
        }

        // 3. Locations and Products
        // Check if Iceland exists to avoid dupes
        const iceland = await db.location.findFirst({ where: { translations: { some: { name: 'Crystal Caves' } } } });
        if (!iceland) {
            await db.location.create({
                data: {
                    lat: 64.9631,
                    lng: -19.0208,
                    image: '/locations/crystal_caves.jpg',
                    translations: {
                        create: [
                            { language_id: en.id, name: 'Crystal Caves', country: 'Iceland', description: 'Glimmering subterranean caverns filled with rare minerals.' },
                            { language_id: ru.id, name: 'Хрустальные пещеры', country: 'Исландия', description: 'Мерцающие подземные каверны, наполненные редкими минералами.' },
                        ]
                    },
                    products: {
                        create: [
                            {
                                price: 1200,
                                image: 'https://placehold.co/400x300/0000ff/ffffff?text=Blue+Gem',
                                category_id: categories['gemstones'].id,
                                translations: {
                                    create: [
                                        { language_id: en.id, name: 'Rare Blue Gem', description: 'A stunning blue gemstone found in the deep mines.' },
                                        { language_id: ru.id, name: 'Редкий синий камень', description: 'Потрясающий синий драгоценный камень, найденный в глубоких шахтах.' },
                                    ]
                                }
                            }
                        ]
                    }
                }
            });
        }

        // Egypt
        const egypt = await db.location.findFirst({ where: { translations: { some: { name: 'Sahara Outpost' } } } });
        if (!egypt) {
            await db.location.create({
                data: {
                    lat: 26.8206,
                    lng: 30.8025,
                    image: '/locations/sahara_outpost.jpg',
                    translations: {
                        create: [
                            { language_id: en.id, name: 'Sahara Outpost', country: 'Egypt', description: 'A remote trading station amidst the endless dunes.' },
                            { language_id: ru.id, name: 'Сахарский аванпост', country: 'Египет', description: 'Удаленная торговая станция среди бескрайних дюн.' },
                        ]
                    },
                    products: {
                        create: [
                            {
                                price: 5000,
                                image: 'https://placehold.co/400x300/aa0000/ffffff?text=Artifact',
                                category_id: categories['artifacts']?.id || categories['gemstones'].id,
                                translations: {
                                    create: [
                                        { language_id: en.id, name: 'Ancient Artifact', description: 'A mysterious artifact from a lost civilization.' },
                                        { language_id: ru.id, name: 'Древний артефакт', description: 'Таинственный артефакт затерянной цивилизации.' },
                                    ]
                                }
                            },
                            {
                                price: 15000,
                                image: 'https://placehold.co/400x300/ffd700/000000?text=Gold',
                                category_id: categories['art']?.id || categories['gemstones'].id,
                                translations: {
                                    create: [
                                        { language_id: en.id, name: 'Golden Statue', description: 'A solid gold statue of a deity.' },
                                        { language_id: ru.id, name: 'Золотая статуя', description: 'Статуя божества из чистого золота.' },
                                    ]
                                }
                            }
                        ]
                    }
                }
            });
        }

        // Nepal
        const nepal = await db.location.findFirst({ where: { translations: { some: { name: 'Himalayan Peaks' } } } });
        if (!nepal) {
            await db.location.create({
                data: {
                    lat: 28.3949,
                    lng: 84.1240,
                    image: '/locations/himalayan_peaks.jpg',
                    translations: {
                        create: [
                            { language_id: en.id, name: 'Himalayan Peaks', country: 'Nepal', description: 'The roof of the world.' },
                            { language_id: ru.id, name: 'Гималайские вершины', country: 'Непал', description: 'Крыша мира.' },
                        ]
                    },
                    products: {
                        create: [
                            {
                                price: 200,
                                image: 'https://placehold.co/400x300/ffff00/000000?text=Spice',
                                category_id: categories['spices']?.id || categories['gemstones'].id,
                                translations: {
                                    create: [
                                        { language_id: en.id, name: 'Exotic Spice', description: 'Rare spices harvested from the highest peaks.' },
                                        { language_id: ru.id, name: 'Экзотическая специя', description: 'Редкие специи, собранные на самых высоких вершинах.' },
                                    ]
                                }
                            }
                        ]
                    }
                }
            });
        }

        // Japan
        const japan = await db.location.findFirst({ where: { translations: { some: { name: 'Kyoto Village' } } } });
        if (!japan) {
            await db.location.create({
                data: {
                    lat: 35.0116,
                    lng: 135.7681,
                    image: '/locations/kyoto_village.jpg',
                    translations: {
                        create: [
                            { language_id: en.id, name: 'Kyoto Village', country: 'Japan', description: 'A traditional village preserving craftsmanship.' },
                            { language_id: ru.id, name: 'Деревня Киото', country: 'Япония', description: 'Традиционная деревня, сохранившая мастерство.' },
                        ]
                    },
                    products: {
                        create: [
                            {
                                price: 800,
                                image: 'https://placehold.co/400x300/00ff00/000000?text=Vase',
                                category_id: categories['ceramics']?.id || categories['gemstones'].id,
                                translations: {
                                    create: [
                                        { language_id: en.id, name: 'Handcrafted Vase', description: 'Delicate vase made by master potters.' },
                                        { language_id: ru.id, name: 'Ваза ручной работы', description: 'Изящная ваза, изготовленная мастерами-гончарами.' },
                                    ]
                                }
                            }
                        ]
                    }
                }
            });
        }
    }

    // 4. Admin User
    await db.user.upsert({
        where: { email: 'admin@stones.com' },
        update: {
            name: 'Admin',
            role: 'ADMIN',
            password_hash: '$2b$10$rHas7QKx6Bjsb8CHfOyxqey4Ei3Ir69F5SEG9ar07eBPN0Gisn0Xy'
        },
        create: {
            name: 'Admin',
            email: 'admin@stones.com',
            role: 'ADMIN',
            password_hash: '$2b$10$rHas7QKx6Bjsb8CHfOyxqey4Ei3Ir69F5SEG9ar07eBPN0Gisn0Xy' // admin123
        }
    });
    console.log('Admin user ensured');

    await db.user.upsert({
        where: { email: 'partner@stones.com' },
        update: {
            name: 'Partner One',
            role: 'FRANCHISEE',
            commission_rate: 50,
            password_hash: '$2b$10$/vO6sqbVFEjs9IADUfQMr.xLkDVZF6FhypFOpig8hAzC0NAJWbagy'
        },
        create: {
            name: 'Partner One',
            email: 'partner@stones.com',
            role: 'FRANCHISEE',
            commission_rate: 50,
            password_hash: '$2b$10$/vO6sqbVFEjs9IADUfQMr.xLkDVZF6FhypFOpig8hAzC0NAJWbagy' // partner123
        }
    });
    console.log('Franchisee user ensured');

    console.log('Seeding finished.');
}

main()
    .then(async () => {
        await db.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await db.$disconnect();
        process.exit(1);
    });
