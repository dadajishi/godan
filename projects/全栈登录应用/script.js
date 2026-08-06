// DOM Elements
const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const messageDiv = document.getElementById('message');

// Tab switching
loginTab.addEventListener('click', () => {
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  clearMessage();
});

registerTab.addEventListener('click', () => {
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  clearMessage();
});

// Helper functions
function showMessage(text, type) {
  messageDiv.textContent = text;
  messageDiv.className = 'message ' + type;
}

function clearMessage() {
  messageDiv.textContent = '';
  messageDiv.className = 'message';
}

// Login form submission
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value.trim();

  if (!username || !password) {
    showMessage('请输入用户名和密码', 'error');
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (response.ok) {
      showMessage('登录成功！欢迎 ' + data.user.username, 'success');
      loginForm.reset();
    } else {
      showMessage(data.message || '登录失败', 'error');
    }
  } catch (error) {
    showMessage('网络错误，请稍后重试', 'error');
  }
});

// Register form submission
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value.trim();
  const password = document.getElementById('registerPassword').value.trim();
  const confirm = document.getElementById('registerConfirm').value.trim();

  if (!username || !password || !confirm) {
    showMessage('请填写所有字段', 'error');
    return;
  }

  if (password !== confirm) {
    showMessage('两次输入的密码不一致', 'error');
    return;
  }

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (response.ok) {
      showMessage('注册成功！请登录', 'success');
      registerForm.reset();
      // Switch to login tab
      loginTab.click();
    } else {
      showMessage(data.message || '注册失败', 'error');
    }
  } catch (error) {
    showMessage('网络错误，请稍后重试', 'error');
  }
});