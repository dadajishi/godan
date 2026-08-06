const display = document.getElementById('display');
let currentInput = '';
let previousInput = '';
let operator = null;
let shouldResetDisplay = false;

function updateDisplay(value) {
    display.value = value;
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
        const result = calculate(parseFloat(previousInput), parseFloat(currentInput), operator);
        previousInput = String(result);
        updateDisplay(previousInput);
    } else {
        previousInput = currentInput || previousInput;
    }
    operator = op;
    shouldResetDisplay = true;
}

function calculate(a, b, op) {
    switch(op) {
        case 'add': return a + b;
        case 'subtract': return a - b;
        case 'multiply': return a * b;
        case 'divide': return b !== 0 ? a / b : 'Error';
        default: return b;
    }
}

function handleEquals() {
    if (operator === null || currentInput === '' || shouldResetDisplay) return;
    const result = calculate(parseFloat(previousInput), parseFloat(currentInput), operator);
    updateDisplay(result);
    previousInput = '';
    currentInput = String(result);
    operator = null;
    shouldResetDisplay = true;
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

document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', () => {
        const value = button.dataset.value;
        const action = button.dataset.action;
        if (value !== undefined) {
            handleNumber(value);
        } else if (action) {
            switch(action) {
                case 'clear': handleClear(); break;
                case 'backspace': handleBackspace(); break;
                case 'add':
                case 'subtract':
                case 'multiply':
                case 'divide': handleOperator(action); break;
                case 'equals': handleEquals(); break;
            }
        }
    });
});

// 键盘支持
document.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key >= '0' && key <= '9' || key === '.') {
        handleNumber(key);
    } else if (key === '+' || key === '-' || key === '*' || key === '/') {
        const actionMap = { '+': 'add', '-': 'subtract', '*': 'multiply', '/': 'divide' };
        handleOperator(actionMap[key]);
    } else if (key === 'Enter' || key === '=') {
        handleEquals();
    } else if (key === 'Backspace') {
        handleBackspace();
    } else if (key === 'Escape') {
        handleClear();
    }
});