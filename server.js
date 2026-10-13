'use strict';
/**
 * AI 사주 상담 서버 — 외부 의존성 없음 (Node 18+)
 *  GET  /                static
 *  GET  /api/config      { mode: 'openai' | 'demo', model }
 *  POST /api/saju        만세력 계산 결과(JSON)
 *  POST /api/interpret   만세력 계산 → LLM 풀이 SSE 스트림
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { computeSaju } = require('./lib/saju');
const { SYSTEM_PROMPT, SERVICE, PERSONA, buildUserMessage } = require('./lib/prompt');
const { buildDemoReport } = require('./lib/demo');

// .env 간이 로더 (dotenv 대체)
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch { /* .env 없음 */ }

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE) || 0.55;
const PUBLIC = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

// 간단한 IP별 요청 제한 (분당 10회, LLM 호출 비용 보호)
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 10;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 20000) { reject(new Error('요청이 너무 큽니다.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { reject(new Error('잘못된 JSON 요청입니다.')); } });
    req.on('error', reject);
  });
}
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };

function parseBirth(b) {
  const hourKnown = b.hour !== null && b.hour !== undefined && b.hour !== '' && b.hourKnown !== false;
  return computeSaju({
    name: String(b.name || '').slice(0, 20),
    gender: b.gender === 'F' ? 'F' : 'M',
    year: b.year, month: b.month, day: b.day,
    calendar: b.calendar === 'lunar' ? 'lunar' : 'solar', leap: !!b.leap,
    hour: hourKnown ? Number(b.hour) : null, minute: hourKnown ? Number(b.minute || 0) : null,
    ziMode: b.ziMode, kstCorrection: b.kstCorrection !== false,
  });
}

const sseWrite = (res, event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

async function streamOpenAI(saju, service, persona, res, signal) {
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL, temperature: TEMPERATURE, stream: true,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserMessage(saju, service, persona, today) }],
    }),
  });
  if (!r.ok) {
    let msg = `OpenAI 오류 (${r.status})`;
    try { const j = await r.json(); if (j.error && j.error.message) msg += `: ${j.error.message}`; } catch { /* ignore */ }
    throw new Error(msg);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const delta = JSON.parse(payload).choices[0].delta.content;
        if (delta) sseWrite(res, 'delta', { text: delta });
      } catch { /* 불완전 청크 무시 */ }
    }
  }
}

async function streamDemo(saju, service, persona, res, aborted) {
  const text = buildDemoReport(saju, service, persona);
  const chunks = text.match(/[\s\S]{1,6}/g);
  for (const c of chunks) {
    if (aborted()) return;
    sseWrite(res, 'delta', { text: c });
    await new Promise((ok) => setTimeout(ok, 12));
  }
}

async function handleInterpret(req, res) {
  const body = await readJson(req);
  const service = body.service_type in SERVICE ? body.service_type : null;
  const persona = body.persona_type in PERSONA ? body.persona_type : null;
  if (!service || !persona) return send(res, 400, { error: '상담 테마와 상담가 유형을 선택해 주세요.' });
  const saju = parseBirth(body);

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  sseWrite(res, 'saju', saju);
  sseWrite(res, 'mode', { mode: API_KEY ? 'openai' : 'demo' });

  const ac = new AbortController();
  let closed = false;
  res.on('close', () => { closed = true; ac.abort(); });
  try {
    if (API_KEY) await streamOpenAI(saju, service, persona, res, ac.signal);
    else await streamDemo(saju, service, persona, res, () => closed);
    if (!closed) sseWrite(res, 'done', {});
  } catch (e) {
    if (!closed) sseWrite(res, 'error', { message: e.message || '풀이 생성 중 오류가 발생했습니다.' });
  }
  res.end();
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.pathname === '/api/config') return send(res, 200, { mode: API_KEY ? 'openai' : 'demo', model: API_KEY ? MODEL : null });
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      if (rateLimited(req.socket.remoteAddress)) return send(res, 429, { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
      if (url.pathname === '/api/saju') return send(res, 200, parseBirth(await readJson(req)));
      if (url.pathname === '/api/interpret') return await handleInterpret(req, res);
      return send(res, 404, { error: 'Not found' });
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    let file = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  } catch (e) {
    if (res.headersSent) return res.end();
    send(res, 400, { error: e.message || '요청 처리 중 오류가 발생했습니다.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`AI 사주 상담 서버: http://localhost:${PORT}`);
    console.log(API_KEY ? `LLM: OpenAI ${MODEL}` : 'LLM: 데모 모드 (.env에 OPENAI_API_KEY를 넣으면 OpenAI로 전환)');
  });
}
module.exports = server;
