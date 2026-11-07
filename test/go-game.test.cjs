const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

function loadGame(fetch) {
  const context = vm.createContext({ fetch });
  const sourceDir = path.join(__dirname, '..', 'src', 'pages', 'game');
  for (const file of ['model/rules.js', 'model/heuristic.js', 'api/katago.js', 'api/game-save.js']) {
    vm.runInContext(readFileSync(path.join(sourceDir, file), 'utf8'), context, { filename: file });
  }
  return vm.runInContext('({ ...GoRules, GoHeuristicAI, GoKataGo, GoGameSave })', context);
}

function play(game, letters, ...moves) {
  for (const move of moves) {
    if (move === 'pass') {
      assert.equal(game.pass(), true);
    } else {
      const result = game.playMove(game.size - Number(move.slice(1)), letters.indexOf(move[0]));
      assert.equal(result.valid, true, result.reason);
    }
  }
}

test('capture counts in statistics while area scoring uses stones, territory and komi', () => {
  const { GoGame, LETTERS, BLACK, WHITE } = loadGame();
  const game = new GoGame();
  play(game, LETTERS, 'B9', 'A9', 'A8', 'J1', 'E5', 'pass', 'F5', 'pass', 'G5', 'pass', 'pass');

  assert.equal(game.isGameOver, true);
  assert.equal(game.prisoners[BLACK], 1);
  assert.equal(game.calculateScore().black.total, 6);
  assert.equal(game.calculateScore().white.total, 6.5);
  assert.equal(game.calculateScore().winner, WHITE);

  assert.equal(game.undo(2), true);
  assert.equal(game.isGameOver, false);
  assert.equal(game.moveNumber, 10);
  assert.equal(game.consecutivePasses, 0);
  assert.equal(game.turn, WHITE);
});

test('simple ko applies to both actual moves and the heuristic reply', () => {
  const { GoGame, GoHeuristicAI, LETTERS, BLACK, WHITE } = loadGame();
  const game = new GoGame();
  play(game, LETTERS, 'B9', 'C9', 'B7', 'D8', 'A8', 'C7', 'J1', 'B8');

  const capture = game.testMove(1, 2, BLACK);
  assert.equal(capture.valid, true);
  assert.equal(capture.captured.length, 1);
  assert.equal(new GoHeuristicAI(game).hasImmediateCounterCapture(capture.nextBoard, 1, 2, WHITE, capture.liberties), false);

  play(game, LETTERS, 'C8');
  assert.match(game.playMove(1, 1).reason, /Ко/);
  assert.equal(game.undo(), true);
  assert.equal(game.board[1][1], WHITE);
  assert.equal(game.prisoners[BLACK], 0);

  play(game, LETTERS, 'C8', 'pass', 'A1', 'B8');
  assert.equal(game.prisoners[WHITE], 1);
});

test('illegal moves leave the turn and history intact', () => {
  const { GoGame, LETTERS, WHITE } = loadGame();
  const game = new GoGame();
  play(game, LETTERS, 'A8', 'J1', 'B9');

  assert.match(game.playMove(0, 0).reason, /Самоубийство/);
  assert.match(game.playMove(0, 1).reason, /занято/);
  assert.match(game.playMove(-1, 0).reason, /вне доски/);
  assert.equal(game.moveCount, 3);
  assert.equal(game.turn, WHITE);
});

test('KataGo gets the same history after undo, and scores use the side to move', async () => {
  let payload;
  const { GoGame, GoKataGo, LETTERS } = loadGame(async (url, options) => {
    assert.equal(url, '/api/query');
    payload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        rootInfo: { winrate: 0.8, scoreLead: 5 },
        moveInfos: [
          { move: 'C7', winrate: 0.8, scoreLead: 5, pv: ['C7', 'C7x', 'pass', 'T20'] },
          { move: 'pass' }
        ]
      })
    };
  });
  const game = new GoGame(13);
  play(game, LETTERS, 'K10', 'pass', 'D4', 'A1', 'A2');
  assert.equal(game.undo(2), true);

  const result = await GoKataGo.analyze(game, 'medium', { hint: true });
  assert.deepEqual(payload, {
    moves: [['B', 'K10'], ['W', 'pass'], ['B', 'D4']],
    maxVisits: 50,
    boardXSize: 13,
    boardYSize: 13,
    komi: 6.5
  });
  assert.equal(Math.round(result.evaluation.blackWinrate), 20);
  assert.equal(result.evaluation.statusLead, 'Белые +5.0');
  assert.deepEqual(Array.from(result.candidates[0].variation), ['C7', 'pass']);
  assert.equal(result.candidates[1].point, null);
});

test('an engine error can fall back to the offline heuristic', async () => {
  const { GoGame, GoKataGo, GoHeuristicAI, WHITE, LETTERS } = loadGame(async () => ({
    ok: true,
    json: async () => ({ error: 'Illegal move' })
  }));
  const game = new GoGame();
  play(game, LETTERS, 'E5');
  await assert.rejects(GoKataGo.analyze(game, 'medium', {}), /Некорректный ответ/);
  const move = new GoHeuristicAI(game).findBestMove(WHITE, 'medium');
  assert.equal(game.testMove(move.r, move.c, WHITE).valid, true);
});

