// 选择API: OpenWeatherMap (免费版)
// 需要用户自行注册获取API Key，这里使用示例key，实际使用请替换
const API_KEY = 'YOUR_API_KEY'; // 替换为你的API Key
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const cityName = document.getElementById('cityName');
const temperature = document.getElementById('temperature');
const description = document.getElementById('description');
const humidity = document.getElementById('humidity');
const windSpeed = document.getElementById('windSpeed');
const weatherIcon = document.getElementById('weatherIcon');
const errorMsg = document.getElementById('errorMsg');

// 默认城市
let currentCity = '北京';

// 初始化加载
window.addEventListener('DOMContentLoaded', () => {
    fetchWeather(currentCity);
});

// 搜索事件
searchBtn.addEventListener('click', () => {
    const city = cityInput.value.trim();
    if (city) {
        fetchWeather(city);
    } else {
        showError('请输入城市名称');
    }
});

// 回车搜索
cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const city = cityInput.value.trim();
        if (city) {
            fetchWeather(city);
        } else {
            showError('请输入城市名称');
        }
    }
});

// 获取天气数据
async function fetchWeather(city) {
    try {
        showError('');
        // 使用中文城市名，需要转换为英文或使用地理编码，这里简化处理，直接使用城市名（OpenWeatherMap支持中文城市名）
        const url = `${BASE_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric&lang=zh_cn`;
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('城市未找到，请检查输入');
            } else if (response.status === 401) {
                throw new Error('API Key无效，请检查');
            } else {
                throw new Error('请求失败，请稍后重试');
            }
        }
        const data = await response.json();
        displayWeather(data);
    } catch (error) {
        showError(error.message);
        // 清空显示
        cityName.textContent = '--';
        temperature.textContent = '--°C';
        description.textContent = '--';
        humidity.textContent = '--%';
        windSpeed.textContent = '-- km/h';
        weatherIcon.textContent = '--';
    }
}

// 显示天气数据
function displayWeather(data) {
    const { name, main, weather, wind } = data;
    cityName.textContent = name;
    temperature.textContent = `${Math.round(main.temp)}°C`;
    description.textContent = weather[0].description;
    humidity.textContent = `${main.humidity}%`;
    windSpeed.textContent = `${Math.round(wind.speed * 3.6)} km/h`; // 转换为km/h
    // 天气图标映射（使用emoji简化）
    const iconMap = {
        '01d': '☀️',
        '01n': '🌙',
        '02d': '⛅',
        '02n': '☁️',
        '03d': '☁️',
        '03n': '☁️',
        '04d': '☁️',
        '04n': '☁️',
        '09d': '🌧️',
        '09n': '🌧️',
        '10d': '🌦️',
        '10n': '🌧️',
        '11d': '⛈️',
        '11n': '⛈️',
        '13d': '❄️',
        '13n': '❄️',
        '50d': '🌫️',
        '50n': '🌫️'
    };
    weatherIcon.textContent = iconMap[weather[0].icon] || '🌡️';
}

// 显示错误
function showError(message) {
    errorMsg.textContent = message;
}

// 注意：由于API Key限制，请用户自行注册获取。
// 开发步骤规划：
// 1. 选择API: OpenWeatherMap (免费，支持中文，无需地理编码)
// 2. 设计UI: 简洁卡片式，响应式布局
// 3. 实现数据展示: 使用fetch异步请求，处理错误，显示温度、湿度、风速、天气描述和图标
// 4. 优化: 添加加载动画，支持地理定位（可选）
// 5. 部署: 可部署到GitHub Pages或Netlify
// 此代码为完整实现，用户需替换API_KEY。