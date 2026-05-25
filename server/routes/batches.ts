import express from 'express';
import { ensureVideoProcessingDirectories } from '../services/videoProcessing.ts';
import { ensureVideoExportDirectories } from '../services/videoExport.ts';
import batchRoutes from './batches/batchRoutes.ts';
import legacyVideoJobRoutes from './batches/legacyVideoJobRoutes.ts';
import photoToolRoutes from './batches/photoToolRoutes.ts';
import videoToolRoutes from './batches/videoToolRoutes.ts';
import videoToolRoutesV2 from './batches/videoToolRoutesV2.ts';

ensureVideoProcessingDirectories();
ensureVideoExportDirectories();

const router = express.Router();

router.use(batchRoutes);
router.use(photoToolRoutes);
router.use(videoToolRoutes);
router.use(videoToolRoutesV2);
router.use(legacyVideoJobRoutes);

export default router;
