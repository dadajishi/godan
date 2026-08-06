const display = document.getElementById('display');
let currentInput = '';
let previousInput = '';
let operator = null;
let shouldResetDisplay = false;

function updateDisplay(value) {
  display.textContent = value || '0';
}

function handleNumber(value) {
  if (shouldResetDisplay) {
    currentInput = '';
    shouldResetDisplay = false;
  }
  if (value === '.' && currentInput.includes('.')) return;
  currentInput += value;
  updateDisplay(currentInput);
}

function handleOperator(op) {
  if (operator && currentInput !== '' && !shouldResetDisplay) {
    const result = calculate(previousInput, currentInput, operator);
    previousInput = result.toString();
    updateDisplay(previousInput);
    currentInput = '';
  } else {
    previousInput = currentInput || previousInput;
  }
  operator = op;
  shouldResetDisplay = true;
}

function calculate(a, b, op) {
  const num1 = parseFloat(a);
  const num2 = parseFloat(b);
  switch (op) {
    case 'add': return num1 + num2;
    case 'subtract': return num1 - num2;
    case 'multiply': return num1 * num2;
    case 'divide': return num2 !== 0 ? num1 / num2 : 'Error';
    default: return num2;
  }
}

function handleEquals() {
  if (operator && currentInput !== '' && previousInput !== '') {
    const result = calculate(previousInput, currentInput, operator);
    updateDisplay(result);
    previousInput = result.toString();
    currentInput = '';
    operator = null;
    shouldResetDisplay = true;
  }
}

function handleClear() {
  currentInput = '';
  previousInput = '';
  operator = null;
  shouldResetDisplay = false;
  updateDisplay('0');
}

function handleBackspace() {
  if (shouldResetDisplay) return;
  currentInput = currentInput.slice(0, -1);
  updateDisplay(currentInput || '0');
}

function handlePercent() {
  if (currentInput !== '') {
    const value = parseFloat(currentInput) / 100;
    currentInput = value.toString();
    updateDisplay(currentInput);
  }
}

document.querySelectorAll('.btn').forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    const value = button.dataset.value;
    if (value !== undefined) {
      handleNumber(value);
    } else if (action) {
      switch (action) {
        case 'clear': handleClear(); break;
        case 'backspace': handleBackspace(); break;
        case 'percent': handlePercent(); break;
        case 'add':
        case 'subtract':
        case 'multiply':
        case 'divide': handleOperator(action); break;
        case 'equals': handleEquals(); break;
      }
    }
  });
});

// Keyboard support
document.addEventListener('keydown', (e) => {
  const key = e.key;
  if (key >= '0' && key <= '9' || key === '.') {
    handleNumber(key);
  } else if (key === '+') {
    handleOperator('add');
  } else if (key === '-') {
    handleOperator('subtract');
  } else if (key === '*') {
    handleOperator('multiply');
  } else if (key === '/') {
    e.preventDefault();
    handleOperator('divide');
  } else if (key === 'Enter' || key === '=') {
    handleEquals();
  } else if (key === 'Backspace') {
    handleBackspace();
  } else if (key === 'Escape') {
    handleClear();
  } else if (key === '%') {
    handlePercent();
  }
});