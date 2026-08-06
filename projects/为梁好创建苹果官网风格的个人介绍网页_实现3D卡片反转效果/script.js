// 3D卡片翻转效果
const cardWrapper = document.getElementById('cardWrapper');
const card = document.getElementById('card');

// 点击翻转
cardWrapper.addEventListener('click', () => {
    cardWrapper.classList.toggle('flipped');
});

// 鼠标移动3D倾斜效果（苹果风格）
let isHovering = false;
let currentX = 0;
let currentY = 0;
let targetX = 0;
let targetY = 0;

cardWrapper.addEventListener('mouseenter', () => {
    isHovering = true;
});

cardWrapper.addEventListener('mouseleave', () => {
    isHovering = false;
    targetX = 0;
    targetY = 0;
});

cardWrapper.addEventListener('mousemove', (e) => {
    if (!isHovering) return;
    const rect = cardWrapper.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 计算旋转角度（最大15度）
    targetX = ((y / rect.height) - 0.5) * 30;
    targetY = ((x / rect.width) - 0.5) * 30;
});

// 动画循环
function animate() {
    // 平滑过渡
    currentX += (targetX - currentX) * 0.1;
    currentY += (targetY - currentY) * 0.1;
    
    // 应用3D变换（如果未翻转）
    if (!cardWrapper.classList.contains('flipped')) {
        card.style.transform = `rotateX(${-currentX}deg) rotateY(${currentY}deg)`;
    } else {
        card.style.transform = `rotateX(${-currentX}deg) rotateY(${currentY + 180}deg)`;
    }
    
    requestAnimationFrame(animate);
}

animate();

// 背景粒子效果（Three.js）
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('bg-canvas').appendChild(renderer.domElement);

// 创建粒子
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = 2000;
const posArray = new Float32Array(particlesCount * 3);

for (let i = 0; i < particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 20;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

// 粒子材质
const particlesMaterial = new THREE.PointsMaterial({
    size: 0.02,
    color: 0x0071e3,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});

const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particlesMesh);

// 相机位置
camera.position.z = 5;

// 鼠标交互
let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// 动画
function animateParticles() {
    requestAnimationFrame(animateParticles);
    
    // 粒子旋转
    particlesMesh.rotation.y += 0.001;
    particlesMesh.rotation.x += 0.0005;
    
    // 相机跟随鼠标
    camera.position.x += (mouseX * 0.5 - camera.position.x) * 0.05;
    camera.position.y += (-mouseY * 0.5 - camera.position.y) * 0.05;
    camera.lookAt(scene.position);
    
    renderer.render(scene, camera);
}

animateParticles();

// 窗口大小调整
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// 键盘支持（空格键翻转）
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        cardWrapper.classList.toggle('flipped');
    }
});