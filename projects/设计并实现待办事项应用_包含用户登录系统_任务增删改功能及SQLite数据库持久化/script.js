// ===== SQLite 数据库初始化 =====
let db = null;
let dbReady = false;
let currentUser = null;

// 初始化 SQLite
async function initDB() {
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
        });
        db = new SQL.Database();
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        `);
        dbReady = true;
        console.log('SQLite 数据库初始化成功');
    } catch (err) {
        console.error('数据库初始化失败:', err);
        alert('数据库初始化失败，请检查网络连接');
    }
}

// ===== 数据库操作辅助函数 =====
function dbRun(sql, params = []) {
    if (!dbReady) return;
    const stmt = db.prepare(sql);
    stmt.run(params);
    stmt.free();
}

function dbGet(sql, params = []) {
    if (!dbReady) return null;
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const result = stmt.getAsObject();
    stmt.free();
    return result;
}

function dbAll(sql, params = []) {
    if (!dbReady) return [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

// ===== 用户认证 =====
function registerUser(username, password) {
    if (!username || !password) {
        return { success: false, message: '用户名和密码不能为空' };
    }
    // 检查用户是否已存在
    const existing = dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (existing && existing.id) {
        return { success: false, message: '用户名已存在' };
    }
    // 插入新用户
    dbRun('INSERT INTO users (username, password) VALUES (?, ?)', [username, password]);
    return { success: true, message: '注册成功，请登录' };
}

function loginUser(username, password) {
    if (!username || !password) {
        return { success: false, message: '用户名和密码不能为空' };
    }
    const user = dbGet('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (user && user.id) {
        return { success: true, user: user };
    }
    return { success: false, message: '用户名或密码错误' };
}

// ===== 任务操作 =====
function getTasks(userId) {
    return dbAll('SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC', [userId]);
}

function addTask(userId, text) {
    if (!text.trim()) return;
    dbRun('INSERT INTO tasks (user_id, text, completed) VALUES (?, ?, 0)', [userId, text.trim()]);
}

function updateTask(taskId, newText) {
    if (!newText.trim()) return;
    dbRun('UPDATE tasks SET text = ? WHERE id = ?', [newText.trim(), taskId]);
}

function deleteTask(taskId) {
    dbRun('DELETE FROM tasks WHERE id = ?', [taskId]);
}

function toggleTask(taskId, completed) {
    dbRun('UPDATE tasks SET completed = ? WHERE id = ?', [completed ? 1 : 0, taskId]);
}

// ===== UI 渲染 =====
function showLogin() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('todo-section').style.display = 'none';
    document.getElementById('login-message').textContent = '';
}

function showTodo() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('todo-section').style.display = 'block';
    document.getElementById('current-user').textContent = currentUser.username;
    renderTasks();
}

function renderTasks() {
    const list = document.getElementById('todo-list');
    list.innerHTML = '';
    const tasks = getTasks(currentUser.id);
    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'todo-item' + (task.completed ? ' completed' : '');
        li.dataset.id = task.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'todo-checkbox';
        checkbox.checked = !!task.completed;
        checkbox.addEventListener('change', () => {
            toggleTask(task.id, checkbox.checked);
            li.classList.toggle('completed', checkbox.checked);
        });

        const span = document.createElement('span');
        span.className = 'todo-text';
        span.textContent = task.text;

        const actions = document.createElement('div');
        actions.className = 'todo-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'edit-btn';
        editBtn.textContent = '编辑';
        editBtn.addEventListener('click', () => {
            const newText = prompt('编辑任务:', task.text);
            if (newText !== null && newText.trim()) {
                updateTask(task.id, newText);
                renderTasks();
            }
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => {
            if (confirm('确定删除该任务？')) {
                deleteTask(task.id);
                renderTasks();
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(deleteBtn);
        li.appendChild(checkbox);
        li.appendChild(span);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

// ===== 事件绑定 =====
document.addEventListener('DOMContentLoaded', async () => {
    await initDB();
    if (!dbReady) return;

    // 登录按钮
    document.getElementById('login-btn').addEventListener('click', () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const result = loginUser(username, password);
        if (result.success) {
            currentUser = result.user;
            document.getElementById('login-username').value = '';
            document.getElementById('login-password').value = '';
            showTodo();
        } else {
            document.getElementById('login-message').textContent = result.message;
        }
    });

    // 注册按钮
    document.getElementById('register-btn').addEventListener('click', () => {
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const result = registerUser(username, password);
        document.getElementById('login-message').textContent = result.message;
    });

    // 退出登录
    document.getElementById('logout-btn').addEventListener('click', () => {
        currentUser = null;
        showLogin();
    });

    // 添加任务
    document.getElementById('add-btn').addEventListener('click', () => {
        const input = document.getElementById('todo-input');
        const text = input.value.trim();
        if (text) {
            addTask(currentUser.id, text);
            input.value = '';
            renderTasks();
        }
    });

    // 回车添加任务
    document.getElementById('todo-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('add-btn').click();
        }
    });

    // 初始显示登录界面
    showLogin();
});