import { spawn } from 'child_process';
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

const main = async () => {
    const allowedOrigin = parseAllowedOrigin(process.env.STONES_HELPER_ALLOWED_ORIGIN || '');
    const baseConfig = JSON.parse(await fs.readFile(builderConfigPath, 'utf8'));
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
                stonesVideoHelper: {
                    allowedOrigin
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
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
};

main().catch((error) => {
    console.error('[video-export-helper:desktop:dist] build failed', error);
    process.exitCode = 1;
});
