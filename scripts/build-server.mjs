import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';

const projectRoot = process.cwd();
const outdir = path.join(projectRoot, 'build', 'server');

fs.rmSync(outdir, { recursive: true, force: true });

await build({
    entryPoints: [
        path.join(projectRoot, 'server/index.ts'),
        path.join(projectRoot, 'server/videoProcessor.ts'),
        path.join(projectRoot, 'server/telegramWorker.ts')
    ],
    outdir,
    entryNames: '[name]',
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    packages: 'external',
    sourcemap: true,
    sourcesContent: false,
    logLevel: 'info'
});
