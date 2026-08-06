const display = document.getElementById('display');
let currentInput = '';
let previousInput = '';
let operator = null;
let shouldResetDisplay = false;

function updateDisplay(value) {
  display.textContent = value || '0';
}

function inputNumber(num) {
  if (shouldResetDisplay) {
    currentInput = '';
    shouldResetDisplay = false;
  }
  if (currentInput.includes('.') && num === '.') return;
  if (currentInput === '0' && num !== '.') {
    currentInput = num;
  } else {
    currentInput += num;
  }
  updateDisplay(currentInput);
}

function inputOperator(op) {
  if (currentInput === '' && previousInput === '') return;
  if (currentInput === '' && previousInput !== '') {
    operator = op;
    return;
  }
  if (previousInput !== '' && operator && currentInput !== '') {
    const result = calculate(previousInput, currentInput, operator);
    previousInput = String(result);
    currentInput = '';
    updateDisplay(previousInput);
  } else {
    previousInput = currentInput;
    currentInput = '';
  }
  operator = op;
  shouldResetDisplay = false;
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

function clearAll() {
  currentInput = '';
  previousInput = '';
  operator = null;
  shouldResetDisplay = false;
  updateDisplay('0');
}

function toggleSign() {
  if (currentInput === '') return;
  currentInput = String(-parseFloat(currentInput));
  updateDisplay(currentInput);
}

function percent() {
  if (currentInput === '') return;
  currentInput = String(parseFloat(currentInput) / 100);
  updateDisplay(currentInput);
}

function decimal() {
  if (shouldResetDisplay) {
    currentInput = '0';
    shouldResetDisplay = false;
  }
  if (!currentInput.includes('.')) {
    currentInput += '.';
    updateDisplay(currentInput);
  }
}

function equals() {
  if (previousInput === '' || currentInput === '' || operator === null) return;
  const result = calculate(previousInput, currentInput, operator);
  updateDisplay(result);
  previousInput = '';
  currentInput = String(result);
  operator = null;
  shouldResetDisplay = true;
}

document.querySelectorAll('.btn').forEach(button => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    const value = button.dataset.value;
    if (action) {
      switch (action) {
        case 'clear': clearAll(); break;
        case 'sign': toggleSign(); break;
        case 'percent': percent(); break;
        case 'decimal': decimal(); break;
        case 'equals': equals(); break;
        case 'add':
        case 'subtract':
        case 'multiply':
        case 'divide': inputOperator(action); break;
      }
    } else if (value !== undefined) {
      inputNumber(value);
    }
  });
});

// Keyboard support
document.addEventListener('keydown', (e) => {
  const key = e.key;
  if (key >= '0' && key <= '9') {
    inputNumber(key);
  } else if (key === '.') {
    decimal();
  } else if (key === '+') {
    inputOperator('add');
  } else if (key === '-') {
    inputOperator('subtract');
  } else if (key === '*') {
    inputOperator('multiply');
  } else if (key === '/') {
    e.preventDefault();
    inputOperator('divide');
  } else if (key === 'Enter' || key === '=') {
    equals();
  } else if (key === 'Escape') {
    clearAll();
  } else if (key === '%') {
    percent();
  }
});