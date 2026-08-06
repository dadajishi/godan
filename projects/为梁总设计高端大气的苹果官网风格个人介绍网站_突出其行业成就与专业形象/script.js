// 平滑滚动（已由CSS scroll-behavior处理，但保留JS增强）
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// 导航栏滚动效果
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    } else {
        navbar.style.boxShadow = 'none';
    }
});

// 简单的滚动显示动画（可选）
const observerOptions = {
    threshold: 0.2
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// 为区块添加初始样式
document.querySelectorAll('.section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(20px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
});

// 为成就卡片添加计数动画（模拟数据）
document.addEventListener('DOMContentLoaded', () => {
    const counters = document.querySelectorAll('.achievement-number');
    const speed = 200;

    const animateCounter = (element) => {
        const target = parseInt(element.innerText.replace(/[^0-9]/g, ''), 10);
        const suffix = element.innerText.includes('+') ? '+' : '';
        let count = 0;
        const increment = target / speed;

        const updateCounter = () => {
            count += increment;
            if (count < target) {
                element.innerText = Math.ceil(count) + suffix;
                requestAnimationFrame(updateCounter);
            } else {
                element.innerText = target + suffix;
            }
        };

        updateCounter();
    };

    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => counterObserver.observe(counter));
});