test('the offline heuristic evaluates a capture from the requested color', () => {
  const { GoGame, GoHeuristicAI, LETTERS, BLACK, WHITE } = loadGame();
  const game = new GoGame();
  play(game, LETTERS, 'B9', 'A9');

  const ai = new GoHeuristicAI(game);
  assert.match(ai.findBestMove(BLACK, 'hard').tag, /Захват/);
  assert.match(ai.findBestMove(WHITE, 'hard').tag, /Спасение из атари/);
});

test('scoring leaves marked stones on the game board and resuming removes the closing passes', () => {
  const { GoGame, LETTERS, WHITE } = loadGame();
  const game = new GoGame();
  play(game, LETTERS, 'A9', 'E5', 'A8', 'pass', 'pass');
  const marked = new Set(['4,4']);
  assert.equal(game.calculateScore(marked).black.total, 81);
  assert.equal(game.calculateScore(marked).white.total, 5.5);
  assert.equal(game.board[4][4], WHITE);

  game.resumePlay();
  assert.equal(game.isGameOver, false);
  assert.equal(game.moveCount, 3);
  assert.equal(game.turn, WHITE);
  assert.equal(game.consecutivePasses, 0);
});

test('replaying a journal rebuilds captures and rejects impossible moves', () => {
  const { GoGame, LETTERS, BLACK, WHITE } = loadGame();
  const game = new GoGame();
  play(game, LETTERS, 'B9', 'A9', 'A8', 'pass');
  const replay = GoGame.fromMoves(game.size, game.getMoveHistory());
  assert.deepEqual(replay.board, game.board);
  assert.equal(replay.prisoners[BLACK], 1);
  assert.equal(replay.turn, BLACK);
  assert.equal(replay.undo(2), true);
  assert.equal(replay.board[0][0], WHITE);
  assert.equal(game.moveCount, 4);
  assert.throws(() => GoGame.fromMoves(9, [
    { color: BLACK, move: { r: 0, c: 0 } },
    { color: WHITE, move: { r: 0, c: 0 } }
  ]), /Недопустимый ход №2/);
});

test('save files restore settings and provisional scoring without accepting partial group marks', () => {
  const { GoGame, GoGameSave, LETTERS, BLACK, WHITE } = loadGame();
  const game = new GoGame(13);
  play(game, LETTERS, 'A13', 'E5', 'A12', 'pass', 'pass');
  const encoded = GoGameSave.encode(game, {
    phase: 'scoring', deadStones: new Set(['0,0', '1,0']),
    playerColor: WHITE, vsAi: true, difficulty: 'hard', preferredEngine: 'katago', showLiberties: true
  });
  const saved = GoGameSave.decode(encoded);
  assert.equal(saved.game.size, 13);
  assert.equal(saved.game.turn, WHITE);
  assert.equal(saved.phase, 'scoring');
  assert.equal(saved.playerColor, WHITE);
  assert.equal(saved.difficulty, 'hard');
  assert.equal(saved.game.board[0][0], BLACK);
  assert.deepEqual(Array.from(saved.deadStones), ['0,0', '1,0']);
  assert.throws(() => GoGameSave.decode(encoded.replace('["0,0","1,0"]', '["0,0"]')), /отмечена частично/);
});

test('save files preserve total party seconds and reject negative duration', () => {
  const { GoGame, GoGameSave, LETTERS, BLACK, WHITE } = loadGame();
  const game = new GoGame(9);
  play(game, LETTERS, 'E5', 'D5');
  const encoded = GoGameSave.encode(game, {
    phase: 'play', deadStones: new Set(),
    playerColor: BLACK, vsAi: true, difficulty: 'medium', preferredEngine: 'builtin', showLiberties: true,
    totalSeconds: 3665
  });
  const saved = GoGameSave.decode(encoded);
  assert.equal(saved.totalSeconds, 3665);

  const legacy = GoGameSave.decode(encoded.replace(/,"totalSeconds":\d+/, ''));
  assert.equal(legacy.totalSeconds, 0);

  assert.throws(() => GoGameSave.decode(encoded.replace('3665', '-10')), /Неподдерживаемый формат/);
});

test('panel formats durations into MM:SS and H:MM:SS', () => {
  const context = vm.createContext({
    document: {
      getElementById: () => ({ addEventListener: () => {}, classList: { add: () => {}, remove: () => {} } }),
      querySelectorAll: () => []
    },
    GoRules: { BLACK: 1, WHITE: 2, formatCoord: () => '' }
  });
  const sourceDir = path.join(__dirname, '..', 'src', 'pages', 'game');
  vm.runInContext(readFileSync(path.join(sourceDir, 'ui', 'game-panel.js'), 'utf8'), context);
  const panel = vm.runInContext('createGamePanel()', context);
  assert.equal(panel.formatDuration(0), '00:00');
  assert.equal(panel.formatDuration(9), '00:09');
  assert.equal(panel.formatDuration(59), '00:59');
  assert.equal(panel.formatDuration(65), '01:05');
  assert.equal(panel.formatDuration(3599), '59:59');
  assert.equal(panel.formatDuration(3600), '1:00:00');
  assert.equal(panel.formatDuration(3665), '1:01:05');
  assert.equal(panel.formatDuration(7325), '2:02:05');
});
