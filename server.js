require('dotenv').config();

const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = path.join(DATA_DIR, 'controle-dividas.db');

if (!SESSION_SECRET || SESSION_SECRET.length < 24) {
  console.error('ERRO: defina SESSION_SECRET com pelo menos 24 caracteres no arquivo .env');
  process.exit(1);
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function normalizeUsername(value) {
  return String(value || '').trim();
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  return username.length >= 3 && username.length <= 32 && /^[A-Za-z0-9._-]+$/.test(username);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, account) {
  if (!account?.password_hash || !account?.password_salt) return false;
  try {
    const candidate = crypto.scryptSync(String(password || ''), account.password_salt, 64);
    const expected = Buffer.from(account.password_hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch (_err) {
    return false;
  }
}

function getAdminAccount() {
  return db.prepare(`
    SELECT id, username, password_salt, password_hash, created_at, updated_at,
           password_changed_at, last_login_at
    FROM admin_account
    WHERE id = 1
  `).get();
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS debtors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      original_amount_cents INTEGER NOT NULL CHECK (original_amount_cents >= 0),
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debtor_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      payment_date TEXT,
      method TEXT DEFAULT '',
      note TEXT DEFAULT '',
      receipt_original_name TEXT,
      receipt_stored_name TEXT,
      receipt_mimetype TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_payments_debtor ON payments(debtor_id);

    CREATE TABLE IF NOT EXISTS admin_account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL UNIQUE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      password_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS c FROM debtors').get().c;
  if (count === 0) {
    const insertDebtor = db.prepare('INSERT INTO debtors (name, original_amount_cents, notes) VALUES (?, ?, ?)');
    const insertPayment = db.prepare(`
      INSERT INTO payments (debtor_id, amount_cents, payment_date, method, note)
      VALUES (?, ?, NULL, '', ?)
    `);

    const seed = db.transaction(() => {
      insertDebtor.run('Vinicius', 2900000, 'Dívida inicial cadastrada no sistema.');
      const guilherme = insertDebtor.run('Guilherme', 1300000, 'Dívida inicial cadastrada no sistema.');
      insertPayment.run(guilherme.lastInsertRowid, 100000, 'Pagamento anterior informado no cadastro inicial.');
      const paulo = insertDebtor.run('Paulo', 80000, 'Dívida inicial cadastrada no sistema.');
      insertPayment.run(paulo.lastInsertRowid, 35000, 'Pagamento anterior informado no cadastro inicial.');
    });
    seed();
  }

  const existingAccount = db.prepare('SELECT id FROM admin_account WHERE id = 1').get();
  if (!existingAccount) {
    const initialUsername = normalizeUsername(ADMIN_USER || 'admin');
    if (!validateUsername(initialUsername)) {
      console.error('ERRO: ADMIN_USER deve ter entre 3 e 32 caracteres e usar apenas letras, números, ponto, _ ou -.');
      process.exit(1);
    }
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
      console.error('ERRO: no primeiro acesso, defina ADMIN_PASSWORD com pelo menos 8 caracteres.');
      process.exit(1);
    }
    const { salt, hash } = hashPassword(ADMIN_PASSWORD);
    db.prepare(`
      INSERT INTO admin_account (id, username, password_salt, password_hash)
      VALUES (1, ?, ?, ?)
    `).run(initialUsername, salt, hash);
  }
}
migrate();

if (isProduction) app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

class SqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = db.prepare('SELECT sess, expires_at FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expires_at < Date.now()) {
        if (row) db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return callback(null, null);
      }
      callback(null, JSON.parse(row.sess));
    } catch (err) { callback(err); }
  }
  set(sid, sess, callback = () => {}) {
    try {
      const expiresAt = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 12 * 60 * 60 * 1000;
      db.prepare(`INSERT INTO sessions (sid, sess, expires_at) VALUES (?, ?, ?)
                  ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at`)
        .run(sid, JSON.stringify(sess), expiresAt);
      callback(null);
    } catch (err) { callback(err); }
  }
  destroy(sid, callback = () => {}) {
    try { db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid); callback(null); }
    catch (err) { callback(err); }
  }
  touch(sid, sess, callback = () => {}) { this.set(sid, sess, callback); }
}

