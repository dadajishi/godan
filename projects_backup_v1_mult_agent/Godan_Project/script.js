// 番茄钟逻辑
let timerInterval = null;
let timeLeft = 25 * 60; // 默认25分钟
let isRunning = false;
let isWorkMode = true;
let isDarkMode = getInitialMode();

const timerDisplay = document.getElementById('timer');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const modeLabel = document.getElementById('modeLabel');
const workInput = document.getElementById('workInput');
const breakInput = document.getElementById('breakInput');
const themeToggle = document.getElementById('themeToggle');

function getInitialMode() {
    const saved = localStorage.getItem('tomato-theme');
    return saved === 'dark' ? true : false;
}

function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function switchMode() {
    isWorkMode = !isWorkMode;
    if (isWorkMode) {
        timeLeft = parseInt(workInput.value) * 60;
        modeLabel.textContent = '工作';
        document.title = '番茄钟 - 工作';
    } else {
        timeLeft = parseInt(breakInput.value) * 60;
        modeLabel.textContent = '休息';
        document.title = '番茄钟 - 休息';
    }
    updateDisplay();
}

function startTimer() {
    if (isRunning) return;
    isRunning = true;
    startBtn.textContent = '暂停';
    timerInterval = setInterval(() => {
        timeLeft--;
        updateDisplay();
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.textContent = '开始';
            // 自动切换模式
            switchMode();
            // 可以播放提示音（这里用alert模拟）
            alert(isWorkMode ? '工作结束，开始休息！' : '休息结束，开始工作！');
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = '开始';
}

function resetTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = '开始';
    isWorkMode = true;
    timeLeft = parseInt(workInput.value) * 60;
    modeLabel.textContent = '工作';
    updateDisplay();
}

function applyTheme() {
    document.body.classList.toggle('dark-mode', isDarkMode);
    localStorage.setItem('tomato-theme', isDarkMode ? 'dark' : 'light');
}

function toggleTheme() {
    isDarkMode = !isDarkMode;
    applyTheme();
}

startBtn.addEventListener('click', () => {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
});

resetBtn.addEventListener('click', resetTimer);

themeToggle.addEventListener('click', toggleTheme);

// 当输入改变时，如果不在运行状态，更新显示
workInput.addEventListener('change', () => {
    if (!isRunning && isWorkMode) {
        timeLeft = parseInt(workInput.value) * 60;
        updateDisplay();
    }
});

breakInput.addEventListener('change', () => {
    if (!isRunning && !isWorkMode) {
        timeLeft = parseInt(breakInput.value) * 60;
        updateDisplay();
    }
});

// 初始化
updateDisplay();
applyTheme();