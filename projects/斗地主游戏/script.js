// 游戏状态
let gameState = {
    deck: [],
    players: [
        { name: '电脑1', cards: [], isHuman: false, isLandlord: false },
        { name: '电脑2', cards: [], isHuman: false, isLandlord: false },
        { name: '你', cards: [], isHuman: true, isLandlord: false }
    ],
    landlordIndex: -1,
    currentPlayer: 0,
    lastPlay: null,
    lastPlayer: -1,
    gameOver: false,
    turnCount: 0
};

// 牌面值映射
const cardValues = ['3','4','5','6','7','8','9','10','J','Q','K','A','2','小王','大王'];
const cardScores = { '3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,'2':15,'小王':16,'大王':17 };

// DOM元素
const topCards = document.getElementById('top-cards');
const leftCards = document.getElementById('left-cards');
const bottomCards = document.getElementById('bottom-cards');
const lastCards = document.getElementById('last-cards');
const gameStatus = document.getElementById('game-status');
const btnStart = document.getElementById('btn-start');
const btnPlay = document.getElementById('btn-play');
const btnPass = document.getElementById('btn-pass');
const btnHint = document.getElementById('btn-hint');
const topCount = document.getElementById('top-count');
const leftCount = document.getElementById('left-count');
const bottomCount = document.getElementById('bottom-count');

// 初始化牌组
function createDeck() {
    const deck = [];
    for (let i = 0; i < 13; i++) {
        for (let j = 0; j < 4; j++) {
            deck.push(cardValues[i]);
        }
    }
    deck.push('小王');
    deck.push('大王');
    return deck;
}

// 洗牌
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// 发牌
function dealCards() {
    gameState.deck = shuffle(createDeck());
    gameState.players.forEach(p => p.cards = []);
    for (let i = 0; i < 51; i++) {
        gameState.players[i % 3].cards.push(gameState.deck[i]);
    }
    // 底牌
    const bottomCards = gameState.deck.slice(51);
    // 随机地主
    gameState.landlordIndex = Math.floor(Math.random() * 3);
    gameState.players[gameState.landlordIndex].isLandlord = true;
    gameState.players[gameState.landlordIndex].cards.push(...bottomCards);
    // 排序
    gameState.players.forEach(p => {
        p.cards.sort((a,b) => cardScores[a] - cardScores[b]);
    });
    gameState.currentPlayer = gameState.landlordIndex;
    gameState.lastPlay = null;
    gameState.lastPlayer = -1;
    gameState.gameOver = false;
    gameState.turnCount = 0;
}

// 渲染牌
function renderCards(container, cards, isBack = false) {
    container.innerHTML = '';
    cards.forEach((card, index) => {
        const div = document.createElement('div');
        div.className = 'card';
        if (isBack) {
            div.classList.add('back');
            div.textContent = '?';
        } else {
            const isRed = card.includes('红') || card.includes('方') || card === '大王';
            div.classList.add(isRed ? 'red' : 'black');
            div.textContent = card;
            div.dataset.value = card;
            div.dataset.index = index;
            if (gameState.players[2].isHuman) {
                div.addEventListener('click', () => toggleSelect(div));
            }
        }
        container.appendChild(div);
    });
}

// 选择牌
function toggleSelect(cardEl) {
    if (gameState.currentPlayer !== 2 || gameState.gameOver) return;
    cardEl.classList.toggle('selected');
}

// 更新界面
function updateUI() {
    // 更新牌数
    topCount.textContent = gameState.players[0].cards.length;
    leftCount.textContent = gameState.players[1].cards.length;
    bottomCount.textContent = gameState.players[2].cards.length;
    
    // 渲染牌
    renderCards(topCards, gameState.players[0].cards, true);
    renderCards(leftCards, gameState.players[1].cards, true);
    renderCards(bottomCards, gameState.players[2].cards, false);
    
    // 渲染上次出的牌
    if (gameState.lastPlay) {
        renderCards(lastCards, gameState.lastPlay, false);
    } else {
        lastCards.innerHTML = '';
    }
    
    // 更新状态
    const currentPlayerName = gameState.players[gameState.currentPlayer].name;
    const landlordName = gameState.players[gameState.landlordIndex].name;
    if (gameState.gameOver) {
        const winner = gameState.players.find(p => p.cards.length === 0);
        gameStatus.textContent = `${winner.name} 获胜！`;
        btnStart.disabled = false;
        btnPlay.disabled = true;
        btnPass.disabled = true;
        btnHint.disabled = true;
    } else {
        gameStatus.textContent = `地主：${landlordName} | 当前：${currentPlayerName}`;
        if (gameState.currentPlayer === 2) {
            btnPlay.disabled = false;
            btnPass.disabled = false;
            btnHint.disabled = false;
        } else {
            btnPlay.disabled = true;
            btnPass.disabled = true;
            btnHint.disabled = true;
        }
    }
}

// 判断牌型
function getCardType(cards) {
    if (cards.length === 0) return null;
    const values = cards.map(c => cardScores[c]).sort((a,b) => a-b);
    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const uniqueValues = Object.keys(counts).map(Number).sort((a,b) => a-b);
    const countValues = Object.values(counts).sort((a,b) => a-b);
    
    // 单张
    if (cards.length === 1) return { type: 'single', main: values[0], length: 1 };
    // 对子
    if (cards.length === 2 && countValues.length === 1 && countValues[0] === 2) return { type: 'pair', main: values[0], length: 2 };
    // 三张
    if (cards.length === 3 && countValues.length === 1 && countValues[0] === 3) return { type: 'triple', main: values[0], length: 3 };
    // 三带一
    if (cards.length === 4 && countValues.includes(3) && countValues.includes(1)) {
        const main = uniqueValues.find(v => counts[v] === 3);
        return { type: 'triple_one', main, length: 4 };
    }
    // 三带二
    if (cards.length === 5 && countValues.includes(3) && countValues.includes(2)) {
        const main = uniqueValues.find(v => counts[v] === 3);
        return { type: 'triple_two', main, length: 5 };
    }
    // 顺子
    if (cards.length >= 5 && countValues.every(c => c === 1) && uniqueValues.length === cards.length) {
        if (uniqueValues[uniqueValues.length-1] - uniqueValues[0] === cards.length - 1 && uniqueValues[uniqueValues.length-1] <= 14) {
            return { type: 'straight', main: uniqueValues[uniqueValues.length-1], length: cards.length };
        }
    }
    // 连对
    if (cards.length >= 6 && cards.length % 2 === 0 && countValues.every(c => c === 2) && uniqueValues.length === cards.length/2) {
        if (uniqueValues[uniqueValues.length-1] - uniqueValues[0] === uniqueValues.length - 1 && uniqueValues[uniqueValues.length-1] <= 14) {
            return { type: 'straight_pair', main: uniqueValues[uniqueValues.length-1], length: cards.length };
        }
    }
    // 飞机不带
    if (cards.length >= 6 && cards.length % 3 === 0 && countValues.every(c => c === 3) && uniqueValues.length === cards.length/3) {
        if (uniqueValues[uniqueValues.length-1] - uniqueValues[0] === uniqueValues.length - 1 && uniqueValues[uniqueValues.length-1] <= 14) {
            return { type: 'plane', main: uniqueValues[uniqueValues.length-1], length: cards.length };
        }
    }
    // 飞机带单
    if (cards.length >= 8 && countValues.includes(3) && countValues.filter(c => c === 1).length > 0) {
        const triples = uniqueValues.filter(v => counts[v] === 3);
        if (triples.length >= 2 && triples[triples.length-1] - triples[0] === triples.length - 1 && triples[triples.length-1] <= 14) {
            return { type: 'plane_single', main: triples[triples.length-1], length: cards.length };
        }
    }
    // 飞机带对
    if (cards.length >= 10 && countValues.includes(3) && countValues.filter(c => c === 2).length > 0) {
        const triples = uniqueValues.filter(v => counts[v] === 3);
        if (triples.length >= 2 && triples[triples.length-1] - triples[0] === triples.length - 1 && triples[triples.length-1] <= 14) {
            return { type: 'plane_pair', main: triples[triples.length-1], length: cards.length };
        }
    }
    // 四带二
    if (cards.length === 6 && countValues.includes(4) && countValues.filter(c => c === 1).length === 2) {
        const main = uniqueValues.find(v => counts[v] === 4);
        return { type: 'four_two', main, length: 6 };
    }
    // 炸弹
    if (cards.length === 4 && countValues.length === 1 && countValues[0] === 4) return { type: 'bomb', main: values[0], length: 4 };
    // 火箭
    if (cards.length === 2 && cards.includes('小王') && cards.includes('大王')) return { type: 'rocket', main: 17, length: 2 };
    return null;
}

// 比较牌型
function canBeat(newType, oldType) {
    if (!oldType) return true;
    if (newType.type === 'rocket') return true;
    if (newType.type === 'bomb') {
        if (oldType.type === 'bomb') return newType.main > oldType.main;
        return true;
    }
    if (oldType.type === 'bomb' || oldType.type === 'rocket') return false;
    if (newType.type !== oldType.type) return false;
    if (newType.length !== oldType.length) return false;
    return newType.main > oldType.main;
}

// 出牌
function playCards(playerIndex, cards) {
    const type = getCardType(cards);
    if (!type) return false;
    if (gameState.lastPlay && gameState.lastPlayer !== playerIndex) {
        if (!canBeat(type, gameState.lastPlay)) return false;
    }
    // 移除牌
    cards.forEach(card => {
        const idx = gameState.players[playerIndex].cards.indexOf(card);
        if (idx !== -1) gameState.players[playerIndex].cards.splice(idx, 1);
    });
    gameState.lastPlay = type;
    gameState.lastPlayer = playerIndex;
    gameState.players[playerIndex].cards.sort((a,b) => cardScores[a] - cardScores[b]);
    // 检查胜利
    if (gameState.players[playerIndex].cards.length === 0) {
        gameState.gameOver = true;
    }
    return true;
}

// 不出
function pass(playerIndex) {
    if (gameState.lastPlayer === playerIndex) return false;
    return true;
}

// AI出牌
function aiPlay(playerIndex) {
    const player = gameState.players[playerIndex];
    const cards = player.cards;
    // 简单策略：找最小能出的牌
    if (!gameState.lastPlay || gameState.lastPlayer === playerIndex) {
        // 自由出牌，出最小的单张或对子
        const sorted = [...cards].sort((a,b) => cardScores[a] - cardScores[b]);
        // 尝试出对子
        for (let i = 0; i < sorted.length - 1; i++) {
            if (sorted[i] === sorted[i+1]) {
                const pair = [sorted[i], sorted[i+1]];
                if (playCards(playerIndex, pair)) return;
            }
        }
        // 出单张
        if (playCards(playerIndex, [sorted[0]])) return;
    } else {
        // 需要压牌
        const lastType = gameState.lastPlay;
        const sorted = [...cards].sort((a,b) => cardScores[a] - cardScores[b]);
        // 尝试单张
        if (lastType.type === 'single') {
            for (let card of sorted) {
                if (cardScores[card] > lastType.main) {
                    if (playCards(playerIndex, [card])) return;
                }
            }
        }
        // 尝试对子
        if (lastType.type === 'pair') {
            for (let i = 0; i < sorted.length - 1; i++) {
                if (sorted[i] === sorted[i+1] && cardScores[sorted[i]] > lastType.main) {
                    if (playCards(playerIndex, [sorted[i], sorted[i+1]])) return;
                }
            }
        }
        // 尝试炸弹
        for (let i = 0; i < sorted.length - 3; i++) {
            if (sorted[i] === sorted[i+1] && sorted[i] === sorted[i+2] && sorted[i] === sorted[i+3]) {
                if (playCards(playerIndex, [sorted[i], sorted[i], sorted[i], sorted[i]])) return;
            }
        }
        // 不出
        pass(playerIndex);
    }
}

// 游戏循环
function nextTurn() {
    if (gameState.gameOver) {
        updateUI();
        return;
    }
    gameState.turnCount++;
    // 如果所有人都pass，重置
    if (gameState.turnCount > 3 && gameState.lastPlayer !== -1) {
        const activePlayers = gameState.players.filter((p,i) => i === gameState.lastPlayer || p.cards.length > 0);
        if (activePlayers.length === 1) {
            gameState.lastPlay = null;
            gameState.lastPlayer = -1;
            gameState.turnCount = 0;
        }
    }
    
    if (gameState.currentPlayer === 2) {
        // 人类玩家
        updateUI();
    } else {
        // AI
        setTimeout(() => {
            aiPlay(gameState.currentPlayer);
            gameState.currentPlayer = (gameState.currentPlayer + 1) % 3;
            updateUI();
            if (!gameState.gameOver) nextTurn();
        }, 800);
    }
}

// 开始游戏
function startGame() {
    dealCards();
    gameState.currentPlayer = gameState.landlordIndex;
    gameState.turnCount = 0;
    btnStart.disabled = true;
    updateUI();
    if (gameState.currentPlayer !== 2) {
        nextTurn();
    }
}

// 玩家出牌
function playerPlay() {
    const selected = document.querySelectorAll('#bottom-cards .card.selected');
    if (selected.length === 0) return;
    const cards = Array.from(selected).map(el => el.dataset.value);
    if (playCards(2, cards)) {
        gameState.currentPlayer = 0;
        gameState.turnCount = 0;
        updateUI();
        if (!gameState.gameOver) nextTurn();
    } else {
        alert('无效的出牌！');
    }
}

// 玩家不出
function playerPass() {
    if (gameState.lastPlayer === 2) {
        alert('你是上一轮出牌者，必须出牌！');
        return;
    }
    gameState.currentPlayer = 0;
    gameState.turnCount = 0;
    updateUI();
    nextTurn();
}

// 提示
function showHint() {
    const player = gameState.players[2];
    const cards = player.cards;
    const sorted = [...cards].sort((a,b) => cardScores[a] - cardScores[b]);
    // 清除选择
    document.querySelectorAll('#bottom-cards .card.selected').forEach(el => el.classList.remove('selected'));
    
    if (!gameState.lastPlay || gameState.lastPlayer === 2) {
        // 自由出牌，提示最小的单张
        const cardEl = document.querySelector(`#bottom-cards .card[data-value="${sorted[0]}"]`);
        if (cardEl) cardEl.classList.add('selected');
    } else {
        const lastType = gameState.lastPlay;
        // 尝试单张
        if (lastType.type === 'single') {
            for (let card of sorted) {
                if (cardScores[card] > lastType.main) {
                    const cardEl = document.querySelector(`#bottom-cards .card[data-value="${card}"]`);
                    if (cardEl) cardEl.classList.add('selected');
                    break;
                }
            }
        } else if (lastType.type === 'pair') {
            for (let i = 0; i < sorted.length - 1; i++) {
                if (sorted[i] === sorted[i+1] && cardScores[sorted[i]] > lastType.main) {
                    const cardEl1 = document.querySelector(`#bottom-cards .card[data-value="${sorted[i]}"]`);
                    const cardEl2 = document.querySelector(`#bottom-cards .card[data-value="${sorted[i+1]}"]`);
                    if (cardEl1 && cardEl2) {
                        cardEl1.classList.add('selected');
                        cardEl2.classList.add('selected');
                    }
                    break;
                }
            }
        } else if (lastType.type === 'bomb') {
            for (let i = 0; i < sorted.length - 3; i++) {
                if (sorted[i] === sorted[i+1] && sorted[i] === sorted[i+2] && sorted[i] === sorted[i+3] && cardScores[sorted[i]] > lastType.main) {
                    for (let j = 0; j < 4; j++) {
                        const cardEl = document.querySelector(`#bottom-cards .card[data-value="${sorted[i]}"]`);
                        if (cardEl) cardEl.classList.add('selected');
                    }
                    break;
                }
            }
        }
    }
}

// 事件绑定
btnStart.addEventListener('click', startGame);
btnPlay.addEventListener('click', playerPlay);
btnPass.addEventListener('click', playerPass);
btnHint.addEventListener('click', showHint);

// 初始化
updateUI();