/* ==========================================
 * CONSTANTS & CORE GAME LOGIC
 * ========================================== */
const SIZE = 15;
const EMPTY = 0;
const PLAYER_X = 1; // Luôn là người chơi đi trước (Blue)
const PLAYER_O = 2; // Luôn là người chơi đi sau (Red)

let board = [];
let depth = 2;
let humanId = PLAYER_X;
let aiId = PLAYER_O;
let currentPlayer = PLAYER_X;
let gameStatus = { winner: null, isDraw: false, winningCells: [], isTimeout: false };
let lastMove = null;
let isThinking = false;

// Variables Timer
let humanTime = 300; // 5 phút * 60 giây
let aiTime = 300;
let timerInterval = null;

let humanMatchScore = 0;
let aiMatchScore = 0;

// Khởi tạo Worker để đẩy logic tính toán sang thread nền chống Đơ (Lag) UI
let aiWorker = new Worker('gamelogic.js');
aiWorker.onmessage = function(e) {
    const { result, elapsed } = e.data;
    
    // Cập nhật thời gian AI đã suy nghĩ 
    aiTime -= Math.floor(elapsed / 1000);
    if (aiTime < 0) aiTime = 0;
    elements.aiTimeDisplay.textContent = formatTime(aiTime);
    
    if (aiTime <= 0) {
        handleTimeout(aiId);
        return;
    }
    
    if (result.move) {
        handleMove(result.move[0], result.move[1], aiId);
    } else {
        // Fallback ngẫu nhiên (hiếm khi xảy ra)
        for (let r=0; r<SIZE; r++) {
            for (let c=0; c<SIZE; c++) {
                if (board[r][c] === EMPTY) {
                    handleMove(r, c, aiId);
                    return;
                }
            }
        }
    }
};

// ==========================================
// CẤU HÌNH  M THANH & NHẠC (Web Audio API)
// ==========================================
// Sử dụng liên kết MP3 miễn phí siêu ổn định cho nhạc nền
const bgmAudio = new Audio('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'); 
bgmAudio.loop = true;
bgmAudio.volume = 0.3;

// Các biến ảo (Dùng cho Synthesizer bên dưới)
const placeAudio = "place"; 
const winAudio = "win"; 
const loseAudio = "lose";

let isSoundEnabled = false;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playTone(freq, type, duration, vol=0.1) {
    if (!isSoundEnabled) return;
    try {
        initAudio();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.start();
        oscillator.stop(audioCtx.currentTime + duration);
    } catch(e) {}
}

function playSound(audioEl) {
    if (!isSoundEnabled) return;

    if (audioEl === "place") {
        playTone(600, 'sine', 0.1, 0.1);
    } else if (audioEl === "win") {
        playTone(440, 'sine', 0.1, 0.2);
        setTimeout(() => playTone(554, 'sine', 0.1, 0.2), 100);
        setTimeout(() => playTone(659, 'sine', 0.4, 0.2), 200);
    } else if (audioEl === "lose") {
        playTone(300, 'sawtooth', 0.3, 0.2);
        setTimeout(() => playTone(250, 'sawtooth', 0.5, 0.2), 200);
    } else if (audioEl && audioEl.play) {
        // Dự phòng nếu có audio HTML5 thật
        audioEl.currentTime = 0;
        audioEl.play().catch(e => console.log("Audio block: ", e));
    }
}

function updateSoundState() {
    if (isSoundEnabled) {
        bgmAudio.play().catch(e => console.log("BGM block: ", e));
        elements.btnSound.innerHTML = '<i id="btn-sound-icon" data-lucide="volume-2" class="w-6 h-6 text-emerald-400"></i>';
    } else {
        bgmAudio.pause();
        elements.btnSound.innerHTML = '<i id="btn-sound-icon" data-lucide="volume-x" class="w-6 h-6 text-slate-500"></i>';
    }
    
    // Yêu cầu thư viện Lucide vẽ lại thẻ SVG mới
    if (window.lucide) window.lucide.createIcons();
}

function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
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

// Logic Evaluation và Minimax đã được tách dời sang gamelogic.js để chạy ngầm

/* ==========================================
 * UI & DOM MANIPULATION (VANILLA JS)
 * ========================================== */

