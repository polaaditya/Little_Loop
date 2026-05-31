/* ─── LittleLoop REST API ────────────────────────────────────────────────
   Mounted at /api by server/index.js

   GET  /health                      — liveness probe (used by ALB)
   GET  /dashboard                   — all dashboard data for default family
   GET  /memories                    — memory jar for default family
   POST /loops/respond               — save a loop response
   GET  /families                    — list all families
   POST /families                    — create a family
   GET  /families/:id/members        — list members
   POST /families/:id/members        — add a member
   GET  /families/:id/loops          — list loops
   POST /families/:id/loops          — create a loop (prompt)
   GET  /families/:id/memories       — list memories
   POST /families/:id/memories       — save a memory
   POST /families/:id/care-steps     — log a care step
   ──────────────────────────────────────────────────────────────────────── */

'use strict';
const router = require('express').Router();
const db     = require('../db');
const { optionalAuth, requireAuth } = require('../middleware/auth');

/* ─── Daily prompt pool ───────────────────────────────────────────────── */
const STAGE_PROMPTS = {
  'Infant': [
    'Capture a tiny smile or sound from today.',
    'What new thing did baby notice today?',
    'Write one milestone down, however small.',
    'What was the sweetest moment with baby today?',
    'What helped baby settle today?',
    'Any new sounds, expressions, or movements today?',
    'What made you smile while watching baby today?',
  ],
  'Little Kid': [
    'What made you laugh today?',
    'What was the best part of your day?',
    'What did you learn today?',
    'Who was your favourite person today and why?',
    'What would you like to do this weekend?',
    'If today was a colour, what would it be?',
    'What\'s something silly that happened today?',
  ],
  'Big Kid': [
    'What made you smile today?',
    'What was the hard part of your day?',
    'What are you proud of this week?',
    'What\'s something you\'re looking forward to?',
    'Tell us something kind you noticed a friend do.',
    'What\'s the best thing you heard today?',
    'If you could redo one moment today, what would it be?',
  ],
  'Teen': [
    'Want advice, space, or just someone to listen?',
    'What\'s on your mind this week?',
    'What song are you into right now?',
    'What\'s something you wish adults understood?',
    'What\'s a goal you\'re working toward?',
    'What was surprisingly good about today?',
    'What\'s one thing you want to try this month?',
  ],
};

const DEFAULT_PROMPTS = [
  'What made you smile today?',
  'What was the best part of your day?',
  'What are you grateful for right now?',
  'What\'s one thing you want to remember this week?',
  'What made today feel different?',
  'Share one small win from today.',
  'What\'s something kind someone did for you today?',
];

function pickDailyPrompt(members) {
  const dayIndex = Math.floor(Date.now() / 86400000); // days since Unix epoch
  const stages   = (members || []).map(m => m.age_stage).filter(Boolean);

  if (stages.length === 0) return DEFAULT_PROMPTS[dayIndex % DEFAULT_PROMPTS.length];

  // Rotate through each member's stage across days
  const stage = stages[dayIndex % stages.length];
  const pool  = STAGE_PROMPTS[stage] || DEFAULT_PROMPTS;
  return pool[dayIndex % pool.length];
}

/* ─── Utility ─────────────────────────────────────────────────────────── */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/* Lazily fetch or create a "default" demo family for the dashboard view */
let _defaultFamilyId = null;
async function defaultFamilyId() {
  if (_defaultFamilyId) return _defaultFamilyId;
  const row = await db.get('SELECT id FROM families ORDER BY id ASC LIMIT 1');
  if (row) { _defaultFamilyId = row.id; return row.id; }
  return null;
}

