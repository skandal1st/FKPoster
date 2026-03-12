const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { authMiddleware, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware, adminOnly);

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Manual multipart parsing — accept raw body as base64 JSON
// or standard multipart (we keep it simple with JSON base64 for now)
router.post('/', express.json({ limit: '5mb' }), async (req, res) => {
  const { filename, data, mime_type } = req.body;

  if (!data) {
    return res.status(400).json({ error: 'Укажите данные файла (data в base64)' });
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const mimeType = mime_type || 'image/jpeg';
  if (!allowedTypes.includes(mimeType)) {
    return res.status(400).json({ error: 'Поддерживаются только изображения (JPEG, PNG, WebP, GIF)' });
  }

  const ext = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
  }[mimeType] || '.jpg';

  const uniqueName = `${req.tenantId}_${crypto.randomBytes(8).toString('hex')}${ext}`;
  const filePath = path.join(UPLOAD_DIR, uniqueName);

  try {
    const buffer = Buffer.from(data, 'base64');

    // Max 5MB
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Файл слишком большой (макс. 5 МБ)' });
    }

    fs.writeFileSync(filePath, buffer);

    const url = `/uploads/${uniqueName}`;
    res.json({ url, filename: uniqueName });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

module.exports = router;
