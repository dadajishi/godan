// 模拟AI响应数据（Mock模式）
const mockResponses = [
  "秋天来了，叶子黄了，风儿轻轻吹过，带来一丝凉意。\n\n山间的小径上，铺满了金色的落叶，仿佛一条通往童话世界的路。\n\n远处的果园里，苹果红了，梨子黄了，空气中弥漫着丰收的喜悦。\n\n秋天，是一首宁静的诗，是一幅多彩的画。",
  "人工智能正在改变世界。\n\n从智能助手到自动驾驶，AI技术正在渗透到我们生活的方方面面。\n\nNexus AI致力于让AI更加人性化，让每个人都能轻松使用AI的力量。",
  "你好！我是Nexus AI助手。\n\n我可以帮你回答问题、创作内容、分析数据，甚至陪你聊天。\n\n有什么我可以帮助你的吗？",
  "未来已来。\n\n随着大语言模型的发展，AI已经能够理解和生成自然语言，帮助人类解决复杂问题。\n\nNexus AI将最前沿的技术带给每一个用户。"
];

// 获取DOM元素
const generateBtn = document.getElementById('generateBtn');
const promptInput = document.getElementById('prompt');
const outputDiv = document.getElementById('output');

// 生成按钮点击事件
generateBtn.addEventListener('click', () => {
  const prompt = promptInput.value.trim();
  
  if (!prompt) {
    outputDiv.innerHTML = '<p class="placeholder">请输入你的问题或需求</p>';
    return;
  }

  // 显示加载状态
  outputDiv.innerHTML = '<p class="placeholder">AI思考中...</p>';

  // 模拟API调用延迟
  setTimeout(() => {
    // 随机选择一个模拟响应
    const randomIndex = Math.floor(Math.random() * mockResponses.length);
    const response = mockResponses[randomIndex];
    
    // 显示响应
    outputDiv.innerHTML = `<p style="white-space: pre-line;">${response}</p>`;
  }, 1000);
});

// 支持回车键触发
promptInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    generateBtn.click();
  }
});

// 页面加载时自动聚焦
window.addEventListener('load', () => {
  promptInput.focus();
});

// 平滑滚动（已由CSS处理）
// 导航栏点击平滑滚动
const navLinks = document.querySelectorAll('.nav-links a');
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetId = link.getAttribute('href');
    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth' });
    }
  });
});
