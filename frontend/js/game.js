/**
 * Tic Tac Toe — Game Logic
 */
const game = {
    board: ['', '', '', '', '', '', '', '', ''],
    currentPlayer: 'X',
    gameOver: false,
    scores: { X: 0, O: 0, draw: 0 },

    // Winning combinations
    winPatterns: [
        [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
        [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
        [0, 4, 8], [2, 4, 6],            // diagonals
    ],

    init() {
        this.cells = document.querySelectorAll('.cell');
        this.statusEl = document.getElementById('game-status');
        this.scoreX = document.getElementById('score-x');
        this.scoreO = document.getElementById('score-o');
        this.scoreDraw = document.getElementById('score-draw');
        this.resultBanner = document.getElementById('result-banner');
        this.resultIcon = document.getElementById('result-icon');
        this.resultText = document.getElementById('result-text');
        this.btnRestart = document.getElementById('btn-restart');
        this.btnResetScores = document.getElementById('btn-reset-scores');

        // Cell clicks
        this.cells.forEach((cell, index) => {
            cell.addEventListener('click', () => this.makeMove(index));
        });

        // Button clicks
        this.btnRestart.addEventListener('click', () => this.restart());
        this.btnResetScores.addEventListener('click', () => this.resetScores());

        this.updateStatus();
    },

    makeMove(index) {
        if (this.board[index] !== '' || this.gameOver) return;

        this.board[index] = this.currentPlayer;
        const cell = this.cells[index];
        cell.textContent = this.currentPlayer;
        cell.classList.add('taken', this.currentPlayer === 'X' ? 'x-cell' : 'o-cell');

        // Check for win
        const winPattern = this.checkWin();
        if (winPattern) {
            this.gameOver = true;
            this.scores[this.currentPlayer]++;
            this.updateScores();
            this.highlightWin(winPattern);
            this.showResult(
                this.currentPlayer === 'X' ? '🏆' : '🏆',
                `Player ${this.currentPlayer} Wins!`
            );
            return;
        }

        // Check for draw
        if (this.board.every(cell => cell !== '')) {
            this.gameOver = true;
            this.scores.draw++;
            this.updateScores();
            this.showResult('🤝', 'It\'s a Draw!');
            return;
        }

        // Switch player
        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();
    },

    checkWin() {
        for (const pattern of this.winPatterns) {
            const [a, b, c] = pattern;
            if (
                this.board[a] !== '' &&
                this.board[a] === this.board[b] &&
                this.board[a] === this.board[c]
            ) {
                return pattern;
            }
        }
        return null;
    },

    highlightWin(pattern) {
        pattern.forEach(i => {
            this.cells[i].classList.add('win-cell');
        });
    },

    showResult(icon, text) {
        this.resultIcon.textContent = icon;
        this.resultText.textContent = text;
        this.resultBanner.classList.add('show');
        this.statusEl.textContent = text;
        this.statusEl.className = 'game-subtitle';
    },

    updateStatus() {
        this.statusEl.textContent = `Player ${this.currentPlayer}'s Turn`;
        this.statusEl.className = `game-subtitle ${this.currentPlayer === 'X' ? 'x-turn' : 'o-turn'}`;
    },

    updateScores() {
        this.scoreX.textContent = this.scores.X;
        this.scoreO.textContent = this.scores.O;
        this.scoreDraw.textContent = this.scores.draw;
    },

    restart() {
        this.board = ['', '', '', '', '', '', '', '', ''];
        this.currentPlayer = 'X';
        this.gameOver = false;

        this.cells.forEach(cell => {
            cell.textContent = '';
            cell.className = 'cell';
        });

        this.resultBanner.classList.remove('show');
        this.updateStatus();
    },

    resetScores() {
        this.scores = { X: 0, O: 0, draw: 0 };
        this.updateScores();
        this.restart();
        // Reset secret tap pattern as well
        if (typeof tapTracker !== 'undefined') tapTracker.reset();
    },
};

// Initialize game on page load
document.addEventListener('DOMContentLoaded', () => {
    game.init();
});
