// 智能待办事项应用
// 使用localStorage存储数据，支持优先级、筛选、统计等功能

// ===== 数据模型 =====
// 任务对象结构：{ id: number, text: string, completed: boolean, priority: 'low'|'medium'|'high', createdAt: string }

// ===== 状态管理 =====
let tasks = [];
let currentFilter = 'all'; // 'all' | 'active' | 'completed'

// ===== DOM元素 =====
const taskInput = document.getElementById('taskInput');
const prioritySelect = document.getElementById('prioritySelect');
const addBtn = document.getElementById('addBtn');
const taskList = document.getElementById('taskList');
const taskCount = document.getElementById('taskCount');
const completedCount = document.getElementById('completedCount');
const filterBtns = document.querySelectorAll('.filter-btn');

// ===== 初始化 =====
function init() {
    loadTasks();
    render();
}

// ===== 数据持久化 =====
function loadTasks() {
    const stored = localStorage.getItem('smartTodoTasks');
    if (stored) {
        try {
            tasks = JSON.parse(stored);
        } catch (e) {
            tasks = [];
        }
    } else {
        // 默认示例数据
        tasks = [
            { id: 1, text: '完成项目报告', completed: false, priority: 'high', createdAt: new Date().toISOString() },
            { id: 2, text: '购买日常用品', completed: false, priority: 'medium', createdAt: new Date().toISOString() },
            { id: 3, text: '阅读30分钟', completed: true, priority: 'low', createdAt: new Date().toISOString() }
        ];
        saveTasks();
    }
}

function saveTasks() {
    localStorage.setItem('smartTodoTasks', JSON.stringify(tasks));
}

// ===== 任务操作 =====
function addTask() {
    const text = taskInput.value.trim();
    if (!text) {
        alert('请输入任务内容！');
        return;
    }
    
    const newTask = {
        id: Date.now(),
        text: text,
        completed: false,
        priority: prioritySelect.value,
        createdAt: new Date().toISOString()
    };
    
    tasks.unshift(newTask);
    saveTasks();
    render();
    
    // 清空输入框并聚焦
    taskInput.value = '';
    taskInput.focus();
}

function toggleTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveTasks();
        render();
    }
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    render();
}

// ===== 筛选 =====
function setFilter(filter) {
    currentFilter = filter;
    // 更新按钮样式
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    render();
}

function getFilteredTasks() {
    switch (currentFilter) {
        case 'active':
            return tasks.filter(t => !t.completed);
        case 'completed':
            return tasks.filter(t => t.completed);
        default:
            return tasks;
    }
}

// ===== 渲染 =====
function render() {
    const filteredTasks = getFilteredTasks();
    
    // 清空列表
    taskList.innerHTML = '';
    
    if (filteredTasks.length === 0) {
        const emptyMsg = document.createElement('li');
        emptyMsg.textContent = '暂无任务，添加一个吧！';
        emptyMsg.style.textAlign = 'center';
        emptyMsg.style.color = '#999';
        emptyMsg.style.padding = '20px';
        taskList.appendChild(emptyMsg);
    } else {
        filteredTasks.forEach(task => {
            const li = document.createElement('li');
            li.className = `task-item ${task.completed ? 'completed' : ''}`;
            li.dataset.id = task.id;
            
            // 复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'task-checkbox';
            checkbox.checked = task.completed;
            checkbox.addEventListener('change', () => toggleTask(task.id));
            
            // 优先级标签
            const priorityBadge = document.createElement('span');
            priorityBadge.className = `priority-badge priority-${task.priority}`;
            const priorityText = {
                low: '低',
                medium: '中',
                high: '高'
            }[task.priority] || '中';
            priorityBadge.textContent = priorityText;
            
            // 任务文本
            const textSpan = document.createElement('span');
            textSpan.className = 'task-text';
            textSpan.textContent = task.text;
            
            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.title = '删除任务';
            deleteBtn.addEventListener('click', () => deleteTask(task.id));
            
            li.appendChild(checkbox);
            li.appendChild(priorityBadge);
            li.appendChild(textSpan);
            li.appendChild(deleteBtn);
            
            taskList.appendChild(li);
        });
    }
    
    // 更新统计
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    taskCount.textContent = total;
    completedCount.textContent = completed;
}

// ===== 事件监听 =====
addBtn.addEventListener('click', addTask);
taskInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTask();
    }
});

filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        setFilter(btn.dataset.filter);
    });
});

// ===== 启动应用 =====
init();