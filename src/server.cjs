'use strict';
// Minimal host for the HR assistant: JWT auth, three demo identities, a chat page.
require('dotenv').config();
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const createChatbotApi = require('./chatbot.cjs');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-demo-only';

// Demo identities. In the real platform these come from the login service; the
// assistant only ever trusts the verified token, never what the user types.
const DEMO_USERS = {
  group: { id: 1, name: 'Laura Petit (group HR)', email: 'laura.petit@northwind.example', role: 'group_hr' },
  france: { id: 2, name: 'Hugo Durand (HR France)', email: 'hugo.durand@northwind.example', role: 'user', country: 'france' },
  suzhou: { id: 3, name: 'Li Na (HR Suzhou plant)', email: 'li.na@northwind.example', role: 'user', country: 'china', plant: 'china suzhou' },
};

function authenticateToken(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ error: 'unauthenticated' });
  }
}

function buildApp(pool) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.post('/api/demo-login', (req, res) => {
    const user = DEMO_USERS[req.body?.user];
    if (!user) return res.status(404).json({ error: 'unknown demo user' });
    res.json({ token: jwt.sign(user, JWT_SECRET, { expiresIn: '8h' }), user });
  });

  app.use('/api/chatbot', createChatbotApi({ pool, authenticateToken }));
  return app;
}

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const port = Number(process.env.PORT || 3100);
  buildApp(pool).listen(port, () => console.log(`HR assistant on http://localhost:${port}`));
}

module.exports = { buildApp, DEMO_USERS, authenticateToken };
