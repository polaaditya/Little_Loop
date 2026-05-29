/* ─── Admin routes ────────────────────────────────────────────────────────
   POST /api/admin/demo-video   — upload a video file OR set a YouTube URL
   GET  /api/admin/demo-video   — get current demo video setting
   All routes require authentication.
   ──────────────────────────────────────────────────────────────────────── */
'use strict';
const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const db      = require('../db');
const { requireAuth } = require('../middleware/auth');

/* ─── Multer — save uploaded videos to /uploads/videos/ ─────────────── */
const uploadDir = path.join(__dirname, '../../uploads/videos');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename:    (_req, _file, cb) => cb(null, 'demo.mp4'),       // always overwrites
});

const upload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },                      // 200 MB max
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('video/');
    cb(ok ? null : new Error('Only video files are accepted'), ok);
  },
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ─── GET current demo video ──────────────────────────────────────────── */
router.get('/demo-video', wrap(async (_req, res) => {
  const row = await db.get("SELECT value FROM settings WHERE key = 'demo_video_url'");
  res.json({ url: row?.value ?? null });
}));

/* ─── POST — set YouTube / Vimeo URL ─────────────────────────────────── */
router.post('/demo-video/url', requireAuth, wrap(async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'url is required' });

  await db.run(
    "INSERT INTO settings (key, value) VALUES ('demo_video_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [url.trim()],
  );
  res.json({ url: url.trim() });
}));

/* ─── POST — upload a video file ─────────────────────────────────────── */
router.post('/demo-video/upload', requireAuth, upload.single('video'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No video file provided' });

  const videoUrl = '/uploads/videos/demo.mp4';
  await db.run(
    "INSERT INTO settings (key, value) VALUES ('demo_video_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [videoUrl],
  );
  res.json({ url: videoUrl, size: req.file.size });
}));

module.exports = router;
