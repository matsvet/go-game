const GoKataGo = (() => {
  'use strict';
  const { BLACK, LETTERS, formatCoord, getKomiForSize } = GoRules;
  const visits = { easy: 5, medium: 35, hard: 150, god: 600 };

  async function status() {
    if (location.protocol === 'file:') return null;
    try {
      const response = await fetch('/api/status');
      return response.ok ? (await response.json()).active === true : null;
    } catch {
      return null;
    }
  }

  function parsePoint(move, size) {
    if (typeof move !== 'string' || !/^[A-HJ-T][1-9]\d?$/i.test(move)) return null;
    const r = size - Number(move.slice(1));
    const c = LETTERS.indexOf(move[0].toUpperCase());
    return r >= 0 && c < size ? { r, c } : null;
  }

  function isPass(move) {
    return typeof move === 'string' && move.toLowerCase() === 'pass';
  }

  // The bridge reports scores and winrates from the side to move.
  function evaluation(info, turn) {
    if (!Number.isFinite(info?.winrate) || !Number.isFinite(info?.scoreLead)) return null;
    const blackWinrate = Math.min(99, Math.max(1, (turn === BLACK ? info.winrate : 1 - info.winrate) * 100));
    const blackLead = turn === BLACK ? info.scoreLead : -info.scoreLead;
    const leader = blackLead >= 0 ? 'Черные' : 'Белые';
    return { blackWinrate, statusLead: `${leader} +${Math.abs(blackLead).toFixed(1)}` };
  }

  async function analyze(game, difficulty, { signal, hint = false }) {
    const { size, turn } = game;
    const moves = game.getMoveHistory().map(({ color, move }) => [
      color === BLACK ? 'B' : 'W',
      move ? formatCoord(move.r, move.c, size) : 'pass'
    ]);
    const response = await fetch('/api/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        moves,
        maxVisits: hint ? Math.max(50, visits[difficulty]) : visits[difficulty],
        boardXSize: size,
        boardYSize: size,
        komi: getKomiForSize(size)
      })
    });
    if (!response.ok) throw new Error(`KataGo HTTP ${response.status}`);

    const data = await response.json();
    if (data?.error || !Array.isArray(data?.moveInfos)) {
      throw new Error('Некорректный ответ KataGo');
    }

    const candidates = [];
    for (const info of data.moveInfos) {
      const point = parsePoint(info?.move, size);
      if (!point && !isPass(info?.move)) continue;
      const winrate = Number.isFinite(info.winrate) ? info.winrate : 0;
      const scoreLead = Number.isFinite(info.scoreLead) ? info.scoreLead : 0;
      const visits = Number.isFinite(info.visits) ? info.visits : 0;
      const variation = Array.isArray(info.pv)
        ? info.pv.filter(move => isPass(move) || parsePoint(move, size)).slice(0, 4)
        : [];
      candidates.push({ point, winrate, scoreLead, visits, variation, evaluation: evaluation(info, turn) });
    }
    if (data.moveInfos.length && !candidates.length) throw new Error('KataGo не вернула допустимые координаты');
    return { candidates, evaluation: evaluation(data.rootInfo, turn) };
  }

  return { status, analyze };
})();
