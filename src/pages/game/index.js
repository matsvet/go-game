(() => {
  'use strict';
  const { GoGame, BLACK, WHITE, opponentOf } = GoRules;
  const byId = id => document.getElementById(id);
  const vsAiControl = byId('chkVsAi');
  const libertiesControl = byId('chkShowLiberties');
  const rulesModal = byId('modalRules');
  const resultModal = byId('modalGameOver');

  const game = new GoGame();
  const heuristic = new GoHeuristicAI(game);
  const sound = new SoundFX();
  const panel = createGamePanel();
  const board = createBoardView(game, { canPlay: isHumanTurn, onPlay: playHumanMove });
  const sizeNames = {
    9: 'Быстрая учебная',
    11: 'Компактная',
    13: 'Средняя классика',
    15: 'Промежуточная',
    19: 'Классическая турнирная'
  };

  let vsAi = vsAiControl.checked;
  let difficulty = 'medium';
  let preferredEngine = 'katago';
  let katagoStatus = 'offline';
  let aiTurn = null;
  let hintRequest = null;
  let hintMoves = [];
  let evaluation = null;

  function isHumanTurn() {
    return !game.isGameOver && !(vsAi && game.turn === WHITE);
  }

  function currentEngine() {
    return katagoStatus === 'ready' ? preferredEngine : 'builtin';
  }

  function renderPanel(score = game.calculateScore()) {
    panel.render({
      game, score, difficulty, vsAi, katagoStatus, evaluation,
      engine: currentEngine(),
      aiThinking: aiTurn !== null,
      hintPending: hintRequest !== null,
      canPlay: isHumanTurn()
    });
  }

  function render() {
    const score = game.calculateScore();
    board.render({
      showLiberties: libertiesControl.checked,
      hintMoves,
      territoryMap: game.isGameOver ? score.territoryMap : null
    });
    renderPanel(score);
    return score;
  }

  function clearAnalysis() {
    hintRequest?.abort();
    hintRequest = null;
    hintMoves = [];
    evaluation = null;
    board.clearGhost();
    panel.hideHint();
  }

  function cancelAiTurn() {
    if (!aiTurn) return;
    clearTimeout(aiTurn.timer);
    aiTurn.controller.abort();
    aiTurn = null;
  }

  function checkAtari(mover) {
    const groups = game.getAllGroups();
    const nextThreatened = groups.some(group => group.color === game.turn && group.liberties.size === 1);
    const moverThreatened = groups.some(group => group.color === mover && group.liberties.size === 1);

    if (vsAi) {
      if (mover === WHITE && nextThreatened) {
        sound.playAtariAlert();
        panel.showToast('⚠️ Внимание: компьютер поставил вашу группу в АТАРИ (осталось 1 дыхание)!');
      } else if (mover === BLACK && moverThreatened) {
        sound.playAtariAlert();
        panel.showToast('⚠️ Ваш ход оставил свою группу в АТАРИ (1 дыхание).');
      } else if (mover === BLACK && nextThreatened) {
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
      checkAtari(mover);
    } else {
      if (!game.pass()) return false;
      sound.playPass();
      const color = mover === BLACK ? 'Черные' : 'Белые';
      panel.showToast(vsAi && mover === WHITE ? '✋ Компьютер пасует!' : `${color} объявили пас.`);
    }

    clearAnalysis();
    evaluation = game.isGameOver ? null : nextEvaluation;
    const score = render();
    if (game.isGameOver) panel.showResult(score);
    return true;
  }

  function playHumanMove(r, c) {
    if (!isHumanTurn()) return;
    board.clearGhost();
    if (applyMove({ r, c })) startAiTurn();
  }

  async function startAiTurn() {
    if (aiTurn || game.isGameOver || !vsAi || game.turn !== WHITE) return;

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
      const point = heuristic.findBestMove(difficulty);
      aiTurn = null;
      applyMove(point);
    }, 550);
  }

  function displayHint(moves, source) {
    hintMoves = moves;
    panel.showHint(moves, game.size, source);
    render();
  }

  async function requestHint() {
    if (!isHumanTurn() || hintRequest) return;

    if (currentEngine() === 'katago') {
      const request = new AbortController();
      hintRequest = request;
      renderPanel();

      let result;
      try {
        result = await GoKataGo.analyze(game, difficulty, { signal: request.signal, hint: true });
      } catch (error) {
        if (hintRequest === request) console.warn('KataGo недоступна, подсказку даёт встроенный движок:', error);
      }
      if (hintRequest !== request) return;
      hintRequest = null;

      if (result) {
        const candidates = result.candidates.filter(({ point }) =>
          !point || game.testMove(point.r, point.c, game.turn).valid
        );
        if (candidates.length || !result.candidates.length) {
          evaluation = result.evaluation;
          const moves = candidates[0]?.point
            ? candidates.filter(move => move.point).slice(0, 3).map(move => ({ ...move, ...move.point }))
            : [];
          displayHint(moves, 'katago');
          return;
        }
      }
    }

    displayHint(heuristic.findBestMoves(game.turn, 3, difficulty), 'builtin');
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
    const resize = size !== game.size;
    game.reset(size);
    if (resize) board.build();
    resultModal.classList.remove('open');
    render();
  }

  function restartGame() {
    resetGame();
    panel.showToast('Начата новая партия! Ход Черных.');
  }

  byId('btnPass').addEventListener('click', () => {
    if (isHumanTurn() && applyMove(null)) startAiTurn();
  });
  byId('btnUndo').addEventListener('click', () => {
    if (aiTurn) return;
    const steps = vsAi && game.turn === BLACK && game.moveCount >= 2 ? 2 : 1;
    if (!game.undo(steps)) return;
    clearAnalysis();
    resultModal.classList.remove('open');
    render();
    panel.showToast('Ход отменен.');
    startAiTurn();
  });
  byId('btnHint').addEventListener('click', requestHint);
  byId('btnRestart').addEventListener('click', restartGame);
  byId('btnRestartFromModal').addEventListener('click', restartGame);
  byId('btnScoreNow').addEventListener('click', () => {
    cancelAiTurn();
    clearAnalysis();
    game.endGame();
    sound.playPass();
    panel.showResult(render());
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
    if (item) playHumanMove(Number(item.dataset.r), Number(item.dataset.c));
  });

  document.querySelectorAll('.diff-btn[data-level]').forEach(button => {
    button.addEventListener('click', () => {
      if (difficulty === button.dataset.level) return;
      difficulty = button.dataset.level;
      refreshAutomation();
      panel.showToast(`Уровень сложности: ${panel.difficultyLabels[difficulty]}`);
    });
  });
  document.querySelectorAll('.diff-btn[data-size]').forEach(button => {
    button.addEventListener('click', () => {
      const size = Number(button.dataset.size);
      if (!Object.hasOwn(sizeNames, size) || size === game.size) return;
      resetGame(size);
      panel.showToast(`Размер доски изменен: ${size} × ${size} (${sizeNames[size]}). Ход Черных.`);
    });
  });
  byId('btnEngineKataGo').addEventListener('click', async () => {
    if (currentEngine() === 'katago') return;
    preferredEngine = 'katago';
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
    if (switched) {
      refreshAutomation();
      panel.showToast('Выбран встроенный офлайн-движок');
    }
  });

  vsAiControl.addEventListener('change', () => {
    vsAi = vsAiControl.checked;
    refreshAutomation();
  });
  libertiesControl.addEventListener('change', render);

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
      event.preventDefault();
      byId('btnPass').click();
    } else if (key === 'z' || key === 'я') {
      byId('btnUndo').click();
    } else if (key === 'h' || key === 'р') {
      byId('btnHint').click();
    } else if (key === 'r' || key === 'к') {
      restartGame();
    }
  });

  board.build();
  render();
  initTipsCarousel();
  detectKataGo();
})();
