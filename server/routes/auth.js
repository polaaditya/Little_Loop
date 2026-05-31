/* ─── Auth routes ─────────────────────────────────────────────────────────
   POST /api/auth/register       — create account + family + invite token
   POST /api/auth/login          — returns JWT
   GET  /api/auth/me             — current user (requires token)
   GET  /api/auth/me/invite      — family invite token (requires token)
   GET  /api/auth/invite/:token  — preview family name for invite page
   POST /api/auth/join           — register and join existing family via invite
   ──────────────────────────────────────────────────────────────────────── */
'use strict';
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../db');
const { requireAuth, signToken } = require('../middleware/auth');

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function makeInviteToken() {
  return crypto.randomBytes(10).toString('hex'); // 20-char hex
}

/* ─── Register ────────────────────────────────────────────────────────── */
router.post('/register', wrap(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name?.trim())     return res.status(400).json({ error: 'Name is required' });
  if (!email?.trim())    return res.status(400).json({ error: 'Email is required' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const normalEmail = email.trim().toLowerCase();

  const existing = await db.get('SELECT id FROM users WHERE email = ?', [normalEmail]);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash        = await bcrypt.hash(password, 10);
  const inviteToken = makeInviteToken();
  const familyName  = `${name.trim().split(' ')[0]}'s Family`;

  const { id: familyId } = await db.run(
    'INSERT INTO families (name, invite_token) VALUES (?, ?)',
    [familyName, inviteToken],
  );

  const { id: userId } = await db.run(
    'INSERT INTO users (name, email, password_hash, family_id) VALUES (?, ?, ?, ?)',
    [name.trim(), normalEmail, hash, familyId],
  );

  // Seed first loop (will be replaced by daily rotation on first dashboard load)
  await db.run(
    "INSERT INTO loops (family_id, loop_type, prompt) VALUES (?, 'Parent-child', ?)",
    [familyId, 'What made you smile today?'],
  );

  const token = signToken({ userId, email: normalEmail, name: name.trim(), familyId });

  res.status(201).json({
    token,
    user:        { userId, email: normalEmail, name: name.trim(), familyId },
    inviteToken, // so frontend can offer "share with family" immediately
    isNew: true,
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

/* ─── Get my family's invite token ───────────────────────────────────── */
router.get('/me/invite', requireAuth, wrap(async (req, res) => {
  const family = await db.get(
    'SELECT invite_token FROM families WHERE id = ?',
    [req.user.familyId],
  );
  if (!family) return res.status(404).json({ error: 'Family not found' });
  res.json({ inviteToken: family.invite_token });
}));

/* ─── Preview invite (public — for the join page) ────────────────────── */
router.get('/invite/:token', wrap(async (req, res) => {
  const family = await db.get(
    'SELECT id, name FROM families WHERE invite_token = ?',
    [req.params.token],
  );
  if (!family) return res.status(404).json({ error: 'Invite link not found' });
  res.json({ familyId: family.id, familyName: family.name });
}));

/* ─── Join existing family via invite ────────────────────────────────── */
router.post('/join', wrap(async (req, res) => {
  const { name, email, password, inviteToken } = req.body;

  if (!name?.trim())     return res.status(400).json({ error: 'Name is required' });
  if (!email?.trim())    return res.status(400).json({ error: 'Email is required' });
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!inviteToken)      return res.status(400).json({ error: 'Invite token is required' });

  const family = await db.get(
    'SELECT id, name FROM families WHERE invite_token = ?',
    [inviteToken],
  );
  if (!family) return res.status(404).json({ error: 'Invite link not found or expired' });

  const normalEmail = email.trim().toLowerCase();
  const existing    = await db.get('SELECT id FROM users WHERE email = ?', [normalEmail]);
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });

  const hash = await bcrypt.hash(password, 10);
  const { id: userId } = await db.run(
    'INSERT INTO users (name, email, password_hash, family_id) VALUES (?, ?, ?, ?)',
    [name.trim(), normalEmail, hash, family.id],
  );

  const token = signToken({ userId, email: normalEmail, name: name.trim(), familyId: family.id });

  res.status(201).json({
    token,
    user:       { userId, email: normalEmail, name: name.trim(), familyId: family.id },
    familyName: family.name,
  });
}));

module.exports = router;
