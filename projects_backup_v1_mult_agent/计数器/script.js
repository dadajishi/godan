let count = 0;

const counterDisplay = document.getElementById('counterDisplay');
const decreaseBtn = document.getElementById('decreaseBtn');
const resetBtn = document.getElementById('resetBtn');
const increaseBtn = document.getElementById('increaseBtn');

function updateDisplay() {
    counterDisplay.textContent = count;
    counterDisplay.classList.remove('positive', 'negative');
    if (count > 0) {
        counterDisplay.classList.add('positive');
    } else if (count < 0) {
        counterDisplay.classList.add('negative');
    }
}

decreaseBtn.addEventListener('click', () => {
    count--;
    updateDisplay();
});

resetBtn.addEventListener('click', () => {
    count = 0;
    updateDisplay();
});

increaseBtn.addEventListener('click', () => {
    count++;
    updateDisplay();
});

updateDisplay();