let coinCount = 0;
// Debug flag: set true to print why candidate positions are rejected (can toggle in console)
let COIN_DEBUG = false;
// Measured coin radius and minimal coin distance (computed at runtime)
let COIN_RADIUS = null; // will be filled by getCoinRadius()
let MIN_COIN_DISTANCE = null;
// Target number of coins to keep on screen
const TARGET_COINS = 18;

// Measure the rendered coin size (returns radius in page pixels)
function getCoinRadius() {
    // If we already measured, return cached value
    if (COIN_RADIUS) return COIN_RADIUS;
    // Create a temporary coin element offscreen to measure
    const temp = document.createElement('img');
    temp.src = 'asset/coin.png';
    temp.className = 'coin';
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    temp.style.top = '-9999px';
    temp.style.opacity = '0';
    document.body.appendChild(temp);
    // force layout
    const rect = temp.getBoundingClientRect();
    const radius = Math.max(rect.width, rect.height) / 2 || 50;
    temp.remove();
    COIN_RADIUS = radius;
    MIN_COIN_DISTANCE = COIN_RADIUS * 2;
    if (COIN_DEBUG) console.log('Measured coin radius:', COIN_RADIUS, 'minDistance:', MIN_COIN_DISTANCE);
    return COIN_RADIUS;
}
const gameContainer = document.getElementById('gameContainer');
const gachaMachine = document.getElementById('gachaMachine');
const ball = document.getElementById('ball');
const giftModal = document.getElementById('giftModal');
const giftImage = document.getElementById('giftImage');
const coinCountDisplay = document.getElementById('coinCount');

const gifts = ['asset/bell.png', 'asset/socks.png', 'asset/hat.png', 'asset/snowflake.png', 'asset/elf.png', 'asset/santa.png'];
let coins = [];

// Helper: check if a point is in viewport
function isInViewport(x, y) {
    const margin = 20; // margin from viewport edges
    return x >= margin && x <= window.innerWidth - margin && 
           y >= margin && y <= window.innerHeight - margin;
}

// Helper: get visible coins count
function getVisibleCoinsCount() {
    return coins.filter(coin => {
        const rect = coin.element.getBoundingClientRect();
        return rect.top >= 0 && rect.left >= 0 && 
               rect.bottom <= window.innerHeight && 
               rect.right <= window.innerWidth;
    }).length;
}

// Helper: distance from a point to a rect (0 if inside rect)
function pointRectDistance(px, py, rect) {
    const dx = Math.max(rect.left - px, 0, px - rect.right);
    const dy = Math.max(rect.top - py, 0, py - rect.bottom);
    return Math.sqrt(dx * dx + dy * dy);
}

// Helper: create a coin at a page-coordinate (x,y) - viewport coordinates
function createCoinAtPage(pageX, pageY) {
    // Ensure coin is in viewport
    if (!isInViewport(pageX, pageY)) {
        if (COIN_DEBUG) console.log('Coin rejected: outside viewport', pageX, pageY);
        return false;
    }

    const coin = document.createElement('img');
    coin.src = 'asset/coin.png';
    coin.className = 'coin';
    coin.draggable = true;

    const containerRect = gameContainer.getBoundingClientRect();
    const left = pageX - containerRect.left;
    const top = pageY - containerRect.top;

    coin.style.left = Math.max(0, Math.min(left, containerRect.width - 40)) + 'px';
    coin.style.top = Math.max(0, Math.min(top, containerRect.height - 40)) + 'px';

    coin.addEventListener('dragstart', handleDragStart);
    coin.addEventListener('dragend', handleDragEnd);

    gameContainer.appendChild(coin);
    coins.push({ element: coin, x: pageX, y: pageY });
    if (COIN_DEBUG) console.log('Coin created at:', pageX, pageY, 'Total coins:', coins.length);
    // Sanity check: warn if this coin is too close to gacha
    try {
        const gRect = gachaMachine.getBoundingClientRect();
        const d = pointRectDistance(pageX, pageY, { left: gRect.left, right: gRect.right, top: gRect.top, bottom: gRect.bottom });
        const measured = COIN_RADIUS || getCoinRadius();
        if (d < measured + 5) {
            console.warn('Sanity: coin created too close to gacha:', pageX, pageY, 'distToGacha:', d, 'measuredRadius:', measured);
        }
    } catch (err) {
        // ignore
    }
    return true;
}

