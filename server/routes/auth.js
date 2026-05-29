/* ─── Auth routes ─────────────────────────────────────────────────────────
   POST /api/auth/register   — create account + auto-create family
   POST /api/auth/login      — returns JWT
   GET  /api/auth/me         — returns current user (requires token)
   ──────────────────────────────────────────────────────────────────────── */
'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { requireAuth, signToken } = require('../middleware/auth');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ─── Register ────────────────────────────────────────────────────────── */
router.post('/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim())     return res.status(400).json({ error: 'Name is required' });
  if (!email?.trim())    return res.status(400).json({ error: 'Email is required' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const normalEmail = email.trim().toLowerCase();

  // Check duplicate
  const existing = await db.get('SELECT id FROM users WHERE email = ?', [normalEmail]);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = await bcrypt.hash(password, 10);

  // Create a family named after the user
  const familyName = `${name.trim().split(' ')[0]}'s Family`;
  const { id: familyId } = await db.run('INSERT INTO families (name) VALUES (?)', [familyName]);

  // Create user
  const { id: userId } = await db.run(
    'INSERT INTO users (name, email, password_hash, family_id) VALUES (?, ?, ?, ?)',
    [name.trim(), normalEmail, hash, familyId],
  );

  // Seed the family's first loop prompt
  await db.run(
    "INSERT INTO loops (family_id, loop_type, prompt) VALUES (?, 'Parent-child', ?)",
    [familyId, 'What made you smile today?'],
  );

  const token = signToken({ userId, email: normalEmail, name: name.trim(), familyId });

  res.status(201).json({
    token,
    user: { userId, email: normalEmail, name: name.trim(), familyId },
  });
}));

/* ─── Login ───────────────────────────────────────────────────────────── */
router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email?.trim() || !password)
    return res.status(400).json({ error: 'Email and password are required' });

  const normalEmail = email.trim().toLowerCase();
  const user = await db.get(
    'SELECT id, name, email, password_hash, family_id FROM users WHERE email = ?',
    [normalEmail],
  );

  if (!user) return res.status(401).json({ error: 'No account found with that email' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok)  return res.status(401).json({ error: 'Incorrect password' });

  const token = signToken({
    userId:   user.id,
    email:    user.email,
    name:     user.name,
    familyId: user.family_id,
  });

  res.json({
    token,
    user: { userId: user.id, email: user.email, name: user.name, familyId: user.family_id },
  });
}));

/* ─── Me ──────────────────────────────────────────────────────────────── */
router.get('/me', requireAuth, wrap(async (req, res) => {
  const user = await db.get(
    'SELECT id, name, email, family_id, created_at FROM users WHERE id = ?',
    [req.user.userId],
  );
  if (!user) return res.status(404).json({ error: 'User not found' });

  const family = await db.get('SELECT name FROM families WHERE id = ?', [user.family_id]);

  res.json({
    userId:     user.id,
    name:       user.name,
    email:      user.email,
    familyId:   user.family_id,
    familyName: family?.name,
    createdAt:  user.created_at,
  });
}));

module.exports = router;
