function createGamePanel() {
  'use strict';
  const { BLACK, WHITE, formatCoord } = GoRules;
  const byId = id => document.getElementById(id);
  const hintBox = byId('hintExplanation');
  const hintButton = byId('btnHint');
  const hintButtonLabel = hintButton.innerHTML;
  const resultModal = byId('modalGameOver');
  const confirmDialog = byId('confirmGameAction');
  const colorButtons = document.querySelectorAll('[data-player-color]');
  const sizeLabels = { 9: 'Быстрая', 11: 'Компактная', 13: 'Средняя', 15: 'Большая', 19: 'Классика' };
  const difficultyLabels = { easy: 'Новичок', medium: 'Любитель', hard: 'Мастер', god: 'Бог Го (600 визитов)' };
  let pendingConfirmation = null;

  function confirmAction({ title, message, label }, action) {
    if (pendingConfirmation) return;
    byId('confirmGameTitle').textContent = title;
    byId('confirmGameMessage').textContent = message;
    byId('btnConfirmGameAction').textContent = label;
    pendingConfirmation = action;
    confirmDialog.returnValue = 'cancel';
    confirmDialog.showModal();
  }

  confirmDialog.addEventListener('close', () => {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    if (confirmDialog.returnValue === 'confirm') action?.();
  });

  function formatDuration(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    const pad = n => String(n).padStart(2, '0');
    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  function updateTimers({ totalSeconds = 0, moveSeconds = 0, turn = BLACK, blackMoveSeconds = 0, whiteMoveSeconds = 0 } = {}) {
    const formattedTotal = formatDuration(totalSeconds);
    const formattedMove = formatDuration(moveSeconds);

    const gameEl = byId('gameTimerText');
    const moveEl = byId('moveTimerText');
    const blackEl = byId('blackTimerVal');
    const whiteEl = byId('whiteTimerVal');

    if (gameEl && gameEl.textContent !== formattedTotal) gameEl.textContent = formattedTotal;
    if (moveEl && moveEl.textContent !== formattedMove) moveEl.textContent = formattedMove;
    if (blackEl) {
      const text = turn === BLACK ? formattedMove : formatDuration(blackMoveSeconds);
      if (blackEl.textContent !== text) blackEl.textContent = text;
    }
    if (whiteEl) {
      const text = turn === WHITE ? formattedMove : formatDuration(whiteMoveSeconds);
      if (whiteEl.textContent !== text) whiteEl.textContent = text;
    }
  }

  function render({
    game, score, difficulty, playerColor, computerColor, engine, katagoStatus,
    aiThinking, scoring, review, savedGame, canSaveGame, hintPending, canPlay,
    canUndo, evaluation,
    totalSeconds = 0, moveSeconds = 0, blackMoveSeconds = 0, whiteMoveSeconds = 0
  }) {
    const vsAi = computerColor !== null;
    byId('blackPrisoners').textContent = game.prisoners[BLACK];
    byId('whitePrisoners').textContent = game.prisoners[WHITE];
    byId('moveCounterText').textContent = review
      ? `Ход ${review.index} из ${review.moves.length}`
      : `Ход: ${game.moveNumber}`;
    byId('cardBlack').classList.toggle('active', game.turn === BLACK);
    byId('cardWhite').classList.toggle('active', game.turn === WHITE);
    byId('blackRoleLabel').textContent = vsAi ? (computerColor === BLACK ? 'Компьютер' : 'Вы') : 'Игрок 1';
    byId('whiteRoleLabel').textContent = vsAi ? (computerColor === WHITE ? 'Компьютер' : 'Вы') : 'Игрок 2';
    byId('gameModeBadge').textContent = vsAi ? 'vs Компьютер' : '2 Игрока';

    updateTimers({
      totalSeconds,
      moveSeconds,
      turn: game.turn,
      blackMoveSeconds,
      whiteMoveSeconds
    });

    const turnName = game.turn === BLACK ? 'Черных' : 'Белых';
    const who = game.turn === computerColor ? 'компьютер' : 'ваш ход';
    const status = savedGame ? 'Есть сохранённая партия'
      : review ? 'Разбор партии' : scoring ? 'Подсчёт очков' : game.isGameOver ? 'Партия завершена!'
      : aiThinking ? `${game.turn === BLACK ? 'Черные' : 'Белые'} думают... 🤔` : `Ход ${turnName} (${who})`;
    const statusColor = game.isGameOver ? 'var(--success)' : aiThinking ? 'var(--warning)' : 'var(--accent)';
    byId('statusMessage').textContent = status;
    byId('statusDot').style.background = statusColor;
    byId('statusDot').style.boxShadow = `0 0 10px ${statusColor}`;

    renderLead(review?.step ? null : evaluation, score, scoring);
    byId('scoringControls').hidden = !scoring;
    if (scoring) {
      byId('scorePreview').textContent = `Чёрные ${score.black.total.toFixed(1)} · Белые ${score.white.total.toFixed(1)}`;
    }
    renderReview(review, game.size, hintPending);
    byId('savedGamePrompt').hidden = !savedGame;
    if (savedGame) {
      const { size, moveCount } = savedGame.game;
      byId('savedGameDetails').textContent = `${size} × ${size} · Ходов: ${moveCount}`;
      byId('btnContinueSaved').textContent = savedGame.phase === 'finished' ? 'Открыть результат' : 'Продолжить';
    }

    document.querySelectorAll('.diff-btn[data-level]').forEach(button => {
      button.classList.toggle('active', button.dataset.level === difficulty);
    });
    document.querySelectorAll('.diff-btn[data-size]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.size) === game.size);
    });
    byId('playerColorControl').hidden = !vsAi;
    colorButtons.forEach(button => {
      const selected = button.dataset.playerColor === (playerColor === BLACK ? 'black' : 'white');
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected);
    });

    byId('diffDescBadge').textContent = difficultyLabels[difficulty];
    byId('boardSizeBadge').textContent = `${game.size} × ${game.size} (${sizeLabels[game.size]})`;
    byId('headerBoardTag').textContent = `${game.size} × ${game.size}`;

    const badge = byId('katagoStatusBadge');
    badge.textContent = { checking: 'Проверка...', ready: 'Metal GPU ✅', offline: 'Офлайн (эвристика)' }[katagoStatus];
    badge.classList.toggle('engine-offline', katagoStatus === 'offline');
    byId('btnEngineKataGo').classList.toggle('active', engine === 'katago');
    byId('btnEngineBuiltin').classList.toggle('active', engine === 'builtin');

    byId('boardFrame').style.cursor = scoring ? 'pointer' : canPlay ? 'crosshair' : 'default';
    byId('btnUndo').disabled = !canUndo;
    byId('btnPass').disabled = !canPlay;
    byId('btnScoreNow').disabled = scoring || Boolean(review) || Boolean(savedGame);
    byId('scoreButtonLabel').textContent = game.isGameOver && !scoring
      ? 'Результаты партии' : 'Завершить и подсчитать очки';
    byId('btnSaveGameFile').disabled = !canSaveGame;
    byId('btnReviewGame').disabled = game.moveCount === 0;
    hintButton.disabled = !canPlay || hintPending;
    const hintLabel = hintPending ? '<span>⏳</span> KataGo...' : hintButtonLabel;
    if (hintButton.innerHTML !== hintLabel) hintButton.innerHTML = hintLabel;
  }

  function renderReview(review, size, hintPending) {
    byId('reviewControls').hidden = !review;
    if (!review) return;

    function describe(entry) {
      if (!entry) return 'Начальная позиция';
      const color = entry.color === BLACK ? 'Чёрные' : 'Белые';
      return `${color} · ${entry.move ? formatCoord(entry.move.r, entry.move.c, size) : 'Пас'}`;
    }

    byId('reviewPosition').textContent = `Ход ${review.index} из ${review.moves.length} · ${describe(review.moves[review.index - 1])}`;
    byId('btnReviewPrev').disabled = review.index === 0;
    byId('btnReviewNext').disabled = review.index === review.moves.length;
    byId('btnReviewHint').disabled = hintPending || review.step > 0;
    byId('btnReviewHint').textContent = hintPending ? 'KataGo анализирует…' : 'Что здесь сыграть?';
    byId('reviewLineControls').hidden = !review.variation.length;
    byId('reviewLinePosition').textContent = review.step
      ? `Вариант ${review.step} из ${review.variation.length} · ${describe(review.variation[review.step - 1])}`
      : `Вариант · ходов: ${review.variation.length}`;
    byId('btnReviewLineBack').disabled = review.step === 0;
    byId('btnReviewLineNext').disabled = review.step === review.variation.length;
  }

  function renderLead(evaluation, score, scoring) {
    const black = byId('leadBlackPercent');
    const white = byId('leadWhitePercent');
    const status = byId('leadStatusText');
    byId('leadProgressFill').style.width = `${evaluation?.blackWinrate ?? 0}%`;
    if (evaluation) {
      black.textContent = `Чёрные ${evaluation.blackWinrate.toFixed(0)}%`;
      white.textContent = `Белые ${(100 - evaluation.blackWinrate).toFixed(0)}%`;
      status.textContent = `Шанс победы (KataGo) · ${evaluation.statusLead}`;
    } else if (score) {
      black.textContent = `Чёрные ${score.black.total.toFixed(1)}`;
      white.textContent = `Белые ${score.white.total.toFixed(1)}`;
      status.textContent = scoring ? 'Предварительный счёт' : 'Итоговый счёт';
    } else {
      black.textContent = 'Чёрные';
      white.textContent = 'Белые';
      status.textContent = 'Нет оценки позиции';
    }
  }

  function showHint(moves, size, engine, reviewing) {
    const kata = engine === 'katago';
    const hints = kata ? moves.map(formatKataGoHint) : moves.map(move => ({
      ...move,
      badge: move.tag,
      detail: `+${Math.max(0, Math.round(move.score))}`
    }));
    const best = hints[0];
    hintBox.classList.add('show');
    if (!best) {
      hintBox.innerHTML = kata
        ? '<strong>Совет KataGo:</strong> Рекомендуется сказать <em>Пас</em>.'
        : '<strong>Совет тренера:</strong> На доске нет явных выгодных продолжений. Рекомендуется сказать <em>Пас</em>.';
      return;
    }

    const coord = formatCoord(best.r, best.c, size);
    const alternatives = hints.slice(1).map((move, i) => {
      const name = formatCoord(move.r, move.c, size);
      return `
        <div class="hint-alt-item" data-r="${move.r}" data-c="${move.c}" title="${reviewing ? 'Показать ход' : 'Сыграть'} в ${name}">
          <span><strong>№${i + 2} ${name}</strong> &mdash; ${move.tag}</span>
          <span class="hint-pill ${move.pillClass} hint-alt-pill">${move.detail}</span>
        </div>`;
    }).join('');

    hintBox.innerHTML = `
      <div class="hint-header">
        <span class="hint-title">Рекомендация${kata ? ' KataGo' : ''} №1: ${coord}</span>
        <span class="hint-pill ${best.pillClass}">${best.badge}</span>
      </div>
      <div class="hint-desc">${best.explanation}</div>
      ${alternatives ? `<div class="hint-alternatives">
        <div class="hint-alt-title">${kata ? 'Альтернативные ходы KataGo' : 'Альтернативные варианты'}:</div>
        ${alternatives}
      </div>` : ''}`;
    showToast(`Подсказка ${kata ? 'KataGo' : 'тренера'}: №1 ${coord} (${best.badge})`);
  }

  function formatKataGoHint(move, i) {
    const pillColors = ['pill-green', 'pill-orange', 'pill-blue'];
    const winrate = `${(move.winrate * 100).toFixed(1)}%`;
    const lead = `${move.scoreLead >= 0 ? '+' : ''}${move.scoreLead.toFixed(1)}`;
    const variation = move.variation.length
      ? `<div class="hint-variation">Предсказанный вариант: <code>${move.variation.join(' &rarr; ')}</code></div>`
      : '';
    return {
      ...move,
      tag: `${winrate} (${lead})`,
      badge: winrate,
      detail: `${move.visits}v`,
      pillClass: pillColors[i],
      explanation: `Шанс на победу <strong>${winrate}</strong>, перевес <strong>${lead}</strong> очков (${move.visits} визитов MCTS).${variation}`
    };
  }

  function hideHint() {
    hintBox.classList.remove('show');
  }

  function showResult(score, { totalSeconds = 0, moveCount = 0 } = {}) {
    byId('finalScoreBlack').textContent = score.black.total.toFixed(1);
    byId('finalScoreWhite').textContent = score.white.total.toFixed(1);
    byId('breakdownBlack').innerHTML = `Территория: ${score.black.territory}<br>Камни на доске: ${score.black.stones}`;
    byId('breakdownWhite').innerHTML = `Территория: ${score.white.territory}<br>Камни на доске: ${score.white.stones}<br>Коми: +${score.white.komi}`;
    byId('winnerAnnouncement').textContent = score.winner === BLACK
      ? `Победа Черных с перевесом в ${score.diff.toFixed(1)} очков! 🎉`
      : `Победа Белых с перевесом в ${score.diff.toFixed(1)} очков! 🏆`;
    const finalDurationEl = byId('finalGameDuration');
    if (finalDurationEl) finalDurationEl.textContent = formatDuration(totalSeconds);
    const finalMoveEl = byId('finalMoveCount');
    if (finalMoveEl) finalMoveEl.textContent = String(moveCount);
    resultModal.classList.add('open');
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    const icon = document.createElement('span');
    icon.textContent = '💬';
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    byId('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 2700);
  }

  return { render, updateTimers, formatDuration, showHint, hideHint, showResult, showToast, confirmAction, difficultyLabels };
}