// Add N coins arranged around title, tip and gacha evenly
function addCoinsAroundGacha(count) {
    if (count <= 0) return;
    const gashaRect = gachaMachine.getBoundingClientRect();
    const tipEl = document.querySelector('.tip-image');
    const tipRect = tipEl ? tipEl.getBoundingClientRect() : null;
    const titleRect = document.querySelector('.title-container').getBoundingClientRect();

    // ensure we have an up-to-date coin radius
    const measuredRadius = getCoinRadius();

    // Calculate centers and radii for all three elements
    const elements = [];
    
    // Title
    const titleCenterX = titleRect.left + titleRect.width / 2;
    const titleCenterY = titleRect.top + titleRect.height / 2;
    const titleRadius = Math.max(titleRect.width, titleRect.height) / 2;
    elements.push({ centerX: titleCenterX, centerY: titleCenterY, radius: titleRadius, name: 'title' });
    
    // Gasha
    const gCenterX = gashaRect.left + gashaRect.width / 2;
    const gCenterY = gashaRect.top + gashaRect.height / 2;
    const gRadius = Math.max(gashaRect.width, gashaRect.height) / 2;
    elements.push({ centerX: gCenterX, centerY: gCenterY, radius: gRadius, name: 'gasha' });
    
    // Tip
    if (tipRect) {
        const tipCenterX = tipRect.left + tipRect.width / 2;
        const tipCenterY = tipRect.top + tipRect.height / 2;
        const tipRadius = Math.max(tipRect.width, tipRect.height) / 2;
        elements.push({ centerX: tipCenterX, centerY: tipCenterY, radius: tipRadius, name: 'tip' });
    }

    // Treat coin as circle with COIN_RADIUS; it's forbidden if its circle intersects any forbidden rect
    function inForbidden(x, y) {
        const pad = 8;
        // title
        if (pointRectDistance(x, y, { left: titleRect.left - pad, right: titleRect.right + pad, top: titleRect.top - pad, bottom: titleRect.bottom + pad }) < measuredRadius) {
            if (COIN_DEBUG) console.log('reject: near title', x, y);
            return true;
        }
        // gasha - ensure the coin circle doesn't intersect gacha rect
        const GACHA_SAFE = measuredRadius + 10; // extra safety gap in px
        if (pointRectDistance(x, y, { left: gashaRect.left, right: gashaRect.right, top: gashaRect.top, bottom: gashaRect.bottom }) < GACHA_SAFE) {
            if (COIN_DEBUG) console.log('reject: near gasha', x, y);
            return true;
        }
        if (tipRect) {
            if (pointRectDistance(x, y, { left: tipRect.left - pad, right: tipRect.right + pad, top: tipRect.top - pad, bottom: tipRect.bottom + pad }) < measuredRadius) {
                if (COIN_DEBUG) console.log('reject: near tip', x, y);
                return true;
            }
        }
        return false;
    }

    let placed = 0;
    const coinsPerElement = Math.ceil(count / elements.length);

    // Distribute coins around each element
    for (const element of elements) {
        if (placed >= count) break;
        
        const coinsForThisElement = Math.min(coinsPerElement, count - placed);
        const angleStep = (Math.PI * 2) / coinsForThisElement;
        const minRadius = element.radius + measuredRadius + 30;
        const maxRadius = element.radius + measuredRadius + 200;
        
        let attempts = 0;
        let placedForElement = 0;
        
        // Try to place coins in a ring around this element
        for (let i = 0; i < coinsForThisElement && placedForElement < coinsForThisElement && attempts < 500; i++) {
            attempts++;
            const angle = i * angleStep + (Math.random() - 0.5) * (angleStep * 0.4);
            const radius = minRadius + Math.random() * (maxRadius - minRadius);
            const pageX = element.centerX + Math.cos(angle) * radius;
            const pageY = element.centerY + Math.sin(angle) * radius;
            
            if (!isInViewport(pageX, pageY)) continue;
            if (inForbidden(pageX, pageY)) continue;
            if (isOverlapping(pageX, pageY, coins)) continue;
            if (createCoinAtPage(pageX, pageY)) {
                placed++;
                placedForElement++;
            }
        }
    }

    // Fill remaining coins in empty spaces between elements
    let safety = 0;
    while (placed < count && safety < 1000) {
        safety++;
        // Generate random position in viewport
        const margin = 20;
        const pageX = margin + Math.random() * (window.innerWidth - 2 * margin);
        const pageY = margin + Math.random() * (window.innerHeight - 2 * margin);
        
        if (!isInViewport(pageX, pageY)) continue;
        if (inForbidden(pageX, pageY)) continue;
        if (isOverlapping(pageX, pageY, coins)) continue;
        if (createCoinAtPage(pageX, pageY)) {
            placed++;
        }
    }
}

// 创建散落的硬币（确保至少 TARGET_COINS 个可见）
function createCoins() {
    const target = TARGET_COINS; // 初始至少显示的硬币数
    console.log('Creating up to', target, 'coins');
    addCoinsAroundGacha(target - coins.length);
    console.log('Total coins after init:', coins.length, 'Visible:', getVisibleCoinsCount());
}

