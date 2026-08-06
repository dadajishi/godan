// 天气应用脚本
// 使用Mock数据模式（无API Key时自动启用）

const API_KEY = ''; // 在此填入你的OpenWeatherMap API Key，留空则使用Mock数据
const API_URL = 'https://api.openweathermap.org/data/2.5/weather';

// Mock数据备用
const mockData = {
    '北京': { temp: 25, desc: '晴', humidity: 40, windSpeed: 3.5, city: '北京' },
    '上海': { temp: 28, desc: '多云', humidity: 60, windSpeed: 4.2, city: '上海' },
    '广州': { temp: 30, desc: '雷阵雨', humidity: 80, windSpeed: 5.1, city: '广州' },
    '深圳': { temp: 29, desc: '阴', humidity: 75, windSpeed: 3.8, city: '深圳' },
    '成都': { temp: 22, desc: '小雨', humidity: 70, windSpeed: 2.5, city: '成都' },
    '杭州': { temp: 27, desc: '晴', humidity: 55, windSpeed: 3.0, city: '杭州' },
    '武汉': { temp: 26, desc: '多云', humidity: 65, windSpeed: 3.2, city: '武汉' },
    '西安': { temp: 24, desc: '晴', humidity: 35, windSpeed: 2.8, city: '西安' },
    '重庆': { temp: 31, desc: '晴', humidity: 50, windSpeed: 2.0, city: '重庆' },
    '南京': { temp: 27, desc: '多云', humidity: 58, windSpeed: 3.4, city: '南京' }
};

// 默认城市
let currentCity = '北京';

// DOM元素
document.addEventListener('DOMContentLoaded', () => {
    const searchBtn = document.getElementById('searchBtn');
    const cityInput = document.getElementById('cityInput');
    const weatherInfo = document.getElementById('weatherInfo');
    const errorMsg = document.getElementById('errorMsg');

    // 初始加载默认城市
    fetchWeather(currentCity);

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
        showLoading();
        errorMsg.textContent = '';

        // 如果API Key为空，使用Mock数据
        if (!API_KEY) {
            // 模拟网络延迟
            setTimeout(() => {
                const data = mockData[city];
                if (data) {
                    displayWeather(data);
                } else {
                    showError('未找到该城市的天气数据（Mock模式）');
                }
            }, 500);
            return;
        }

        // 使用真实API
        try {
            const response = await fetch(`${API_URL}?q=${city}&appid=${API_KEY}&units=metric&lang=zh_cn`);
            if (!response.ok) {
                throw new Error('城市不存在或API错误');
            }
            const data = await response.json();
            const weatherData = {
                city: data.name,
                temp: Math.round(data.main.temp),
                desc: data.weather[0].description,
                humidity: data.main.humidity,
                windSpeed: data.wind.speed
            };
            displayWeather(weatherData);
        } catch (error) {
            showError(error.message);
        }
    }

    // 显示天气信息
    function displayWeather(data) {
        weatherInfo.innerHTML = `
            <h2>${data.city}</h2>
            <div class="temp">${data.temp}°C</div>
            <div class="desc">${data.desc}</div>
            <div class="details">
                <div>
                    <span>湿度</span>
                    <strong>${data.humidity}%</strong>
                </div>
                <div>
                    <span>风速</span>
                    <strong>${data.windSpeed} m/s</strong>
                </div>
                <div>
                    <span>体感</span>
                    <strong>${data.temp}°C</strong>
                </div>
            </div>
        `;
        weatherInfo.classList.add('active');
    }

    // 显示加载状态
    function showLoading() {
        weatherInfo.innerHTML = '<p class="loading">加载中...</p>';
        weatherInfo.classList.add('active');
    }

    // 显示错误
    function showError(msg) {
        errorMsg.textContent = msg;
        weatherInfo.classList.remove('active');
    }
});