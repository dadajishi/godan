// 夜间模式切换
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

// 检查本地存储中的主题偏好
if (localStorage.getItem('theme') === 'dark') {
    body.classList.add('dark-mode');
    themeToggle.textContent = '☀️';
}

themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
});

// 音乐播放器控制
const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const volumeSlider = document.getElementById('volumeSlider');

playBtn.addEventListener('click', () => {
    audio.play();
});

pauseBtn.addEventListener('click', () => {
    audio.pause();
});

stopBtn.addEventListener('click', () => {
    audio.pause();
    audio.currentTime = 0;
});

volumeSlider.addEventListener('input', (e) => {
    audio.volume = e.target.value;
});

// 初始化音量
audio.volume = volumeSlider.value;