// Truy xuất DOM Elements
const elements = {
    btnSound: document.getElementById('btn-sound'),
    btnSoundIcon: document.getElementById('btn-sound-icon'),
    depthDisplay: document.getElementById('depth-display'),
    btnDepthMinus: document.getElementById('btn-depth-minus'),
    btnDepthPlus: document.getElementById('btn-depth-plus'),
    btnRestart: document.getElementById('btn-restart'),
    boardGrid: document.getElementById('board-grid'),
    gameOverOverlay: document.getElementById('game-over-overlay'),
    winnerMessage: document.getElementById('winner-message'),
    winnerDepthInfo: document.getElementById('winner-depth-info'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    humanCard: document.getElementById('human-card'),
    aiCard: document.getElementById('ai-card'),
    humanTurnIndicator: document.getElementById('human-turn-indicator'),
    aiThinkingIndicator: document.getElementById('ai-thinking-indicator'),
    humanStoneIcon: document.getElementById('human-stone-icon'),
    aiStoneIcon: document.getElementById('ai-stone-icon'),
    humanTimeDisplay: document.getElementById('human-time-display'),
    aiTimeDisplay: document.getElementById('ai-time-display'),
    humanScoreDisplay: document.getElementById('human-score-display'),
    aiScoreDisplay: document.getElementById('ai-score-display'),
    btnNextRound: document.getElementById('btn-next-round')
};

// Utils: Hiển thị định dạng mm:ss
function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (gameStatus.winner || gameStatus.isDraw) {
            clearInterval(timerInterval);
            return;
        }

        if (currentPlayer === humanId) {
            humanTime--;
            elements.humanTimeDisplay.textContent = formatTime(humanTime);
            if (humanTime <= 0) handleTimeout(humanId);
        } else if (currentPlayer === aiId) {
            aiTime--;
            elements.aiTimeDisplay.textContent = formatTime(aiTime);
            if (aiTime <= 0) handleTimeout(aiId);
        }
    }, 1000);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
}

function handleTimeout(playerIdTimeout) {
    stopTimer();
    
    if (playerIdTimeout === aiId) {
        playSound(winAudio);
        humanMatchScore++;
    } else {
        playSound(loseAudio);
        aiMatchScore++;
    }
    
    elements.humanScoreDisplay.textContent = humanMatchScore;
    elements.aiScoreDisplay.textContent = aiMatchScore;

    gameStatus = {
        winner: playerIdTimeout === 1 ? 2 : 1, // Kẻ kia thắng
        isDraw: false,
        winningCells: [],
        isTimeout: true
    };
    currentPlayer = null;
    isThinking = false;
    renderUI();
}

let cellDOMs = [];

function initBoardDOM() {
    elements.boardGrid.innerHTML = "";
    cellDOMs = [];
    for (let r = 0; r < SIZE; r++) {
        const rowDOM = [];
        for (let c = 0; c < SIZE; c++) {
            const cellDiv = document.createElement('div');
            cellDiv.className = 'board-cell';
            cellDiv.addEventListener('click', () => handleCellClick(r, c));
            elements.boardGrid.appendChild(cellDiv);
            rowDOM.push(cellDiv);
        }
        cellDOMs.push(rowDOM);
    }
}

function createEmptyBoard() {
    return Array(SIZE).fill(0).map(() => Array(SIZE).fill(0));
}

function getStoneClasses(val) {
    if (val === EMPTY) return "";
    // Quân 1 (Xanh dương)
    if (val === 1) {
        return "bg-gradient-to-br from-cyan-300 to-blue-600 shadow-[0_4px_10px_rgba(37,99,235,0.5)]";
    }
    // Quân 2 (Cam/Đỏ)
    return "bg-gradient-to-br from-orange-300 to-red-600 shadow-[0_4px_10px_rgba(220,38,38,0.5)]";
}

function initGame(isFullReset = true) {
    if (isFullReset) {
        const humanGoesFirst = Math.random() < 0.5;
        humanId = humanGoesFirst ? 1 : 2;
        aiId = humanGoesFirst ? 2 : 1;
        
        humanMatchScore = 0;
        aiMatchScore = 0;
        if (elements.humanScoreDisplay) elements.humanScoreDisplay.textContent = '0';
        if (elements.aiScoreDisplay) elements.aiScoreDisplay.textContent = '0';
    }

    board = createEmptyBoard();
    gameStatus = { winner: null, isDraw: false, winningCells: [], isTimeout: false };
    lastMove = null;
    currentPlayer = PLAYER_X; // 1 luôn đi trước
    isThinking = false;

    humanTime = 300;
    aiTime = 300;
    elements.humanTimeDisplay.textContent = "05:00";
    elements.aiTimeDisplay.textContent = "05:00";

    renderUI();
    startTimer();

    // Nếu aiId === 1 thì tời lượt AI ngay từ đầu
    if (currentPlayer === aiId) {
        triggerAITurn();
    }
}

