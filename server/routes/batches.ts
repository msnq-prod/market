import express from 'express';
import batchRoutes from './batches/batchRoutes.ts';
import photoToolRoutes from './batches/photoToolRoutes.ts';

const router = express.Router();

router.use(batchRoutes);
router.use(photoToolRoutes);

export default router;
