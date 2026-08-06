// 宁悦用户介绍网页 - 交互脚本

// 页面加载完成后执行
window.addEventListener('DOMContentLoaded', () => {
    // 为所有卡片添加点击反馈效果
    const cards = document.querySelectorAll('.achievement-card, .testimonial-card');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            // 添加点击动画
            this.style.transform = 'scale(0.98)';
            setTimeout(() => {
                this.style.transform = '';
            }, 150);
        });
    });

    // 控制台输出欢迎信息
    console.log('欢迎来到宁悦的个人主页！');
    console.log('🏆 大胃王大赛冠军');
    console.log('💖 最佳可爱奖');

    // 动态更新年份
    const footer = document.querySelector('footer p');
    if (footer) {
        const year = new Date().getFullYear();
        footer.textContent = `© ${year} 宁悦 · 用心生活`;
    }

    // 添加滚动渐入效果
    const sections = document.querySelectorAll('.achievements, .testimonials, .about');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.2 });

    sections.forEach(section => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(section);
    });
});