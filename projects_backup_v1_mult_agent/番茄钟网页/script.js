const timerDisplay = document.getElementById('timerDisplay');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const statusEl = document.getElementById('status');
const sessionCountEl = document.getElementById('sessionCount');
const modeBtns = document.querySelectorAll('.mode-btn');

const MODES = {
    work: { duration: 25 * 60, label: '工作' },
    shortBreak: { duration: 5 * 60, label: '短休' },
    longBreak: { duration: 15 * 60, label: '长休' }
};

let currentMode = 'work';
let timeLeft = MODES[currentMode].duration;
let timerId = null;
let isRunning = false;
let sessionCount = 0;

function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    document.title = `${timerDisplay.textContent} - 番茄钟`;
}

function setMode(mode) {
    if (isRunning) {
        pauseTimer();
    }
    currentMode = mode;
    timeLeft = MODES[mode].duration;
    updateDisplay();
    statusEl.textContent = `准备${MODES[mode].label}`;
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    startBtn.disabled = false;
    pauseBtn.disabled = true;
}

function startTimer() {
    if (isRunning) return;
    if (timeLeft <= 0) {
        timeLeft = MODES[currentMode].duration;
    }
    isRunning = true;
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    statusEl.textContent = `${MODES[currentMode].label}进行中...`;
    timerId = setInterval(() => {
        timeLeft--;
        updateDisplay();
        if (timeLeft <= 0) {
            clearInterval(timerId);
            timerId = null;
            isRunning = false;
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            if (currentMode === 'work') {
                sessionCount++;
                sessionCountEl.textContent = sessionCount;
                statusEl.textContent = '工作完成！休息一下吧';
                // 自动切换到短休
                setMode('shortBreak');
            } else {
                statusEl.textContent = '休息结束！开始工作吧';
                setMode('work');
            }
        }
    }, 1000);
}

function pauseTimer() {
    if (!isRunning) return;
    clearInterval(timerId);
    timerId = null;
    isRunning = false;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    statusEl.textContent = '已暂停';
}

function resetTimer() {
    pauseTimer();
    timeLeft = MODES[currentMode].duration;
    updateDisplay();
    statusEl.textContent = `准备${MODES[currentMode].label}`;
}

startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
    });
});

// 初始化
updateDisplay();
statusEl.textContent = '准备开始';