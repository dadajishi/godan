// 番茄钟逻辑
let timerInterval = null;
let timeLeft = 25 * 60; // 默认25分钟
let currentMode = 'work';
let isRunning = false;

const WORK_TIME = 25 * 60;
const SHORT_BREAK_TIME = 5 * 60;
const LONG_BREAK_TIME = 15 * 60;

const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const modeBtns = document.querySelectorAll('.mode-btn');
const themeToggle = document.getElementById('themeToggle');

// 深色模式切换
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

// 初始化主题
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        // 默认跟随系统
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(prefersDark ? 'dark' : 'light');
    }
}

// 更新显示
function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    minutesDisplay.textContent = String(minutes).padStart(2, '0');
    secondsDisplay.textContent = String(seconds).padStart(2, '0');
}

// 切换模式
function switchMode(mode) {
    currentMode = mode;
    stopTimer();
    switch (mode) {
        case 'work':
            timeLeft = WORK_TIME;
            break;
        case 'shortBreak':
            timeLeft = SHORT_BREAK_TIME;
            break;
        case 'longBreak':
            timeLeft = LONG_BREAK_TIME;
            break;
    }
    updateDisplay();
    // 更新按钮状态
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
}

// 开始/暂停
function toggleTimer() {
    if (isRunning) {
        stopTimer();
        startBtn.textContent = '继续';
    } else {
        startTimer();
        startBtn.textContent = '暂停';
    }
}

function startTimer() {
    if (timeLeft <= 0) return;
    isRunning = true;
    timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay();
        if (timeLeft <= 0) {
            stopTimer();
            startBtn.textContent = '开始';
            // 自动切换到下一个模式（简单处理）
            if (currentMode === 'work') {
                switchMode('shortBreak');
            } else {
                switchMode('work');
            }
            alert('时间到！');
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    isRunning = false;
}

function resetTimer() {
    stopTimer();
    switchMode(currentMode);
    startBtn.textContent = '开始';
}

// 事件监听
startBtn.addEventListener('click', toggleTimer);
resetBtn.addEventListener('click', resetTimer);
themeToggle.addEventListener('click', toggleTheme);

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        switchMode(btn.dataset.mode);
        startBtn.textContent = '开始';
    });
});

// 初始化
initTheme();
updateDisplay();