let coinCount = 0;
// Debug flag: set true to print why candidate positions are rejected (can toggle in console)
let COIN_DEBUG = false;
// Measured coin radius and minimal coin distance (computed at runtime)
let COIN_RADIUS = null; // will be filled by getCoinRadius()
let MIN_COIN_DISTANCE = null;
// Target number of coins to keep on screen (reduced for better performance)
const TARGET_COINS = 10;
// Initial coins to load (reduced for faster initial load, especially on mobile)
const INITIAL_COINS = 6;

// Measure the rendered coin size (returns radius in page pixels)
function getCoinRadius() {
    // If we already measured, return cached value
    if (COIN_RADIUS) return COIN_RADIUS;
    // Use a default value first to avoid blocking, then measure when coin is actually loaded
    // This prevents blocking initial render
    const defaultRadius = 50;
    COIN_RADIUS = defaultRadius;
    MIN_COIN_DISTANCE = COIN_RADIUS * 2;
    
    // Measure actual size asynchronously (after page load)
    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', measureCoinSize);
    } else {
        // Use setTimeout to defer measurement after initial render
        setTimeout(measureCoinSize, 100);
    }
    
    return COIN_RADIUS;
}

// Measure actual coin size (called asynchronously)
function measureCoinSize() {
    if (COIN_RADIUS && COIN_RADIUS !== 50) return; // Already measured with actual value
    
    const temp = document.createElement('img');
    temp.src = 'asset/coin.png';
    temp.className = 'coin';
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    temp.style.top = '-9999px';
    temp.style.opacity = '0';
    temp.loading = 'eager'; // Load immediately for measurement
    document.body.appendChild(temp);
    
    // Wait for image to load before measuring
    temp.onload = () => {
        const rect = temp.getBoundingClientRect();
        const radius = Math.max(rect.width, rect.height) / 2 || 50;
        COIN_RADIUS = radius;
        MIN_COIN_DISTANCE = COIN_RADIUS * 2;
        temp.remove();
        if (COIN_DEBUG) console.log('Measured coin radius:', COIN_RADIUS, 'minDistance:', MIN_COIN_DISTANCE);
    };
    
    temp.onerror = () => {
        // If image fails to load, keep default
        temp.remove();
    };
}
const gameContainer = document.getElementById('gameContainer');
const gachaMachine = document.getElementById('gachaMachine');
const ball = document.getElementById('ball');
const giftModal = document.getElementById('giftModal');
const giftImage = document.getElementById('giftImage');
const coinCountDisplay = document.getElementById('coinCount');

const gifts = ['asset/bell.png', 'asset/socks.png', 'asset/hat.png', 'asset/snowflake.png', 'asset/elf.png', 'asset/santa.png'];
let coins = [];

// 图片预加载函数（延迟加载非关键图片）
function preloadImages(urls, callback) {
    let loaded = 0;
    const total = urls.length;
    if (total === 0) {
        if (callback) callback();
        return;
    }
    
    urls.forEach(url => {
        const img = new Image();
        img.onload = img.onerror = () => {
            loaded++;
            if (loaded === total && callback) callback();
        };
        img.src = url;
    });
}

// 延迟预加载非关键图片（在关键图片加载完成后）
function preloadNonCriticalImages() {
    // 延迟加载礼物图片和tip图片
    setTimeout(() => {
        const nonCriticalImages = [
            'asset/tip.png',
            'asset/ball.png',
            ...gifts
        ];
        preloadImages(nonCriticalImages);
    }, 1000); // 延迟1秒，让关键图片先加载
}

