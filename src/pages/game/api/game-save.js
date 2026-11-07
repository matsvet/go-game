const GoGameSave = (() => {
  'use strict';
  const { GoGame, EMPTY, BLACK, WHITE } = GoRules;
  const storageKey = 'go-game:last-game';
  const maxFileSize = 1024 * 1024;

  function encode(game, { phase, deadStones, playerColor, vsAi, difficulty, preferredEngine, showLiberties, totalSeconds = 0 }) {
    return JSON.stringify({
      format: 'go-game',
      version: 1,
      size: game.size,
      moves: game.getMoveHistory(),
      phase,
      deadStones: deadStones ? Array.from(deadStones) : [],
      playerColor,
      vsAi,
      difficulty,
      preferredEngine,
      showLiberties,
      totalSeconds: Math.max(0, Math.floor(Number(totalSeconds) || 0))
    });
  }

  function decode(text) {
    if (text.length > maxFileSize) throw new Error('Файл партии слишком большой.');
    const data = JSON.parse(text);
    if (data?.format !== 'go-game' || data.version !== 1 ||
        !['play', 'scoring', 'finished'].includes(data.phase) ||
        ![BLACK, WHITE].includes(data.playerColor) ||
        typeof data.vsAi !== 'boolean' || typeof data.showLiberties !== 'boolean' ||
        !['easy', 'medium', 'hard', 'god'].includes(data.difficulty) ||
        !['builtin', 'katago'].includes(data.preferredEngine) ||
        !Array.isArray(data.deadStones) ||
        (data.totalSeconds !== undefined && (!Number.isInteger(data.totalSeconds) || data.totalSeconds < 0))) {
      throw new Error('Неподдерживаемый формат сохранения.');
    }

    const game = GoGame.fromMoves(data.size, data.moves);
    const deadStones = new Set(data.deadStones);
    if (data.phase === 'play' && (game.isGameOver || deadStones.size)) {
      throw new Error('Некорректное состояние партии.');
    }
    if (data.phase !== 'play') game.endGame();

    for (const key of deadStones) {
      if (typeof key !== 'string') throw new Error('Некорректная отметка группы.');
      const [r, c] = key.split(',').map(Number);
      if (key !== `${r},${c}` || !Number.isInteger(r) || !Number.isInteger(c) ||
          !game.isValidCoord(r, c) || game.board[r][c] === EMPTY) {
        throw new Error('Некорректная отметка группы.');
      }
    }
    if (deadStones.size && game.getAllGroups().some(({ stones }) => {
      const marked = stones.filter(({ r, c }) => deadStones.has(`${r},${c}`)).length;
      return marked > 0 && marked < stones.length;
    })) {
      throw new Error('Мёртвая группа отмечена частично.');
    }

    return {
      game,
      phase: data.phase,
      deadStones: data.phase === 'play' ? null : deadStones,
      playerColor: data.playerColor,
      vsAi: data.vsAi,
      difficulty: data.difficulty,
      preferredEngine: data.preferredEngine,
      showLiberties: data.showLiberties,
      totalSeconds: Number.isInteger(data.totalSeconds) ? data.totalSeconds : 0
    };
  }

  function read() {
    try {
      const text = localStorage.getItem(storageKey);
      return text ? decode(text) : null;
    } catch {
      // Storage can be disabled, particularly when the page is opened from disk.
      return null;
    }
  }

  function write(text) {
    try {
      if (text) localStorage.setItem(storageKey, text);
      else localStorage.removeItem(storageKey);
    } catch {
      // Downloading and opening a file still work without browser storage.
    }
  }

  function download(text, size) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `go-game-${size}x${size}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function openFile(file) {
    if (file.size > maxFileSize) throw new Error('Файл партии слишком большой.');
    return decode(await file.text());
  }

  return { encode, decode, read, write, download, openFile };
})();
