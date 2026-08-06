// 数据库模拟（localStorage）
const DB = {
    // 获取所有用户
    getUsers() {
        const users = localStorage.getItem('todo_users');
        return users ? JSON.parse(users) : [];
    },
    // 保存用户
    saveUsers(users) {
        localStorage.setItem('todo_users', JSON.stringify(users));
    },
    // 获取当前用户的待办事项
    getTodos(username) {
        const todos = localStorage.getItem('todo_todos_' + username);
        return todos ? JSON.parse(todos) : [];
    },
    // 保存待办事项
    saveTodos(username, todos) {
        localStorage.setItem('todo_todos_' + username, JSON.stringify(todos));
    }
};

// 当前登录用户
let currentUser = null;

// DOM 元素
const loginContainer = document.getElementById('login-container');
const registerContainer = document.getElementById('register-container');
const todoContainer = document.getElementById('todo-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const todoForm = document.getElementById('todo-form');
const todoList = document.getElementById('todo-list');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');
const currentUserSpan = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');

// 显示登录界面
function showLoginContainer() {
    loginContainer.style.display = 'block';
    registerContainer.style.display = 'none';
    todoContainer.style.display = 'none';
    loginError.textContent = '';
    registerError.textContent = '';
}

// 显示注册界面
function showRegisterContainer() {
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'block';
    todoContainer.style.display = 'none';
    loginError.textContent = '';
    registerError.textContent = '';
}

// 显示待办事项界面
function showTodoContainer() {
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'none';
    todoContainer.style.display = 'block';
    currentUserSpan.textContent = currentUser;
    renderTodos();
}

// 渲染待办事项列表
function renderTodos() {
    const todos = DB.getTodos(currentUser);
    todoList.innerHTML = '';
    todos.forEach((todo, index) => {
        const li = document.createElement('li');
        li.className = todo.completed ? 'completed' : '';
        
        const span = document.createElement('span');
        span.textContent = todo.text;
        span.addEventListener('click', () => toggleTodo(index));
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删除';
        deleteBtn.addEventListener('click', () => deleteTodo(index));
        
        li.appendChild(span);
        li.appendChild(deleteBtn);
        todoList.appendChild(li);
    });
}

// 登录处理
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    
    const users = DB.getUsers();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        currentUser = username;
        showTodoContainer();
        loginForm.reset();
    } else {
        loginError.textContent = '用户名或密码错误';
    }
});

// 注册处理
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value.trim();
    const password = document.getElementById('register-password').value.trim();
    
    if (!username || !password) {
        registerError.textContent = '用户名和密码不能为空';
        return;
    }
    
    const users = DB.getUsers();
    if (users.some(u => u.username === username)) {
        registerError.textContent = '用户名已存在';
        return;
    }
    
    users.push({ username, password });
    DB.saveUsers(users);
    registerError.textContent = '';
    alert('注册成功，请登录');
    showLoginContainer();
    registerForm.reset();
});

// 添加待办事项
todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('todo-input');
    const text = input.value.trim();
    if (!text) return;
    
    const todos = DB.getTodos(currentUser);
    todos.push({ text, completed: false });
    DB.saveTodos(currentUser, todos);
    input.value = '';
    renderTodos();
});

// 切换完成状态
function toggleTodo(index) {
    const todos = DB.getTodos(currentUser);
    todos[index].completed = !todos[index].completed;
    DB.saveTodos(currentUser, todos);
    renderTodos();
}

// 删除待办事项
function deleteTodo(index) {
    const todos = DB.getTodos(currentUser);
    todos.splice(index, 1);
    DB.saveTodos(currentUser, todos);
    renderTodos();
}

// 退出登录
logoutBtn.addEventListener('click', () => {
    currentUser = null;
    showLoginContainer();
});

// 切换界面事件
showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    showRegisterContainer();
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    showLoginContainer();
});

// 初始化
showLoginContainer();