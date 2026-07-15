import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { openDatabase } from '../db.js';
import { createApp } from '../app.js';
import { DEFAULTS } from '../config.js';

function makeConfig(overrides = {}) {
  return structuredClone({ ...DEFAULTS, ...overrides });
}

function appWith(config) {
  const db = openDatabase(':memory:');
  return createApp({ db, config, secret: 'test-secret' });
}

describe('API without auth', () => {
  let app;
  beforeEach(() => {
    app = appWith(makeConfig());
  });

  it('exposes public settings without the password', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Hustlify');
    expect(res.body.authRequired).toBe(false);
    expect(res.body).not.toHaveProperty('password');
  });

  it('runs the full category + timer flow', async () => {
    const cat = await request(app).post('/api/categories').send({ name: 'Dev', color: '#3b82f6' });
    expect(cat.status).toBe(201);

    const start = await request(app).post('/api/timer/start').send({ categoryId: cat.body.id, note: 'x' });
    expect(start.status).toBe(201);
    expect(start.body.running).toBe(true);

    const dup = await request(app).post('/api/timer/start').send({});
    expect(dup.status).toBe(409);

    const stop = await request(app).post('/api/timer/stop').send();
    expect(stop.status).toBe(200);
    expect(stop.body.running).toBe(false);

    const list = await request(app).get('/api/entries');
    expect(list.body).toHaveLength(1);
  });

  it('validates manual entries', async () => {
    const bad = await request(app).post('/api/entries').send({ startTs: 5000, endTs: 1000 });
    expect(bad.status).toBe(400);
  });

  it('exports CSV and a PDF report', async () => {
    await request(app).post('/api/entries').send({ startTs: 1_700_000_000_000, endTs: 1_700_003_600_000, note: 'work' });

    const csv = await request(app).get('/api/export.csv');
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/csv/);
    expect(csv.text.split('\r\n')[0]).toBe('Date,Start,End,Duration,Hours,Category,Note');

    const pdf = await request(app).get('/api/report.pdf').buffer(true).parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.body.slice(0, 4).toString()).toBe('%PDF');
  });
});

describe('API with auth', () => {
  let app;
  beforeEach(() => {
    app = appWith(makeConfig({ auth: { password: 'secret123' } }));
  });

  it('reports that auth is required and blocks protected routes', async () => {
    const settings = await request(app).get('/api/settings');
    expect(settings.body.authRequired).toBe(true);

    const blocked = await request(app).get('/api/categories');
    expect(blocked.status).toBe(401);
  });

  it('rejects a wrong password and accepts the right one', async () => {
    const wrong = await request(app).post('/api/login').send({ password: 'nope' });
    expect(wrong.status).toBe(401);

    const agent = request.agent(app);
    const ok = await agent.post('/api/login').send({ password: 'secret123' });
    expect(ok.status).toBe(200);

    const cats = await agent.get('/api/categories');
    expect(cats.status).toBe(200);
  });
});
