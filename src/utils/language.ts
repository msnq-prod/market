type TranslationLike = Record<string, unknown> & { language_id?: number };
type Translatable = { translations?: TranslationLike[] } | null | undefined;

export const getLocalizedValue = (obj: Translatable, field: string, langId: number): string => {
    if (!obj) return '';

    const translations = obj.translations || [];
    const translation = translations.find((t) => t.language_id === langId);
    const directValue = translation?.[field];

    if (typeof directValue === 'string' && directValue.length > 0) {
        return directValue;
    }

    // Fallback to default language (ID 1)
    const defaultTranslation = translations.find((t) => t.language_id === 1);
    const defaultValue = defaultTranslation?.[field];
    if (typeof defaultValue === 'string' && defaultValue.length > 0) {
        return defaultValue;
    }

    const fallback = translations[0]?.[field];
    return typeof fallback === 'string' ? fallback : '';
};
