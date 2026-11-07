// Classic scripts let index.html run directly from disk.
const GoRules = (() => {
  'use strict';

  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;

  // Традиционная координатная сетка Го (19 букв, буква 'I' традиционно пропускается)
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'];

  // Коми в зависимости от масштаба доски
  function getKomiForSize(size) {
    if (size >= 19) return 7.5; // Классический международный стандарт
    if (size >= 13) return 6.5; // Стандарт для средних полей
    return 5.5; // Стандарт для 9х9 и 11х11
  }

  // Традиционные звездные пункты (Хоси) для каждого размера
  function getHoshiPoints(size) {
    if (size === 19) {
      const lines = [3, 9, 15]; // 4-я линия, Тэнгэн (10-я линия), 16-я линия
      const pts = [];
      for (const r of lines) {
        for (const c of lines) {
          pts.push({ r, c });
        }
      }
      return pts; // 9 точек классической доски 19х19
    }
    if (size === 15) {
      return [
        { r: 3, c: 3 }, { r: 3, c: 11 },
        { r: 7, c: 7 }, // Тэнгэн H8
        { r: 11, c: 3 }, { r: 11, c: 11 }
      ];
    }
    if (size === 13) {
      return [
        { r: 3, c: 3 }, { r: 3, c: 9 },
        { r: 6, c: 6 }, // Тэнгэн G7
        { r: 9, c: 3 }, { r: 9, c: 9 }
      ];
    }
    if (size === 11) {
      return [
        { r: 2, c: 2 }, { r: 2, c: 8 },
        { r: 5, c: 5 }, // Тэнгэн F6
        { r: 8, c: 2 }, { r: 8, c: 8 }
      ];
    }
    // 9х9 по умолчанию: 4 угловых Хоси (3-я линия) + Тэнгэн E5
    return [
      { r: 2, c: 2 }, { r: 2, c: 6 },
      { r: 4, c: 4 },
      { r: 6, c: 2 }, { r: 6, c: 6 }
    ];
  }

  function opponentOf(color) {
    return color === BLACK ? WHITE : BLACK;
  }

  function formatCoord(r, c, size) {
    return `${LETTERS[c]}${size - r}`;
  }

  class GoGame {
    #history;

    constructor(size = 9) {
      this.reset(size);
    }

    static fromMoves(size, moves) {
      if (![9, 11, 13, 15, 19].includes(size) || !Array.isArray(moves)) {
        throw new Error('Неподдерживаемый размер доски или журнал ходов');
      }
      const game = new GoGame(size);
      for (const [index, entry] of moves.entries()) {
        if (entry?.color !== game.turn ||
            !(entry.move === null ? game.pass() : entry.move && game.playMove(entry.move.r, entry.move.c).valid)) {
          throw new Error(`Недопустимый ход №${index + 1}`);
        }
      }
      return game;
    }

    reset(size = this.size) {
      this.size = size;
      this.board = Array(this.size).fill(null).map(() => Array(this.size).fill(EMPTY));
      this.turn = BLACK; // Черные ходят первыми
      this.prisoners = { [BLACK]: 0, [WHITE]: 0 }; // Захваченные противники
      this.consecutivePasses = 0;
      this.lastMove = null; // { r, c, color }
      this.#history = [];
      this.isGameOver = false;
    }

    get moveCount() {
      return this.#history.length;
    }

    get moveNumber() {
      return this.moveCount + 1;
    }

    getMoveHistory() {
      return this.#history.map(({ turn: color, move }) => ({ color, move: move && { ...move } }));
    }

    #getBoardKey(b) {
      return b.map(row => row.join('')).join('|');
    }

    isValidCoord(r, c) {
      return r >= 0 && r < this.size && c >= 0 && c < this.size;
    }

    getNeighbors(r, c) {
      const neighbors = [];
      const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (this.isValidCoord(nr, nc)) {
          neighbors.push({ r: nr, c: nc });
        }
      }
      return neighbors;
    }

    // Поиск группы камней и её свободных дыханий (дамэ)
    getGroupAndLiberties(r, c, board = this.board) {
      const color = board[r][c];
      if (color === EMPTY) {
        return { color: EMPTY, stones: [], liberties: new Set() };
      }

      const stones = [{ r, c }];
      const liberties = new Set();
      const visited = new Set();
      visited.add(`${r},${c}`);

      for (let i = 0; i < stones.length; i++) {
        const curr = stones[i];

        for (const nb of this.getNeighbors(curr.r, curr.c)) {
          const key = `${nb.r},${nb.c}`;
          const nbColor = board[nb.r][nb.c];

          if (nbColor === EMPTY) {
            liberties.add(key);
          } else if (nbColor === color && !visited.has(key)) {
            visited.add(key);
            stones.push(nb);
          }
        }
      }

      return { color, stones, liberties };
    }

    // Получить все уникальные группы на доске
    getAllGroups(board = this.board) {
      const visited = new Set();
      const groups = [];

      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const key = `${r},${c}`;
          if (board[r][c] !== EMPTY && !visited.has(key)) {
            const group = this.getGroupAndLiberties(r, c, board);
            for (const stone of group.stones) {
              visited.add(`${stone.r},${stone.c}`);
            }
            groups.push(group);
          }
        }
      }
      return groups;
    }

    // Проверка допустимости хода и симуляция захвата
    testMove(r, c, color, board = this.board, previousBoard = this.#history.at(-1)?.board) {
      if (!Number.isInteger(r) || !Number.isInteger(c) || !this.isValidCoord(r, c)) {
        return { valid: false, reason: 'Пересечение вне доски.' };
      }
      // 1. Клетка должна быть пустой
      if (board[r][c] !== EMPTY) {
        return { valid: false, captured: [], reason: 'Пересечение уже занято!' };
      }

      const opponent = opponentOf(color);
      const testBoard = board.map(row => [...row]);
      testBoard[r][c] = color;

      // 2. Проверяем захват групп противника
      const capturedStones = [];
      const checkedOpponentKeys = new Set();

      for (const nb of this.getNeighbors(r, c)) {
        if (testBoard[nb.r][nb.c] === opponent) {
          const nbKey = `${nb.r},${nb.c}`;
          if (!checkedOpponentKeys.has(nbKey)) {
            const oppGroup = this.getGroupAndLiberties(nb.r, nb.c, testBoard);
            for (const s of oppGroup.stones) {
              checkedOpponentKeys.add(`${s.r},${s.c}`);
            }
            // Если у группы противника 0 дыханий — она захватывается!
            if (oppGroup.liberties.size === 0) {
              capturedStones.push(...oppGroup.stones);
            }
          }
        }
      }

      // Удаляем захваченные камни противника с симуляционной доски
      for (const s of capturedStones) {
        testBoard[s.r][s.c] = EMPTY;
      }

      // 3. Проверка на самоубийство
      const ownGroup = this.getGroupAndLiberties(r, c, testBoard);
      if (ownGroup.liberties.size === 0) {
        return {
          valid: false,
          captured: [],
          reason: 'Самоубийство! У выставленного камня не будет дыханий.'
        };
      }

      // 4. Проверка правила Ко (запрет немедленного повторения позиции)
      if (capturedStones.length === 1 && previousBoard &&
          this.#getBoardKey(testBoard) === this.#getBoardKey(previousBoard)) {
        return {
          valid: false,
          captured: [],
          reason: 'Правило Ко! Запрещено немедленно повторять позицию доски (сделайте ход в другом месте — Ко-угрозу).'
        };
      }

      return { valid: true, captured: capturedStones, nextBoard: testBoard, liberties: ownGroup.liberties };
    }

    #savePosition(move) {
      this.#history.push({
        // testMove creates the next board. No move mutates a board in history.
        board: this.board,
        turn: this.turn,
        prisoners: { ...this.prisoners },
        consecutivePasses: this.consecutivePasses,
        lastMove: this.lastMove,
        move
      });
    }

    playMove(r, c) {
      if (this.isGameOver) return { valid: false };

      const move = this.testMove(r, c, this.turn);
      if (!move.valid) return move;

      this.#savePosition({ r, c });
      this.board = move.nextBoard;
      this.lastMove = { r, c, color: this.turn };
      this.consecutivePasses = 0;
      this.prisoners[this.turn] += move.captured.length;
      this.turn = opponentOf(this.turn);

      return move;
    }

    pass() {
      if (this.isGameOver) return false;

      this.#savePosition(null);
      this.consecutivePasses++;
      this.turn = opponentOf(this.turn);
      if (this.consecutivePasses === 2) this.endGame();
      return true;
    }

    undo(steps = 1) {
      if (!Number.isInteger(steps) || steps < 1 || this.#history.length < steps) return false;

      const [position] = this.#history.splice(-steps);
      this.board = position.board;
      this.turn = position.turn;
      this.prisoners = position.prisoners;
      this.consecutivePasses = position.consecutivePasses;
      this.lastMove = position.lastMove;
      this.isGameOver = false;
      return true;
    }

    endGame() {
      this.isGameOver = true;
    }

    resumePlay() {
      if (this.consecutivePasses === 2) this.undo(2);
      else this.isGameOver = false;
    }

    // ─── Подсчет очков по площади (камни и окружённая территория) ───
    calculateScore(deadStones) {
      const b = deadStones?.size
        ? this.board.map((row, r) => row.map((stone, c) => deadStones.has(`${r},${c}`) ? EMPTY : stone))
        : this.board;
      let blackStones = 0;
      let whiteStones = 0;

      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (b[r][c] === BLACK) blackStones++;
          else if (b[r][c] === WHITE) whiteStones++;
        }
      }

      // Поиск нейтральных и окруженных пустых областей (заливка flood fill)
      const visited = Array(this.size).fill(null).map(() => Array(this.size).fill(false));
      let blackTerritory = 0;
      let whiteTerritory = 0;
      const territoryMap = Array(this.size).fill(null).map(() => Array(this.size).fill(EMPTY));

      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          if (b[r][c] === EMPTY && !visited[r][c]) {
            const region = [{ r, c }];
            visited[r][c] = true;
            const surroundingColors = new Set();

            for (let i = 0; i < region.length; i++) {
              const curr = region[i];
              for (const nb of this.getNeighbors(curr.r, curr.c)) {
                const color = b[nb.r][nb.c];
                if (color === EMPTY) {
                  if (!visited[nb.r][nb.c]) {
                    visited[nb.r][nb.c] = true;
                    region.push(nb);
                  }
                } else {
                  surroundingColors.add(color);
                }
              }
            }

            // Область принадлежит игроку, если граничит ИСКЛЮЧИТЕЛЬНО с его камнями
            if (surroundingColors.has(BLACK) && !surroundingColors.has(WHITE)) {
              blackTerritory += region.length;
              for (const pt of region) territoryMap[pt.r][pt.c] = BLACK;
            } else if (surroundingColors.has(WHITE) && !surroundingColors.has(BLACK)) {
              whiteTerritory += region.length;
              for (const pt of region) territoryMap[pt.r][pt.c] = WHITE;
            }
          }
        }
      }

      const komi = getKomiForSize(this.size);
      const totalBlack = blackTerritory + blackStones;
      const totalWhite = whiteTerritory + whiteStones + komi;

      return {
        black: {
          territory: blackTerritory,
          stones: blackStones,
          total: totalBlack
        },
        white: {
          territory: whiteTerritory,
          stones: whiteStones,
          komi,
          total: totalWhite
        },
        territoryMap,
        winner: totalBlack > totalWhite ? BLACK : WHITE,
        diff: Math.abs(totalBlack - totalWhite)
      };
    }
  }

  return { GoGame, EMPTY, BLACK, WHITE, LETTERS, getKomiForSize, getHoshiPoints, opponentOf, formatCoord };
})();
