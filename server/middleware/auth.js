/* ─── JWT auth middleware ─────────────────────────────────────────────────
   Usage:  router.get('/protected', requireAuth, handler)
   Attaches req.user = { userId, email, name, familyId } on success.
   ──────────────────────────────────────────────────────────────────────── */
'use strict';
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'littleloop-dev-secret-change-in-prod';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, SECRET); } catch { /* ignore */ }
  }
  next();
}

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

module.exports = { requireAuth, optionalAuth, signToken };