app.use(session({
  store: new SqliteSessionStore(),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  maxAge: isProduction ? '1h' : 0,
  index: false
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }
});

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function requireAuth(req, res, next) {
  if (!req.session?.authenticated) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  next();
}

function requireCsrf(req, res, next) {
  const token = req.get('x-csrf-token');
  if (!token || !req.session?.csrfToken || !safeEqual(token, req.session.csrfToken)) {
    return res.status(403).json({ error: 'Requisição inválida. Atualize a página e tente novamente.' });
  }
  next();
}

function moneyToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function getDebtor(id) {
  return db.prepare(`
    SELECT d.*,
      COALESCE(SUM(p.amount_cents), 0) AS paid_cents,
      d.original_amount_cents - COALESCE(SUM(p.amount_cents), 0) AS remaining_cents,
      COUNT(p.id) AS payments_count
    FROM debtors d
    LEFT JOIN payments p ON p.debtor_id = d.id
    WHERE d.id = ?
    GROUP BY d.id
  `).get(id);
}

const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
    cb(null, `${Date.now()}-${crypto.randomUUID()}${extMap[file.mimetype] || ''}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowedMime.has(file.mimetype)) return cb(new Error('Formato inválido. Use JPG, PNG, WEBP ou PDF.'));
    cb(null, true);
  }
});

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'private', req.session?.authenticated ? 'app.html' : 'login.html'));
});

app.post('/api/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const account = getAdminAccount();
  if (!account || !safeEqual(username || '', account.username) || !verifyPassword(password, account)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  db.prepare(`UPDATE admin_account SET last_login_at = datetime('now') WHERE id = 1`).run();

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Não foi possível iniciar a sessão.' });
    req.session.authenticated = true;
    req.session.accountId = account.id;
    req.session.accountUsername = account.username;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    req.session.save(() => res.json({ ok: true }));
  });
});

app.get('/api/session', requireAuth, (req, res) => {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  const account = getAdminAccount();
  if (!account) return res.status(401).json({ error: 'Conta administrativa não encontrada.' });
  res.json({ authenticated: true, csrfToken: req.session.csrfToken, user: account.username });
});

app.get('/api/account', requireAuth, (_req, res) => {
  const account = getAdminAccount();
  if (!account) return res.status(404).json({ error: 'Conta não encontrada.' });
  res.json({
    username: account.username,
    createdAt: account.created_at,
    updatedAt: account.updated_at,
    passwordChangedAt: account.password_changed_at,
    lastLoginAt: account.last_login_at
  });
});

app.put('/api/account/username', requireAuth, requireCsrf, (req, res) => {
  const account = getAdminAccount();
  const currentPassword = String(req.body?.currentPassword || '');
  const username = normalizeUsername(req.body?.username);

  if (!verifyPassword(currentPassword, account)) {
    return res.status(403).json({ error: 'A senha atual está incorreta.' });
  }
  if (!validateUsername(username)) {
    return res.status(400).json({ error: 'O usuário deve ter de 3 a 32 caracteres e usar apenas letras, números, ponto, _ ou -.' });
  }
  if (safeEqual(username, account.username)) {
    return res.status(400).json({ error: 'Informe um usuário diferente do atual.' });
  }

  db.prepare(`
    UPDATE admin_account
    SET username = ?, updated_at = datetime('now')
    WHERE id = 1
  `).run(username);

  req.session.accountUsername = username;
  req.session.save(() => res.json({ ok: true, username }));
});

app.put('/api/account/password', requireAuth, requireCsrf, (req, res) => {
  const account = getAdminAccount();
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  const confirmPassword = String(req.body?.confirmPassword || '');

  if (!verifyPassword(currentPassword, account)) {
    return res.status(403).json({ error: 'A senha atual está incorreta.' });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return res.status(400).json({ error: 'A nova senha deve ter entre 8 e 128 caracteres.' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'A confirmação da nova senha não confere.' });
  }
  if (verifyPassword(newPassword, account)) {
    return res.status(400).json({ error: 'A nova senha precisa ser diferente da senha atual.' });
  }

  const { salt, hash } = hashPassword(newPassword);
  const updatePassword = db.transaction(() => {
    db.prepare(`
      UPDATE admin_account
      SET password_salt = ?, password_hash = ?, password_changed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = 1
    `).run(salt, hash);
    db.prepare('DELETE FROM sessions WHERE sid <> ?').run(req.sessionID);
  });
  updatePassword();

  res.json({ ok: true });
});

app.post('/api/account/logout-others', requireAuth, requireCsrf, (req, res) => {
  const account = getAdminAccount();
  const currentPassword = String(req.body?.currentPassword || '');
  if (!verifyPassword(currentPassword, account)) {
    return res.status(403).json({ error: 'A senha atual está incorreta.' });
  }
  const result = db.prepare('DELETE FROM sessions WHERE sid <> ?').run(req.sessionID);
  res.json({ ok: true, closedSessions: result.changes });
});

app.post('/api/logout', requireAuth, requireCsrf, (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/dashboard', requireAuth, (_req, res) => {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(original_amount_cents), 0) AS original_cents,
      COALESCE((SELECT SUM(amount_cents) FROM payments), 0) AS paid_cents,
      COUNT(*) AS debtors_count
    FROM debtors
  `).get();
  totals.remaining_cents = totals.original_cents - totals.paid_cents;

  const debtors = db.prepare(`
    SELECT d.*,
      COALESCE(SUM(p.amount_cents), 0) AS paid_cents,
      d.original_amount_cents - COALESCE(SUM(p.amount_cents), 0) AS remaining_cents,
      COUNT(p.id) AS payments_count
    FROM debtors d
    LEFT JOIN payments p ON p.debtor_id = d.id
    GROUP BY d.id
    ORDER BY remaining_cents DESC, d.name COLLATE NOCASE
  `).all();

  const recent = db.prepare(`
    SELECT p.id, p.debtor_id, d.name AS debtor_name, p.amount_cents, p.payment_date,
           p.method, p.note, p.receipt_original_name, p.receipt_mimetype, p.created_at
    FROM payments p JOIN debtors d ON d.id = p.debtor_id
    ORDER BY COALESCE(p.payment_date, substr(p.created_at,1,10)) DESC, p.id DESC
    LIMIT 8
  `).all();

  res.json({ totals, debtors, recent });
});

