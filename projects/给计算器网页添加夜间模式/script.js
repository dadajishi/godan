// 计算器逻辑
let currentInput = '';
let previousInput = '';
let operation = null;
let shouldResetDisplay = false;

const display = document.getElementById('display');

function updateDisplay(value) {
    display.textContent = value || '0';
}

function inputNumber(num) {
    if (shouldResetDisplay) {
        currentInput = '';
        shouldResetDisplay = false;
    }
    if (currentInput.includes('.') && num === '.') return;
    currentInput += num;
    updateDisplay(currentInput);
}

function inputDecimal() {
    if (shouldResetDisplay) {
        currentInput = '0';
        shouldResetDisplay = false;
    }
    if (currentInput.includes('.')) return;
    currentInput += '.';
    updateDisplay(currentInput);
}

function clear() {
    currentInput = '';
    previousInput = '';
    operation = null;
    shouldResetDisplay = false;
    updateDisplay('0');
}

function backspace() {
    if (shouldResetDisplay) return;
    currentInput = currentInput.slice(0, -1);
    updateDisplay(currentInput || '0');
}

function percent() {
    if (currentInput === '') return;
    const value = parseFloat(currentInput);
    currentInput = String(value / 100);
    updateDisplay(currentInput);
}

function chooseOperation(op) {
    if (currentInput === '') return;
    if (previousInput !== '') {
        calculate();
    }
    operation = op;
    previousInput = currentInput;
    shouldResetDisplay = true;
}

function calculate() {
    if (operation === null || previousInput === '' || currentInput === '') return;
    const prev = parseFloat(previousInput);
    const curr = parseFloat(currentInput);
    let result;
    switch (operation) {
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
                updateDisplay('错误');
                currentInput = '';
                previousInput = '';
                operation = null;
                shouldResetDisplay = true;
                return;
            }
            result = prev / curr;
            break;
        default:
            return;
    }
    currentInput = String(result);
    previousInput = '';
    operation = null;
    shouldResetDisplay = true;
    updateDisplay(currentInput);
}

// 事件监听
document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', () => {
        const action = button.dataset.action;
        const value = button.dataset.value;
        switch (action) {
            case 'number':
                inputNumber(value);
                break;
            case 'decimal':
                inputDecimal();
                break;
            case 'clear':
                clear();
                break;
            case 'backspace':
                backspace();
                break;
            case 'percent':
                percent();
                break;
            case 'add':
            case 'subtract':
            case 'multiply':
            case 'divide':
                chooseOperation(action);
                break;
            case 'equals':
                calculate();
                break;
        }
    });
});

// 键盘支持
document.addEventListener('keydown', (e) => {
    const key = e.key;
    if (key >= '0' && key <= '9') {
        inputNumber(key);
    } else if (key === '.') {
        inputDecimal();
    } else if (key === 'Enter' || key === '=') {
        calculate();
    } else if (key === 'Backspace') {
        backspace();
    } else if (key === 'Escape') {
        clear();
    } else if (key === '+') {
        chooseOperation('add');
    } else if (key === '-') {
        chooseOperation('subtract');
    } else if (key === '*') {
        chooseOperation('multiply');
    } else if (key === '/') {
        e.preventDefault();
        chooseOperation('divide');
    } else if (key === '%') {
        percent();
    }
});

// 夜间模式切换
const themeSwitch = document.getElementById('themeSwitch');
const themeLabel = document.getElementById('themeLabel');

// 检查本地存储
if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-mode');
    themeSwitch.checked = true;
    themeLabel.textContent = '日间模式';
}

themeSwitch.addEventListener('change', () => {
    if (themeSwitch.checked) {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        themeLabel.textContent = '日间模式';
    } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        themeLabel.textContent = '夜间模式';
    }
});
