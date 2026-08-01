// 番茄钟逻辑
let timerInterval = null;
let timeLeft = 25 * 60; // 25分钟
let isRunning = false;

const timeDisplay = document.getElementById('time-display');
const startBtn = document.getElementById('start-btn');
const resetBtn = document.getElementById('reset-btn');

function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (isRunning) return;
    isRunning = true;
    startBtn.textContent = '暂停';
    timerInterval = setInterval(() => {
        if (timeLeft > 0) {
            timeLeft--;
            updateDisplay();
        } else {
            clearInterval(timerInterval);
            isRunning = false;
            startBtn.textContent = '开始';
            alert('番茄钟完成！休息一下吧！');
            // 自动重置
            timeLeft = 25 * 60;
            updateDisplay();
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
const taskInput = document.getElementById('task-input');
const addTaskBtn = document.getElementById('add-task-btn');
const taskList = document.getElementById('task-list');

let tasks = [];

// 从localStorage加载任务
function loadTasks() {
    const storedTasks = localStorage.getItem('tasks');
    if (storedTasks) {
        tasks = JSON.parse(storedTasks);
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
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'empty-message';
        emptyMessage.textContent = '暂无任务，添加一个吧！';
        taskList.appendChild(emptyMessage);
        return;
    }

    tasks.forEach((task, index) => {
        const li = document.createElement('li');
        li.dataset.index = index;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', () => toggleTask(index));

        const span = document.createElement('span');
        span.className = 'task-text';
        if (task.completed) {
            span.classList.add('completed');
        }
        span.textContent = task.text;

        const actions = document.createElement('div');
        actions.className = 'task-actions';

        const completeBtn = document.createElement('button');
        completeBtn.className = 'complete-btn';
        completeBtn.textContent = task.completed ? '↩' : '✓';
        completeBtn.title = task.completed ? '取消完成' : '标记完成';
        completeBtn.addEventListener('click', () => toggleTask(index));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.title = '删除任务';
        deleteBtn.addEventListener('click', () => deleteTask(index));

        actions.appendChild(completeBtn);
        actions.appendChild(deleteBtn);

        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(actions);

        taskList.appendChild(li);
    });
}

// 添加任务
function addTask() {
    const text = taskInput.value.trim();
    if (text === '') {
        alert('请输入任务内容！');
        return;
    }
    tasks.push({ text: text, completed: false });
    saveTasks();
    renderTasks();
    taskInput.value = '';
    taskInput.focus();
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