/* ─── Health check ────────────────────────────────────────────────────── */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ─── Dashboard ───────────────────────────────────────────────────────── */
router.get('/dashboard', optionalAuth, asyncHandler(async (req, res) => {
  // Authenticated users see their own family; guests see the demo family
  const fid = req.user?.familyId ?? await defaultFamilyId();
  const isGuest = !req.user;
  if (!fid) return res.json({ careStepsWeek: 0, streakDays: 0, todayLoop: null, familyName: 'Your', isGuest: true });

  const family = await db.get('SELECT name FROM families WHERE id = ?', [fid]);

  // Care steps this week
  const stepsRow = await db.get(
    `SELECT COUNT(*) AS cnt FROM care_steps
     WHERE family_id = ?
       AND step_date >= date('now', '-6 days')`,
    [fid],
  );
  const careStepsWeek = Number(stepsRow?.cnt ?? 0);

  // Streak: distinct days with at least one response in the last 30 days
  const streakRows = await db.all(
    `SELECT DISTINCT date(created_at) AS d FROM responses
     WHERE loop_id IN (SELECT id FROM loops WHERE family_id = ?)
     ORDER BY d DESC
     LIMIT 30`,
    [fid],
  );

  let streakDays = 0;
  const today = new Date().toISOString().split('T')[0];
  for (let i = 0; i < streakRows.length; i++) {
    const expected = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    if (streakRows[i].d === expected) streakDays++;
    else break;
  }

  // Get family members (for age-stage-aware prompt)
  const members = await db.all(
    'SELECT age_stage FROM members WHERE family_id = ?',
    [fid],
  );

  // Check for a loop created today
  const todayDate = new Date().toISOString().split('T')[0];
  let loop = await db.get(
    `SELECT l.id, l.prompt, r.content AS lastResponse
     FROM loops l
     LEFT JOIN responses r ON r.loop_id = l.id
     WHERE l.family_id = ? AND date(l.created_at) = ?
     ORDER BY l.created_at DESC, r.created_at DESC
     LIMIT 1`,
    [fid, todayDate],
  );

  // Auto-create today's loop if none exists
  if (!loop && !isGuest) {
    const prompt = pickDailyPrompt(members);
    const { id: loopId } = await db.run(
      "INSERT INTO loops (family_id, loop_type, prompt) VALUES (?, 'Parent-child', ?)",
      [fid, prompt],
    );
    loop = { id: loopId, prompt, lastResponse: null };
  }

  // Fallback: show most recent loop for guests (or if today creation failed)
  if (!loop) {
    loop = await db.get(
      `SELECT l.id, l.prompt, r.content AS lastResponse
       FROM loops l
       LEFT JOIN responses r ON r.loop_id = l.id
       WHERE l.family_id = ?
       ORDER BY l.created_at DESC, r.created_at DESC
       LIMIT 1`,
      [fid],
    );
  }

  res.json({
    familyName:   family?.name ?? 'Your',
    careStepsWeek,
    streakDays,
    isGuest,
    todayLoop: loop
      ? { id: loop.id, prompt: loop.prompt, lastResponse: loop.lastResponse }
      : null,
  });
}));

/* ─── Memories (default family or user's family) ─────────────────────── */
router.get('/memories', optionalAuth, asyncHandler(async (req, res) => {
  const fid = req.user?.familyId ?? await defaultFamilyId();
  if (!fid) return res.json({ memories: [] });

  const memories = await db.all(
    'SELECT id, content, image_data, created_at FROM memories WHERE family_id = ? ORDER BY created_at DESC LIMIT 20',
    [fid],
  );
  res.json({ memories });
}));

/* ─── Save loop response (requires auth) ─────────────────────────────── */
router.post('/loops/respond', requireAuth, asyncHandler(async (req, res) => {
  const { response, loopId, image_data } = req.body;

  // At least one of text or image is required
  const text = response?.trim() || '';
  if (!text && !image_data) {
    return res.status(400).json({ error: 'response or image_data is required' });
  }

  // Validate image_data is a data URL if provided
  if (image_data && !image_data.startsWith('data:image/')) {
    return res.status(400).json({ error: 'image_data must be a data URL' });
  }

  const fid = req.user?.familyId ?? await defaultFamilyId();
  let lid = loopId;

  if (!lid) {
    const loop = await db.get(
      'SELECT id FROM loops WHERE family_id = ? ORDER BY created_at DESC LIMIT 1',
      [fid],
    );
    lid = loop?.id;
  }

  if (!lid) return res.status(404).json({ error: 'No active loop found' });

  const content = text || 'A photo memory';

  // Save response
  const { id } = await db.run(
    'INSERT INTO responses (loop_id, content) VALUES (?, ?)',
    [lid, content],
  );

  // Save to memory jar (with optional image)
  await db.run(
    'INSERT INTO memories (family_id, content, image_data) VALUES (?, ?, ?)',
    [fid, content, image_data ?? null],
  );

  // Log a care step
  await db.run('INSERT INTO care_steps (family_id) VALUES (?)', [fid]);

  res.status(201).json({ id, saved: true });
}));