app.get('/api/debtors/:id', requireAuth, (req, res) => {
  const debtor = getDebtor(req.params.id);
  if (!debtor) return res.status(404).json({ error: 'Pessoa não encontrada.' });
  const payments = db.prepare(`
    SELECT id, debtor_id, amount_cents, payment_date, method, note,
           receipt_original_name, receipt_mimetype, created_at
    FROM payments WHERE debtor_id = ?
    ORDER BY COALESCE(payment_date, substr(created_at,1,10)) DESC, id DESC
  `).all(req.params.id);
  res.json({ debtor, payments });
});

app.post('/api/debtors', requireAuth, requireCsrf, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const cents = moneyToCents(req.body?.originalAmount);
  const notes = String(req.body?.notes || '').trim().slice(0, 1500);
  if (!name || name.length > 100 || !cents) return res.status(400).json({ error: 'Informe nome e valor válidos.' });
  const result = db.prepare('INSERT INTO debtors (name, original_amount_cents, notes) VALUES (?, ?, ?)').run(name, cents, notes);
  res.status(201).json({ debtor: getDebtor(result.lastInsertRowid) });
});

app.put('/api/debtors/:id', requireAuth, requireCsrf, (req, res) => {
  const current = getDebtor(req.params.id);
  if (!current) return res.status(404).json({ error: 'Pessoa não encontrada.' });
  const name = String(req.body?.name || '').trim();
  const cents = moneyToCents(req.body?.originalAmount);
  const notes = String(req.body?.notes || '').trim().slice(0, 1500);
  if (!name || name.length > 100 || !cents) return res.status(400).json({ error: 'Informe nome e valor válidos.' });
  if (cents < current.paid_cents) return res.status(400).json({ error: 'O valor da dívida não pode ser menor que o total já pago.' });
  db.prepare('UPDATE debtors SET name = ?, original_amount_cents = ?, notes = ? WHERE id = ?').run(name, cents, notes, req.params.id);
  res.json({ debtor: getDebtor(req.params.id) });
});

