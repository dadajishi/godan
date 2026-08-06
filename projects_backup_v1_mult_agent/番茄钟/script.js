const timeDisplay = document.getElementById('timeDisplay');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');
const progressCircle = document.getElementById('progress');
const workTimeInput = document.getElementById('workTime');
const shortTimeInput = document.getElementById('shortTime');
const longTimeInput = document.getElementById('longTime');
const sessionCountSpan = document.getElementById('sessionCount');
const modeBtns = document.querySelectorAll('.mode-btn');

let totalTime = 25 * 60;
let remainingTime = totalTime;
let timerInterval = null;
let isRunning = false;
let currentMode = 'work';
let sessionCount = 0;

const CIRCUMFERENCE = 2 * Math.PI * 90;
progressCircle.style.strokeDasharray = CIRCUMFERENCE;
progressCircle.style.strokeDashoffset = 0;

function updateDisplay() {
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    timeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const progress = (totalTime - remainingTime) / totalTime;
    progressCircle.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
}

function setMode(mode) {
    currentMode = mode;
    modeBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    
    let minutes;
    if (mode === 'work') {
        minutes = parseInt(workTimeInput.value) || 25;
        progressCircle.style.stroke = '#e74c3c';
    } else if (mode === 'short') {
        minutes = parseInt(shortTimeInput.value) || 5;
        progressCircle.style.stroke = '#27ae60';
    } else {
        minutes = parseInt(longTimeInput.value) || 15;
        progressCircle.style.stroke = '#2980b9';
    }
    
    totalTime = minutes * 60;
    remainingTime = totalTime;
    stopTimer();
    updateDisplay();
}

function startTimer() {
    if (isRunning) return;
    isRunning = true;
    startBtn.textContent = '暂停';
    timerInterval = setInterval(() => {
        remainingTime--;
        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.textContent = '开始';
            
            if (currentMode === 'work') {
                sessionCount++;
                sessionCountSpan.textContent = sessionCount;
                // 自动切换到短休
                setMode('short');
                alert('专注完成！休息一下吧');
            } else {
                // 休息结束回到专注
                setMode('work');
                alert('休息结束！开始新的专注');
            }
            return;
        }
        updateDisplay();
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    startBtn.textContent = '开始';
}

function resetTimer() {
    stopTimer();
    setMode(currentMode);
}

startBtn.addEventListener('click', () => {
    if (isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
});

resetBtn.addEventListener('click', resetTimer);

modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        setMode(btn.dataset.mode);
    });
});

[workTimeInput, shortTimeInput, longTimeInput].forEach(input => {
    input.addEventListener('change', () => {
        if (!isRunning) {
            setMode(currentMode);
        }
    });
});

// 初始化
setMode('work');