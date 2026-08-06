let count = 0;

document.getElementById('increment-btn').addEventListener('click', function() {
    count++;
    document.getElementById('count-display').textContent = count;
});