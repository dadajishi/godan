const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const highScoreElement = document.getElementById('highScore');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');

const gridSize = 20;
const tileCount = canvas.width / gridSize;

let snake = [{ x: 10, y: 10 }];
let direction = { x: 0, y: 0 };
let food = {};
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let gameRunning = false;
let gamePaused = false;
let gameInterval;
let gameSpeed = 100;

highScoreElement.textContent = highScore;

function initGame() {
    snake = [{ x: 10, y: 10 }];
    direction = { x: 0, y: 0 };
    score = 0;
    scoreElement.textContent = score;
    generateFood();
    drawGame();
}

function generateFood() {
    let newFood;
    do {
        newFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
    food = newFood;
}

function drawGame() {
    // Clear canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines (optional)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i <= tileCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(canvas.width, i * gridSize);
        ctx.stroke();
    }

    // Draw snake
    snake.forEach((segment, index) => {
        const gradient = ctx.createRadialGradient(
            segment.x * gridSize + gridSize/2,
            segment.y * gridSize + gridSize/2,
            2,
            segment.x * gridSize + gridSize/2,
            segment.y * gridSize + gridSize/2,
            gridSize/2
        );
        if (index === 0) {
            gradient.addColorStop(0, '#4CAF50');
            gradient.addColorStop(1, '#2E7D32');
        } else {
            gradient.addColorStop(0, '#81C784');
            gradient.addColorStop(1, '#388E3C');
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(segment.x * gridSize + 1, segment.y * gridSize + 1, gridSize - 2, gridSize - 2);
        
        // Draw eyes on head
        if (index === 0) {
            ctx.fillStyle = '#fff';
            const eyeSize = 3;
            const eyeOffset = 5;
            if (direction.x === 1) {
                ctx.fillRect(segment.x * gridSize + gridSize - eyeOffset - eyeSize, segment.y * gridSize + 5, eyeSize, eyeSize);
                ctx.fillRect(segment.x * gridSize + gridSize - eyeOffset - eyeSize, segment.y * gridSize + gridSize - 5 - eyeSize, eyeSize, eyeSize);
            } else if (direction.x === -1) {
                ctx.fillRect(segment.x * gridSize + eyeOffset, segment.y * gridSize + 5, eyeSize, eyeSize);
                ctx.fillRect(segment.x * gridSize + eyeOffset, segment.y * gridSize + gridSize - 5 - eyeSize, eyeSize, eyeSize);
            } else if (direction.y === 1) {
                ctx.fillRect(segment.x * gridSize + 5, segment.y * gridSize + gridSize - eyeOffset - eyeSize, eyeSize, eyeSize);
                ctx.fillRect(segment.x * gridSize + gridSize - 5 - eyeSize, segment.y * gridSize + gridSize - eyeOffset - eyeSize, eyeSize, eyeSize);
            } else if (direction.y === -1) {
                ctx.fillRect(segment.x * gridSize + 5, segment.y * gridSize + eyeOffset, eyeSize, eyeSize);
                ctx.fillRect(segment.x * gridSize + gridSize - 5 - eyeSize, segment.y * gridSize + eyeOffset, eyeSize, eyeSize);
            } else {
                ctx.fillRect(segment.x * gridSize + 5, segment.y * gridSize + 5, eyeSize, eyeSize);
                ctx.fillRect(segment.x * gridSize + gridSize - 5 - eyeSize, segment.y * gridSize + 5, eyeSize, eyeSize);
            }
        }
    });

    // Draw food
    const foodGradient = ctx.createRadialGradient(
        food.x * gridSize + gridSize/2,
        food.y * gridSize + gridSize/2,
        2,
        food.x * gridSize + gridSize/2,
        food.y * gridSize + gridSize/2,
        gridSize/2
    );
    foodGradient.addColorStop(0, '#ff6b6b');
    foodGradient.addColorStop(1, '#c0392b');
    ctx.fillStyle = foodGradient;
    ctx.beginPath();
    ctx.arc(food.x * gridSize + gridSize/2, food.y * gridSize + gridSize/2, gridSize/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Food shine
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(food.x * gridSize + gridSize/2 - 2, food.y * gridSize + gridSize/2 - 2, 2, 0, Math.PI * 2);
    ctx.fill();
}

function moveSnake() {
    if (!gameRunning || gamePaused) return;

    const head = { ...snake[0] };
    head.x += direction.x;
    head.y += direction.y;

    // Check wall collision
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        gameOver();
        return;
    }

    // Check self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        gameOver();
        return;
    }

    snake.unshift(head);

    // Check food collision
    if (head.x === food.x && head.y === food.y) {
        score++;
        scoreElement.textContent = score;
        if (score > highScore) {
            highScore = score;
            highScoreElement.textContent = highScore;
            localStorage.setItem('snakeHighScore', highScore);
        }
        generateFood();
        // Increase speed slightly
        if (gameSpeed > 50) {
            clearInterval(gameInterval);
            gameSpeed -= 2;
            gameInterval = setInterval(moveSnake, gameSpeed);
        }
    } else {
        snake.pop();
    }

    drawGame();
}

function gameOver() {
    gameRunning = false;
    clearInterval(gameInterval);
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = '暂停';
    gamePaused = false;
    
    // Draw game over overlay
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('游戏结束', canvas.width/2, canvas.height/2 - 20);
    ctx.font = '18px Arial';
    ctx.fillText(`得分: ${score}`, canvas.width/2, canvas.height/2 + 20);
    ctx.fillText('点击开始重新游戏', canvas.width/2, canvas.height/2 + 50);
}

function startGame() {
    if (gameRunning) return;
    initGame();
    gameRunning = true;
    gamePaused = false;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    pauseBtn.textContent = '暂停';
    gameSpeed = 100;
    clearInterval(gameInterval);
    gameInterval = setInterval(moveSnake, gameSpeed);
    drawGame();
}

function togglePause() {
    if (!gameRunning) return;
    gamePaused = !gamePaused;
    if (gamePaused) {
        pauseBtn.textContent = '继续';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂停中', canvas.width/2, canvas.height/2);
    } else {
        pauseBtn.textContent = '暂停';
        drawGame();
    }
}

function resetGame() {
    clearInterval(gameInterval);
    gameRunning = false;
    gamePaused = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = '暂停';
    initGame();
    drawGame();
}

// Event listeners
startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', resetGame);

document.addEventListener('keydown', (e) => {
    if (!gameRunning || gamePaused) return;
    
    const key = e.key.toLowerCase();
    
    // Prevent snake from reversing
    if ((key === 'arrowup' || key === 'w') && direction.y === 0) {
        direction = { x: 0, y: -1 };
    } else if ((key === 'arrowdown' || key === 's') && direction.y === 0) {
        direction = { x: 0, y: 1 };
    } else if ((key === 'arrowleft' || key === 'a') && direction.x === 0) {
        direction = { x: -1, y: 0 };
    } else if ((key === 'arrowright' || key === 'd') && direction.x === 0) {
        direction = { x: 1, y: 0 };
    }
});

// Initialize game display
initGame();
