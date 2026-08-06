document.getElementById('actionBtn').addEventListener('click', function() {
    const output = document.getElementById('output');
    output.textContent = '按钮被点击了！当前时间：' + new Date().toLocaleTimeString();
});