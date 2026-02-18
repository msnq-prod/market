import express from 'express';
import { upload } from '../middleware/upload.ts';

const router = express.Router();

router.post('/photo', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // Return relative path for frontend usage
    const relativePath = `/uploads/photos/${req.file.filename}`;
    res.json({ url: relativePath });
});

router.post('/video', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const relativePath = `/uploads/videos/${req.file.filename}`;

    // In a real app, strict processing/compression would happen here or logically queued.
    // For now, we return the path directly.

    res.json({ url: relativePath });
});

// Backward-compatible endpoint used by some admin forms.
router.post('/', upload.any(), (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const [file] = files;
    const folder = file.mimetype.startsWith('video/') ? 'videos' : 'photos';
    res.json({ url: `/uploads/${folder}/${file.filename}` });
});

export default router;
