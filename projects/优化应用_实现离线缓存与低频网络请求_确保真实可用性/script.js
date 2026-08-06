// ==================== 配置 ====================
const CACHE_KEY = 'app_data_cache';
const CACHE_EXPIRY = 5 * 60 * 1000; // 5分钟缓存过期
const REQUEST_INTERVAL = 30000; // 30秒最小请求间隔

// 模拟数据源（真实场景可替换为API）
const MOCK_DATA = [
    { id: 1, title: '示例数据 1', content: '这是第一条示例数据的内容。', timestamp: '2025-01-01 10:00:00' },
    { id: 2, title: '示例数据 2', content: '这是第二条示例数据的内容。', timestamp: '2025-01-01 10:05:00' },
    { id: 3, title: '示例数据 3', content: '这是第三条示例数据的内容。', timestamp: '2025-01-01 10:10:00' },
    { id: 4, title: '示例数据 4', content: '这是第四条示例数据的内容。', timestamp: '2025-01-01 10:15:00' },
    { id: 5, title: '示例数据 5', content: '这是第五条示例数据的内容。', timestamp: '2025-01-01 10:20:00' }
];

// ==================== 状态管理 ====================
let isOnline = navigator.onLine;
let lastRequestTime = 0;
let isRequesting = false;

// ==================== DOM元素 ====================
const networkStatusEl = document.getElementById('network-status');
const cacheStatusEl = document.getElementById('cache-status');
const dataContainer = document.getElementById('data-container');
const logList = document.getElementById('log-list');
const fetchBtn = document.getElementById('fetch-data-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const simulateOfflineBtn = document.getElementById('simulate-offline-btn');
const simulateOnlineBtn = document.getElementById('simulate-online-btn');

// ==================== 工具函数 ====================
function log(message, type = 'info') {
    const li = document.createElement('li');
    li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    li.className = `log-${type}`;
    logList.prepend(li);
    // 限制日志数量
    while (logList.children.length > 50) {
        logList.removeChild(logList.lastChild);
    }
}

function updateNetworkStatus() {
    if (isOnline) {
        networkStatusEl.textContent = '在线';
        networkStatusEl.style.background = '#27ae60';
    } else {
        networkStatusEl.textContent = '离线';
        networkStatusEl.style.background = '#e74c3c';
    }
}

function updateCacheStatus() {
    const cache = getCache();
    if (cache && cache.data && cache.data.length > 0) {
        const age = Date.now() - cache.timestamp;
        const ageStr = age < 60000 ? `${Math.floor(age/1000)}秒前` : `${Math.floor(age/60000)}分钟前`;
        cacheStatusEl.textContent = `缓存: ${cache.data.length}条 (${ageStr})`;
    } else {
        cacheStatusEl.textContent = '缓存: 无';
    }
}

// ==================== 缓存操作 ====================
function getCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.error('读取缓存失败', e);
        return null;
    }
}

function setCache(data) {
    const cache = {
        data: data,
        timestamp: Date.now()
    };
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        updateCacheStatus();
        log('数据已缓存', 'success');
    } catch (e) {
        console.error('写入缓存失败', e);
        log('缓存写入失败', 'error');
    }
}

function clearCache() {
    localStorage.removeItem(CACHE_KEY);
    updateCacheStatus();
    log('缓存已清除', 'info');
    renderData([]);
}

function isCacheValid() {
    const cache = getCache();
    if (!cache) return false;
    return (Date.now() - cache.timestamp) < CACHE_EXPIRY;
}

// ==================== 数据获取 ====================
function fetchData() {
    if (isRequesting) {
        log('请求进行中，忽略本次操作', 'info');
        return;
    }

    // 检查请求频率
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_INTERVAL) {
        const waitTime = Math.ceil((REQUEST_INTERVAL - (now - lastRequestTime)) / 1000);
        log(`请求过于频繁，请等待 ${waitTime} 秒`, 'info');
        // 尝试使用缓存
        const cache = getCache();
        if (cache && cache.data) {
            renderData(cache.data);
            log('已使用缓存数据', 'info');
        }
        return;
    }

    // 检查网络状态
    if (!isOnline) {
        log('当前处于离线状态，无法请求网络', 'error');
        const cache = getCache();
        if (cache && cache.data) {
            renderData(cache.data);
            log('已使用缓存数据', 'info');
        } else {
            renderData([]);
            log('无缓存可用', 'error');
        }
        return;
    }

    // 检查缓存是否有效
    if (isCacheValid()) {
        const cache = getCache();
        log('缓存有效，直接使用缓存', 'info');
        renderData(cache.data);
        return;
    }

    // 执行网络请求（模拟）
    isRequesting = true;
    lastRequestTime = Date.now();
    log('发起网络请求...', 'info');

    // 模拟异步请求
    setTimeout(() => {
        try {
            // 模拟网络请求成功
            const data = MOCK_DATA;
            setCache(data);
            renderData(data);
            log('网络请求成功，数据已更新', 'success');
        } catch (e) {
            log('网络请求失败', 'error');
            // 尝试使用缓存
            const cache = getCache();
            if (cache && cache.data) {
                renderData(cache.data);
                log('已使用缓存数据', 'info');
            }
        } finally {
            isRequesting = false;
        }
    }, 500); // 模拟网络延迟
}

// ==================== 渲染 ====================
function renderData(data) {
    if (!data || data.length === 0) {
        dataContainer.innerHTML = '<p class="placeholder">暂无数据，请点击"获取数据"按钮。</p>';
        return;
    }

    dataContainer.innerHTML = '';
    data.forEach(item => {
        const div = document.createElement('div');
        div.className = 'data-item';
        div.innerHTML = `
            <h3>${item.title}</h3>
            <p>${item.content}</p>
            <div class="timestamp">更新时间: ${item.timestamp}</div>
        `;
        dataContainer.appendChild(div);
    });
}

// ==================== 事件监听 ====================
fetchBtn.addEventListener('click', fetchData);

clearCacheBtn.addEventListener('click', () => {
    clearCache();
    log('缓存已手动清除', 'info');
});

simulateOfflineBtn.addEventListener('click', () => {
    isOnline = false;
    updateNetworkStatus();
    log('模拟离线状态', 'info');
});

simulateOnlineBtn.addEventListener('click', () => {
    isOnline = true;
    updateNetworkStatus();
    log('模拟恢复在线', 'info');
});

// 监听真实网络状态变化
window.addEventListener('online', () => {
    isOnline = true;
    updateNetworkStatus();
    log('网络连接恢复', 'success');
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateNetworkStatus();
    log('网络连接断开', 'error');
});

// ==================== 初始化 ====================
function init() {
    updateNetworkStatus();
    updateCacheStatus();

    // 加载缓存数据
    const cache = getCache();
    if (cache && cache.data) {
        renderData(cache.data);
        log('已加载缓存数据', 'info');
    } else {
        log('无缓存数据，请点击获取数据', 'info');
    }

    // 自动获取数据（如果缓存无效且在线）
    if (isOnline && !isCacheValid()) {
        fetchData();
    }
}

// 启动
init();