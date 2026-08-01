const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const controls = document.getElementById('controls');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const formatSelect = document.getElementById('formatSelect');
const compressAllBtn = document.getElementById('compressAllBtn');
const imageList = document.getElementById('imageList');
const result = document.getElementById('result');
const summary = document.getElementById('summary');
const downloadAllBtn = document.getElementById('downloadAllBtn');

let files = [];
let compressedResults = [];

// 拖拽上传
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
    }
});

fileInput.addEventListener('change', (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 0) {
        addFiles(selectedFiles);
    }
    fileInput.value = '';
});

function addFiles(newFiles) {
    files = files.concat(newFiles);
    controls.style.display = 'flex';
    renderImageList();
}

function renderImageList() {
    imageList.innerHTML = '';
    files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}">
                <div class="image-info">
                    <div class="name">${file.name}</div>
                    <div class="sizes">
                        <span class="original">原始: ${formatSize(file.size)}</span>
                        <span class="compressed">压缩: 等待</span>
                    </div>
                    <div class="savings">节省: -</div>
                </div>
            `;
            card.dataset.index = index;
            imageList.appendChild(card);
        };
        reader.readAsDataURL(file);
    });
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = qualitySlider.value;
});

compressAllBtn.addEventListener('click', async () => {
    if (files.length === 0) return;
    compressAllBtn.disabled = true;
    compressAllBtn.textContent = '压缩中...';
    compressedResults = [];

    const quality = parseInt(qualitySlider.value) / 100;
    const format = formatSelect.value;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const compressed = await compressImage(file, quality, format);
            compressedResults.push({
                name: file.name.replace(/\.[^.]+$/, '') + '.' + getExtension(format),
                originalSize: file.size,
                compressedSize: compressed.size,
                blob: compressed
            });
            updateCard(i, compressed.size);
        } catch (err) {
            console.error('压缩失败', err);
            alert(`压缩 ${file.name} 失败`);
        }
    }

    compressAllBtn.disabled = false;
    compressAllBtn.textContent = '压缩全部';
    showResult();
});

function compressImage(file, quality, format) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // 处理PNG透明背景
                if (format === 'image/png') {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('压缩失败'));
                        }
                    }, format);
                } else {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('压缩失败'));
                        }
                    }, format, quality);
                }
            };
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('文件读取失败'));
        reader.readAsDataURL(file);
    });
}

function getExtension(format) {
    switch(format) {
        case 'image/jpeg': return 'jpg';
        case 'image/webp': return 'webp';
        case 'image/png': return 'png';
        default: return 'jpg';
    }
}

function updateCard(index, compressedSize) {
    const card = imageList.querySelector(`[data-index="${index}"]`);
    if (card) {
        const compressedSpan = card.querySelector('.compressed');
        const savingsDiv = card.querySelector('.savings');
        const originalSize = files[index].size;
        compressedSpan.textContent = `压缩: ${formatSize(compressedSize)}`;
        const savings = ((originalSize - compressedSize) / originalSize * 100).toFixed(1);
        savingsDiv.textContent = `节省: ${savings}%`;
        if (savings > 0) {
            savingsDiv.style.color = '#27ae60';
        } else {
            savingsDiv.style.color = '#e74c3c';
        }
    }
}

function showResult() {
    if (compressedResults.length === 0) return;
    result.style.display = 'block';
    
    const totalOriginal = compressedResults.reduce((sum, item) => sum + item.originalSize, 0);
    const totalCompressed = compressedResults.reduce((sum, item) => sum + item.compressedSize, 0);
    const totalSavings = ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(1);
    
    summary.innerHTML = `
        <p>共压缩 ${compressedResults.length} 张图片</p>
        <p>原始大小: ${formatSize(totalOriginal)} → 压缩后: ${formatSize(totalCompressed)}</p>
        <p>总节省: <strong style="color:#27ae60;">${totalSavings}%</strong></p>
    `;
}

downloadAllBtn.addEventListener('click', async () => {
    if (compressedResults.length === 0) return;
    
    const zip = new JSZip();
    compressedResults.forEach(item => {
        zip.file(item.name, item.blob);
    });
    
    const blob = await zip.generateAsync({type: 'blob'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'compressed-images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});