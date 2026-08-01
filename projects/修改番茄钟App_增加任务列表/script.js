// 番茄钟逻辑
let timerInterval = null;
let timeLeft = 25 * 60; // 25分钟
let isRunning = false;

const timeDisplay = document.getElementById('time');
const startBtn = document.getElementById('startBtn');
const resetBtn = document.getElementById('resetBtn');

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateDisplay() {
    timeDisplay.textContent = formatTime(timeLeft);
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
            timeLeft = 25 * 60;
            updateDisplay();
            alert('番茄钟完成！休息一下吧！');
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
    timeLeft = 25 * 60;
    updateDisplay();
    startBtn.textContent = '开始';
}

startBtn.addEventListener('click', () => {
    if (isRunning) {
        pauseTimer();
    } else {
        startTimer();
    }
});

resetBtn.addEventListener('click', resetTimer);

// 任务列表逻辑
const taskInput = document.getElementById('taskInput');
const addTaskBtn = document.getElementById('addTaskBtn');
const taskList = document.getElementById('taskList');

let tasks = [];

// 从localStorage加载任务
function loadTasks() {
    const stored = localStorage.getItem('tasks');
    if (stored) {
        try {
            tasks = JSON.parse(stored);
        } catch (e) {
            tasks = [];
        }
    }
}

// 保存任务到localStorage
function saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(tasks));
}

// 渲染任务列表
function renderTasks() {
    taskList.innerHTML = '';
    if (tasks.length === 0) {
        const li = document.createElement('li');
        li.textContent = '暂无任务，添加一个吧！';
        li.className = 'empty-message';
        taskList.appendChild(li);
        return;
    }

    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        if (task.completed) {
            li.classList.add('completed');
        }

        const span = document.createElement('span');
        span.className = 'task-text';
        span.textContent = task.text;
        span.addEventListener('click', () => toggleTask(index));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTask(index);
        });

        li.appendChild(span);
        li.appendChild(deleteBtn);
        taskList.appendChild(li);
    });
}

// 添加任务
function addTask() {
    const text = taskInput.value.trim();
    if (text === '') {
        alert('请输入任务内容');
        return;
    }
    tasks.push({ text: text, completed: false });
    taskInput.value = '';
    saveTasks();
    renderTasks();
}

// 切换任务完成状态
function toggleTask(index) {
    tasks[index].completed = !tasks[index].completed;
    saveTasks();
    renderTasks();
}

// 删除任务
function deleteTask(index) {
    tasks.splice(index, 1);
    saveTasks();
    renderTasks();
}

addTaskBtn.addEventListener('click', addTask);
taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTask();
    }
});

// 初始化
loadTasks();
renderTasks();
updateDisplay();