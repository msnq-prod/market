import { startVideoExportHelperServer } from './server.js';

const main = async () => {
    const helper = await startVideoExportHelperServer();
    console.log(`[video-export-helper] listening on http://${helper.host}:${helper.port}`);
};

main().catch((error) => {
    console.error('[video-export-helper] fatal error', error);
    process.exitCode = 1;
});
