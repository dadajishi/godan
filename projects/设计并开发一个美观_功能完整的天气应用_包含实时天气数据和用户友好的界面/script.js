// ===== 配置 =====
const API_KEY = 'YOUR_API_KEY'; // 替换为你的OpenWeatherMap API Key
const USE_MOCK = true; // 设置为true使用Mock数据，false使用真实API

// ===== Mock数据 =====
const mockData = {
    city: '北京',
    current: {
        temp: 22,
        feels_like: 20,
        humidity: 65,
        wind_speed: 3.5,
        pressure: 1013,
        weather: {
            main: 'Clear',
            description: '晴',
            icon: '01d'
        }
    },
    forecast: [
        { day: '周一', temp_max: 24, temp_min: 18, icon: '01d' },
        { day: '周二', temp_max: 26, temp_min: 19, icon: '02d' },
        { day: '周三', temp_max: 23, temp_min: 17, icon: '03d' },
        { day: '周四', temp_max: 21, temp_min: 15, icon: '10d' },
        { day: '周五', temp_max: 20, temp_min: 14, icon: '04d' }
    ]
};

// ===== DOM元素 =====
const cityInput = document.getElementById('cityInput');
const searchBtn = document.getElementById('searchBtn');
const locationBtn = document.getElementById('locationBtn');
const cityName = document.getElementById('cityName');
const date = document.getElementById('date');
const temp = document.getElementById('temp');
const weatherIcon = document.getElementById('weatherIcon');
const description = document.getElementById('description');
const feelsLike = document.getElementById('feelsLike');
const humidity = document.getElementById('humidity');
const wind = document.getElementById('wind');
const pressure = document.getElementById('pressure');
const forecastList = document.getElementById('forecastList');

// ===== 工具函数 =====
function formatDate() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return now.toLocaleDateString('zh-CN', options);
}

function getWeatherIconUrl(iconCode) {
    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
}

function getDayOfWeek(dateStr) {
    const date = new Date(dateStr);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
}

// ===== 渲染函数 =====
function renderCurrentWeather(data) {
    cityName.textContent = data.city;
    date.textContent = formatDate();
    temp.textContent = Math.round(data.current.temp);
    weatherIcon.src = getWeatherIconUrl(data.current.weather.icon);
    weatherIcon.alt = data.current.weather.description;
    description.textContent = data.current.weather.description;
    feelsLike.textContent = `${Math.round(data.current.feels_like)}°C`;
    humidity.textContent = `${data.current.humidity}%`;
    wind.textContent = `${data.current.wind_speed} m/s`;
    pressure.textContent = `${data.current.pressure} hPa`;
}

function renderForecast(forecast) {
    forecastList.innerHTML = '';
    forecast.forEach(item => {
        const div = document.createElement('div');
        div.className = 'forecast-item';
        div.innerHTML = `
            <span class="day">${item.day}</span>
            <img class="icon" src="${getWeatherIconUrl(item.icon)}" alt="天气图标">
            <span class="temp-range">${Math.round(item.temp_min)}° / ${Math.round(item.temp_max)}°</span>
        `;
        forecastList.appendChild(div);
    });
}

// ===== 数据获取 =====
async function fetchWeather(city) {
    if (USE_MOCK) {
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 500));
        return { ...mockData, city: city || mockData.city };
    }

    // 真实API调用
    try {
        const currentRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric&lang=zh_cn`);
        if (!currentRes.ok) throw new Error('城市未找到');
        const currentData = await currentRes.json();

        const forecastRes = await fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric&lang=zh_cn`);
        if (!forecastRes.ok) throw new Error('预报获取失败');
        const forecastData = await forecastRes.json();

        // 处理当前天气
        const current = {
            temp: currentData.main.temp,
            feels_like: currentData.main.feels_like,
            humidity: currentData.main.humidity,
            wind_speed: currentData.wind.speed,
            pressure: currentData.main.pressure,
            weather: {
                main: currentData.weather[0].main,
                description: currentData.weather[0].description,
                icon: currentData.weather[0].icon
            }
        };

        // 处理5天预报（每天取一个代表）
        const dailyForecast = [];
        const seenDates = new Set();
        for (const item of forecastData.list) {
            const dateStr = item.dt_txt.split(' ')[0];
            if (!seenDates.has(dateStr)) {
                seenDates.add(dateStr);
                dailyForecast.push({
                    day: getDayOfWeek(dateStr),
                    temp_max: item.main.temp_max,
                    temp_min: item.main.temp_min,
                    icon: item.weather[0].icon
                });
            }
            if (dailyForecast.length === 5) break;
        }

        return {
            city: currentData.name,
            current: current,
            forecast: dailyForecast
        };
    } catch (error) {
        console.error('API请求失败:', error);
        alert('获取天气数据失败，请检查城市名称或API配置');
        return null;
    }
}

// ===== 事件处理 =====
async function handleSearch() {
    const city = cityInput.value.trim();
    if (!city) {
        alert('请输入城市名称');
        return;
    }
    const data = await fetchWeather(city);
    if (data) {
        renderCurrentWeather(data);
        renderForecast(data.forecast);
    }
}

async function handleLocation() {
    if (!navigator.geolocation) {
        alert('浏览器不支持地理位置');
        return;
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        if (USE_MOCK) {
            // Mock模式下使用默认城市
            const data = await fetchWeather('北京');
            if (data) {
                renderCurrentWeather(data);
                renderForecast(data.forecast);
            }
            return;
        }

        try {
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${API_KEY}&units=metric&lang=zh_cn`);
            if (!res.ok) throw new Error('位置获取失败');
            const data = await res.json();
            const city = data.name;
            const weatherData = await fetchWeather(city);
            if (weatherData) {
                renderCurrentWeather(weatherData);
                renderForecast(weatherData.forecast);
            }
        } catch (error) {
            console.error('位置获取失败:', error);
            alert('获取位置失败，请检查权限');
        }
    }, (error) => {
        console.error('定位错误:', error);
        alert('无法获取位置，请检查权限设置');
    });
}

// ===== 初始化 =====
searchBtn.addEventListener('click', handleSearch);
cityInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});
locationBtn.addEventListener('click', handleLocation);

// 页面加载时显示默认城市
(async () => {
    const data = await fetchWeather('北京');
    if (data) {
        renderCurrentWeather(data);
        renderForecast(data.forecast);
    }
})();