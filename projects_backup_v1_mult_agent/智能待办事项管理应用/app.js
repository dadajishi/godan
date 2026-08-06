// ===== 数据模型 =====
// 使用localStorage持久化存储待办事项
const STORAGE_KEY = 'smart_todo_app';

// 默认示例数据（首次加载时使用）
const DEFAULT_TODOS = [
    {
        id: 1,
        text: '完成项目报告',
        completed: false,
        priority: 'high',
        createdAt: new Date().toISOString()
    },
    {
        id: 2,
        text: '购买日常用品',
        completed: false,
        priority: 'medium',
        createdAt: new Date().toISOString()
    },
    {
        id: 3,
        text: '阅读30分钟',
        completed: true,
        priority: 'low',
        createdAt: new Date().toISOString()
    }
];

// ===== 状态管理 =====
let todos = [];
let currentFilter = 'all';

// ===== DOM元素 =====
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const prioritySelect = document.getElementById('priority-select');
const todoList = document.getElementById('todo-list');
const filterButtons = document.querySelectorAll('.filter-btn');
const totalCount = document.getElementById('total-count');
const completedCount = document.getElementById('completed-count');
const pendingCount = document.getElementById('pending-count');

// ===== 初始化 =====
function init() {
    // 从localStorage加载数据，如果没有则使用默认数据
    const storedTodos = localStorage.getItem(STORAGE_KEY);
    if (storedTodos) {
        try {
            todos = JSON.parse(storedTodos);
        } catch (e) {
            console.error('解析存储数据失败，使用默认数据');
            todos = [...DEFAULT_TODOS];
        }
    } else {
        todos = [...DEFAULT_TODOS];
        saveTodos();
    }

    // 绑定事件
    todoForm.addEventListener('submit', addTodo);
    todoList.addEventListener('click', handleListClick);
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => setFilter(btn.dataset.filter));
    });

    // 渲染
    render();
}

// ===== 数据持久化 =====
function saveTodos() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

// ===== 添加待办 =====
function addTodo(e) {
    e.preventDefault();
    const text = todoInput.value.trim();
    if (!text) return;

    const newTodo = {
        id: Date.now(),
        text: text,
        completed: false,
        priority: prioritySelect.value,
        createdAt: new Date().toISOString()
    };

    todos.unshift(newTodo);
    saveTodos();
    todoInput.value = '';
    render();
}

// ===== 删除/切换完成状态 =====
function handleListClick(e) {
    const target = e.target;
    const todoItem = target.closest('.todo-item');
    if (!todoItem) return;

    const id = parseInt(todoItem.dataset.id);

    // 删除按钮
    if (target.classList.contains('delete-btn')) {
        todos = todos.filter(todo => todo.id !== id);
        saveTodos();
        render();
        return;
    }

    // 复选框切换完成状态
    if (target.classList.contains('todo-checkbox')) {
        const todo = todos.find(t => t.id === id);
        if (todo) {
            todo.completed = target.checked;
            saveTodos();
            render();
        }
    }
}

// ===== 设置筛选 =====
function setFilter(filter) {
    currentFilter = filter;
    filterButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    render();
}

// ===== 获取筛选后的待办 =====
function getFilteredTodos() {
    switch (currentFilter) {
        case 'active':
            return todos.filter(todo => !todo.completed);
        case 'completed':
            return todos.filter(todo => todo.completed);
        default:
            return todos;
    }
}

// ===== 渲染 =====
function render() {
    const filteredTodos = getFilteredTodos();

    // 清空列表
    todoList.innerHTML = '';

    // 如果没有待办事项
    if (filteredTodos.length === 0) {
        const emptyMessage = document.createElement('li');
        emptyMessage.className = 'todo-item';
        emptyMessage.style.justifyContent = 'center';
        emptyMessage.style.color = '#999';
        emptyMessage.textContent = '暂无待办事项';
        todoList.appendChild(emptyMessage);
    } else {
        // 渲染每个待办
        filteredTodos.forEach(todo => {
            const li = document.createElement('li');
            li.className = `todo-item ${todo.completed ? 'completed' : ''}`;
            li.dataset.id = todo.id;

            // 复选框
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'todo-checkbox';
            checkbox.checked = todo.completed;

            // 优先级标签
            const priorityBadge = document.createElement('span');
            priorityBadge.className = `priority-badge priority-${todo.priority}`;
            const priorityText = {
                low: '低',
                medium: '中',
                high: '高'
            };
            priorityBadge.textContent = priorityText[todo.priority] || '中';

            // 文本
            const textSpan = document.createElement('span');
            textSpan.className = 'todo-text';
            textSpan.textContent = todo.text;

            // 删除按钮
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = '删除';

            li.appendChild(checkbox);
            li.appendChild(priorityBadge);
            li.appendChild(textSpan);
            li.appendChild(deleteBtn);

            todoList.appendChild(li);
        });
    }

    // 更新统计信息
    const total = todos.length;
    const completed = todos.filter(t => t.completed).length;
    const pending = total - completed;

    totalCount.textContent = `总计: ${total}`;
    completedCount.textContent = `已完成: ${completed}`;
    pendingCount.textContent = `待完成: ${pending}`;
}

// ===== 启动应用 =====
document.addEventListener('DOMContentLoaded', init);