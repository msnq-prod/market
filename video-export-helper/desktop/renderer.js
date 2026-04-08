const statusLine = document.getElementById('status-line');
const runtimeMeta = document.getElementById('runtime-meta');
const storageMeta = document.getElementById('storage-meta');
const originsMeta = document.getElementById('origins-meta');

const formatBytes = (value) => {
    if (!Number.isFinite(value) || value <= 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
    }

    return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const renderRows = (container, rows) => {
    container.innerHTML = rows.map(([label, value]) => `
        <div class="meta-row">
            <span>${label}</span>
            <span>${value}</span>
        </div>
    `).join('');
};

const loadStatus = async () => {
    statusLine.textContent = 'Проверка helper...';
    statusLine.className = 'small';

    try {
        const status = await window.helperDesktop.getStatus();
        statusLine.textContent = 'Helper готов к монтажу.';
        statusLine.className = 'small status-ready';

        renderRows(runtimeMeta, [
            ['Версия helper', status.helper_version || '0.0.0'],
            ['Порт', String(status.port)],
            ['Активных render jobs', String(status.queued_jobs)]
        ]);

        renderRows(storageMeta, [
            ['Путь', `<code>${status.storage_root}</code>`],
            ['Свободно на диске', formatBytes(status.free_bytes)],
            ['TTL cleanup', `${status.cleanup_threshold_days} дн.`]
        ]);

        const origins = Array.isArray(status.allowed_origins) && status.allowed_origins.length > 0
            ? status.allowed_origins.map((origin) => ['Origin', `<code>${origin}</code>`])
            : [['Origin', 'Не настроен']];
        renderRows(originsMeta, origins);
    } catch (error) {
        statusLine.textContent = error instanceof Error ? error.message : 'Helper недоступен.';
        statusLine.className = 'small status-error';
        runtimeMeta.innerHTML = '';
        storageMeta.innerHTML = '';
        originsMeta.innerHTML = '';
    }
};

document.getElementById('refresh-button').addEventListener('click', () => {
    void loadStatus();
});

document.getElementById('cleanup-button').addEventListener('click', async () => {
    statusLine.textContent = 'Очистка helper cache...';
    statusLine.className = 'small';
    try {
        const result = await window.helperDesktop.cleanup();
        statusLine.textContent = `Cleanup завершён. Удалено jobs: ${result.removed_jobs}, sources: ${result.removed_sources}.`;
        statusLine.className = 'small status-ready';
        await loadStatus();
    } catch (error) {
        statusLine.textContent = error instanceof Error ? error.message : 'Не удалось очистить helper cache.';
        statusLine.className = 'small status-error';
    }
});

document.getElementById('restart-button').addEventListener('click', () => {
    void window.helperDesktop.restartApp();
});

document.getElementById('open-storage-button').addEventListener('click', () => {
    void window.helperDesktop.showStorage();
});

void loadStatus();
