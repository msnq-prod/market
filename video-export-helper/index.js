import { startVideoExportHelperServer } from './server.js';

const main = async () => {
    const helper = await startVideoExportHelperServer();
    const listeningUrls = helper.listenHosts.map((host) => `http://${host.includes(':') ? `[${host}]` : host}:${helper.port}`);
    console.log(`[video-export-helper] listening on ${listeningUrls.join(', ')}`);
};

main().catch((error) => {
    console.error('[video-export-helper] fatal error', error);
    process.exitCode = 1;
});
