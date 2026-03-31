const SIZE = 15;
const EMPTY = 0;

// Tính ma trận vị trí (positional matrix) để ưu tiên đánh gần trung tâm
const CENTER = 7;
const positionalMatrix = Array(SIZE).fill(0).map((_, r) =>
    Array(SIZE).fill(0).map((_, c) =>
        Math.max(0, CENTER - Math.max(Math.abs(r - CENTER), Math.abs(c - CENTER)))
    )
);

function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

function getValidMoves(boardState) {
    const moves = new Set();
    let hasPieces = false;

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (boardState[r][c] !== EMPTY) {
                hasPieces = true;
                for (let dr = -2; dr <= 2; dr++) {
                    for (let dc = -2; dc <= 2; dc++) {
                        const nr = r + dr, nc = c + dc;
                        if (inBounds(nr, nc) && boardState[nr][nc] === EMPTY) {
                            moves.add(`${nr},${nc}`);
                        }
                    }
                }
            }
        }
    }

    if (!hasPieces) {
        return [[Math.floor(SIZE / 2), Math.floor(SIZE / 2)]];
    }

    return Array.from(moves).map(m => {
        const parts = m.split(',');
        return [parseInt(parts[0]), parseInt(parts[1])];
    });
}

function checkWinner(boardState) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const player = boardState[r][c];
            if (player === EMPTY) continue;

            for (const [dr, dc] of directions) {
                let count = 1;
                let winningCells = [[r, c]];

                // Tiến
                let currR = r + dr, currC = c + dc;
                while (inBounds(currR, currC) && boardState[currR][currC] === player) {
                    count++;
                    winningCells.push([currR, currC]);
                    currR += dr;
                    currC += dc;
                }

                // Lùi
                currR = r - dr; currC = c - dc;
                while (inBounds(currR, currC) && boardState[currR][currC] === player) {
                    count++;
                    winningCells.push([currR, currC]);
                    currR -= dr;
                    currC -= dc;
                }

                if (count >= 5) {
                    return { winner: player, isDraw: false, winningCells };
                }
            }
        }
    }

    const isFull = boardState.every(row => row.every(cell => cell !== EMPTY));
    return { winner: null, isDraw: isFull, winningCells: [] };
}

function scorePatternFromCell(boardState, row, col, dr, dc, player) {
    if (!inBounds(row, col) || boardState[row][col] !== player) return 0;

    // Chặn đếm trùng
    const prevR = row - dr, prevC = col - dc;
    if (inBounds(prevR, prevC) && boardState[prevR][prevC] === player) return 0;

    let length = 0;
    let r = row, c = col;
    while (inBounds(r, c) && boardState[r][c] === player) {
        length++;
        r += dr;
        c += dc;
    }

    const endR1 = row - dr, endC1 = col - dc;
    const endR2 = r, endC2 = c;

    let openEnds = 0;
    if (inBounds(endR1, endC1) && boardState[endR1][endC1] === EMPTY) openEnds++;
    if (inBounds(endR2, endC2) && boardState[endR2][endC2] === EMPTY) openEnds++;

    if (length >= 5) return 100000;
    if (length === 4) {
        if (openEnds === 2) return 10000;
        if (openEnds === 1) return 5000;
    }
    if (length === 3) {
        if (openEnds === 2) return 1000;
        if (openEnds === 1) return 200;
    }
    if (length === 2) {
        if (openEnds === 2) return 50;
    }
    return 0;
}

function evaluateSinglePlayer(boardState, player) {
    let total = 0;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            for (const [dr, dc] of directions) {
                total += scorePatternFromCell(boardState, r, c, dr, dc, player);
            }
        }
    }
    return total;
}

function evaluateBoard(boardState, aiPlayerId) {
    const opponentId = aiPlayerId === 1 ? 2 : 1;

    let bonusAI = 0, bonusOpp = 0;
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            if (boardState[r][c] === aiPlayerId) bonusAI += positionalMatrix[r][c];
            else if (boardState[r][c] === opponentId) bonusOpp += positionalMatrix[r][c];
        }
    }

    const scoreAI = evaluateSinglePlayer(boardState, aiPlayerId);
    const scoreOpp = evaluateSinglePlayer(boardState, opponentId);

    return (scoreAI - scoreOpp) + (bonusAI - bonusOpp);
}

function minimax(boardState, depthLimit, alpha, beta, isMaximizing, aiId, moveCount) {
    const status = checkWinner(boardState);
    if (status.winner !== null || status.isDraw || depthLimit === 0) {
        let score = evaluateBoard(boardState, aiId);
        if (status.winner === aiId) score += 1000000 + depthLimit * 1000;
        else if (status.winner !== null) score -= 1000000 + depthLimit * 1000;
        return { score, move: null };
    }

    let validMoves = getValidMoves(boardState);
    if (validMoves.length === 0) return { score: evaluateBoard(boardState, aiId), move: null };

    const currPlayer = isMaximizing ? aiId : (aiId === 1 ? 2 : 1);

    if (depthLimit >= 2) {
        const scoredMoves = validMoves.map(move => {
            const [r, c] = move;
            boardState[r][c] = currPlayer;
            const s = evaluateBoard(boardState, aiId);
            boardState[r][c] = EMPTY;
            return { move, score: isMaximizing ? s : -s };
        });
        scoredMoves.sort((a, b) => b.score - a.score);
        validMoves = scoredMoves.map(m => m.move);
    }

    let bestMove = null;

    if (isMaximizing) {
        let bestScore = -Infinity;
        for (const [r, c] of validMoves) {
            boardState[r][c] = currPlayer;
            const result = minimax(boardState, depthLimit - 1, alpha, beta, false, aiId, moveCount + 1);
            boardState[r][c] = EMPTY;

            if (result.score > bestScore) {
                bestScore = result.score;
                bestMove = [r, c];
            }
            alpha = Math.max(alpha, bestScore);
            if (beta <= alpha) break; // Pruning
        }
        return { score: bestScore, move: bestMove };
    } else {
        let bestScore = Infinity;
        for (const [r, c] of validMoves) {
            boardState[r][c] = currPlayer;
            const result = minimax(boardState, depthLimit - 1, alpha, beta, true, aiId, moveCount + 1);
            boardState[r][c] = EMPTY;

            if (result.score < bestScore) {
                bestScore = result.score;
                bestMove = [r, c];
            }
            beta = Math.min(beta, bestScore);
            if (beta <= alpha) break; // Pruning
        }
        return { score: bestScore, move: bestMove };
    }
}

// Giao tiếp với Main Thread (Nhận sự kiện từ AICARO_FINAL.js)
self.onmessage = function(e) {
    const { boardCopy, depth, aiId } = e.data;
    const startTime = performance.now();
    
    // Đệ quy tính toán dài hơi (không làm kẹt UI chính)
    const result = minimax(boardCopy, depth, -Infinity, Infinity, true, aiId, 0);
    
    const elapsed = performance.now() - startTime;
    self.postMessage({ result, elapsed });
};