// 确保始终有足够的可见硬币
function ensureVisibleCoins() {
    const visibleCount = getVisibleCoinsCount();
    const needed = TARGET_COINS - visibleCount;
    if (needed > 0) {
        console.log('Refilling coins: visible =', visibleCount, 'needed =', needed);
        addCoinsAroundGacha(needed);
    }
}

function isOverlapping(x, y, existingCoins) {
    for (let coin of existingCoins) {
        const distance = Math.sqrt(Math.pow(x - coin.x, 2) + Math.pow(y - coin.y, 2));
        if (distance < MIN_COIN_DISTANCE) {
            if (COIN_DEBUG) console.log('reject: overlap with coin', x, y, 'existing', coin.x, coin.y, 'dist', distance);
            return true;
        }
    }
    return false;
}

let draggedCoin = null;

function handleDragStart(e) {
    draggedCoin = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.outerHTML);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
}

// 扭蛋机拖拽区域
gachaMachine.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
});

gachaMachine.addEventListener('drop', (e) => {
    e.preventDefault();
    if (draggedCoin) {
        // 硬币消失动画
        draggedCoin.style.transition = 'all 0.3s ease-out';
        draggedCoin.style.transform = 'scale(0)';
        draggedCoin.style.opacity = '0';
        
        setTimeout(() => {
            draggedCoin.remove();
            coins = coins.filter(c => c.element !== draggedCoin);
            draggedCoin = null;
            
            // 增加硬币计数
            coinCount++;
            coinCountDisplay.textContent = coinCount;
            
            // 生成新硬币，确保至少有 TARGET_COINS 个可见
            ensureVisibleCoins();

            // 播放扭蛋机旋钮动画并显示扭蛋（drop 后出现）
            gachaMachine.classList.add('rotating');
            setTimeout(() => {
                gachaMachine.classList.remove('rotating');
            }, 600);
            // 在旋转稍后显示扭蛋，保持和点击抽取时相同的延迟
            setTimeout(() => {
                ball.style.display = 'block';
            }, 400);
        }, 300);
    }
});

// 点击扭蛋机抽取
gachaMachine.addEventListener('click', () => {
    if (coinCount > 0) {
        coinCount--;
        coinCountDisplay.textContent = coinCount;
        
        // 添加旋钮旋转动画
        gachaMachine.classList.add('rotating');
        setTimeout(() => {
            gachaMachine.classList.remove('rotating');
        }, 600);
        
        // 延迟显示扭蛋，等待旋转动画完成
        setTimeout(() => {
            ball.style.display = 'block';
        }, 400);
    }
});

// 点击扭蛋显示礼物
ball.addEventListener('click', () => {
    // 随机选择礼物
    const randomGift = gifts[Math.floor(Math.random() * gifts.length)];
    giftImage.src = randomGift;
    giftModal.classList.add('show');
    ball.style.display = 'none';
});

// 点击全屏模态框任意位置关闭
giftModal.addEventListener('click', (e) => {
    giftModal.classList.remove('show');
});

// 初始化
// Expose debug helpers to window so you can toggle and inspect from DevTools
window.enableCoinDebug = function() { COIN_DEBUG = true; console.log('COIN_DEBUG = true'); };
window.disableCoinDebug = function() { COIN_DEBUG = false; console.log('COIN_DEBUG = false'); };
window.refillCoins = function() { ensureVisibleCoins(); };

// Draw outlines for forbidden rects (temporary visual aid)
window.showForbiddenRects = function() {
    const existing = document.querySelectorAll('.debug-rect');
    existing.forEach(e => e.remove());
    const g = gachaMachine.getBoundingClientRect();
    const t = document.querySelector('.title-container').getBoundingClientRect();
    const tipEl = document.querySelector('.tip-image');
    const tipR = tipEl ? tipEl.getBoundingClientRect() : null;

    function makeRect(rect, color) {
        const d = document.createElement('div');
        d.className = 'debug-rect';
        d.style.position = 'fixed';
        d.style.left = rect.left + 'px';
        d.style.top = rect.top + 'px';
        d.style.width = (rect.right - rect.left) + 'px';
        d.style.height = (rect.bottom - rect.top) + 'px';
        d.style.border = '3px dashed ' + color;
        d.style.zIndex = 2000;
        d.style.pointerEvents = 'none';
        document.body.appendChild(d);
    }

    makeRect(g, 'red');
    makeRect(t, 'yellow');
    if (tipR) makeRect(tipR, 'blue');
};

// 初始化
createCoins();

// 定期检查并补充可见硬币
setInterval(() => {
    ensureVisibleCoins();
}, 2000); // 每2秒检查一次

// 窗口大小改变时重新生成硬币
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        // 移除所有硬币
        coins.forEach(coin => coin.element.remove());
        coins = [];
        // 重新生成
        createCoins();
    }, 300);
});

