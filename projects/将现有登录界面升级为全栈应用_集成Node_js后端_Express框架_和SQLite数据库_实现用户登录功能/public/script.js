document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const loginContainer = document.querySelector('.form-container');
  const registerContainer = document.getElementById('registerContainer');
  const welcomeContainer = document.getElementById('welcomeContainer');
  const showRegister = document.getElementById('showRegister');
  const showLogin = document.getElementById('showLogin');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginError = document.getElementById('loginError');
  const registerError = document.getElementById('registerError');
  const welcomeUsername = document.getElementById('welcomeUsername');

  // Check current user on load
  fetch('/api/current-user')
    .then(res => {
      if (res.ok) return res.json();
      throw new Error('Not authenticated');
    })
    .then(data => {
      showWelcome(data.user.username);
    })
    .catch(() => {
      showLoginForm();
    });

  // Switch to register form
  showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'block';
    welcomeContainer.style.display = 'none';
    clearErrors();
  });

  // Switch to login form
  showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.style.display = 'block';
    registerContainer.style.display = 'none';
    welcomeContainer.style.display = 'none';
    clearErrors();
  });

  // Login form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
      loginError.textContent = 'Please fill in all fields';
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
        showWelcome(data.user.username);
      } else {
        loginError.textContent = data.message;
      }
    } catch (err) {
      loginError.textContent = 'Network error, please try again';
    }
  });

  // Register form submission
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;

    if (!username || !password || !confirm) {
      registerError.textContent = 'Please fill in all fields';
      return;
    }

    if (password !== confirm) {
      registerError.textContent = 'Passwords do not match';
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
        alert('Registration successful! Please login.');
        showLoginForm();
        document.getElementById('loginUsername').value = username;
        document.getElementById('loginPassword').value = '';
      } else {
        registerError.textContent = data.message;
      }
    } catch (err) {
      registerError.textContent = 'Network error, please try again';
    }
  });

  // Logout
  logoutBtn.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      showLoginForm();
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';
    } catch (err) {
      console.error('Logout error:', err);
    }
  });

  // Helper functions
  function showWelcome(username) {
    loginContainer.style.display = 'none';
    registerContainer.style.display = 'none';
    welcomeContainer.style.display = 'block';
    welcomeUsername.textContent = username;
    clearErrors();
  }

  function showLoginForm() {
    loginContainer.style.display = 'block';
    registerContainer.style.display = 'none';
    welcomeContainer.style.display = 'none';
    clearErrors();
  }

  function clearErrors() {
    loginError.textContent = '';
    registerError.textContent = '';
  }
});