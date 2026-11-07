(() => {
  'use strict';
  const { GoGame, EMPTY, BLACK, WHITE, opponentOf } = GoRules;
  const byId = id => document.getElementById(id);
  const vsAiControl = byId('chkVsAi');
  const libertiesControl = byId('chkShowLiberties');
  const rulesModal = byId('modalRules');
  const resultModal = byId('modalGameOver');

  let game = new GoGame();
  const sound = new SoundFX();
  const panel = createGamePanel();
  const board = createBoardView({ canPlay: isHumanTurn, onPlay: onBoardClick });
  const sizeNames = {
    9: 'Быстрая учебная',
    11: 'Компактная',
    13: 'Средняя классика',
    15: 'Промежуточная',
    19: 'Классическая турнирная'
  };

  let vsAi = vsAiControl.checked;
  let playerColor = BLACK;
  let difficulty = 'medium';
  let preferredEngine = 'katago';
  let katagoStatus = 'offline';
  let aiTurn = null;
  let hintRequest = null;
  let hintMoves = [];
  let evaluation = null;
  let scoring = false;
  let deadStones = null;
  let review = null;
  let savedGame = GoGameSave.read();
  let totalGameSeconds = savedGame?.totalSeconds || 0;
  let turnStartedAt = null;
  let currentMoveSeconds = 0;
  let lastBlackMoveSeconds = 0;
  let lastWhiteMoveSeconds = 0;
  let timerInterval = null;

  function getActiveTotalSeconds() {
    if (!turnStartedAt || game.isGameOver || scoring || review || savedGame) {
      return totalGameSeconds;
    }
    const currentTurnElapsed = Math.max(0, Math.floor((Date.now() - turnStartedAt) / 1000));
    return totalGameSeconds + currentTurnElapsed;
  }

  function getActiveMoveSeconds() {
    if (!turnStartedAt || game.isGameOver || scoring || review || savedGame) {
      return currentMoveSeconds;
    }
    return Math.max(0, Math.floor((Date.now() - turnStartedAt) / 1000));
  }

  function updateTimerUI() {
    panel.updateTimers({
      totalSeconds: getActiveTotalSeconds(),
      moveSeconds: getActiveMoveSeconds(),
      turn: visiblePosition().turn,
      blackMoveSeconds: lastBlackMoveSeconds,
      whiteMoveSeconds: lastWhiteMoveSeconds
    });
  }

  function startTurnTimer() {
    if (game.isGameOver || scoring || review || savedGame) {
      turnStartedAt = null;
      updateTimerUI();
      return;
    }
    turnStartedAt = Date.now();
    currentMoveSeconds = 0;
    updateTimerUI();
    if (!timerInterval) {
      timerInterval = setInterval(() => {
        if (!turnStartedAt || game.isGameOver || scoring || review || savedGame) return;
        currentMoveSeconds = Math.max(0, Math.floor((Date.now() - turnStartedAt) / 1000));
        updateTimerUI();
      }, 500);
    }
  }

  function commitTurnTime(moverColor) {
    if (turnStartedAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - turnStartedAt) / 1000));
      totalGameSeconds += elapsed;
      if (moverColor === BLACK) lastBlackMoveSeconds = elapsed;
      else if (moverColor === WHITE) lastWhiteMoveSeconds = elapsed;
      currentMoveSeconds = 0;
    }
    turnStartedAt = null;
  }

  function pauseGameTimer() {
    if (turnStartedAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - turnStartedAt) / 1000));
      totalGameSeconds += elapsed;
      if (game.turn === BLACK) lastBlackMoveSeconds = elapsed;
      else if (game.turn === WHITE) lastWhiteMoveSeconds = elapsed;
      turnStartedAt = null;
    }
    currentMoveSeconds = 0;
    updateTimerUI();
  }

  function resetAllTimers() {
    totalGameSeconds = 0;
    currentMoveSeconds = 0;
    lastBlackMoveSeconds = 0;
    lastWhiteMoveSeconds = 0;
    startTurnTimer();
  }

  function getComputerColor() {
    return vsAi ? opponentOf(playerColor) : null;
  }

  function isHumanTurn() {
    return !savedGame && !review && !game.isGameOver && game.turn !== getComputerColor();
  }

  function undoSteps() {
    if (scoring || review || aiTurn || game.moveCount === 0) return 0;
    const computerColor = getComputerColor();
    if (computerColor === null || game.turn === computerColor) return 1;
    return game.moveCount >= 2 ? 2 : 0;
  }

  function currentEngine() {
    return katagoStatus === 'ready' ? preferredEngine : 'builtin';
  }

  function visiblePosition() {
    if (!review) return game;
    return review.variation[review.step - 1]?.position ?? review.position;
  }

  function currentScore() {
    return !review && game.isGameOver ? game.calculateScore(deadStones) : null;
  }

  function renderPanel(score = currentScore()) {
    panel.render({
      game: visiblePosition(), score, difficulty, playerColor, katagoStatus, evaluation,
      computerColor: getComputerColor(),
      engine: currentEngine(),
      aiThinking: aiTurn !== null,
      scoring,
      review,
      savedGame,
      canSaveGame: game.moveCount > 0 || game.isGameOver,
      hintPending: hintRequest !== null,
      canPlay: isHumanTurn(),
      canUndo: undoSteps() > 0,
      totalSeconds: getActiveTotalSeconds(),
      moveSeconds: getActiveMoveSeconds(),
      blackMoveSeconds: lastBlackMoveSeconds,
      whiteMoveSeconds: lastWhiteMoveSeconds
    });
  }

  function render({ animateOpponentMove = false } = {}) {
    const score = currentScore();
    board.render({
      position: visiblePosition(),
      showLiberties: libertiesControl.checked,
      hintMoves: review?.step ? [] : hintMoves,
      animateOpponentMove,
      territoryMap: score?.territoryMap,
      deadStones: review ? null : deadStones
    });
    renderPanel(score);
    return score;
  }

  function encodeGame() {
    const phase = scoring ? 'scoring' : game.isGameOver ? 'finished' : 'play';
    return GoGameSave.encode(game, {
      phase, deadStones, playerColor, vsAi, difficulty, preferredEngine,
      showLiberties: libertiesControl.checked,
      totalSeconds: getActiveTotalSeconds()
    });
  }

  function saveProgress({ clearEmpty = false } = {}) {
    if (savedGame) return;
    if (game.moveCount || game.isGameOver) GoGameSave.write(encodeGame());
    else if (clearEmpty) GoGameSave.write(null);
  }

  function restoreGame(saved) {
    cancelAiTurn();
    clearAnalysis();
    review = null;
    savedGame = null;
    game = saved.game;
    scoring = saved.phase === 'scoring';
    deadStones = saved.deadStones;
    playerColor = saved.playerColor;
    vsAiControl.checked = vsAi = saved.vsAi;
    difficulty = saved.difficulty;
    preferredEngine = saved.preferredEngine;
    libertiesControl.checked = saved.showLiberties;
    totalGameSeconds = saved.totalSeconds || 0;
    currentMoveSeconds = 0;
    lastBlackMoveSeconds = 0;
    lastWhiteMoveSeconds = 0;
    resultModal.classList.remove('open');
    saveProgress({ clearEmpty: true });
    const score = render();
    if (saved.phase === 'finished') {
      turnStartedAt = null;
      updateTimerUI();
      panel.showResult(score, { totalSeconds: totalGameSeconds, moveCount: game.moveCount });
    } else if (saved.phase === 'scoring') {
      turnStartedAt = null;
      updateTimerUI();
    } else {
      startTurnTimer();
    }
    startAiTurn();
  }

  function beginScoring() {
    cancelAiTurn();
    clearAnalysis();
    pauseGameTimer();
    game.endGame();
    scoring = true;
    deadStones = new Set();
    saveProgress();
    render();
  }

  function onBoardClick(r, c) {
    if (!scoring) {
      playHumanMove(r, c);
      return;
    }
    if (game.board[r][c] === EMPTY) return;
    const markDead = !deadStones.has(`${r},${c}`);
    deadStones = new Set(deadStones);
    for (const stone of game.getGroupAndLiberties(r, c).stones) {
      const key = `${stone.r},${stone.c}`;
      if (markDead) deadStones.add(key);
      else deadStones.delete(key);
    }
    saveProgress();
    render();
  }

  function clearAnalysis() {
    hintRequest?.abort();
    hintRequest = null;
    hintMoves = [];
    evaluation = null;
    if (review) {
      review.variation = [];
      review.step = 0;
    }
    board.clearGhost();
    panel.hideHint();
  }

  function cancelAiTurn() {
    if (!aiTurn) return;
    clearTimeout(aiTurn.timer);
    aiTurn.controller.abort();
    aiTurn = null;
  }

  function checkAtari(mover, computerMoved) {
    const groups = game.getAllGroups();
    const nextThreatened = groups.some(group => group.color === game.turn && group.liberties.size === 1);
    const moverThreatened = groups.some(group => group.color === mover && group.liberties.size === 1);

    if (vsAi) {
      if (computerMoved) {
        if (nextThreatened) {
          sound.playAtariAlert();
          panel.showToast('⚠️ Внимание: компьютер поставил вашу группу в АТАРИ (осталось 1 дыхание)!');
        }
      } else if (moverThreatened) {
        sound.playAtariAlert();
        panel.showToast('⚠️ Ваш ход оставил свою группу в АТАРИ (1 дыхание).');
      } else if (nextThreatened) {
        panel.showToast('⚡ АТАРИ! Вы поставили камни соперника под угрозу захвата!');
      }
    } else if (moverThreatened || nextThreatened) {
      sound.playAtariAlert();
      const threatened = moverThreatened ? mover : opponentOf(mover);
      const name = threatened === BLACK ? 'Черных' : 'Белых';
      panel.showToast(`⚡ АТАРИ! Группа ${name} под угрозой захвата (1 дыхание)!`);
    }
  }

  function applyMove(point, nextEvaluation = null) {
    const mover = game.turn;
    const computerMoved = mover === getComputerColor();
    if (point) {
      const result = game.playMove(point.r, point.c);
      if (!result.valid) {
        if (isHumanTurn()) panel.showToast(result.reason);
        return false;
      }

      if (result.captured.length) {
        sound.playCapture();
        const captured = mover === BLACK ? 'белых' : 'черных';
        panel.showToast(`Захвачено камней ${captured}: ${result.captured.length}!`);
      } else {
        sound.playStoneClick();
      }
      checkAtari(mover, computerMoved);
    } else {
      if (!game.pass()) return false;
      sound.playPass();
      const color = mover === BLACK ? 'Черные' : 'Белые';
      panel.showToast(computerMoved ? '✋ Компьютер пасует!' : `${color} объявили пас.`);
    }

    commitTurnTime(mover);

    if (game.isGameOver) {
      beginScoring();
    } else {
      startTurnTimer();
      clearAnalysis();
      evaluation = nextEvaluation;
      saveProgress();
      render({ animateOpponentMove: Boolean(point) && computerMoved });
    }
    return true;
  }

  function playHumanMove(r, c) {
    if (!isHumanTurn()) return;
    board.clearGhost();
    if (applyMove({ r, c })) startAiTurn();
  }

  async function startAiTurn() {
    if (savedGame || aiTurn || game.isGameOver || game.turn !== getComputerColor()) return;

    const turn = { controller: new AbortController(), timer: null };
    aiTurn = turn;
    renderPanel();

    if (currentEngine() === 'katago') {
      let result;
      try {
        result = await GoKataGo.analyze(game, difficulty, { signal: turn.controller.signal });
      } catch (error) {
        if (aiTurn === turn) console.warn('KataGo недоступна, ходит встроенный движок:', error);
      }
      if (aiTurn !== turn) return;
      if (result) {
        const best = result.candidates[0];
        aiTurn = null;
        if (applyMove(best?.point ?? null, best?.evaluation)) return;
        aiTurn = turn;
      }
    }

    turn.timer = setTimeout(() => {
      if (aiTurn !== turn) return;
      const point = new GoHeuristicAI(game).findBestMove(game.turn, difficulty);
      aiTurn = null;
      applyMove(point);
    }, 550);
  }

  function setReviewVariation(points) {
    const moves = review.position.getMoveHistory();
    let position = review.position;
    review.variation = [];
    review.step = 0;
    for (const move of points) {
      const entry = { color: position.turn, move };
      moves.push(entry);
      try {
        position = GoGame.fromMoves(game.size, moves);
      } catch {
        break;
      }
      review.variation.push({ ...entry, position });
    }
  }

  function displayHint(moves, source, best = moves[0]) {
    if (review) {
      const points = best?.variation?.length
        ? best.variation.map(move => GoKataGo.parsePoint(move, game.size))
        : best ? [source === 'katago' ? best.point : { r: best.r, c: best.c }] : [];
      setReviewVariation(points);
    }
    hintMoves = moves;
    panel.showHint(moves, game.size, source, Boolean(review));
    render();
  }

  async function requestHint() {
    if ((!review && !isHumanTurn()) || review?.step || hintRequest) return;
    const position = visiblePosition();

    if (currentEngine() === 'katago') {
      const request = new AbortController();
      hintRequest = request;
      renderPanel();

      let result;
      try {
        result = await GoKataGo.analyze(position, difficulty, { signal: request.signal, hint: true });
      } catch (error) {
        if (hintRequest === request) console.warn('KataGo недоступна, подсказку даёт встроенный движок:', error);
      }
      if (hintRequest !== request) return;
      hintRequest = null;

      if (result) {
        const candidates = result.candidates.filter(({ point }) =>
          !point || position.testMove(point.r, point.c, position.turn).valid
        );
        if (candidates.length || !result.candidates.length) {
          evaluation = result.evaluation;
          const moves = candidates[0]?.point
            ? candidates.filter(move => move.point).slice(0, 3).map(move => ({ ...move, ...move.point }))
            : [];
          displayHint(moves, 'katago', candidates[0]);
          return;
        }
      }
    }

    displayHint(new GoHeuristicAI(position).findBestMoves(position.turn, 3, difficulty), 'builtin');
  }

  function selectReviewMove(index) {
    if (!review || index < 0 || index > review.moves.length) return;
    clearAnalysis();
    review.index = index;
    review.position = GoGame.fromMoves(game.size, review.moves.slice(0, index));
    if (review.position.isGameOver) review.position.resumePlay();
    render();
  }

  function refreshAutomation() {
    cancelAiTurn();
    clearAnalysis();
    render();
    startAiTurn();
  }

  async function detectKataGo() {
    if (katagoStatus === 'checking') return;

    katagoStatus = 'checking';
    renderPanel();

    // The bridge can answer before its Metal model has loaded.
    let active;
    for (let attempt = 0; attempt < 10; attempt++) {
      active = await GoKataGo.status();
      if (active !== false) break;
      if (attempt < 9) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    katagoStatus = active ? 'ready' : 'offline';
    if (currentEngine() === 'katago') refreshAutomation();
    else renderPanel();
  }

  function resetGame(size = game.size) {
    cancelAiTurn();
    clearAnalysis();
    scoring = false;
    deadStones = null;
    review = null;
    game.reset(size);
    resultModal.classList.remove('open');
    resetAllTimers();
    saveProgress({ clearEmpty: true });
    render();
    startAiTurn();
  }

  function restartGame() {
    resetGame();
    panel.showToast('Начата новая партия! Ход Черных.');
  }

  function confirmIfInProgress({ title, label, message = 'Позиция и история ходов текущей партии будут сброшены.' }, action) {
    if (game.moveCount > 0 && (!game.isGameOver || scoring)) {
      panel.confirmAction({ title, message, label }, action);
    } else {
      action();
    }
  }

  function requestRestart() {
    if (savedGame) {
      discardSavedGame();
      return;
    }
    confirmIfInProgress({ title: 'Начать новую партию?', label: 'Начать заново' }, restartGame);
  }

  function discardSavedGame() {
    panel.confirmAction({
      title: 'Начать новую партию?',
      message: 'Сохранённая партия будет удалена.',
      label: 'Начать новую'
    }, () => {
      savedGame = null;
      restartGame();
    });
  }

  byId('btnContinueSaved').addEventListener('click', () => {
    if (savedGame) restoreGame(savedGame);
  });
  byId('btnDiscardSaved').addEventListener('click', discardSavedGame);
  byId('btnSaveGameFile').addEventListener('click', () => GoGameSave.download(encodeGame(), game.size));
  const gameFileInput = byId('gameFileInput');
  byId('btnOpenGameFile').addEventListener('click', () => gameFileInput.click());
  gameFileInput.addEventListener('change', async () => {
    const [file] = gameFileInput.files;
    gameFileInput.value = '';
    if (!file) return;
    let imported;
    try {
      imported = await GoGameSave.openFile(file);
    } catch (error) {
      panel.showToast(`Не удалось открыть файл партии. ${error.message}`);
      return;
    }

    const title = 'Открыть партию из файла?';
    const label = 'Открыть партию';
    const load = () => restoreGame(imported);
    if (savedGame) {
      panel.confirmAction({ title, label, message: 'Партия из файла заменит сохранённую в браузере.' }, load);
    } else if (game.moveCount || game.isGameOver) {
      panel.confirmAction({ title, label, message: 'Партия из файла заменит текущую.' }, load);
    } else {
      load();
    }
  });

  byId('btnPass').addEventListener('click', () => {
    if (isHumanTurn() && applyMove(null)) startAiTurn();
  });
  byId('btnUndo').addEventListener('click', () => {
    const steps = undoSteps();
    if (!steps || !game.undo(steps)) return;
    clearAnalysis();
    deadStones = null;
    resultModal.classList.remove('open');
    startTurnTimer();
    saveProgress({ clearEmpty: true });
    render();
    panel.showToast('Ход отменен.');
  });
  byId('btnHint').addEventListener('click', requestHint);
  byId('btnReviewHint').addEventListener('click', requestHint);
  byId('btnReviewGame').addEventListener('click', () => {
    if (!game.isGameOver || scoring || !game.moveCount) return;
    pauseGameTimer();
    review = { moves: game.getMoveHistory(), variation: [], step: 0 };
    resultModal.classList.remove('open');
    selectReviewMove(game.moveCount);
  });
  byId('btnReviewPrev').addEventListener('click', () => selectReviewMove(review.index - 1));
  byId('btnReviewNext').addEventListener('click', () => selectReviewMove(review.index + 1));
  byId('btnReviewLineNext').addEventListener('click', () => {
    if (review.step >= review.variation.length) return;
    review.step++;
    render();
  });
  byId('btnReviewLineBack').addEventListener('click', () => {
    review.step = 0;
    render();
  });
  byId('btnExitReview').addEventListener('click', () => {
    clearAnalysis();
    review = null;
    panel.showResult(render(), { totalSeconds: totalGameSeconds, moveCount: game.moveCount });
  });
  byId('btnRestart').addEventListener('click', requestRestart);
  byId('btnRestartFromModal').addEventListener('click', restartGame);
  byId('btnScoreNow').addEventListener('click', () => {
    if (savedGame) return;
    if (game.isGameOver) {
      if (!scoring) panel.showResult(game.calculateScore(deadStones), { totalSeconds: totalGameSeconds, moveCount: game.moveCount });
      return;
    }
    confirmIfInProgress({
      title: 'Перейти к подсчёту?',
      message: 'Ходы будут приостановлены. На экране подсчёта можно продолжить игру.',
      label: 'Подсчитать очки'
    }, () => {
      sound.playPass();
      beginScoring();
    });
  });
  byId('btnConfirmScore').addEventListener('click', () => {
    if (!scoring) return;
    scoring = false;
    saveProgress();
    panel.showResult(render(), { totalSeconds: totalGameSeconds, moveCount: game.moveCount });
  });
  byId('btnResumePlay').addEventListener('click', () => {
    if (!scoring) return;
    scoring = false;
    deadStones = null;
    game.resumePlay();
    startTurnTimer();
    saveProgress({ clearEmpty: true });
    render();
    startAiTurn();
  });

  const hintBox = byId('hintExplanation');
  hintBox.addEventListener('mouseover', event => {
    const item = event.target.closest('.hint-alt-item');
    if (item) board.preview(Number(item.dataset.r), Number(item.dataset.c));
  });
  hintBox.addEventListener('mouseout', event => {
    if (event.target.closest('.hint-alt-item')) board.clearGhost();
  });
  hintBox.addEventListener('click', event => {
    const item = event.target.closest('.hint-alt-item');
    if (!item) return;
    const point = { r: Number(item.dataset.r), c: Number(item.dataset.c) };
    if (review) {
      setReviewVariation([point]);
      review.step = review.variation.length;
      render();
    } else {
      playHumanMove(point.r, point.c);
    }
  });

  document.querySelectorAll('.diff-btn[data-level]').forEach(button => {
    button.addEventListener('click', () => {
      if (difficulty === button.dataset.level) return;
      difficulty = button.dataset.level;
      saveProgress();
      refreshAutomation();
      panel.showToast(`Уровень сложности: ${panel.difficultyLabels[difficulty]}`);
    });
  });
  document.querySelectorAll('.diff-btn[data-size]').forEach(button => {
    button.addEventListener('click', () => {
      const size = Number(button.dataset.size);
      if (!Object.hasOwn(sizeNames, size) || size === game.size) return;
      confirmIfInProgress({ title: `Сменить размер на ${size} × ${size}?`, label: 'Сменить размер' }, () => {
        resetGame(size);
        panel.showToast(`Размер доски изменен: ${size} × ${size} (${sizeNames[size]}). Ход Черных.`);
      });
    });
  });
  document.querySelectorAll('[data-player-color]').forEach(button => {
    button.addEventListener('click', () => {
      const color = button.dataset.playerColor === 'black' ? BLACK : WHITE;
      if (!vsAi || color === playerColor) return;
      const side = color === BLACK ? 'чёрных' : 'белых';
      confirmIfInProgress({ title: `Начать новую партию за ${side}?`, label: 'Сменить цвет' }, () => {
        playerColor = color;
        restartGame();
      });
    });
  });
  byId('btnEngineKataGo').addEventListener('click', async () => {
    if (currentEngine() === 'katago') return;
    preferredEngine = 'katago';
    saveProgress();
    if (katagoStatus !== 'ready') {
      await detectKataGo();
      if (preferredEngine === 'katago' && katagoStatus === 'offline') {
        panel.showToast('⚠️ KataGo пока недоступна. Запустите ./start.sh или дождитесь загрузки модели.');
      }
      return;
    }
    refreshAutomation();
    panel.showToast('Выбран движок KataGo (Metal GPU нейросеть)');
  });
  byId('btnEngineBuiltin').addEventListener('click', () => {
    const switched = currentEngine() !== 'builtin';
    preferredEngine = 'builtin';
    saveProgress();
    if (switched) {
      refreshAutomation();
      panel.showToast('Выбран встроенный офлайн-движок');
    }
  });

  vsAiControl.addEventListener('change', () => {
    vsAi = vsAiControl.checked;
    saveProgress();
    refreshAutomation();
  });
  libertiesControl.addEventListener('change', () => {
    saveProgress();
    render();
  });

  byId('btnRules').addEventListener('click', () => rulesModal.classList.add('open'));
  for (const [modal, closeId] of [[rulesModal, 'btnCloseRules'], [resultModal, 'btnCloseGameOver']]) {
    byId(closeId).addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.remove('open');
    });
  }

  byId('btnAudioToggle').addEventListener('click', () => {
    sound.enabled = !sound.enabled;
    byId('audioIcon').textContent = sound.enabled ? '🔊' : '🔇';
    panel.showToast(sound.enabled ? 'Звук включен' : 'Звук выключен');
  });
  window.addEventListener('pointerdown', () => sound.init(), { once: true });
  window.addEventListener('keydown', event => {
    if (byId('confirmGameAction').open) return;
    if (document.activeElement?.matches('input, textarea')) return;
    if (rulesModal.classList.contains('open') || resultModal.classList.contains('open')) {
      if (event.key === 'Escape') {
        rulesModal.classList.remove('open');
        resultModal.classList.remove('open');
      }
      return;
    }
    const key = event.key.toLowerCase();
    if (event.code === 'Space') {
      if (document.activeElement?.matches('[data-player-color]')) return;
      event.preventDefault();
      byId('btnPass').click();
    } else if (key === 'z' || key === 'я') {
      byId('btnUndo').click();
    } else if (key === 'h' || key === 'р') {
      byId(review ? 'btnReviewHint' : 'btnHint').click();
    } else if (key === 'r' || key === 'к') {
      requestRestart();
    }
  });

  render();
  initTipsCarousel();
  detectKataGo();
  if (!savedGame) startTurnTimer();
})();
