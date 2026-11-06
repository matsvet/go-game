function createGamePanel() {
  'use strict';
  const { BLACK, WHITE, formatCoord } = GoRules;
  const byId = id => document.getElementById(id);
  const hintBox = byId('hintExplanation');
  const hintButton = byId('btnHint');
  const hintButtonLabel = hintButton.innerHTML;
  const resultModal = byId('modalGameOver');
  const sizeLabels = { 9: 'Быстрая', 11: 'Компактная', 13: 'Средняя', 15: 'Большая', 19: 'Классика' };
  const difficultyLabels = { easy: 'Новичок', medium: 'Любитель', hard: 'Мастер', god: 'Бог Го (600 визитов)' };

  function render({ game, score, difficulty, vsAi, engine, katagoStatus, aiThinking, hintPending, canPlay, evaluation }) {
    byId('blackPrisoners').textContent = game.prisoners[BLACK];
    byId('whitePrisoners').textContent = game.prisoners[WHITE];
    byId('moveCounterText').textContent = `Ход: ${game.moveNumber}`;
    byId('cardBlack').classList.toggle('active', game.turn === BLACK);
    byId('cardWhite').classList.toggle('active', game.turn === WHITE);
    byId('whiteRoleLabel').textContent = vsAi ? 'Компьютер' : 'Игрок 2';
    byId('gameModeBadge').textContent = vsAi ? 'vs Компьютер' : '2 Игрока';

    const turnName = game.turn === BLACK ? 'Черных' : 'Белых';
    const who = vsAi && game.turn === WHITE ? 'компьютер' : 'ваш ход';
    const status = game.isGameOver ? 'Партия завершена!'
      : aiThinking ? 'Белые думают... 🤔' : `Ход ${turnName} (${who})`;
    const statusColor = game.isGameOver ? 'var(--success)' : aiThinking ? 'var(--warning)' : 'var(--accent)';
    byId('statusMessage').textContent = status;
    byId('statusDot').style.background = statusColor;
    byId('statusDot').style.boxShadow = `0 0 10px ${statusColor}`;

    renderLead(score, evaluation);

    document.querySelectorAll('.diff-btn[data-level]').forEach(button => {
      button.classList.toggle('active', button.dataset.level === difficulty);
    });
    document.querySelectorAll('.diff-btn[data-size]').forEach(button => {
      button.classList.toggle('active', Number(button.dataset.size) === game.size);
    });

    byId('diffDescBadge').textContent = difficultyLabels[difficulty];
    byId('boardSizeBadge').textContent = `${game.size} × ${game.size} (${sizeLabels[game.size]})`;
    byId('headerBoardTag').textContent = `${game.size} × ${game.size}`;

    const badge = byId('katagoStatusBadge');
    badge.textContent = { checking: 'Проверка...', ready: 'Metal GPU ✅', offline: 'Офлайн (эвристика)' }[katagoStatus];
    badge.classList.toggle('engine-offline', katagoStatus === 'offline');
    byId('btnEngineKataGo').classList.toggle('active', engine === 'katago');
    byId('btnEngineBuiltin').classList.toggle('active', engine === 'builtin');

    byId('boardFrame').style.cursor = canPlay ? 'crosshair' : 'wait';
    byId('btnUndo').disabled = game.moveCount === 0 || aiThinking;
    byId('btnPass').disabled = !canPlay;
    hintButton.disabled = !canPlay || hintPending;
    const hintLabel = hintPending ? '<span>⏳</span> KataGo...' : hintButtonLabel;
    if (hintButton.innerHTML !== hintLabel) hintButton.innerHTML = hintLabel;
  }

  function renderLead(score, evaluation) {
    const totalPoints = score.black.total + score.white.total;
    const blackPct = evaluation
      ? evaluation.blackWinrate
      : Math.min(88, Math.max(12, Math.round((score.black.total / totalPoints) * 100)));
    const blackPoints = evaluation ? '' : ` (${score.black.total.toFixed(1)})`;
    const whitePoints = evaluation ? '' : ` (${score.white.total.toFixed(1)})`;
    const leader = score.winner === BLACK ? 'Черные' : 'Белые';

    byId('leadBlackPercent').textContent = `Черные ${blackPct.toFixed(0)}%${blackPoints}`;
    byId('leadWhitePercent').textContent = `Белые ${(100 - blackPct).toFixed(0)}%${whitePoints}`;
    byId('leadProgressFill').style.width = `${blackPct}%`;
    byId('leadStatusText').textContent = evaluation
      ? `${evaluation.statusLead} (KataGo)`
      : score.diff < 1.5 ? 'Равная позиция' : `${leader} +${score.diff.toFixed(1)}`;
  }

  function showHint(moves, size, engine) {
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
        <div class="hint-alt-item" data-r="${move.r}" data-c="${move.c}" title="Нажмите, чтобы сыграть в ${name}">
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

  function showResult(score) {
    byId('finalScoreBlack').textContent = score.black.total.toFixed(1);
    byId('finalScoreWhite').textContent = score.white.total.toFixed(1);
    byId('breakdownBlack').innerHTML = `Территория: ${score.black.territory}<br>Камни на доске: ${score.black.stones}`;
    byId('breakdownWhite').innerHTML = `Территория: ${score.white.territory}<br>Камни на доске: ${score.white.stones}<br>Коми: +${score.white.komi}`;
    byId('winnerAnnouncement').textContent = score.winner === BLACK
      ? `Победа Черных с перевесом в ${score.diff.toFixed(1)} очков! 🎉`
      : `Победа Белых с перевесом в ${score.diff.toFixed(1)} очков! 🏆`;
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

  return { render, showHint, hideHint, showResult, showToast, difficultyLabels };
}