function handleCellClick(r, c) {
    if (currentPlayer === humanId && !isThinking && !gameStatus.winner) {
        handleMove(r, c, humanId);
    }
}

function handleMove(r, c, playerDoingMove) {
    if (board[r][c] !== EMPTY || gameStatus.winner) return;

    playSound(placeAudio);

    board[r][c] = playerDoingMove;
    lastMove = [r, c];

    gameStatus = checkWinner(board);

    if (gameStatus.winner !== null || gameStatus.isDraw) {
        stopTimer();
        currentPlayer = null;
        isThinking = false;
        
        if (gameStatus.winner) {
            if (gameStatus.winner === humanId) {
                playSound(winAudio);
                humanMatchScore++;
            } else if (gameStatus.winner === aiId) {
                playSound(loseAudio);
                aiMatchScore++;
            }
            elements.humanScoreDisplay.textContent = humanMatchScore;
            elements.aiScoreDisplay.textContent = aiMatchScore;
        }

        renderUI();
    } else {
        currentPlayer = (playerDoingMove === 1 ? 2 : 1);
        isThinking = false;
        renderUI();

        // Nếu lượt tiếp theo là lượt của AI
        if (currentPlayer === aiId) {
            triggerAITurn();
        }
    }
}

function triggerAITurn() {
    if (gameStatus.winner || gameStatus.isDraw) return;

    if (aiTime < 120 && depth > 4) {
        depth = 4;
        elements.depthDisplay.textContent = depth;
    }

    isThinking = true;
    renderStatusPanels(); // Cập nhật chữ "Đang tính..." lập tức

    // Chuyển Bàn cờ sang cho gamelogic để xử lý ngầm (Non-blocking)
    const boardCopy = board.map(row => [...row]);
    aiWorker.postMessage({ boardCopy, depth, aiId });
}

function renderUI() {
    renderBoard();
    renderStatusPanels();
    
    // Nếu có người thắng / hòa, trì hoãn 1.5s trước khi hiện modal để khoe đường chiến thắng
    if (gameStatus.winner || gameStatus.isDraw) {
        setTimeout(renderGameOver, 1500);
    } else {
        renderGameOver();
    }
}

function renderBoard() {
    for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
            const cellVal = board[r][c];
            const isWinning = gameStatus.winningCells.some(cell => cell[0] === r && cell[1] === c);
            const cellDiv = cellDOMs[r][c];

            cellDiv.className = `board-cell ${isWinning ? 'winning-cell' : ''}`;

            let stoneDiv = cellDiv.firstElementChild;

            if (cellVal !== EMPTY) {
                let isNew = false;
                if (!stoneDiv) {
                    stoneDiv = document.createElement('div');
                    cellDiv.appendChild(stoneDiv);
                    isNew = true; // Quân cờ mới được thêm vào
                }

                const stoneClasses = getStoneClasses(cellVal);
                const isLast = (lastMove && lastMove[0] === r && lastMove[1] === c);

                let classes = `w-[80%] h-[80%] rounded-full ${stoneClasses}`;
                if (isLast) classes += ' last-move';

                // Chỉ thêm animation cho quân cờ mới hoặc giữ lại nếu đang có sẵn
                if (isNew) {
                    classes += ' stone-animate';
                } else if (stoneDiv.classList.contains('stone-animate')) {
                    classes += ' stone-animate';
                }

                stoneDiv.className = classes;
            } else {
                if (stoneDiv) {
                    cellDiv.removeChild(stoneDiv); // Xóa quân cờ khi load lại ván mới
                }
            }
        }
    }
}

