const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendStatusChangedEmail } = require('../utils/email');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const VALID_STATUSES = ['new', 'documents_review', 'submitted_to_customs', 'cleared', 'rejected'];

router.get('/users', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT id, email, full_name, company_name, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users: result.rows });
  } catch (err) {
    next(err);
  }
});

router.get('/applications', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT a.*, u.email AS user_email, u.full_name AS user_full_name
      FROM applications a JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC
    `);
    res.json({ applications: result.rows });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/applications/:id/status',
  [
    param('id').isInt().toInt(),
    body('status').isIn(VALID_STATUSES).withMessage('Недопустимый статус'),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg });

    try {
      const result = await query(
        'UPDATE applications SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
        [req.body.status, req.params.id]
      );
      const app = result.rows[0];
      if (!app) return res.status(404).json({ error: 'Заявка не найдена' });

      await query(
        `INSERT INTO application_events (application_id, event_type, message, created_by)
         VALUES ($1,'status_changed',$2,$3)`,
        [app.id, `Статус изменён на: ${req.body.status}`, req.user.id]
      );

      const userResult = await query('SELECT email, full_name FROM users WHERE id = $1', [app.user_id]);
      if (userResult.rows[0]) sendStatusChangedEmail(userResult.rows[0], app); // fire-and-forget

      res.json({ application: app });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
