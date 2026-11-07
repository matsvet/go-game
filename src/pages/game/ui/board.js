'use strict';

function createBoardView({ canPlay, onPlay }) {
  const { EMPTY, BLACK, LETTERS, getHoshiPoints } = GoRules;

  const SVG_SIZE = 540;

  function getBoardLayout(size) {
    const padding = size >= 15 ? 34 : (size >= 13 ? 38 : 44);
    const cellSize = (SVG_SIZE - 2 * padding) / (size - 1);
    const stoneRadius = cellSize * 0.46;
    return { padding, cellSize, stoneRadius };
  }

  const svg = document.getElementById('goBoardSvg');
  const gridLayer = document.getElementById('gridLayer');
  const highlightLayer = document.getElementById('highlightLayer');
  const stonesLayer = document.getElementById('stonesLayer');
  const libertiesLayer = document.getElementById('libertiesLayer');
  const ghostLayer = document.getElementById('ghostLayer');
  const hitTargetsLayer = document.getElementById('hitTargetsLayer');
  let game;
  let renderedBoard = null;
  let renderedDeadStones = null;
  let renderedSize = null;

  function svgElement(tag, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  function coordToSvg(r, c) {
    const { padding, cellSize } = getBoardLayout(game.size);
    const x = padding + c * cellSize;
    const y = padding + r * cellSize;
    return { x, y };
  }

  function buildBoardGrid() {
    gridLayer.innerHTML = '';
    hitTargetsLayer.innerHTML = '';

    const { padding, cellSize } = getBoardLayout(game.size);
    const lineWidth = game.size >= 15 ? '1.1' : (game.size >= 13 ? '1.3' : '1.6');
    const labelFontSize = game.size >= 15 ? 10 : (game.size >= 13 ? 11 : 13);
    const hoshiRadius = game.size >= 15 ? 2.8 : (game.size >= 13 ? 3.4 : 4.0);

    // 1. Сетка линий
    for (let i = 0; i < game.size; i++) {
      // Горизонтальные
      const startH = coordToSvg(i, 0);
      const endH = coordToSvg(i, game.size - 1);
      const lineH = svgElement('line', {
        x1: startH.x,
        y1: startH.y,
        x2: endH.x,
        y2: endH.y,
        stroke: 'var(--wood-line)',
        'stroke-width': lineWidth,
        'stroke-linecap': 'round'
      });
      gridLayer.appendChild(lineH);

      // Вертикальные
      const startV = coordToSvg(0, i);
      const endV = coordToSvg(game.size - 1, i);
      const lineV = svgElement('line', {
        x1: startV.x,
        y1: startV.y,
        x2: endV.x,
        y2: endV.y,
        stroke: 'var(--wood-line)',
        'stroke-width': lineWidth,
        'stroke-linecap': 'round'
      });
      gridLayer.appendChild(lineV);
    }

    // 2. Звездные пункты (Хоси)
    const hoshiPoints = getHoshiPoints(game.size);
    for (const pt of hoshiPoints) {
      const { x, y } = coordToSvg(pt.r, pt.c);
      const circle = svgElement('circle', {
        cx: x,
        cy: y,
        r: hoshiRadius,
        fill: 'var(--wood-line)'
      });
      gridLayer.appendChild(circle);
    }

    // 3. Координатная разметка (Буквы и Цифры)
    for (let c = 0; c < game.size; c++) {
      const { x } = coordToSvg(0, c);
      createLabel(x, padding - 17, LETTERS[c], labelFontSize);
      createLabel(x, SVG_SIZE - padding + 21, LETTERS[c], labelFontSize);
    }

    for (let r = 0; r < game.size; r++) {
      const { y } = coordToSvg(r, 0);
      const num = game.size - r;
      createLabel(padding - 18, y + 2, num, labelFontSize);
      createLabel(SVG_SIZE - padding + 18, y + 2, num, labelFontSize);
    }

    // 4. Прозрачные зоны клика (Hit Targets)
    for (let r = 0; r < game.size; r++) {
      for (let c = 0; c < game.size; c++) {
        const { x, y } = coordToSvg(r, c);
        const target = svgElement('circle', {
          cx: x,
          cy: y,
          r: cellSize * 0.49,
          fill: 'transparent',
          'data-r': r,
          'data-c': c
        });
        target.style.cursor = 'pointer';

        // Обработчики наведения мыши
        target.addEventListener('mouseenter', () => {
          if (game.board[r][c] !== EMPTY) {
            clearGhost();
            highlightGroupAndDame(r, c);
          } else {
            clearGroupHighlight();
            onIntersectionHover(r, c);
          }
        });

        target.addEventListener('mouseleave', () => {
          clearGroupHighlight();
          clearGhost();
        });

        target.addEventListener('click', (e) => {
          e.stopPropagation();
          onPlay(r, c);
        });
        hitTargetsLayer.appendChild(target);
      }
    }
  }

  // Дополнительный умный перехват кликов с авто-привязкой к ближайшему перекрестку для тач-экранов
  svg.addEventListener('click', (e) => {
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0) return;
    const scale = SVG_SIZE / rect.width;
    const svgX = (e.clientX - rect.left) * scale;
    const svgY = (e.clientY - rect.top) * scale;
    const { padding, cellSize } = getBoardLayout(game.size);

    const c = Math.round((svgX - padding) / cellSize);
    const r = Math.round((svgY - padding) / cellSize);

    if (r >= 0 && r < game.size && c >= 0 && c < game.size) {
      const { x, y } = coordToSvg(r, c);
      const dist = Math.hypot(svgX - x, svgY - y);
      if (dist <= cellSize * 0.55) {
        onPlay(r, c);
      }
    }
  });

  svg.addEventListener('mouseleave', () => {
    clearGroupHighlight();
    clearGhost();
  });

  function createLabel(x, y, text, fontSize = 12) {
    const txt = svgElement('text', {
      x: x,
      y: y,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      fill: 'var(--wood-line)',
      opacity: '0.75',
      'font-size': fontSize,
      'font-weight': '700'
    });
    txt.textContent = text.toString();
    gridLayer.appendChild(txt);
  }

  function renderBoard({ position, showLiberties, hintMoves, animateOpponentMove, territoryMap, deadStones }) {
    game = position;
    if (game.size !== renderedSize) {
      buildBoardGrid();
      renderedSize = game.size;
    }
    libertiesLayer.replaceChildren();
    highlightLayer.replaceChildren();

    const { stoneRadius } = getBoardLayout(game.size);
    drawHints(hintMoves, stoneRadius);
    if (game.board !== renderedBoard || deadStones !== renderedDeadStones) {
      stonesLayer.replaceChildren();
      drawStones(stoneRadius, animateOpponentMove, deadStones);
      renderedBoard = game.board;
      renderedDeadStones = deadStones;
    }
    if (showLiberties && !game.isGameOver) drawLiberties(stoneRadius);
    if (territoryMap) drawTerritory(territoryMap, stoneRadius);
  }

  function drawHints(hintMoves, stoneRadius) {
    const hintColors = ['#10b981', '#f59e0b', '#38bdf8'];
    const badgeRadius = Math.max(7, Math.round(stoneRadius * 0.44));
    const badgeFontSize = Math.max(7, Math.round(stoneRadius * 0.42));

    hintMoves.forEach((hm, idx) => {
      const { x, y } = coordToSvg(hm.r, hm.c);
      const color = hintColors[idx] || '#10b981';

      // Кольцо вокруг перекрестка
      const ring = svgElement('circle', {
        cx: x,
        cy: y,
        r: stoneRadius * (idx === 0 ? 1.08 : 0.95),
        fill: 'none',
        stroke: color,
        'stroke-width': idx === 0 ? '3.5' : '2.5',
        'stroke-dasharray': idx === 0 ? '6,3' : '4,3'
      });
      if (idx === 0) ring.setAttribute('class', 'hint-pulse');
      highlightLayer.appendChild(ring);

      // Бейдж с номером ранга (1, 2, 3)
      const badgeBg = svgElement('circle', {
        cx: x,
        cy: y,
        r: badgeRadius,
        fill: color,
        stroke: '#ffffff',
        'stroke-width': '1.5'
      });
      highlightLayer.appendChild(badgeBg);

      const badgeNum = svgElement('text', {
        x: x,
        y: y + 1,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        fill: '#000000',
        'font-size': badgeFontSize,
        'font-weight': '900'
      });
      badgeNum.textContent = (idx + 1).toString();
      highlightLayer.appendChild(badgeNum);
    });
  }

  function drawStones(stoneRadius, animateOpponentMove, deadStones) {
    const lastPlacement = document.createDocumentFragment();
    for (let r = 0; r < game.size; r++) {
      for (let c = 0; c < game.size; c++) {
        const color = game.board[r][c];
        if (color !== EMPTY) {
          const { x, y } = coordToSvg(r, c);
          const isLastMove = game.lastMove?.r === r && game.lastMove.c === c;
          const isDead = deadStones?.has(`${r},${c}`);
          const isOpponentPlacement = isLastMove && animateOpponentMove;

          const stone = svgElement('circle', {
            cx: x,
            cy: y,
            r: stoneRadius,
            fill: color === BLACK ? 'url(#blackStoneGrad)' : 'url(#whiteStoneGrad)',
            filter: 'url(#stoneShadow)',
            'class': isDead ? 'stone dead-stone' : 'stone'
          });

          if (isOpponentPlacement) {
            stone.classList.add('opponent-placement');
            // Keep the incoming stone inside the SVG near its top and right edges.
            stone.style.setProperty('--stone-entry-x', x + 3.1 * stoneRadius < SVG_SIZE ? '95%' : '-95%');
            stone.style.setProperty('--stone-entry-y', y > 4 * stoneRadius ? '-125%' : '125%');
          } else if (isLastMove && !deadStones) {
            stone.classList.add('stone-appear');
          }

          // Маркер последнего сделанного хода (кольцо)
          if (isLastMove && !deadStones) {
            const ring = svgElement('circle', {
              cx: x,
              cy: y,
              r: stoneRadius * 0.45,
              fill: 'none',
              stroke: color === BLACK ? '#f59e0b' : '#d97706',
              'stroke-width': '2.5',
              'class': 'last-move-ring'
            });
            lastPlacement.append(stone, ring);
          } else {
            stonesLayer.appendChild(stone);
          }
        }
      }
    }
    stonesLayer.appendChild(lastPlacement);
  }

  function drawLiberties(stoneRadius) {
    const groups = game.getAllGroups();
    const atariBadgeFontSize = Math.max(8, Math.round(stoneRadius * 0.55));
    const warnBadgeFontSize = Math.max(7, Math.round(stoneRadius * 0.42));
    const escapePtRadius = Math.max(3.5, Math.round(stoneRadius * 0.28));

    for (const g of groups) {
      const dameCount = g.liberties.size;

      if (dameCount === 1) {
        // ОПАСНОСТЬ: АТАРИ (1 дыхание) — красная пульсирующая метка
        for (const s of g.stones) {
          const { x, y } = coordToSvg(s.r, s.c);

          const atariHalo = svgElement('circle', {
            cx: x,
            cy: y,
            r: stoneRadius * 0.85,
            fill: 'rgba(239, 68, 68, 0.45)',
            stroke: '#ef4444',
            'stroke-width': '2.5',
            'class': 'atari-pulse'
          });
          libertiesLayer.appendChild(atariHalo);

          const badgeText = svgElement('text', {
            x: x,
            y: y + 1,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: '#ffffff',
            'font-size': atariBadgeFontSize,
            'font-weight': '900'
          });
          badgeText.textContent = '!';
          libertiesLayer.appendChild(badgeText);
        }

        // Метка на единственном оставшемся дыхании группы
        for (const key of g.liberties) {
          const [lr, lc] = key.split(',').map(Number);
          const { x, y } = coordToSvg(lr, lc);

          const escapePt = svgElement('circle', {
            cx: x,
            cy: y,
            r: escapePtRadius,
            fill: '#ef4444',
            opacity: '0.75',
            stroke: '#fff',
            'stroke-width': '1.5'
          });
          libertiesLayer.appendChild(escapePt);
        }

      } else if (dameCount === 2) {
        // ВНИМАНИЕ: 2 дыхания — оранжевая метка
        for (const s of g.stones) {
          const { x, y } = coordToSvg(s.r, s.c);
          const warnBadge = svgElement('circle', {
            cx: x,
            cy: y,
            r: stoneRadius * 0.42,
            fill: 'rgba(245, 158, 11, 0.85)'
          });
          libertiesLayer.appendChild(warnBadge);

          const badgeText = svgElement('text', {
            x: x,
            y: y + 1,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            fill: '#000000',
            'font-size': warnBadgeFontSize,
            'font-weight': '800'
          });
          badgeText.textContent = '2';
          libertiesLayer.appendChild(badgeText);
        }
      }
    }
  }

  function drawTerritory(territoryMap, stoneRadius) {
    const sqSize = Math.max(7, Math.round(stoneRadius * 0.55));

    for (let r = 0; r < game.size; r++) {
      for (let c = 0; c < game.size; c++) {
        const terr = territoryMap[r][c];
        if (terr !== EMPTY) {
          const { x, y } = coordToSvg(r, c);
          const square = svgElement('rect', {
            x: x - sqSize / 2,
            y: y - sqSize / 2,
            width: sqSize,
            height: sqSize,
            rx: '3',
            fill: terr === BLACK ? '#18181b' : '#ffffff',
            stroke: terr === BLACK ? '#f59e0b' : '#52525b',
            'stroke-width': '1.5',
            opacity: '0.85'
          });
          highlightLayer.appendChild(square);
        }
      }
    }
  }

  // Подсветка конкретной группы и её дыханий при наведении
  function highlightGroupAndDame(r, c) {
    clearGroupHighlight();
    const group = game.getGroupAndLiberties(r, c);
    if (group.color === EMPTY) return;
    const { stoneRadius } = getBoardLayout(game.size);

    // Обводка всех камней группы
    for (const s of group.stones) {
      const { x, y } = coordToSvg(s.r, s.c);
      const ring = svgElement('circle', {
        cx: x,
        cy: y,
        r: stoneRadius * 0.9,
        fill: 'none',
        stroke: '#38bdf8',
        'stroke-width': '3',
        'class': 'group-highlight-element'
      });
      highlightLayer.appendChild(ring);
    }

    // Метки на всех свободных дыханиях группы
    const ptRadius = Math.max(3, Math.round(stoneRadius * 0.25));
    for (const key of group.liberties) {
      const [lr, lc] = key.split(',').map(Number);
      const { x, y } = coordToSvg(lr, lc);
      const pt = svgElement('circle', {
        cx: x,
        cy: y,
        r: ptRadius,
        fill: '#38bdf8',
        stroke: '#ffffff',
        'stroke-width': '1.5',
        'class': 'group-highlight-element'
      });
      highlightLayer.appendChild(pt);
    }
  }

  function clearGroupHighlight() {
    const elements = highlightLayer.querySelectorAll('.group-highlight-element');
    elements.forEach(el => el.remove());
  }

  // Предпросмотр камня при наведении мыши
  function onIntersectionHover(r, c) {
    if (!canPlay()) {
      clearGhost();
      return;
    }
    if (game.board[r][c] !== EMPTY) {
      clearGhost();
      return;
    }

    ghostLayer.innerHTML = '';
    const { x, y } = coordToSvg(r, c);

    const test = game.testMove(r, c, game.turn);
    const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    const { stoneRadius } = getBoardLayout(game.size);
    ghost.setAttribute('cx', x);
    ghost.setAttribute('cy', y);
    ghost.setAttribute('r', stoneRadius.toString());

    if (test.valid) {
      ghost.setAttribute('fill', game.turn === BLACK ? '#000000' : '#ffffff');
      ghost.setAttribute('opacity', '0.45');
    } else {
      ghost.setAttribute('fill', 'rgba(239, 68, 68, 0.4)');
      ghost.setAttribute('stroke', '#ef4444');
      ghost.setAttribute('stroke-width', '2');
    }

    ghostLayer.appendChild(ghost);
  }

  function clearGhost() {
    ghostLayer.innerHTML = '';
  }

  return { render: renderBoard, preview: onIntersectionHover, clearGhost };
}
