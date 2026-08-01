// 点击切换翻转（可选，悬停已实现）
const card = document.querySelector('.card');

card.addEventListener('click', () => {
    card.classList.toggle('flipped');
});

// 添加键盘支持（空格键翻转）
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        card.classList.toggle('flipped');
    }
});

// 初始化时移除悬停效果（可选，保留悬停则注释掉）
// 如果希望点击优先，可以取消下面的注释
// card.addEventListener('mouseenter', () => {
//     card.classList.remove('flipped');
// });
// card.addEventListener('mouseleave', () => {
//     card.classList.remove('flipped');
// });