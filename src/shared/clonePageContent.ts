export type ClonePageContent = {
    hero_badge: string;
    hero_title_template: string;
    hero_description: string;
    details_heading: string;
    video_heading: string;
    video_empty_text: string;
    authenticity_heading: string;
    authenticity_text: string;
    field_token_label: string;
    field_status_label: string;
    field_activation_label: string;
    field_coords_label: string;
    field_partner_label: string;
    field_batch_date_label: string;
    link_label: string;
    copy_button_text: string;
    copied_button_text: string;
};

export const DEFAULT_CLONE_PAGE_CONTENT: ClonePageContent = {
    hero_badge: 'Цифровой клон',
    hero_title_template: 'Камень №{{temp_id}}',
    hero_description: 'Прозрачная карточка происхождения: фото предмета, видео места сбора и ключевые данные о партии.',
    details_heading: 'Паспорт предмета',
    video_heading: 'Видео с места сбора',
    video_empty_text: 'Видео с места сбора не загружено',
    authenticity_heading: 'Подлинность и трассировка',
    authenticity_text: 'Каждый предмет имеет уникальный публичный токен. Сканируйте QR, чтобы в любой момент проверить происхождение.',
    field_token_label: 'Токен',
    field_status_label: 'Статус',
    field_activation_label: 'Дата активации',
    field_coords_label: 'Координаты сбора',
    field_partner_label: 'Партнер',
    field_batch_date_label: 'Дата партии',
    link_label: 'Ссылка цифрового клона',
    copy_button_text: 'Копировать',
    copied_button_text: 'Скопировано'
};

const KEYS = Object.keys(DEFAULT_CLONE_PAGE_CONTENT) as (keyof ClonePageContent)[];

export const sanitizeClonePageContent = (input: unknown): ClonePageContent => {
    const data = (typeof input === 'object' && input !== null) ? (input as Record<string, unknown>) : {};

    const normalized: ClonePageContent = { ...DEFAULT_CLONE_PAGE_CONTENT };
    for (const key of KEYS) {
        const candidate = data[key];
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            normalized[key] = candidate.trim().slice(0, 1000);
        }
    }
    return normalized;
};

export const applyCloneTemplate = (
    template: string,
    values: Record<string, string | number | null | undefined>
): string => {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
        const value = values[key];
        if (value === null || value === undefined) return '';
        return String(value);
    });
};

