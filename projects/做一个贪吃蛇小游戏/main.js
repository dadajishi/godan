const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score');
const restartBtn = document.getElementById('restartBtn');

const gridSize = 20;
const tileCount = canvas.width / gridSize;

let snake = [
    {x: 10, y: 10}
];
let direction = {x: 0, y: 0};
let food = {};
let score = 0;
let gameRunning = false;
let gameInterval;

function initGame() {
    snake = [{x: 10, y: 10}];
    direction = {x: 0, y: 0};
    score = 0;
    scoreElement.textContent = '得分: 0';
    generateFood();
    gameRunning = true;
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(gameLoop, 100);
}

function generateFood() {
    food = {
        x: Math.floor(Math.random() * tileCount),
        y: Math.floor(Math.random() * tileCount)
    };
    // 确保食物不在蛇身上
    for (let segment of snake) {
        if (segment.x === food.x && segment.y === food.y) {
            generateFood();
            return;
        }
    }
}

function gameLoop() {
    if (!gameRunning) return;
    moveSnake();
    if (checkCollision()) {
        gameOver();
        return;
    }
    checkFood();
    drawGame();
}

function moveSnake() {
    const head = {x: snake[0].x + direction.x, y: snake[0].y + direction.y};
    snake.unshift(head);
    // 如果没有吃到食物，移除尾部
    if (head.x === food.x && head.y === food.y) {
        score++;
        scoreElement.textContent = '得分: ' + score;
        generateFood();
    } else {
        snake.pop();
    }
}

function checkCollision() {
    const head = snake[0];
    // 撞墙
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        return true;
    }
    // 撞自己
    for (let i = 1; i < snake.length; i++) {
        if (snake[i].x === head.x && snake[i].y === head.y) {
            return true;
        }
    }
    return false;
}

function checkFood() {
    // 食物已被吃掉，重新生成
    if (snake[0].x === food.x && snake[0].y === food.y) {
        generateFood();
    }
}

function drawGame() {
    // 清屏
    ctx.fillStyle = '#0f3460';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 画蛇
    ctx.fillStyle = '#4ecca3';
    for (let i = 0; i < snake.length; i++) {
        const segment = snake[i];
        ctx.fillRect(segment.x * gridSize, segment.y * gridSize, gridSize - 2, gridSize - 2);
    }

    // 画食物
    ctx.fillStyle = '#e94560';
    ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize - 2, gridSize - 2);
}

function gameOver() {
    gameRunning = false;
    clearInterval(gameInterval);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('游戏结束', canvas.width / 2, canvas.height / 2);
    ctx.font = '20px Arial';
    ctx.fillText('得分: ' + score, canvas.width / 2, canvas.height / 2 + 40);
}

// 键盘控制
document.addEventListener('keydown', (e) => {
    if (!gameRunning) return;
    const key = e.key;
    // 防止反向移动
    if ((key === 'ArrowUp' || key === 'w' || key === 'W') && direction.y === 0) {
        direction = {x: 0, y: -1};
    } else if ((key === 'ArrowDown' || key === 's' || key === 'S') && direction.y === 0) {
        direction = {x: 0, y: 1};
    } else if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && direction.x === 0) {
        direction = {x: -1, y: 0};
    } else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && direction.x === 0) {
        direction = {x: 1, y: 0};
    }
});

// 重新开始
restartBtn.addEventListener('click', initGame);

// 启动游戏
initGame();