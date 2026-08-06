// 简单的交互脚本

document.addEventListener('DOMContentLoaded', function() {
    // 为所有卡片添加点击效果
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('click', function() {
            alert('你点击了：' + this.querySelector('h2').textContent);
        });
    });

    // 为奖项添加悬停效果
    const awards = document.querySelectorAll('.award');
    awards.forEach(award => {
        award.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#d5dbdb';
        });
        award.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#ecf0f1';
        });
    });
});