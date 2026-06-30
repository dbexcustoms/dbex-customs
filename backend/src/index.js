require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const applicationRoutes = require('./routes/applications');
const adminRoutes = require('./routes/admin');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

// Trust the first proxy hop (needed for correct rate-limiting / req.ip behind nginx, Render, Railway, etc.)
app.set('trust proxy', 1);

// ---- security headers ----
app.use(helmet());

// ---- CORS: only the configured frontend origin may call this API ----
const allowedOrigin = process.env.FRONTEND_URL || '*';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));

// ---- response compression for faster page/asset loads ----
app.use(compression());

// ---- body parsing with a sane size limit (also mitigates body-based DoS) ----
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ---- global rate limit (auth routes have a stricter limiter of their own) ----
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Note on CSRF: this API is stateless (Bearer JWT in the Authorization header, no auth cookies),
// so classic cookie-based CSRF does not apply. If you later switch to httpOnly cookie sessions,
// add a CSRF token (e.g. csrf-csrf package) on top of this.

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`DBEX Customs API listening on port ${PORT}`);
});
