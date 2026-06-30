const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { query } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/email');

const router = express.Router();

// Brute-force protection on auth endpoints specifically
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много попыток. Попробуйте позже.' },
});

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function publicUser(u) {
  return { id: u.id, email: u.email, full_name: u.full_name, company_name: u.company_name, role: u.role };
}

router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Некорректный email'),
    body('password').isLength({ min: 8 }).withMessage('Пароль должен быть не менее 8 символов'),
    body('full_name').trim().isLength({ min: 2, max: 255 }).withMessage('Укажите имя'),
    body('company_name').optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 64 }),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: errors.array()[0].msg, details: errors.array() });

    try {
      const { email, password, full_name, company_name, phone } = req.body;
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length) return res.status(409).json({ error: 'Пользователь с таким email уже существует' });

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await query(
        `INSERT INTO users (email, password_hash, full_name, company_name, phone, role)
         VALUES ($1, $2, $3, $4, $5, 'client')
         RETURNING id, email, full_name, company_name, role`,
        [email, passwordHash, full_name, company_name || null, phone || null]
      );
      const user = result.rows[0];
      sendWelcomeEmail(user); // fire-and-forget, never blocks registration

      const token = signToken(user);
      res.status(201).json({ token, user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ error: 'Введите корректный email и пароль' });

    try {
      const { email, password } = req.body;
      const result = await query('SELECT * FROM users WHERE email = $1', [email]);
      const user = result.rows[0];
      // Same generic error whether email or password is wrong - avoids leaking which emails are registered
      if (!user) return res.status(401).json({ error: 'Неверный email или пароль' });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Неверный email или пароль' });

      const token = signToken(user);
      res.json({ token, user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await query('SELECT id, email, full_name, company_name, role FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
