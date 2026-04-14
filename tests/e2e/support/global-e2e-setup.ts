import { cleanupE2eArtifacts, disconnectE2eCleanupDb, restoreSeedCatalogState } from './e2e-db-cleanup';

export default async function globalSetup() {
    await cleanupE2eArtifacts({ verbose: true });
    await restoreSeedCatalogState();
    await disconnectE2eCleanupDb();
}
