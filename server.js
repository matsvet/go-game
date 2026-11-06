const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const port = 3000;
const kataGoDir = '/opt/homebrew/opt/katago/share/katago';
const model = process.env.KATAGO_MODEL || path.join(kataGoDir, 'kata1-b18c384nbt-s9996604416-d4316597426.bin.gz');
const config = process.env.KATAGO_CONFIG || path.join(kataGoDir, 'configs/analysis_example.cfg');
const kataGo = spawn(process.env.KATAGO_BIN || 'katago', [
  'analysis', '-model', model, '-config', config,
  '-override-config', 'reportAnalysisWinratesAs=SIDETOMOVE'
]);

let ready = false;
let queryCounter = 0;
let startupMessage = '';
const pending = new Map();

// Match the browser: simple ko, no suicide, stones and enclosed points.
const rules = { ko: 'SIMPLE', scoring: 'AREA', tax: 'NONE', suicide: false };

createInterface({ input: kataGo.stdout }).on('line', line => {
  let result;
  try {
    result = JSON.parse(line);
  } catch {
    console.error('Некорректная строка KataGo:', line);
    return;
  }

  const finish = pending.get(result?.id);
  if (!finish) return;
  if (result.error) {
    finish(new Error(result.error));
  } else if (result.warning) {
    console.warn('KataGo:', result.warning);
  } else if (!result.isDuringSearch) {
    finish(null, result);
  }
});

createInterface({ input: kataGo.stderr }).on('line', line => {
  startupMessage = line;
  if (line.includes('Started, ready to begin handling requests')) {
    ready = true;
    console.log('KataGo готова к анализу.');
  }
});

function engineStopped(error) {
  ready = false;
  for (const finish of pending.values()) finish(error);
}

kataGo.on('error', error => {
  console.error('Не удалось запустить KataGo:', error.message);
  engineStopped(error);
});
kataGo.stdin.on('error', engineStopped);
kataGo.on('exit', (code, signal) => {
  console.log(`KataGo завершилась (${signal || code}). ${startupMessage}`);
  engineStopped(new Error('Процесс KataGo завершился'));
});

function queryKataGo({ moves = [], boardXSize = 9, boardYSize = 9, komi = 5.5, maxVisits = 50 }, response) {
  return new Promise((resolve, reject) => {
    const id = `q_${++queryCounter}`;
    const payload = { id, moves, boardXSize, boardYSize, komi, maxVisits, rules };
    const finish = (error, result) => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      response.off('close', cancel);
      if (error) reject(error);
      else resolve(result);
    };
    const stopSearch = error => {
      finish(error);
      if (ready && kataGo.stdin.writable) {
        kataGo.stdin.write(JSON.stringify({ id: `stop_${id}`, action: 'terminate', terminateId: id }) + '\n');
      }
    };
    const cancel = () => stopSearch(new Error('Запрос отменен'));
    const timer = setTimeout(() => stopSearch(new Error('Таймаут ответа KataGo (10 сек)')), 10000);

    pending.set(id, finish);
    response.once('close', cancel);
    kataGo.stdin.write(JSON.stringify(payload) + '\n', error => {
      if (error) finish(error);
    });
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');

  if (request.method === 'GET' && pathname === '/api/status') {
    return sendJson(response, 200, { active: ready });
  }

  if (request.method === 'POST' && pathname === '/api/query') {
    if (!ready) return sendJson(response, 503, { error: 'KataGo еще не готова' });

    let payload;
    try {
      const chunks = [];
      let length = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        length += chunk.length;
        if (length > 256 * 1024) return sendJson(response, 413, { error: 'Запрос слишком большой' });
        chunks.push(chunk);
      }
      payload = JSON.parse(Buffer.concat(chunks));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
    } catch {
      if (!response.destroyed) sendJson(response, 400, { error: 'Ожидается JSON-объект' });
      return;
    }

    if (response.destroyed) return;
    try {
      const result = await queryKataGo(payload, response);
      if (!response.destroyed) sendJson(response, 200, result);
    } catch (error) {
      if (!response.destroyed) sendJson(response, 502, { error: error.message });
    }
    return;
  }

  const asset = pathname === '/' ? '/index.html' : pathname;
  const isGameAsset = asset.startsWith('/src/pages/game/') && /\.(css|js)$/.test(asset);
  if (request.method === 'GET' && (asset === '/index.html' || isGameAsset)) {
    try {
      const content = await fs.promises.readFile(path.join(__dirname, asset));
      response.writeHead(200, { 'Content-Type': `${mime[path.extname(asset)]}; charset=utf-8` });
      response.end(content);
      return;
    } catch {
      // Missing assets return 404 below.
    }
  }

  response.writeHead(404);
  response.end('Not found');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    kataGo.kill();
    server.close();
  });
}
server.on('error', error => {
  console.error(error.message);
  kataGo.kill();
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Тренажер Го: http://localhost:${port}`);
});
