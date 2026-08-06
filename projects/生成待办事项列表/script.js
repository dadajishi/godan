// 获取DOM元素
const todoInput = document.getElementById('todo-input');
const addBtn = document.getElementById('add-btn');
const todoList = document.getElementById('todo-list');
const itemCount = document.getElementById('item-count');
const clearCompletedBtn = document.getElementById('clear-completed');

// 从localStorage加载待办事项，如果没有则初始化为空数组
let todos = JSON.parse(localStorage.getItem('todos')) || [];

// 渲染待办事项列表
function renderTodos() {
  todoList.innerHTML = '';
  todos.forEach((todo, index) => {
    const li = document.createElement('li');
    li.className = 'todo-item' + (todo.completed ? ' completed' : '');
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'todo-checkbox';
    checkbox.checked = todo.completed;
    checkbox.addEventListener('change', () => toggleTodo(index));
    
    const span = document.createElement('span');
    span.className = 'todo-text';
    span.textContent = todo.text;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = '删除';
    deleteBtn.addEventListener('click', () => deleteTodo(index));
    
    li.appendChild(checkbox);
    li.appendChild(span);
    li.appendChild(deleteBtn);
    todoList.appendChild(li);
  });
  
  updateCount();
}

// 更新待办事项数量
function updateCount() {
  const remaining = todos.filter(todo => !todo.completed).length;
  itemCount.textContent = remaining + ' 项待办';
}

// 添加新待办事项
function addTodo() {
  const text = todoInput.value.trim();
  if (text === '') {
    alert('请输入待办事项内容');
    return;
  }
  todos.push({ text: text, completed: false });
  todoInput.value = '';
  saveTodos();
  renderTodos();
}

// 切换待办事项完成状态
function toggleTodo(index) {
  todos[index].completed = !todos[index].completed;
  saveTodos();
  renderTodos();
}

// 删除待办事项
function deleteTodo(index) {
  todos.splice(index, 1);
  saveTodos();
  renderTodos();
}

// 清除所有已完成事项
function clearCompleted() {
  todos = todos.filter(todo => !todo.completed);
  saveTodos();
  renderTodos();
}

// 保存到localStorage
function saveTodos() {
  localStorage.setItem('todos', JSON.stringify(todos));
}

// 事件监听
addBtn.addEventListener('click', addTodo);
todoInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    addTodo();
  }
});
clearCompletedBtn.addEventListener('click', clearCompleted);

// 初始化渲染
renderTodos();