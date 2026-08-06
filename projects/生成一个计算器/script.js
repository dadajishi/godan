let display = document.getElementById('display');
let currentInput = '';
let previousInput = '';
let operator = null;
let shouldResetScreen = false;

function appendChar(char) {
    if (shouldResetScreen) {
        currentInput = '';
        shouldResetScreen = false;
    }
    
    if (char === '.' && currentInput.includes('.')) return;
    if (currentInput === '0' && char !== '.') {
        currentInput = char;
    } else {
        currentInput += char;
    }
    updateDisplay();
}

function updateDisplay() {
    display.value = currentInput || '0';
}

function clearDisplay() {
    currentInput = '';
    previousInput = '';
    operator = null;
    shouldResetScreen = false;
    updateDisplay();
}

function deleteChar() {
    if (shouldResetScreen) return;
    currentInput = currentInput.slice(0, -1);
    updateDisplay();
}

function setOperator(op) {
    if (operator !== null && !shouldResetScreen) {
        calculate();
    }
    previousInput = currentInput || '0';
    operator = op;
    shouldResetScreen = true;
}

function calculate() {
    if (operator === null || shouldResetScreen) return;
    
    const prev = parseFloat(previousInput);
    const curr = parseFloat(currentInput);
    if (isNaN(prev) || isNaN(curr)) return;
    
    let result;
    switch (operator) {
        case '+':
            result = prev + curr;
            break;
        case '-':
            result = prev - curr;
            break;
        case '*':
            result = prev * curr;
            break;
        case '/':
            if (curr === 0) {
                display.value = '错误';
                currentInput = '';
                previousInput = '';
                operator = null;
                shouldResetScreen = false;
                return;
            }
            result = prev / curr;
            break;
        case '%':
            result = prev % curr;
            break;
        default:
            return;
    }
    
    currentInput = String(parseFloat(result.toFixed(10)));
    operator = null;
    previousInput = '';
    shouldResetScreen = true;
    updateDisplay();
}

// 键盘支持
document.addEventListener('keydown', function(e) {
    const key = e.key;
    if (key >= '0' && key <= '9' || key === '.') {
        appendChar(key);
    } else if (key === '+' || key === '-' || key === '*' || key === '/' || key === '%') {
        setOperator(key);
    } else if (key === 'Enter' || key === '=') {
        calculate();
    } else if (key === 'Backspace') {
        deleteChar();
    } else if (key === 'Escape' || key === 'c' || key === 'C') {
        clearDisplay();
    }
});

// 修改按钮的onclick，使运算符使用setOperator
// 重新绑定按钮事件（因为HTML中直接用了appendChar，这里覆盖）
document.querySelectorAll('.btn.operator').forEach(btn => {
    btn.onclick = function() {
        setOperator(this.textContent);
    };
});

// 初始化显示
updateDisplay();