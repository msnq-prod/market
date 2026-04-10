import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.ts';
import { upload } from '../middleware/upload.ts';

const router = express.Router();

router.use(authenticateToken, requireRole(['ADMIN', 'MANAGER', 'FRANCHISEE']));

router.post('/photo', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен.' });
    }

    const relativePath = `/uploads/photos/${req.file.filename}`;
    res.json({ url: relativePath });
});

router.post('/video', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Файл не загружен.' });
    }

    const relativePath = `/uploads/videos/${req.file.filename}`;
    res.json({ url: relativePath });
});

router.post('/', upload.any(), (req, res) => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
        return res.status(400).json({ error: 'Файл не загружен.' });
    }

    const [file] = files;
    const folder = file.mimetype.startsWith('video/') ? 'videos' : 'photos';
    res.json({ url: `/uploads/${folder}/${file.filename}` });
});

export default router;
