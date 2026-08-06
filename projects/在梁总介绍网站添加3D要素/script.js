// 3D背景动画 - 使用Three.js

// 初始化场景
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('bg-canvas'), antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

// 创建粒子系统
const particlesGeometry = new THREE.BufferGeometry();
const particlesCount = 2000;
const posArray = new Float32Array(particlesCount * 3);

for(let i = 0; i < particlesCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 100;
}

particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

const particlesMaterial = new THREE.PointsMaterial({
    size: 0.2,
    color: 0x00aaff,
    transparent: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending
});

const particlesMesh = new THREE.Points(particlesGeometry, particlesMaterial);
scene.add(particlesMesh);

// 创建旋转的立方体
const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
const cubeMaterial = new THREE.MeshStandardMaterial({
    color: 0xffaa00,
    wireframe: true,
    transparent: true,
    opacity: 0.3
});
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
scene.add(cube);

// 创建环绕的环
const ringGeometry = new THREE.TorusGeometry(3, 0.1, 16, 100);
const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0x00ffaa,
    wireframe: true,
    transparent: true,
    opacity: 0.5
});
const ring = new THREE.Mesh(ringGeometry, ringMaterial);
scene.add(ring);

// 添加光源
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

// 相机位置
camera.position.z = 8;

// 鼠标交互
let mouseX = 0;
let mouseY = 0;

document.addEventListener('mousemove', (event) => {
    mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
});

// 动画循环
function animate() {
    requestAnimationFrame(animate);

    // 粒子旋转
    particlesMesh.rotation.y += 0.001;
    particlesMesh.rotation.x += 0.0005;

    // 立方体旋转
    cube.rotation.x += 0.005;
    cube.rotation.y += 0.005;

    // 环旋转
    ring.rotation.x += 0.01;
    ring.rotation.z += 0.005;

    // 鼠标影响相机位置
    camera.position.x += (mouseX * 2 - camera.position.x) * 0.05;
    camera.position.y += (mouseY * 2 - camera.position.y) * 0.05;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
}

animate();

// 窗口大小调整
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});