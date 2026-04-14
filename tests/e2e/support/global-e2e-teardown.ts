import { cleanupE2eArtifacts, disconnectE2eCleanupDb } from './e2e-db-cleanup';

export default async function globalTeardown() {
    await cleanupE2eArtifacts({ verbose: true });
    await disconnectE2eCleanupDb();
}
