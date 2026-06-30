const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendApplicationCreatedEmail } = require('../utils/email');

const router = express.Router();

// ---------- pricing logic (server-side - never trust client-sent prices) ----------
function calculateEstimate({ operation_type, lines_count, cargo_value }) {
  const base = 120;
  const lineSurcharge = lines_count <= 3 ? 0 : lines_count <= 10 ? 35 : 90;
  const typeSurcharge = operation_type === 'transit' ? 60 : 0;
  const valueSurcharge = cargo_value > 20000 ? 40 : 0;

  const low = base + lineSurcharge + typeSurcharge;
  const high = low + 65 + valueSurcharge;
  return { low, high };
}

// ---------- file upload config ----------
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Never trust the original filename for the path on disk - generate a random name,
    // keep the original name only as metadata in the database.
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 15) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Недопустимый тип файла. Разрешены PDF, изображения, Word, Excel.'));
    }
    cb(null, true);
  },
});

// ---------- helpers ----------
async function getOwnedApplication(applicationId, user) {
  const result = await query('SELECT * FROM applications WHERE id = $1', [applicationId]);
  const app = result.rows[0];
  if (!app) return { app: null, forbidden: false };
  if (user.role !== 'admin' && app.user_id !== user.id) return { app: null, forbidden: true };
  return { app, forbidden: false };
}

// ---------- routes ----------

// Public, unauthenticated calculator preview (no DB write) - used by the marketing site
router.post(
  '/estimate',
  [
    body('operation_type').isIn(['import', 'export', 'transit']),
    body('lines_count').isInt({ min: 1, max: 9999 }).toInt(),
    body('cargo_value').isFloat({ min: 0 }).toFloat(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: 'Некорректные параметры расчёта' });
    const estimate = calculateEstimate(req.body);
    res.json(estimate);
  }
);

router.post(
  '/',
  requireAuth,
  [
    body('operation_type').isIn(['import', 'export', 'transit']).withMessage('Некорректный тип операции'),
    body('lines_count').isInt({ min: 1, max: 9999 }).toInt(),
    body('cargo_value').isFloat({ min: 0 }).toFloat(),
    body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 4000 }),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });

    try {
      const { operation_type, lines_count, cargo_value, notes } = req.body;
      const { low, high } = calculateEstimate({ operation_type, lines_count, cargo_value });

      const result = await query(
        `INSERT INTO applications (user_id, operation_type, cargo_value, lines_count, estimate_low, estimate_high, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.user.id, operation_type, cargo_value, lines_count, low, high, notes || null]
      );
      const app = result.rows[0];

      await query(
        `INSERT INTO application_events (application_id, event_type, message, created_by)
         VALUES ($1,'created','Заявка создана',$2)`,
        [app.id, req.user.id]
      );

      const userResult = await query('SELECT email, full_name FROM users WHERE id = $1', [req.user.id]);
      sendApplicationCreatedEmail(userResult.rows[0], app); // fire-and-forget

      res.status(201).json({ application: app });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const result = req.user.role === 'admin'
      ? await query('SELECT * FROM applications ORDER BY created_at DESC')
      : await query('SELECT * FROM applications WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ applications: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, [param('id').isInt().toInt()], async (req, res, next) => {
  try {
    const { app, forbidden } = await getOwnedApplication(req.params.id, req.user);
    if (forbidden) return res.status(403).json({ error: 'Нет доступа к этой заявке' });
    if (!app) return res.status(404).json({ error: 'Заявка не найдена' });

    const files = await query(
      'SELECT id, original_name, mime_type, size_bytes, uploaded_at FROM application_files WHERE application_id = $1 ORDER BY uploaded_at DESC',
      [app.id]
    );
    const events = await query(
      'SELECT event_type, message, created_at FROM application_events WHERE application_id = $1 ORDER BY created_at ASC',
      [app.id]
    );
    res.json({ application: app, files: files.rows, events: events.rows });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/files',
  requireAuth,
  [param('id').isInt().toInt()],
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
      next();
    });
  },
  async (req, res, next) => {
    try {
      const { app, forbidden } = await getOwnedApplication(req.params.id, req.user);
      if (forbidden) return res.status(403).json({ error: 'Нет доступа к этой заявке' });
      if (!app) return res.status(404).json({ error: 'Заявка не найдена' });
      if (!req.file) return res.status(400).json({ error: 'Файл не передан' });

      const result = await query(
        `INSERT INTO application_files (application_id, stored_name, original_name, mime_type, size_bytes, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, original_name, mime_type, size_bytes, uploaded_at`,
        [app.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id]
      );

      await query(
        `INSERT INTO application_events (application_id, event_type, message, created_by)
         VALUES ($1,'file_uploaded',$2,$3)`,
        [app.id, `Загружен файл: ${req.file.originalname}`, req.user.id]
      );

      res.status(201).json({ file: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/:id/files/:fileId/download', requireAuth, [param('id').isInt().toInt(), param('fileId').isInt().toInt()], async (req, res, next) => {
  try {
    const { app, forbidden } = await getOwnedApplication(req.params.id, req.user);
    if (forbidden) return res.status(403).json({ error: 'Нет доступа к этой заявке' });
    if (!app) return res.status(404).json({ error: 'Заявка не найдена' });

    const result = await query(
      'SELECT * FROM application_files WHERE id = $1 AND application_id = $2',
      [req.params.fileId, app.id]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).json({ error: 'Файл не найден' });

    const filePath = path.join(UPLOAD_DIR, file.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл отсутствует на сервере' });

    res.download(filePath, file.original_name);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
