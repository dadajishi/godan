// 获取DOM元素
const promiseBox = document.getElementById('promiseBox');
const promiseStatus = document.getElementById('promiseStatus');
const promiseValue = document.getElementById('promiseValue');
const logContainer = document.getElementById('log');
const btnResolve = document.getElementById('btnResolve');
const btnReject = document.getElementById('btnReject');
const btnReset = document.getElementById('btnReset');

// 当前Promise状态
let currentPromise = null;
let isResolved = false;
let isRejected = false;

// 添加日志
function addLog(message, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

// 更新UI
function updateUI(status, value) {
    promiseBox.className = `promise-box ${status}`;
    promiseStatus.textContent = status;
    promiseValue.textContent = value !== undefined ? JSON.stringify(value) : 'undefined';
}

// 重置状态
function reset() {
    if (currentPromise) {
        // 无法取消Promise，但可以忽略结果
        currentPromise = null;
    }
    isResolved = false;
    isRejected = false;
    updateUI('pending', undefined);
    logContainer.innerHTML = '';
    addLog('已重置，创建新的Promise', 'info');
    
    // 创建新的Promise
    currentPromise = new Promise((resolve, reject) => {
        // 保存resolve和reject供按钮使用
        window._resolve = resolve;
        window._reject = reject;
    });
    
    // 监听Promise状态变化
    currentPromise.then(
        (value) => {
            if (currentPromise) {
                updateUI('fulfilled', value);
                addLog(`Promise 成功: ${JSON.stringify(value)}`, 'success');
            }
        },
        (reason) => {
            if (currentPromise) {
                updateUI('rejected', reason);
                addLog(`Promise 失败: ${JSON.stringify(reason)}`, 'error');
            }
        }
    );
    
    addLog('Promise 已创建，状态: pending', 'info');
}

// 初始化
reset();

// 按钮事件
btnResolve.addEventListener('click', () => {
    if (isResolved || isRejected) {
        addLog('Promise 已经完成，无法再次resolve', 'error');
        return;
    }
    isResolved = true;
    addLog('调用 resolve("成功")', 'info');
    window._resolve('成功');
});

btnReject.addEventListener('click', () => {
    if (isResolved || isRejected) {
        addLog('Promise 已经完成，无法再次reject', 'error');
        return;
    }
    isRejected = true;
    addLog('调用 reject("失败")', 'info');
    window._reject('失败');
});

btnReset.addEventListener('click', reset);

// 初始日志
addLog('演示Promise的三种状态: pending, fulfilled, rejected', 'info');
addLog('点击按钮触发状态变化', 'info');