const expressionEl = document.getElementById('expression');
const resultEl = document.getElementById('result');

let currentInput = '';
let previousInput = '';
let operator = null;
let shouldResetScreen = false;

const buttons = document.querySelectorAll('.btn');

buttons.forEach(button => {
    button.addEventListener('click', () => {
        const value = button.dataset.value;
        const action = button.dataset.action;

        if (value !== undefined) {
            inputNumber(value);
        } else if (action) {
            handleAction(action);
        }
    });
});

function inputNumber(value) {
    if (shouldResetScreen) {
        currentInput = '';
        shouldResetScreen = false;
    }

    if (value === '.' && currentInput.includes('.')) return;
    if (currentInput === '0' && value !== '.') {
        currentInput = value;
    } else {
        currentInput += value;
    }
    updateDisplay();
}

function handleAction(action) {
    switch (action) {
        case 'clear':
            clearAll();
            break;
        case 'backspace':
            backspace();
            break;
        case 'percent':
            percent();
            break;
        case 'divide':
        case 'multiply':
        case 'subtract':
        case 'add':
            setOperator(action);
            break;
        case 'equals':
            calculate();
            break;
    }
}

function setOperator(op) {
    if (currentInput === '' && previousInput === '') return;

    if (currentInput === '' && previousInput !== '') {
        operator = op;
        updateExpression();
        return;
    }

    if (previousInput !== '' && operator && currentInput !== '') {
        calculate();
    }

    previousInput = currentInput || previousInput;
    currentInput = '';
    operator = op;
    shouldResetScreen = false;
    updateExpression();
}

function calculate() {
    if (previousInput === '' || currentInput === '' || operator === null) return;

    const prev = parseFloat(previousInput);
    const curr = parseFloat(currentInput);
    let result;

    switch (operator) {
        case 'add':
            result = prev + curr;
            break;
        case 'subtract':
            result = prev - curr;
            break;
        case 'multiply':
            result = prev * curr;
            break;
        case 'divide':
            if (curr === 0) {
                result = 'Error';
            } else {
                result = prev / curr;
            }
            break;
        default:
            return;
    }

    if (typeof result === 'number') {
        result = parseFloat(result.toPrecision(12));
    }

    currentInput = String(result);
    previousInput = '';
    operator = null;
    shouldResetScreen = true;
    updateDisplay();
    expressionEl.textContent = '';
}

function clearAll() {
    currentInput = '';
    previousInput = '';
    operator = null;
    shouldResetScreen = false;
    updateDisplay();
    expressionEl.textContent = '';
}

function backspace() {
    if (shouldResetScreen) return;
    currentInput = currentInput.slice(0, -1);
    updateDisplay();
}

function percent() {
    if (currentInput === '') return;
    const num = parseFloat(currentInput);
    if (isNaN(num)) return;
    currentInput = String(num / 100);
    updateDisplay();
}

function updateDisplay() {
    if (currentInput === '') {
        resultEl.textContent = '0';
    } else {
        resultEl.textContent = currentInput;
    }
}

function updateExpression() {
    const opSymbol = {
        add: '+',
        subtract: '-',
        multiply: '×',
        divide: '÷'
    };
    if (previousInput !== '' && operator) {
        expressionEl.textContent = previousInput + ' ' + opSymbol[operator];
    } else {
        expressionEl.textContent = '';
    }
}

// 键盘支持
document.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key >= '0' && key <= '9') {
        inputNumber(key);
    } else if (key === '.') {
        inputNumber('.');
    } else if (key === '+') {
        setOperator('add');
    } else if (key === '-') {
        setOperator('subtract');
    } else if (key === '*') {
        setOperator('multiply');
    } else if (key === '/') {
        e.preventDefault();
        setOperator('divide');
    } else if (key === 'Enter' || key === '=') {
        calculate();
    } else if (key === 'Backspace') {
        backspace();
    } else if (key === 'Escape') {
        clearAll();
    } else if (key === '%') {
        percent();
    }
});