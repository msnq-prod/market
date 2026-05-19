import { spawn } from 'child_process';
import crypto from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const builderConfigPath = path.join(projectRoot, 'electron', 'hq', 'electron-builder.json');
const appDisplayName = 'ZAGARAMI admin';
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const electronBuilderBin = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
);

const normalizeApiOrigin = (rawValue) => {
    const fallback = 'http://127.0.0.1:3001';
    const value = typeof rawValue === 'string' && rawValue.trim() ? rawValue.trim() : fallback;

    try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('unsupported protocol');
        }

        return parsed.origin;
    } catch {
        throw new Error(`STONES_HQ_API_ORIGIN должен быть корректным http/https origin, сейчас: ${value}`);
    }
};

const getUpdateBaseUrl = (apiOrigin) => `${apiOrigin.replace(/\/+$/, '')}/uploads/downloads`;

const getPackageVersion = async () => {
    const packageJson = JSON.parse(await fs.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
    return typeof packageJson.version === 'string' && packageJson.version.trim()
        ? packageJson.version.trim()
        : '0.0.0';
};

const getMacAppPath = async (outputDir, arch) => {
    const candidates = arch === 'arm64'
        ? [
            path.join(outputDir, 'mac-arm64', `${appDisplayName}.app`),
            path.join(outputDir, 'mac-arm64', 'ZAGARAMI HQ.app')
        ]
        : [
            path.join(outputDir, 'mac', `${appDisplayName}.app`),
            path.join(outputDir, 'mac-x64', `${appDisplayName}.app`),
            path.join(outputDir, 'mac', 'ZAGARAMI HQ.app'),
            path.join(outputDir, 'mac-x64', 'ZAGARAMI HQ.app')
        ];

    for (const candidate of candidates) {
        const stat = await fs.stat(candidate).catch(() => null);
        if (stat?.isDirectory()) {
            return candidate;
        }
    }

    throw new Error(`Не найден собранный ${appDisplayName}.app для ${arch}.`);
};

const createStableMacDmg = async ({ outputDir, appVersion, arch, fileName }) => {
    const appPath = await getMacAppPath(outputDir, arch);
    const stablePath = path.join(outputDir, fileName);
    const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), `stones-hq-${arch}-dmg-`));

    try {
        await run('ditto', [appPath, path.join(stagingDir, `${appDisplayName}.app`)]);
        await fs.symlink('/Applications', path.join(stagingDir, 'Applications')).catch(() => undefined);
        await fs.rm(stablePath, { force: true });
        await run('hdiutil', [
            'create',
            '-volname',
            `${appDisplayName} ${appVersion}-${arch}`,
            '-srcfolder',
            stagingDir,
            '-ov',
            '-format',
            'UDZO',
            stablePath
        ]);
    } finally {
        await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
};

const syncStableDmgArtifacts = async ({ outputDir, appVersion }) => {
    const artifacts = {
        x64: {
            source: `ZAGARAMI-HQ-${appVersion}-x64.dmg`,
            stable: 'ZAGARAMI-HQ.dmg'
        },
        arm64: {
            source: `ZAGARAMI-HQ-${appVersion}-arm64.dmg`,
            stable: 'ZAGARAMI-HQ-arm64.dmg'
        }
    };

    if (process.platform === 'darwin') {
        for (const [arch, artifact] of Object.entries(artifacts)) {
            await createStableMacDmg({
                outputDir,
                appVersion,
                arch,
                fileName: artifact.stable
            });
        }
        return;
    }

    for (const artifact of Object.values(artifacts)) {
        await fs.copyFile(
            path.join(outputDir, artifact.source),
            path.join(outputDir, artifact.stable)
        );
    }
};

const sha256File = (filePath) => new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
});

const getFileMetadata = async (filePath) => {
    const [stats, sha256] = await Promise.all([
        fs.stat(filePath),
        sha256File(filePath)
    ]);
    return {
        size: stats.size,
        sha256
    };
};

const writeUpdateManifest = async ({ outputDir, appVersion, updateBaseUrl }) => {
    const stableFiles = {
        x64: 'ZAGARAMI-HQ.dmg',
        arm64: 'ZAGARAMI-HQ-arm64.dmg'
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
        app_id: 'com.stones.hq',
        product_name: appDisplayName,
        version: appVersion,
        generated_at: new Date().toISOString(),
        files
    };

    await fs.writeFile(
        path.join(outputDir, 'ZAGARAMI-HQ-update.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
    );
};

const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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

        reject(new Error(`${command} ${args.join(' ')} завершился с кодом ${code ?? 'unknown'}.`));
    });
});

const main = async () => {
    const apiOrigin = normalizeApiOrigin(process.env.STONES_HQ_API_ORIGIN);
    const updateBaseUrl = getUpdateBaseUrl(apiOrigin);
    const baseConfig = JSON.parse(await fs.readFile(builderConfigPath, 'utf8'));
    const appVersion = await getPackageVersion();
    const outputDir = path.join(
        projectRoot,
        typeof baseConfig?.directories?.output === 'string' ? baseConfig.directories.output : 'dist-electron-hq'
    );
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stones-hq-builder-'));
    const tempConfigPath = path.join(tempDir, 'electron-builder.json');

    try {
        await run(npmBin, ['run', 'build:client']);

        const nextConfig = {
            ...baseConfig,
            extraMetadata: {
                ...(baseConfig.extraMetadata || {}),
                stonesHq: {
                    ...(baseConfig.extraMetadata?.stonesHq || {}),
                    apiOrigin,
                    updateBaseUrl
                }
            }
        };

        await fs.writeFile(tempConfigPath, `${JSON.stringify(nextConfig, null, 2)}\n`, 'utf8');
        await run(electronBuilderBin, ['--config', tempConfigPath]);
        await syncStableDmgArtifacts({ outputDir, appVersion });
        await writeUpdateManifest({ outputDir, appVersion, updateBaseUrl });
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
};

main().catch((error) => {
    console.error('[admin:desktop:dist] build failed', error);
    process.exitCode = 1;
});
