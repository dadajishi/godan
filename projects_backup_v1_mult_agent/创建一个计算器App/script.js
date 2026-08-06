const display = document.getElementById('display');
let currentInput = '';
let previousInput = '';
let operator = null;
let shouldResetDisplay = false;

function updateDisplay(value) {
    display.textContent = value || '0';
}

function handleNumber(num) {
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

function handleOperator(op) {
    if (currentInput === '' && previousInput === '') return;
    if (currentInput === '' && previousInput !== '') {
        operator = op;
        return;
    }
    if (previousInput !== '' && currentInput !== '' && operator) {
        const result = calculate(previousInput, currentInput, operator);
        previousInput = result;
        currentInput = '';
        updateDisplay(result);
    } else {
        previousInput = currentInput;
        currentInput = '';
    }
    operator = op;
    shouldResetDisplay = true;
}

function calculate(a, b, op) {
    const num1 = parseFloat(a);
    const num2 = parseFloat(b);
    let result;
    switch (op) {
        case '+':
            result = num1 + num2;
            break;
        case '-':
            result = num1 - num2;
            break;
        case '*':
            result = num1 * num2;
            break;
        case '/':
            if (num2 === 0) {
                return 'Error';
            }
            result = num1 / num2;
            break;
        default:
            return b;
    }
    return parseFloat(result.toPrecision(12)).toString();
}

function handleEquals() {
    if (operator === null || currentInput === '' || previousInput === '') return;
    const result = calculate(previousInput, currentInput, operator);
    updateDisplay(result);
    previousInput = '';
    currentInput = result;
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

function handleDelete() {
    if (shouldResetDisplay) return;
    currentInput = currentInput.slice(0, -1);
    updateDisplay(currentInput || '0');
}

function handleDecimal() {
    if (shouldResetDisplay) {
        currentInput = '0';
        shouldResetDisplay = false;
    }
    if (currentInput.includes('.')) return;
    currentInput += '.';
    updateDisplay(currentInput);
}

document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', () => {
        const action = button.dataset.action;
        const value = button.dataset.value;
        switch (action) {
            case 'number':
                handleNumber(value);
                break;
            case 'operator':
                handleOperator(value);
                break;
            case 'equals':
                handleEquals();
                break;
            case 'clear':
                handleClear();
                break;
            case 'delete':
                handleDelete();
                break;
            case 'decimal':
                handleDecimal();
                break;
        }
    });
});