// Helper: check if a point is in viewport and not blocked by UI elements
function isInViewport(x, y) {
    const margin = 20; // margin from viewport edges
    if (x < margin || x > window.innerWidth - margin || 
        y < margin || y > window.innerHeight - margin) {
        return false;
    }
    
    // Check if point is near coin count display (top-right corner)
    const coinDisplay = document.querySelector('.coin-count-display');
    if (coinDisplay) {
        const rect = coinDisplay.getBoundingClientRect();
        const padding = 30; // extra padding around the button
        if (x >= rect.left - padding && x <= rect.right + padding &&
            y >= rect.top - padding && y <= rect.bottom + padding) {
            return false;
        }
    }
    
    return true;
}

// Helper: get visible coins count (coins that are at least partially visible)
function getVisibleCoinsCount() {
    return coins.filter(coin => {
        if (!coin.element || !coin.element.parentNode) {
            return false; // Coin has been removed
        }
        const rect = coin.element.getBoundingClientRect();
        // Check if coin is at least partially visible (overlaps with viewport)
        return rect.bottom > 0 && rect.right > 0 && 
               rect.top < window.innerHeight && 
               rect.left < window.innerWidth;
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
    coin.loading = 'lazy'; // Lazy load coin images for better performance

    const containerRect = gameContainer.getBoundingClientRect();
    const left = pageX - containerRect.left;
    const top = pageY - containerRect.top;

    coin.style.left = Math.max(0, Math.min(left, containerRect.width - 40)) + 'px';
    coin.style.top = Math.max(0, Math.min(top, containerRect.height - 40)) + 'px';

    // Desktop drag events
    coin.addEventListener('dragstart', handleDragStart);
    coin.addEventListener('dragend', handleDragEnd);
    
    // Mobile touch events
    coin.addEventListener('touchstart', handleTouchStart, { passive: false });
    coin.addEventListener('touchmove', handleTouchMove, { passive: false });
    coin.addEventListener('touchend', handleTouchEnd, { passive: false });

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
    
    // Use requestAnimationFrame to avoid blocking, especially on iOS
    requestAnimationFrame(() => {
        // Further defer on mobile devices for better performance
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (isMobile) {
            setTimeout(() => {
                addCoinsAroundGachaInternal(count);
            }, 50);
            return;
        }
        addCoinsAroundGachaInternal(count);
    });
}

function addCoinsAroundGachaInternal(count) {
    if (count <= 0) return 0;
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

    // Distribute coins around each element (simplified for performance)
    for (const element of elements) {
        if (placed >= count) break;
        
        const coinsForThisElement = Math.min(coinsPerElement, count - placed);
        const angleStep = (Math.PI * 2) / coinsForThisElement;
        const minRadius = element.radius + measuredRadius + 30;
        const maxRadius = element.radius + measuredRadius + 150; // Reduced range for faster placement
        
        let placedForElement = 0;
        
        // Try to place coins in a ring around this element (simplified)
        for (let i = 0; i < coinsForThisElement && placedForElement < coinsForThisElement; i++) {
            const angle = i * angleStep + (Math.random() - 0.5) * (angleStep * 0.3);
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

    // Fill remaining coins in empty spaces between elements (increased attempts for better placement)
    let safety = 0;
    const maxAttempts = Math.max(500, count * 30); // Increased attempts for better placement
    while (placed < count && safety < maxAttempts) {
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
    
    return placed; // Return actual number of coins placed
}

// 创建散落的硬币（初始加载较少硬币以提高性能）
function createCoins() {
    // Detect mobile devices for longer delay
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const initialDelay = isMobile ? 300 : 100; // Longer delay on mobile
    
    // Defer coin creation to avoid blocking initial render
    setTimeout(() => {
        const target = INITIAL_COINS; // 初始加载较少的硬币以提高性能
        console.log('Creating initial', target, 'coins');
        addCoinsAroundGacha(target - coins.length);
        // Then fill to target after a delay (longer on mobile)
        setTimeout(() => {
            const needed = TARGET_COINS - getVisibleCoinsCount();
            if (needed > 0) {
                addCoinsAroundGacha(needed);
            }
        }, isMobile ? 1000 : 500);
        console.log('Total coins after init:', coins.length, 'Visible:', getVisibleCoinsCount());
    }, initialDelay);
}

// 确保始终有足够的可见硬币
function ensureVisibleCoins() {
    // Defer to avoid blocking
    requestAnimationFrame(() => {
        const visibleCount = getVisibleCoinsCount();
        const needed = TARGET_COINS - visibleCount;
        if (needed > 0) {
            console.log('Refilling coins: visible =', visibleCount, 'needed =', needed);
            // Use the internal function directly to get actual placement count
            const actuallyPlaced = addCoinsAroundGachaInternal(needed);
            if (actuallyPlaced < needed) {
                // If not all coins were placed, try again after a delay
                const remaining = needed - actuallyPlaced;
                setTimeout(() => {
                    const secondAttempt = addCoinsAroundGachaInternal(remaining);
                    console.log('Second attempt: placed', secondAttempt, 'more coins. Total visible:', getVisibleCoinsCount());
                }, 200);
            }
        }
    });
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
let touchStartX = 0;
let touchStartY = 0;
let isDragging = false;

function handleDragStart(e) {
    draggedCoin = this;
    this.classList.add('dragging');
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.outerHTML);
    }
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    isDragging = false;
}

// Touch event handlers for mobile
function handleTouchStart(e) {
    e.preventDefault();
    draggedCoin = this;
    isDragging = true;
    this.classList.add('dragging');
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    
    // Get initial position
    const rect = this.getBoundingClientRect();
    this.dataset.startX = rect.left;
    this.dataset.startY = rect.top;
    this.style.position = 'fixed';
    this.style.left = rect.left + 'px';
    this.style.top = rect.top + 'px';
    this.style.zIndex = '1000';
}

function handleTouchMove(e) {
    if (!isDragging || !draggedCoin) return;
    e.preventDefault();
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    
    draggedCoin.style.left = (parseFloat(draggedCoin.dataset.startX) + deltaX) + 'px';
    draggedCoin.style.top = (parseFloat(draggedCoin.dataset.startY) + deltaY) + 'px';
}

function handleTouchEnd(e) {
    if (!isDragging || !draggedCoin) return;
    e.preventDefault();
    isDragging = false;
    
    const coinRect = draggedCoin.getBoundingClientRect();
    const gachaRect = gachaMachine.getBoundingClientRect();
    
    // Check if coin is over gacha machine
    const coinCenterX = coinRect.left + coinRect.width / 2;
    const coinCenterY = coinRect.top + coinRect.height / 2;
    
    if (coinCenterX >= gachaRect.left && coinCenterX <= gachaRect.right &&
        coinCenterY >= gachaRect.top && coinCenterY <= gachaRect.bottom) {
        // Coin dropped on gacha machine
        handleCoinDrop(draggedCoin);
    } else {
        // Reset coin position
        draggedCoin.classList.remove('dragging');
        draggedCoin.style.position = '';
        draggedCoin.style.left = '';
        draggedCoin.style.top = '';
        draggedCoin.style.zIndex = '';
        draggedCoin = null;
    }
}

function handleCoinDrop(coin) {
    // 硬币消失动画
    coin.style.transition = 'all 0.3s ease-out';
    coin.style.transform = 'scale(0)';
    coin.style.opacity = '0';
    
    setTimeout(() => {
        coin.remove();
        coins = coins.filter(c => c.element !== coin);
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

// 扭蛋机拖拽区域
gachaMachine.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
});

gachaMachine.addEventListener('drop', (e) => {
    e.preventDefault();
    if (draggedCoin) {
        handleCoinDrop(draggedCoin);
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

// 初始化 - 确保ball初始隐藏
if (ball) {
    ball.style.display = 'none';
}

// 页面加载完成后预加载非关键图片
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        preloadNonCriticalImages();
    });
} else {
    // DOM already loaded
    preloadNonCriticalImages();
}

// 初始化硬币（延迟加载以提高性能）
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

