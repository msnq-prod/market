import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const mode = process.argv.includes('--dist') ? 'dist' : 'vite';
const apiOrigin = process.env.STONES_HQ_API_ORIGIN || 'http://127.0.0.1:3001';
const viteOrigin = process.env.STONES_HQ_DEV_SERVER_URL || 'http://127.0.0.1:5173';
const viteBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const electronBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const children = new Set();

const spawnChild = (command, args, env) => {
    const child = spawn(command, args, {
        cwd: projectRoot,
        env: {
            ...process.env,
            ...env
        },
        stdio: 'inherit'
    });
    children.add(child);
    child.on('exit', () => children.delete(child));
    return child;
};

const shutdown = (code = 0) => {
    for (const child of children) {
        child.kill('SIGTERM');
    }
    process.exit(code);
};

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

const waitForPort = (port, host = '127.0.0.1', timeoutMs = 30000) => new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const attempt = () => {
        const socket = net.createConnection({ port, host });
        socket.once('connect', () => {
            socket.destroy();
            resolve();
        });
        socket.once('error', () => {
            socket.destroy();
            if (Date.now() - startedAt > timeoutMs) {
                reject(new Error(`Vite dev server не поднялся на ${host}:${port} за ${timeoutMs}ms.`));
                return;
            }
            setTimeout(attempt, 250);
        });
    };
    attempt();
});

const runViteMode = async () => {
    const viteUrl = new URL(viteOrigin);
    const vitePort = Number(viteUrl.port || '5173');
    const viteHost = viteUrl.hostname || '127.0.0.1';

    spawnChild(viteBin, ['--host', viteHost, '--port', String(vitePort)], {
        VITE_API_TARGET: apiOrigin
    });
    await waitForPort(vitePort, viteHost);
    spawnChild(electronBin, ['electron/hq/main.cjs'], {
        STONES_HQ_API_ORIGIN: apiOrigin,
        STONES_HQ_DEV_SERVER_URL: viteOrigin
    });
};

const runDistMode = async () => {
    const build = spawnChild(npmBin, ['run', 'build:client'], {});
    const code = await new Promise((resolve) => build.on('exit', resolve));
    if (code !== 0) {
        shutdown(Number(code) || 1);
        return;
    }

    spawnChild(electronBin, ['electron/hq/main.cjs'], {
        STONES_HQ_API_ORIGIN: apiOrigin,
        STONES_HQ_USE_DIST: '1'
    });
};

try {
    if (mode === 'dist') {
        await runDistMode();
    } else {
        await runViteMode();
    }
} catch (error) {
    console.error(error);
    shutdown(1);
}
