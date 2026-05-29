/* ─── LittleLoop server entry point ─────────────────────────────────────
   Serves:
     • Static frontend          (index.html, styles.css, app.js)
     • REST API                 (/api/*)
     • Auth API                 (/api/auth/*)
     • Admin API                (/api/admin/*)
     • Uploaded videos          (/uploads/videos/*)

   Start:  npm start          (production)
           npm run dev        (auto-reload with nodemon)
   ──────────────────────────────────────────────────────────────────────── */

'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./db');
const api     = require('./routes/api');
const auth    = require('./routes/auth');
const admin   = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── Middleware ──────────────────────────────────────────────────────── */
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: false, limit: '8mb' }));

/* ─── Serve uploaded files (videos) ──────────────────────────────────── */
const UPLOADS_DIR = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(UPLOADS_DIR));

/* ─── API routes ──────────────────────────────────────────────────────── */
app.use('/api/auth',  auth);
app.use('/api/admin', admin);
app.use('/api',       api);

/* ─── Serve static frontend ───────────────────────────────────────────── */
const STATIC_DIR = path.join(__dirname, '..');
app.use(express.static(STATIC_DIR, { index: 'index.html' }));
app.get('*', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

/* ─── Global error handler ────────────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

/* ─── Startup ─────────────────────────────────────────────────────────── */
(async () => {
  try {
    await db.init();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🌿 LittleLoop running at http://localhost:${PORT}`);
      console.log(`   Auth:    http://localhost:${PORT}/api/auth/login`);
      console.log(`   Health:  http://localhost:${PORT}/api/health\n`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
