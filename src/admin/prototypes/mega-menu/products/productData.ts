export const productTasks = [
    {
        id: 'task-serials',
        group: 'Ошибки проверки',
        tone: 'danger',
        template: 'Аметист «Полярная ночь»',
        location: 'Урал',
        batch: 'B-250618-03',
        items: 18,
        photos: '18 / 18',
        videos: '18 / 18',
        status: '2 дубля серийных номеров',
        action: 'Исправить',
        scenario: 'identification'
    },
    {
        id: 'task-photo-1',
        group: 'Требуют фото',
        tone: 'attention',
        template: 'Кварц «Горный свет»',
        location: 'Якутия',
        batch: 'B-250624-07',
        items: 24,
        photos: '17 / 24',
        videos: '24 / 24',
        status: 'Не хватает 7 фото',
        action: 'Назначить фото',
        scenario: 'photos'
    },
    {
        id: 'task-photo-2',
        group: 'Требуют фото',
        tone: 'attention',
        template: 'Цитрин «Солнце»',
        location: 'Мадагаскар',
        batch: 'B-250620-02',
        items: 12,
        photos: '9 / 12',
        videos: '12 / 12',
        status: 'Не хватает 3 фото',
        action: 'Назначить фото',
        scenario: 'photos'
    },
    {
        id: 'task-video-1',
        group: 'Требуют видео',
        tone: 'technical',
        template: 'Топаз «Глубина»',
        location: 'Бразилия',
        batch: 'B-250625-01',
        items: 16,
        photos: '16 / 16',
        videos: '10 / 16',
        status: 'Экспорт не завершен',
        action: 'Подготовить видео',
        scenario: 'videos'
    },
    {
        id: 'task-stock-1',
        group: 'Готовы на склад',
        tone: 'success',
        template: 'Гранат «Теплый свет»',
        location: 'Индия',
        batch: 'B-250622-04',
        items: 20,
        photos: '20 / 20',
        videos: '20 / 20',
        status: 'Готова к проверке',
        action: 'Передать на склад',
        scenario: 'stock-readiness'
    },
    {
        id: 'task-stock-2',
        group: 'Готовы на склад',
        tone: 'success',
        template: 'Берилл «Север»',
        location: 'Намибия',
        batch: 'B-250621-02',
        items: 14,
        photos: '14 / 14',
        videos: '14 / 14',
        status: 'Готова к проверке',
        action: 'Передать на склад',
        scenario: 'stock-readiness'
    },
    {
        id: 'task-acceptance',
        group: 'Ожидают приемки',
        tone: 'neutral',
        template: 'Аквамарин «Лед»',
        location: 'Забайкалье',
        batch: 'B-250626-01',
        items: 30,
        photos: '0 / 30',
        videos: '0 / 30',
        status: 'Прибыла сегодня',
        action: 'Принять',
        scenario: 'acceptance'
    }
] as const;

export const locations = [
    { id: 'yakutia', name: 'Якутия', country: 'Россия', lat: '62.03', lng: '129.73', description: 'Месторождения Восточной Сибири.', hidden: false, templates: 4, batches: 12 },
    { id: 'ural', name: 'Урал', country: 'Россия', lat: '56.84', lng: '60.61', description: 'Камни Уральского региона.', hidden: false, templates: 3, batches: 8 },
    { id: 'brazil', name: 'Бразилия', country: 'Бразилия', lat: '-15.79', lng: '-47.88', description: 'Поставки цветных камней.', hidden: false, templates: 5, batches: 16 },
    { id: 'madagascar', name: 'Мадагаскар', country: 'Мадагаскар', lat: '-18.88', lng: '47.51', description: 'Островные месторождения.', hidden: true, templates: 2, batches: 5 }
];

export const templates = [
    { id: 'quartz', name: 'Кварц «Горный свет»', location: 'Якутия', category: 'Кварц', price: '48 000', code: 'RUSYAKQTZ', published: true },
    { id: 'amethyst', name: 'Аметист «Полярная ночь»', location: 'Урал', category: 'Аметист', price: '76 000', code: 'RUSURLAMT', published: true },
    { id: 'topaz', name: 'Топаз «Глубина»', location: 'Бразилия', category: 'Топаз', price: '92 000', code: 'BRABRATOP', published: false },
    { id: 'citrine', name: 'Цитрин «Солнце»', location: 'Мадагаскар', category: 'Цитрин', price: '58 000', code: 'MDGMDGCIT', published: false }
];

export const collectionOrders = [
    { id: 'CR-104', template: 'Кварц «Горный свет»', location: 'Якутия', qty: 24, assignee: 'Якутия Partner', status: 'Партия в пути' },
    { id: 'CR-103', template: 'Аметист «Полярная ночь»', location: 'Урал', qty: 18, assignee: 'Общий пул', status: 'В работе' },
    { id: 'CR-102', template: 'Топаз «Глубина»', location: 'Бразилия', qty: 16, assignee: 'Admin HQ', status: 'Принят сразу' },
    { id: 'CR-101', template: 'Цитрин «Солнце»', location: 'Мадагаскар', qty: 12, assignee: 'Общий пул', status: 'Открыт' }
];

export const batches = [
    { id: 'B-250626-01', template: 'Аквамарин «Лед»', location: 'Забайкалье', qty: 30, photos: 0, videos: 0, status: 'TRANSIT' },
    { id: 'B-250624-07', template: 'Кварц «Горный свет»', location: 'Якутия', qty: 24, photos: 17, videos: 24, status: 'RECEIVED' },
    { id: 'B-250625-01', template: 'Топаз «Глубина»', location: 'Бразилия', qty: 16, photos: 16, videos: 10, status: 'RECEIVED' },
    { id: 'B-250622-04', template: 'Гранат «Теплый свет»', location: 'Индия', qty: 20, photos: 20, videos: 20, status: 'RECEIVED' }
];

export const warehouseItems = [
    { id: 'item-1', serial: 'RUSYAKQTZ240626001', template: 'Кварц «Горный свет»', location: 'Якутия', batch: 'B-250610-01', media: 'Фото + видео', state: 'На складе', date: '10 июня' },
    { id: 'item-2', serial: 'RUSYAKQTZ240626002', template: 'Кварц «Горный свет»', location: 'Якутия', batch: 'B-250610-01', media: 'Фото + видео', state: 'На складе', date: '10 июня' },
    { id: 'item-3', serial: 'RUSURLAMT180626001', template: 'Аметист «Полярная ночь»', location: 'Урал', batch: 'B-250609-02', media: 'Фото + видео', state: 'Списан', date: '9 июня' },
    { id: 'item-4', serial: 'BRABRATOP150626004', template: 'Топаз «Глубина»', location: 'Бразилия', batch: 'B-250608-01', media: 'Фото + видео', state: 'На складе', date: '8 июня' }
];
