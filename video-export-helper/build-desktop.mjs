import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const builderConfigPath = path.join(__dirname, 'electron-builder.json');
const electronBuilderBin = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
);

const parseAllowedOrigin = (rawValue) => {
    const trimmedValue = rawValue.trim();
    if (!trimmedValue) {
        throw new Error('Укажите STONES_HELPER_ALLOWED_ORIGIN перед сборкой production helper.');
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(trimmedValue);
    } catch {
        throw new Error(`STONES_HELPER_ALLOWED_ORIGIN должен быть корректным URL, сейчас: ${trimmedValue}`);
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('STONES_HELPER_ALLOWED_ORIGIN должен использовать http или https.');
    }

    return parsedUrl.origin;
};

const normalizeVersion = (rawValue) => (typeof rawValue === 'string' ? rawValue.trim() : '');

const getDefaultHelperVersion = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}.${now.getUTCMonth() + 1}.${now.getUTCDate()}`;
};

const resolveHelperVersion = (baseConfig) => {
    const envVersion = normalizeVersion(process.env.STONES_HELPER_VERSION);
    if (envVersion) {
        return envVersion;
    }

    const configVersion = normalizeVersion(baseConfig?.extraMetadata?.version);
    if (configVersion && configVersion !== '0.0.0') {
        return configVersion;
    }

    return getDefaultHelperVersion();
};

const getUpdateBaseUrl = (allowedOrigin) => {
    const rawValue = normalizeVersion(process.env.STONES_HELPER_UPDATE_BASE_URL);
    if (rawValue) {
        return rawValue.replace(/\/+$/, '');
    }

    return `${allowedOrigin}/uploads/downloads`;
};

const syncStableDmgArtifacts = async (outputDir) => {
    const stableArtifactNames = new Map([
        ['x64', 'ZAGARAMI-Video-Helper.dmg'],
        ['arm64', 'ZAGARAMI-Video-Helper-arm64.dmg']
    ]);

    const entries = await fs.readdir(outputDir, { withFileTypes: true });

    for (const [arch, stableName] of stableArtifactNames) {
        const sourceEntry = entries.find((entry) => (
            entry.isFile()
            && /^ZAGARAMI-Video-Helper-.*\.dmg$/.test(entry.name)
            && entry.name.endsWith(`-${arch}.dmg`)
        ));

        if (!sourceEntry) {
            continue;
        }

        const sourcePath = path.join(outputDir, sourceEntry.name);
        const stablePath = path.join(outputDir, stableName);
        await fs.copyFile(sourcePath, stablePath);
    }
};

const getFileMetadata = async (filePath) => {
    const [stats, fileBuffer] = await Promise.all([
        fs.stat(filePath),
        fs.readFile(filePath)
    ]);

    return {
        size: stats.size,
        sha256: crypto.createHash('sha256').update(fileBuffer).digest('hex')
    };
};

const writeUpdateManifest = async ({ outputDir, helperVersion, updateBaseUrl }) => {
    const stableFiles = {
        x64: 'ZAGARAMI-Video-Helper.dmg',
        arm64: 'ZAGARAMI-Video-Helper-arm64.dmg'
    };
    const files = {};

    for (const [arch, fileName] of Object.entries(stableFiles)) {
        const filePath = path.join(outputDir, fileName);
        const metadata = await getFileMetadata(filePath);
        files[arch] = {
            file_name: fileName,
            url: `${updateBaseUrl}/${fileName}`,
            ...metadata
        };
    }

    const manifest = {
        manifest_version: 1,
        app_id: 'com.stones.videohelper',
        product_name: 'ZAGARAMI Video Helper',
        version: helperVersion,
        protocol_version: 'stones-video-export-helper-v3',
        generated_at: new Date().toISOString(),
        files
    };

    await fs.writeFile(
        path.join(outputDir, 'ZAGARAMI-Video-Helper-update.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
    );
};

const main = async () => {
    const allowedOrigin = parseAllowedOrigin(process.env.STONES_HELPER_ALLOWED_ORIGIN || '');
    const baseConfig = JSON.parse(await fs.readFile(builderConfigPath, 'utf8'));
    const helperVersion = resolveHelperVersion(baseConfig);
    const updateBaseUrl = getUpdateBaseUrl(allowedOrigin);
    const outputDir = path.join(
        projectRoot,
        typeof baseConfig?.directories?.output === 'string' ? baseConfig.directories.output : 'dist-electron'
    );
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stones-helper-builder-'));
    const tempConfigPath = path.join(tempDir, 'electron-builder.json');

    try {
        const nextConfig = {
            ...baseConfig,
            extraMetadata: {
                ...(baseConfig.extraMetadata || {}),
                version: helperVersion,
                stonesVideoHelper: {
                    allowedOrigin,
                    updateBaseUrl
                }
            }
        };

        await fs.writeFile(tempConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');

        await new Promise((resolve, reject) => {
            const child = spawn(electronBuilderBin, ['--config', tempConfigPath], {
                cwd: projectRoot,
                env: process.env,
                stdio: 'inherit'
            });

            child.on('error', reject);
            child.on('exit', (code) => {
                if (code === 0) {
                    resolve(undefined);
                    return;
                }

                reject(new Error(`electron-builder завершился с кодом ${code ?? 'unknown'}.`));
            });
        });

        await syncStableDmgArtifacts(outputDir);
        await writeUpdateManifest({ outputDir, helperVersion, updateBaseUrl });
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
};

main().catch((error) => {
    console.error('[video-export-helper:desktop:dist] build failed', error);
    process.exitCode = 1;
});
