const GoHeuristicAI = (() => {
  'use strict';
  const { EMPTY, WHITE, getHoshiPoints, opponentOf, formatCoord } = GoRules;

  return class GoHeuristicAI {
    constructor(game) {
      this.game = game;
    }

    // Проверка на истинный глаз (не заполнять собственные 100% оформленные глаза)
    isTrueEye(r, c, color, board = this.game.board) {
      const neighbors = this.game.getNeighbors(r, c);
      const allOrthogonalFriends = neighbors.every(nb => board[nb.r][nb.c] === color);
      if (!allOrthogonalFriends) return false;

      const diagonals = [
        [r - 1, c - 1], [r - 1, c + 1],
        [r + 1, c - 1], [r + 1, c + 1]
      ].filter(([dr, dc]) => this.game.isValidCoord(dr, dc));

      const enemyDiagonals = diagonals.filter(([dr, dc]) => {
        const col = board[dr][dc];
        return col !== EMPTY && col !== color;
      }).length;

      const isEdge = (r === 0 || r === this.game.size - 1 || c === 0 || c === this.game.size - 1);
      return isEdge ? (enemyDiagonals === 0) : (enemyDiagonals <= 1);
    }

    // 1-ply Quiescence Check: проверка на ловушку немедленного съедения (лестница/захват на следующем ходу)
    hasImmediateCounterCapture(simBoard, r, c, opponent, liberties) {
      if (liberties.size > 2) return false;

      for (const libKey of liberties) {
        const [lr, lc] = libKey.split(',').map(Number);
        const oppTest = this.game.testMove(lr, lc, opponent, simBoard, this.game.board);
        if (oppTest.valid && oppTest.captured.length > 0) {
          const capturedOurGroup = oppTest.captured.some(s => s.r === r && s.c === c);
          if (capturedOurGroup) return true;
        }
      }
      return false;
    }

    // Оценка классических форм Го (Katachi)
    evaluateShapes(board, r, c, color, opponent) {
      let score = 0;
      let shapeTag = null;
      let shapeDesc = null;

      // 1. Штраф за «Пустой треугольник» (Аки-санкаку — неэффективная перегруженная форма)
      const quadrants = [
        [[0,0], [0,1], [1,0], [1,1]],
        [[0,0], [0,-1], [1,0], [1,-1]],
        [[0,0], [0,1], [-1,0], [-1,1]],
        [[0,0], [0,-1], [-1,0], [-1,-1]]
      ];

      for (const q of quadrants) {
        let friendly = 1; // камень (r, c), который ставим
        let empty = 0;
        for (const [dr, dc] of q) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (this.game.isValidCoord(nr, nc)) {
            if (board[nr][nc] === color) friendly++;
            else if (board[nr][nc] === EMPTY) empty++;
          }
        }
        if (friendly === 3 && empty === 1) {
          score -= 140;
          break;
        }
      }

      // 2. «Бамбуковый сустав» (Такэфу — абсолютное соединение через разрыв)
      const bambooPatterns = [
        // Горизонтальные пары
        { friend: [[0, 1], [2, 0], [2, 1]], spaces: [[1, 0], [1, 1]] },
        { friend: [[0, -1], [2, 0], [2, -1]], spaces: [[1, 0], [1, -1]] },
        { friend: [[0, 1], [-2, 0], [-2, 1]], spaces: [[-1, 0], [-1, 1]] },
        { friend: [[0, -1], [-2, 0], [-2, -1]], spaces: [[-1, 0], [-1, -1]] },
        // Вертикальные пары
        { friend: [[1, 0], [0, 2], [1, 2]], spaces: [[0, 1], [1, 1]] },
        { friend: [[-1, 0], [0, 2], [-1, 2]], spaces: [[0, 1], [-1, 1]] },
        { friend: [[1, 0], [0, -2], [1, -2]], spaces: [[0, -1], [1, -1]] },
        { friend: [[-1, 0], [0, -2], [-1, -2]], spaces: [[0, -1], [-1, -1]] }
      ];

      for (const pat of bambooPatterns) {
        const allFriends = pat.friend.every(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return this.game.isValidCoord(nr, nc) && board[nr][nc] === color;
        });
        const allSpaces = pat.spaces.every(([dr, dc]) => {
          const nr = r + dr, nc = c + dc;
          return this.game.isValidCoord(nr, nc) && board[nr][nc] === EMPTY;
        });
        if (allFriends && allSpaces) {
          score += 170;
          shapeTag = 'Бамбуковый сустав';
          shapeDesc = 'Форма «бамбуковый сустав» (такэфу) — надежное соединение, неуязвимое для разрезания.';
          break;
        }
      }

      // 3. Бонус за форму «Пасть тигра» (Какэ-цуги — защищенный контур для глаза)
      if (!shapeTag) {
        const tigerPatterns = [
          { wings: [[-1, -1], [-1, 1]], mouth: [-1, 0] },
          { wings: [[1, -1], [1, 1]], mouth: [1, 0] },
          { wings: [[-1, -1], [1, -1]], mouth: [0, -1] },
          { wings: [[-1, 1], [1, 1]], mouth: [0, 1] }
        ];
        for (const pat of tigerPatterns) {
          const wingsOk = pat.wings.every(([dr, dc]) => {
            const nr = r + dr, nc = c + dc;
            return this.game.isValidCoord(nr, nc) && board[nr][nc] === color;
          });
          const mouthNr = r + pat.mouth[0], mouthNc = c + pat.mouth[1];
          const mouthOk = this.game.isValidCoord(mouthNr, mouthNc) && board[mouthNr][mouthNc] === EMPTY;
          if (wingsOk && mouthOk) {
            score += 150;
            shapeTag = 'Пасть тигра';
            shapeDesc = 'Создает защитную форму «пасть тигра» (какэ-цуги) для построения надежного глаза.';
            break;
          }
        }
      }

      // 4. Бонус за «Хане на голове двух камней» (Ni-shi no atama wo hane)
      if (!shapeTag) {
        const haneChecks = [
          [[0, -1], [0, -2]],
          [[0, 1], [0, 2]],
          [[-1, 0], [-2, 0]],
          [[1, 0], [2, 0]]
        ];

        for (const check of haneChecks) {
          const [d1, d2] = check;
          const r1 = r + d1[0], c1 = c + d1[1];
          const r2 = r + d2[0], c2 = c + d2[1];
          if (this.game.isValidCoord(r1, c1) && this.game.isValidCoord(r2, c2)) {
            if (board[r1][c1] === opponent && board[r2][c2] === opponent) {
              score += 160;
              shapeTag = 'Хане на голове';
              shapeDesc = 'Атакующее хане на голове двух камней соперника, сковывающее их развитие.';
              break;
            }
          }
        }
      }

      return { score, shapeTag, shapeDesc };
    }

    // Комплексная оценка хода
    evaluateMove(r, c, testResult, { color, opponent, difficulty, ownAtariGroups, opponentAtariCount, hoshiPoints }) {
      let score = 0;
      const numCaptured = testResult.captured.length;
      const { nextBoard: simBoard, liberties } = testResult;
      let tag = 'Развитие формы';
      let pillClass = 'pill-info';
      let explanation = 'Гармоничное развитие формы и укрепление позиции.';

      // ─── 1. Захват камней ───
      if (numCaptured > 0) {
        score += 1200 + (numCaptured * 320);
        tag = `Захват (+${numCaptured})`;
        pillClass = 'pill-danger';
        explanation = `Немедленный захват ${numCaptured} ${numCaptured === 1 ? 'камня' : 'камней'} соперника, устраняющий угрозу.`;
      }

      // ─── 2. Спасение своих камней из Атари ───
      let savedFromAtari = false;
      if (liberties.size >= 2) {
        for (const atariGroup of ownAtariGroups) {
          const connects = atariGroup.stones.some(stone =>
            Math.abs(stone.r - r) + Math.abs(stone.c - c) === 1
          );
          if (connects) {
            score += 1400 + (atariGroup.stones.length * 190);
            savedFromAtari = true;
            tag = 'Спасение из атари';
            pillClass = 'pill-success';
            explanation = `Спасает группу из ${atariGroup.stones.length} камней от гибели, увеличивая число дыханий до ${liberties.size}.`;
          }
        }
      }

      // ─── 3. 1-ply Quiescence Lookahead: проверка на ловушку немедленного съедения ───
      if (difficulty !== 'easy') {
        const isTrapped = this.hasImmediateCounterCapture(simBoard, r, c, opponent, liberties);
        if (isTrapped) {
          score -= 1700;
        }
      }

      // ─── 4. Двойное Атари (Ryō-atari) ───
      const afterOppGroups = this.game.getAllGroups(simBoard).filter(g => g.color === opponent && g.liberties.size === 1).length;
      const atariGain = afterOppGroups - opponentAtariCount;

      if (atariGain >= 2 && numCaptured === 0) {
        score += 950;
        tag = 'Двойное атари!';
        pillClass = 'pill-danger';
        explanation = 'Двойное атари! Ставит сразу 2 группы соперника под удар — спасти обе невозможно!';
      } else if (atariGain === 1 && numCaptured === 0 && !savedFromAtari) {
        score += 400;
        tag = 'Атака: Атари';
        pillClass = 'pill-warning';
        explanation = 'Ставит группу соперника в положение Атари (осталось всего 1 дыхание).';
      }

      // ─── 5. Защита от Само-атари ───
      if (liberties.size === 1 && numCaptured === 0) {
        score -= 1150;
      } else if (liberties.size === 2 && numCaptured === 0) {
        score -= 80;
      } else if (liberties.size >= 4) {
        score += 140;
      }

      // ─── 6. Оценка форм (Katachi) ───
      const shapes = this.evaluateShapes(this.game.board, r, c, color, opponent);
      score += shapes.score;
      if (shapes.shapeTag && !savedFromAtari && numCaptured === 0 && atariGain === 0) {
        tag = shapes.shapeTag;
        pillClass = 'pill-info';
        explanation = shapes.shapeDesc;
      }

      // ─── 7. Соединение и Разрезание ───
      let adjacentFriends = 0;
      let adjacentEnemies = 0;
      for (const nb of this.game.getNeighbors(r, c)) {
        if (this.game.board[nb.r][nb.c] === color) adjacentFriends++;
        if (this.game.board[nb.r][nb.c] === opponent) adjacentEnemies++;
      }

      if (adjacentFriends >= 2) {
        score += 150;
        if (numCaptured === 0 && !savedFromAtari && atariGain === 0) {
          tag = 'Соединение групп';
          pillClass = 'pill-success';
          explanation = 'Связывает ваши разрозненные группы камней в единую несокрушимую цепь.';
        }
      }
      if (adjacentEnemies >= 2) {
        score += 130;
        if (numCaptured === 0 && !savedFromAtari && atariGain === 0) {
          tag = 'Разрезание сил';
          pillClass = 'pill-warning';
          explanation = 'Разрезает камни соперника, создавая для него две слабые изолированные группы.';
        }
      }

      // ─── 8. Позиционная ценность и дебют ───
      const distFromEdge = Math.min(r, this.game.size - 1 - r, c, this.game.size - 1 - c);
      const centerR = Math.floor(this.game.size / 2);
      const centerC = centerR;
      const isTengen = (r === centerR && c === centerC);
      const tengenCoord = formatCoord(centerR, centerC, this.game.size);
      const isCornerHoshi = hoshiPoints.some(h => h.r === r && h.c === c && !(h.r === centerR && h.c === centerC));

      if (distFromEdge === 0) {
        if (this.game.moveNumber < 22 && numCaptured === 0) score -= 130;
        else score -= 25;
      } else if (distFromEdge === 1) {
        if (this.game.moveNumber < 15) score -= 30;
        else score += 25;
      } else if (distFromEdge === 2) {
        // 3-я линия — линия территории
        score += 85;
        if (this.game.moveNumber <= 15 && numCaptured === 0 && !savedFromAtari && atariGain === 0) {
          tag = 'Территория (3-я линия)';
          pillClass = 'pill-info';
          explanation = '3-я линия — идеальная высота для быстрого закрепления надежной территории вдоль края.';
        }
      } else if (distFromEdge === 3) {
        // 4-я линия — линия влияния
        score += 75;
      }

      // Особенности дебюта в зависимости от размера доски
      if (this.game.moveNumber <= 12) {
        if (this.game.size === 9) {
          // На малой доске 9х9 центр (Тэнгэн) — сильнейший пункт первого хода
          if (isTengen) {
            score += 150;
            if (numCaptured === 0 && !savedFromAtari && atariGain === 0) {
              tag = 'Центр (Тэнгэн)';
              pillClass = 'pill-info';
              explanation = `На доске 9х9 центр (Тэнгэн ${tengenCoord}) — классический первый ход: дает тотальный контроль над всеми 4 углами сразу.`;
            }
          } else if (isCornerHoshi) {
            score += 100;
          }
        } else {
          // На досках 11х11, 13х13, 15х15, 19х19 действует классика: «Угол — золото, сторона — серебро, центр — трава»
          if (isCornerHoshi) {
            score += 160;
            if (numCaptured === 0 && !savedFromAtari && atariGain === 0) {
              tag = 'Угловой пункт (Хоси)';
              pillClass = 'pill-info';
              explanation = 'Классическое дебютное развитие в углу (Хоси). Занимает угол с наименьшими затратами камней.';
            }
          } else if (isTengen) {
            score += 80;
          }
        }
      }

      return { score, tag, pillClass, explanation };
    }

    // Поиск топ-N лучших ходов (для подсказок тренера и ходов ИИ)
    findBestMoves(color, count, difficulty) {
      const opponent = opponentOf(color);
      const atariGroups = this.game.getAllGroups().filter(group => group.liberties.size === 1);
      const ownAtariGroups = atariGroups.filter(group => group.color === color);
      const position = {
        color,
        opponent,
        difficulty,
        ownAtariGroups,
        opponentAtariCount: atariGroups.length - ownAtariGroups.length,
        hoshiPoints: getHoshiPoints(this.game.size)
      };
      const validMoves = [];

      for (let r = 0; r < this.game.size; r++) {
        for (let c = 0; c < this.game.size; c++) {
          if (this.game.board[r][c] === EMPTY) {
            if (this.isTrueEye(r, c, color)) continue;

            const test = this.game.testMove(r, c, color);
            if (test.valid) {
              const evalResult = this.evaluateMove(r, c, test, position);
              validMoves.push({
                r, c,
                score: evalResult.score,
                tag: evalResult.tag,
                pillClass: evalResult.pillClass,
                explanation: evalResult.explanation
              });
            }
          }
        }
      }

      validMoves.sort((a, b) => b.score - a.score);
      return validMoves.slice(0, count);
    }

    // Выбор хода компьютером с учетом уровня сложности
    findBestMove(difficulty) {
      const candidates = this.findBestMoves(WHITE, 6, difficulty);
      if (candidates.length === 0) return null;

      if (candidates[0].score < -300 && this.game.moveNumber > 25) {
        return null;
      }


      if (difficulty === 'easy') {
        // Новичок: 25% вероятность совершить ошибку (пропустить идеальный ход)
        if (Math.random() < 0.25 && candidates.length > 2) {
          const blunders = candidates.slice(1, Math.min(5, candidates.length));
          return blunders[Math.floor(Math.random() * blunders.length)];
        }
        const topTier = candidates.filter(m => m.score >= candidates[0].score - 35);
        return topTier[Math.floor(Math.random() * topTier.length)];
      } else if (difficulty === 'medium') {
        // Любитель: сбалансированная игра с легкой вариативностью
        const topTier = candidates.filter(m => m.score >= candidates[0].score - 15);
        return topTier[Math.floor(Math.random() * topTier.length)];
      } else {
        // Мастер: выбирает строго наилучший ход
        const topScore = candidates[0].score;
        const masterTier = candidates.filter(m => m.score >= topScore - 4);
        return masterTier[Math.floor(Math.random() * masterTier.length)];
      }
    }
  };
})();