function renderStatusPanels() {
    // Cập nhật màu các Icon quân cờ
    elements.humanStoneIcon.className = `w-6 h-6 rounded-full ${getStoneClasses(humanId)}`;
    elements.aiStoneIcon.className = `w-6 h-6 rounded-full ${getStoneClasses(aiId)}`;

    // Status Người chơi
    if (currentPlayer === humanId && !gameStatus.winner && !gameStatus.isDraw) {
        elements.humanCard.className = 'p-4 rounded-xl border transition-all duration-300 bg-blue-900/40 border-blue-500 scale-105 shadow-[0_0_15px_rgba(59,130,246,0.5)]';
        elements.humanTurnIndicator.classList.remove('hidden');
    } else {
        elements.humanCard.className = 'p-4 rounded-xl border transition-all duration-300 bg-slate-800/50 border-slate-700 opacity-70';
        elements.humanTurnIndicator.classList.add('hidden');
    }

    // Status AI
    if (currentPlayer === aiId && !gameStatus.winner && !gameStatus.isDraw) {
        elements.aiCard.className = 'p-4 rounded-xl border transition-all duration-300 bg-red-900/40 border-red-500 scale-105 shadow-[0_0_15px_rgba(239,68,68,0.5)]';
        if (isThinking) {
            elements.aiThinkingIndicator.classList.remove('hidden');
            elements.aiThinkingIndicator.classList.add('flex');
        } else {
            elements.aiThinkingIndicator.classList.add('hidden');
            elements.aiThinkingIndicator.classList.remove('flex');
        }
    } else {
        elements.aiCard.className = 'p-4 rounded-xl border transition-all duration-300 bg-slate-800/50 border-slate-700 opacity-70';
        elements.aiThinkingIndicator.classList.add('hidden');
        elements.aiThinkingIndicator.classList.remove('flex');
    }
}

function renderGameOver() {
    if (gameStatus.winner) {
        elements.gameOverOverlay.classList.remove('hidden');
        elements.gameOverOverlay.classList.add('flex');

        elements.winnerDepthInfo.textContent = `Trận đấu kết thúc ở độ sâu (Depth): ${depth}`;
        let reason = gameStatus.isTimeout ? " <br/><span class='text-2xl mt-4 block text-slate-300'>(Đối phương đã hết thời gian!)</span>" : "";

        const isFinal = humanMatchScore >= 3 || aiMatchScore >= 3;

        if (gameStatus.winner === humanId) {
            elements.winnerMessage.innerHTML = `<div class="text-emerald-400 text-center flex flex-col items-center"><i data-lucide="trophy" class="w-16 h-16 mb-4"></i>${isFinal ? '🏆 CHIẾN THẮNG CHUNG CUỘC! 🏆' : 'Bạn (Người) đã thắng!'} ${reason}</div>`;
        } else {
            elements.winnerMessage.innerHTML = `<div class="text-red-400 text-center flex flex-col items-center"><i data-lucide="skull" class="w-16 h-16 mb-4"></i>${isFinal ? '☠️ AI VÔ ĐỊCH TOÀN CỤC! ☠️' : 'Máy (AI) đã thắng!'} ${reason}</div>`;
        }
        
        if (isFinal) {
            if (elements.btnNextRound) {
                elements.btnNextRound.classList.add('hidden');
                elements.btnNextRound.classList.remove('block');
            }
        } else {
            if (elements.btnNextRound) {
                elements.btnNextRound.classList.remove('hidden');
                elements.btnNextRound.classList.add('block');
            }
        }

        if (window.lucide) window.lucide.createIcons();
    }
    else if (gameStatus.isDraw) {
        elements.gameOverOverlay.classList.remove('hidden');
        elements.gameOverOverlay.classList.add('flex');

        elements.winnerMessage.innerHTML = `<span class="text-amber-400">HÒA NHAU!</span>`;
        elements.winnerDepthInfo.textContent = '';
    }
    else {
        elements.gameOverOverlay.classList.add('hidden');
        elements.gameOverOverlay.classList.remove('flex');
    }
}

/* ==========================================
 * BIND EVENTS VÀ KHỞI TẠO GAME
 * ========================================== */

elements.btnDepthMinus.addEventListener('click', () => {
    depth = Math.max(1, depth - 1);
    elements.depthDisplay.textContent = depth;
});

elements.btnDepthPlus.addEventListener('click', () => {
    depth = Math.min(7, depth + 1);
    elements.depthDisplay.textContent = depth;
});

elements.btnRestart.addEventListener('click', () => initGame(true));
elements.btnPlayAgain.addEventListener('click', () => initGame(true));

if (elements.btnNextRound) {
    elements.btnNextRound.addEventListener('click', () => {
        elements.gameOverOverlay.classList.add('hidden');
        elements.gameOverOverlay.classList.remove('flex');
        initGame(false);
    });
}

if (elements.btnSound) {
    elements.btnSound.addEventListener('click', () => {
        isSoundEnabled = !isSoundEnabled;
        updateSoundState();
    });
}

// Lần gọi khởi đầu
window.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();
    initBoardDOM(); // Sinh sẵn lưới 225 ô cờ một lần duy nhất
    initGame(true);
});
