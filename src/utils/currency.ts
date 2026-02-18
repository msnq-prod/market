export function formatRub(amount: number | string): string {
    const numeric = typeof amount === 'string' ? Number(amount) : amount;
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number.isFinite(numeric) ? numeric : 0);
}