/* ─── Families ────────────────────────────────────────────────────────── */
router.get('/families', asyncHandler(async (_req, res) => {
  const rows = await db.all('SELECT id, name, created_at FROM families ORDER BY id');
  res.json({ families: rows });
}));

router.post('/families', asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const { id } = await db.run('INSERT INTO families (name) VALUES (?)', [name.trim()]);
  res.status(201).json({ id, name: name.trim() });
}));

/* ─── Members ─────────────────────────────────────────────────────────── */
router.get('/families/:id/members', asyncHandler(async (req, res) => {
  const rows = await db.all(
    'SELECT id, name, role, age_stage, created_at FROM members WHERE family_id = ? ORDER BY id',
    [req.params.id],
  );
  res.json({ members: rows });
}));

router.post('/families/:id/members', asyncHandler(async (req, res) => {
  const { name, role = 'Parent', age_stage } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  const { id } = await db.run(
    'INSERT INTO members (family_id, name, role, age_stage) VALUES (?, ?, ?, ?)',
    [req.params.id, name.trim(), role, age_stage ?? null],
  );
  res.status(201).json({ id, name: name.trim(), role, age_stage });
}));

/* ─── Loops ───────────────────────────────────────────────────────────── */
router.get('/families/:id/loops', asyncHandler(async (req, res) => {
  const rows = await db.all(
    `SELECT l.id, l.loop_type, l.prompt, l.created_at,
            (SELECT content FROM responses WHERE loop_id = l.id ORDER BY created_at DESC LIMIT 1) AS lastResponse
     FROM loops l WHERE l.family_id = ? ORDER BY l.created_at DESC LIMIT 30`,
    [req.params.id],
  );
  res.json({ loops: rows });
}));

router.post('/families/:id/loops', asyncHandler(async (req, res) => {
  const { loop_type = 'Parent-child', prompt } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' });
  const { id } = await db.run(
    'INSERT INTO loops (family_id, loop_type, prompt) VALUES (?, ?, ?)',
    [req.params.id, loop_type, prompt.trim()],
  );
  res.status(201).json({ id, loop_type, prompt: prompt.trim() });
}));

/* ─── Memories (per family) ───────────────────────────────────────────── */
router.get('/families/:id/memories', asyncHandler(async (req, res) => {
  const rows = await db.all(
    'SELECT id, content, image_data, created_at FROM memories WHERE family_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.params.id],
  );
  res.json({ memories: rows });
}));

router.post('/families/:id/memories', asyncHandler(async (req, res) => {
  const { content, member_id, image_data } = req.body;
  if (!content?.trim() && !image_data) return res.status(400).json({ error: 'content or image_data is required' });
  const text = content?.trim() || 'A photo memory';
  const { id } = await db.run(
    'INSERT INTO memories (family_id, member_id, content, image_data) VALUES (?, ?, ?, ?)',
    [req.params.id, member_id ?? null, text, image_data ?? null],
  );
  res.status(201).json({ id, content: text, image_data: image_data ?? null });
}));

/* ─── Care steps ──────────────────────────────────────────────────────── */
router.post('/families/:id/care-steps', asyncHandler(async (req, res) => {
  const { member_id } = req.body;
  const { id } = await db.run(
    'INSERT INTO care_steps (family_id, member_id) VALUES (?, ?)',
    [req.params.id, member_id ?? null],
  );
  res.status(201).json({ id });
}));

/* ─── 404 catch-all ───────────────────────────────────────────────────── */
router.use((_req, res) => res.status(404).json({ error: 'Not found' }));

module.exports = router;