app.post('/api/debtors/:id/payments', requireAuth, requireCsrf, upload.single('receipt'), (req, res) => {
  const debtor = getDebtor(req.params.id);
  if (!debtor) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Pessoa não encontrada.' });
  }
  const cents = moneyToCents(req.body?.amount);
  if (!cents) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Informe um valor de pagamento válido.' });
  }
  if (cents > debtor.remaining_cents) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'O pagamento não pode ser maior que o saldo restante.' });
  }
  const paymentDate = req.body?.paymentDate ? String(req.body.paymentDate) : null;
  const method = String(req.body?.method || '').trim().slice(0, 80);
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  const result = db.prepare(`
    INSERT INTO payments (debtor_id, amount_cents, payment_date, method, note, receipt_original_name, receipt_stored_name, receipt_mimetype)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.id, cents, paymentDate, method, note,
    req.file?.originalname || null, req.file?.filename || null, req.file?.mimetype || null
  );
  res.status(201).json({ ok: true, paymentId: result.lastInsertRowid, debtor: getDebtor(req.params.id) });
});

app.post('/api/payments/:id/receipt', requireAuth, requireCsrf, upload.single('receipt'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecione um comprovante.' });
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Pagamento não encontrado.' });
  }
  if (payment.receipt_stored_name) fs.unlink(path.join(UPLOAD_DIR, payment.receipt_stored_name), () => {});
  db.prepare(`UPDATE payments SET receipt_original_name = ?, receipt_stored_name = ?, receipt_mimetype = ? WHERE id = ?`)
    .run(req.file.originalname, req.file.filename, req.file.mimetype, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/payments/:id/receipt', requireAuth, requireCsrf, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado.' });
  if (payment.receipt_stored_name) fs.unlink(path.join(UPLOAD_DIR, payment.receipt_stored_name), () => {});
  db.prepare('UPDATE payments SET receipt_original_name = NULL, receipt_stored_name = NULL, receipt_mimetype = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.delete('/api/payments/:id', requireAuth, requireCsrf, (req, res) => {
  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(req.params.id);
  if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado.' });
  if (payment.receipt_stored_name) fs.unlink(path.join(UPLOAD_DIR, payment.receipt_stored_name), () => {});
  db.prepare('DELETE FROM payments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/receipts/:paymentId', requireAuth, (req, res) => {
  const payment = db.prepare('SELECT receipt_original_name, receipt_stored_name, receipt_mimetype FROM payments WHERE id = ?').get(req.params.paymentId);
  if (!payment?.receipt_stored_name) return res.status(404).send('Comprovante não encontrado.');
  const filePath = path.join(UPLOAD_DIR, path.basename(payment.receipt_stored_name));
  if (!fs.existsSync(filePath)) return res.status(404).send('Arquivo não encontrado.');
  res.setHeader('Content-Type', payment.receipt_mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(payment.receipt_original_name || 'comprovante')}`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(filePath);
});

app.get('/api/receipts', requireAuth, (_req, res) => {
  const receipts = db.prepare(`
    SELECT p.id AS payment_id, p.amount_cents, p.payment_date, p.created_at,
           p.receipt_original_name, p.receipt_mimetype, d.id AS debtor_id, d.name AS debtor_name
    FROM payments p JOIN debtors d ON d.id = p.debtor_id
    WHERE p.receipt_stored_name IS NOT NULL
    ORDER BY COALESCE(p.payment_date, substr(p.created_at,1,10)) DESC, p.id DESC
  `).all();
  res.json({ receipts });
});

app.get('/api/backup', requireAuth, (_req, res) => {
  const data = {
    exportedAt: new Date().toISOString(),
    debtors: db.prepare('SELECT * FROM debtors ORDER BY id').all(),
    payments: db.prepare(`SELECT id, debtor_id, amount_cents, payment_date, method, note, receipt_original_name, receipt_mimetype, created_at FROM payments ORDER BY id`).all()
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backup-dividas-${new Date().toISOString().slice(0,10)}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'O comprovante deve ter no máximo 8 MB.' });
  }
  if (err?.message?.includes('Formato inválido')) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Ocorreu um erro interno.' });
});

app.listen(PORT, () => {
  console.log(`Controle de Dívidas rodando em http://localhost:${PORT}`);
});
