const gameArea = document.getElementById('game-area');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const restartBtn = document.getElementById('restart-btn');

let score = 0;
let timeLeft = 30;
let gameActive = false;
let timerInterval = null;
let bubbleInterval = null;

const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff9f43', '#a29bfe', '#fd79a8'];

function createBubble() {
    if (!gameActive) return;
    
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    
    const size = Math.random() * 60 + 30; // 30-90px
    const x = Math.random() * (gameArea.clientWidth - size);
    const y = Math.random() * (gameArea.clientHeight - size);
    
    bubble.style.width = size + 'px';
    bubble.style.height = size + 'px';
    bubble.style.left = x + 'px';
    bubble.style.top = y + 'px';
    bubble.style.background = `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), ${colors[Math.floor(Math.random() * colors.length)]} 60%, transparent)`;
    
    bubble.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!gameActive) return;
        
        score++;
        scoreDisplay.textContent = score;
        
        this.classList.add('popped');
        setTimeout(() => {
            this.remove();
        }, 300);
        
        // 添加音效（可选，用Web Audio API生成简单音效）
        playPopSound();
    });
    
    gameArea.appendChild(bubble);
    
    // 自动消失（如果没被点击）
    setTimeout(() => {
        if (bubble.parentNode) {
            bubble.remove();
        }
    }, 3000);
}

function playPopSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
        // 忽略音频错误
    }
}

function startGame() {
    // 重置状态
    score = 0;
    timeLeft = 30;
    gameActive = true;
    scoreDisplay.textContent = '0';
    timerDisplay.textContent = '30';
    
    // 清除之前的泡泡和定时器
    gameArea.innerHTML = '';
    if (timerInterval) clearInterval(timerInterval);
    if (bubbleInterval) clearInterval(bubbleInterval);
    
    // 开始生成泡泡
    bubbleInterval = setInterval(createBubble, 500);
    
    // 倒计时
    timerInterval = setInterval(() => {
        timeLeft--;
        timerDisplay.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000);
}

function endGame() {
    gameActive = false;
    clearInterval(timerInterval);
    clearInterval(bubbleInterval);
    
    // 清除所有泡泡
    gameArea.innerHTML = '';
    
    // 显示结果
    const result = document.createElement('div');
    result.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 2rem; color: #333; text-align: center;';
    result.innerHTML = `游戏结束！<br>最终得分: ${score}`;
    gameArea.appendChild(result);
}

restartBtn.addEventListener('click', startGame);

// 页面加载时自动开始
startGame();