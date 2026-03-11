function changeHamburger(x) {
    // Toggle visual hamburger animation
    x.classList.toggle("change");
    // Toggle the nav visibility by switching the 'active' class on the UL
    var y = document.getElementById("TopNav");
    if (y) {
        y.classList.toggle('active');
    }
}

// Attach listeners after DOM is ready in case the script is loaded in the head
document.addEventListener('DOMContentLoaded', function () {
    var navLinks = document.querySelectorAll('.nav-links a');
    var topNav = document.getElementById('TopNav');
    var hamburger = document.querySelector('.nav-toggle');

    navLinks.forEach(function (link) {
        link.addEventListener('click', function () {
            // Only attempt to close if the panel is active
            if (topNav && topNav.classList.contains('active')) {
                topNav.classList.remove('active');
            }
            // Reset hamburger animation if present
            if (hamburger && hamburger.classList.contains('change')) {
                hamburger.classList.remove('change');
            }
        });
    });

    /* --- Carousel initialization --- */
    function initCarousel(carouselId) {
        var carousel = document.getElementById(carouselId);
        if (!carousel) return;
        var wrapper = carousel.querySelector('.carousel-track-wrapper');
        var track = carousel.querySelector('.carousel-track');
        var slides = Array.from(track.querySelectorAll('.carousel-slide'));
        if (slides.length === 0) return;

        // Linear carousel (no clones)
        var currentIndex = 0; // start at the first slide
        var isMobile = (window.innerWidth <= 600);

        // Helper to center the given slide index
        function centerIndex(index, withTransition) {
            var slide = slides[index];
            if (!slide) return;
            var wrapperWidth = wrapper.clientWidth;
            var slideLeft = slide.offsetLeft;
            var slideWidth = slide.getBoundingClientRect().width;
            var translateX = -(slideLeft - (wrapperWidth - slideWidth) / 2);
            if (!withTransition) {
                track.style.transition = 'none';
            } else {
                track.style.transition = '';
            }
            // update active/prev/next classes first so they animate concurrently with the transform
            slides.forEach(function (s) { s.classList.remove('active','prev','next'); });
            slide.classList.add('active');
            // (prev/next classes already applied above)
            track.style.transform = 'translateX(' + translateX + 'px)';
            var prevIndex = index - 1;
            var nextIndex = index + 1;
            if (prevIndex >= 0) slides[prevIndex].classList.add('prev');
            if (nextIndex < slides.length) slides[nextIndex].classList.add('next');
            // enable/disable buttons
            if (btnPrev) btnPrev.disabled = (index === 0);
            if (btnNext) btnNext.disabled = (index === slides.length - 1);
            // if we reached the last slide, stop autoplay
            if (btnNext && btnNext.disabled && typeof autoplayTimer !== 'undefined' && autoplayTimer) {
                clearInterval(autoplayTimer);
                autoplayTimer = null;
            }
            currentIndex = index;
        }

        // Move to next / prev (bounded)
        function moveNext() { if (currentIndex < slides.length - 1) centerIndex(currentIndex + 1, true); }
        function movePrev() { if (currentIndex > 0) centerIndex(currentIndex - 1, true); }

        // Buttons
        var btnPrev = carousel.querySelector('.carousel-btn.prev');
        var btnNext = carousel.querySelector('.carousel-btn.next');
        if (btnPrev) btnPrev.addEventListener('click', movePrev);
        if (btnNext) btnNext.addEventListener('click', moveNext);

        // No clone handling needed for a linear carousel

        // Keyboard support
        document.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowLeft') movePrev();
            if (e.key === 'ArrowRight') moveNext();
        });

        // Resize handler: re-center current and update mobile flag
        window.addEventListener('resize', function () {
            // re-calc after a small debounce
            clearTimeout(window._carouselResizeTimer);
            window._carouselResizeTimer = setTimeout(function () { centerIndex(currentIndex, false); }, 120);
            isMobile = (window.innerWidth <= 600);
        });

        // Autoplay disabled: user-driven navigation only

        // Wait for images to load before computing initial layout
        var imgs = track.querySelectorAll('img');
        var loaded = 0;
        if (imgs.length === 0) {
            centerIndex(currentIndex, false);
        } else {
            imgs.forEach(function (img) {
                if (img.complete) {
                    loaded++;
                } else {
                    img.addEventListener('load', function () { loaded++; if (loaded === imgs.length) centerIndex(currentIndex, false); });
                    img.addEventListener('error', function () { loaded++; if (loaded === imgs.length) centerIndex(currentIndex, false); });
                }
            });
            if (loaded === imgs.length) centerIndex(currentIndex, false);
        }

        /* Swipe disabled by design: button-only navigation */
    }

    // Kick off the bagel carousel if present
    initCarousel('bagelCarousel');
});

// ==========================================
// MOBILE BOTTOM SHEET CART
// ==========================================
let bottomSheetState = 'peek'; // hidden, peek, half, expanded
let sheetDragging = false;
let sheetStartY = 0;
let sheetCurrentY = 0;
let sheetDidMove = false; // Track if user actually dragged

function setBottomSheetState(state) {
    const sheet = document.getElementById('cartBottomSheet');
    const overlay = document.getElementById('bottomSheetOverlay');
    if (!sheet) return;
    
    bottomSheetState = state;
    sheet.className = 'cart-bottom-sheet ' + state;
    
    if (overlay) {
        if (state === 'expanded') {
            overlay.classList.add('visible');
        } else {
            overlay.classList.remove('visible');
        }
    }
}

function toggleBottomSheet() {
    if (bottomSheetState === 'peek') {
        setBottomSheetState('expanded');
    } else {
        setBottomSheetState('peek');
    }
}

// Initialize bottom sheet event handlers
document.addEventListener('DOMContentLoaded', function() {
    const sheet = document.getElementById('cartBottomSheet');
    const handle = document.getElementById('sheetHandle');
    const header = document.getElementById('sheetHeader');
    const overlay = document.getElementById('bottomSheetOverlay');
    const checkoutBtn = document.getElementById('sheetCheckoutBtn');
    
    if (!sheet) return;
    
    // Tap overlay to minimize
    if (overlay) {
        overlay.addEventListener('click', function() {
            setBottomSheetState('peek');
        });
    }
    
    // Checkout button
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            // Trigger the same checkout flow as desktop
            const mainCheckoutBtn = document.getElementById('checkoutBtn');
            if (mainCheckoutBtn) mainCheckoutBtn.click();
        });
    }
    
    // Drag handling
    function startDrag(clientY) {
        sheetDragging = true;
        sheetDidMove = false;
        sheetStartY = clientY;
        sheetCurrentY = clientY;
    }
    
    function moveDrag(clientY) {
        if (!sheetDragging) return;
        
        const diff = clientY - sheetStartY;
        
        // Only start visual drag after moving at least 10px
        if (Math.abs(diff) > 10) {
            sheetDidMove = true;
            sheet.style.transition = 'none';
        }
        
        if (!sheetDidMove) return;
        
        sheetCurrentY = clientY;
        const windowHeight = window.innerHeight;
        
        // Calculate base position based on current state
        let baseTranslateY;
        if (bottomSheetState === 'peek') {
            baseTranslateY = windowHeight - 72;
        } else if (bottomSheetState === 'expanded') {
            baseTranslateY = 0;
        } else {
            baseTranslateY = windowHeight;
        }
        
        const newTranslateY = Math.max(0, Math.min(windowHeight - 72, baseTranslateY + diff));
        sheet.style.transform = `translateY(${newTranslateY}px)`;
    }
    
    function endDrag() {
        if (!sheetDragging) return;
        
        const wasDrag = sheetDidMove;
        sheetDragging = false;
        sheet.style.transition = '';
        sheet.style.transform = '';
        
        // If user actually dragged (moved finger), handle the swipe
        if (wasDrag) {
            const diff = sheetCurrentY - sheetStartY;
            
            if (Math.abs(diff) > 50) {
                if (diff < 0) {
                    // Swiped up
                    setBottomSheetState('expanded');
                } else {
                    // Swiped down
                    setBottomSheetState('peek');
                }
            } else {
                // Small movement - snap back
                setBottomSheetState(bottomSheetState);
            }
        } else {
            // It was a tap, not a drag - toggle the sheet
            toggleBottomSheet();
        }
        
        sheetDidMove = false;
    }
    
    // Touch events on the sheet top area
    sheet.addEventListener('touchstart', function(e) {
        const rect = sheet.getBoundingClientRect();
        const touchY = e.touches[0].clientY - rect.top;
        // Start drag if touching top 90px (handle + header area)
        if (touchY < 90) {
            startDrag(e.touches[0].clientY);
        }
    }, { passive: true });
    
    document.addEventListener('touchmove', function(e) {
        if (sheetDragging) {
            moveDrag(e.touches[0].clientY);
        }
    }, { passive: true });
    
    document.addEventListener('touchend', endDrag);
    
    // Mouse events (for desktop testing)
    sheet.addEventListener('mousedown', function(e) {
        const rect = sheet.getBoundingClientRect();
        const mouseY = e.clientY - rect.top;
        if (mouseY < 90) {
            startDrag(e.clientY);
            e.preventDefault();
        }
    });
    
    document.addEventListener('mousemove', function(e) {
        if (sheetDragging) {
            moveDrag(e.clientY);
        }
    });
    
    document.addEventListener('mouseup', endDrag);
});

// Menu rendering and quantity button initialization moved to an ES module: js/renderMenu.js
// This keeps `script.js` focused on site behaviour (carousels, cart updates, checkout, etc.).

// Adjust quantity from bottom sheet
function adjustSheetQty(itemId, delta) {
    if (itemId === 'combo_bagel_schmear') {
        // Handle combo item
        const comboQtyEl = document.querySelector('.combo-qty');
        if (comboQtyEl) {
            let qty = parseInt(comboQtyEl.textContent) || 0;
            qty = Math.max(0, qty + delta);
            comboQtyEl.textContent = qty;
        }
    } else {
        // Handle regular menu item
        const qtyEl = document.querySelector(`.qty[data-id="${itemId}"]`);
        if (qtyEl) {
            let qty = parseInt(qtyEl.textContent) || 0;
            qty = Math.max(0, qty + delta);
            qtyEl.textContent = qty;
        }
    }
    updateCart();
}

// Remove item from bottom sheet
function removeSheetItem(itemId) {
    if (itemId === 'combo_bagel_schmear') {
        const comboQtyEl = document.querySelector('.combo-qty');
        if (comboQtyEl) comboQtyEl.textContent = '0';
    } else {
        const qtyEl = document.querySelector(`.qty[data-id="${itemId}"]`);
        if (qtyEl) qtyEl.textContent = '0';
    }
    updateCart();
}

function updateCart() {
    let cartItems = [];
    let subtotal = 0;

    // Handle regular menu items
    document.querySelectorAll('.menu-item').forEach(item => {
        const id = item.dataset.id;
        const qty = parseInt(document.querySelector(`.qty[data-id="${id}"]`).textContent);
                
        if (qty > 0) {
            const name = item.dataset.name;
            const price = parseFloat(item.dataset.price);
            const itemTotal = qty * price;
                    
            cartItems.push({ id, name, price, qty, itemTotal });
            subtotal += itemTotal;
        }
    });

    // Handle combo item separately
    const comboItem = document.querySelector('.combo-item');
    if (comboItem) {
        const comboQtyEl = comboItem.querySelector('.combo-qty');
        const comboQty = parseInt(comboQtyEl?.textContent) || 0;
        
        if (comboQty > 0) {
            const bagelSelect = document.getElementById('comboBagelSelect');
            const schmearSelect = document.getElementById('comboSchmearSelect');
            const bagelId = bagelSelect?.value || '';
            const schmearId = schmearSelect?.value || '';
            const bagelName = bagelSelect?.selectedOptions[0]?.dataset?.name || 'No bagel';
            const schmearName = schmearSelect?.selectedOptions[0]?.dataset?.name || 'No schmear';
            
            const comboPrice = parseFloat(comboItem.dataset.price);
            const comboTotal = comboQty * comboPrice;
            const displayName = `Combo: ${bagelName} + ${schmearName}`;
            
            cartItems.push({
                id: 'combo_bagel_schmear',
                name: displayName,
                price: comboPrice,
                qty: comboQty,
                itemTotal: comboTotal,
                isCombo: true,
                bagelId,
                schmearId,
                bagelName,
                schmearName
            });
            subtotal += comboTotal;
        }
    }

    // Update cart display
    const cartItemsDiv = document.getElementById('cartItems');
    if (cartItems.length === 0) {
        cartItemsDiv.innerHTML = '<p class="empty-cart">No items added</p>';
    } else {
        cartItemsDiv.innerHTML = cartItems.map(item => 
            `<div class="cart-item">
                <span>${item.qty}x ${item.name}</span>
                <span>₹${item.itemTotal.toFixed(2)}</span>
            </div>`
        ).join('');
    }

    const sgst = subtotal * 0.025;
    const cgst = subtotal * 0.025;
    const tax = sgst + cgst;
    const total = subtotal + tax;

    document.getElementById('toggleTotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    const sgstEl = document.getElementById('sgst');
    const cgstEl = document.getElementById('cgst');
    if (sgstEl) sgstEl.textContent = `₹${sgst.toFixed(2)}`;
    if (cgstEl) cgstEl.textContent = `₹${cgst.toFixed(2)}`;
    document.getElementById('total').textContent = `₹${total.toFixed(2)}`;

    // Update review section (if present)
    const reviewItemsDiv = document.getElementById('reviewItems');
    if (reviewItemsDiv) {
        reviewItemsDiv.innerHTML = cartItems.map(item => 
            `<div class="review-item">
                <span>${item.qty}x ${item.name}</span>
                <span>₹${item.itemTotal.toFixed(2)}</span>
            </div>`
        ).join('');
    }
    const reviewTotalEl = document.getElementById('reviewTotal');
    if (reviewTotalEl) reviewTotalEl.textContent = `₹${total.toFixed(2)}`;

    // Update mobile bottom sheet cart
    const totalQty = cartItems.reduce((sum, item) => sum + item.qty, 0);
    const sheetItemCount = document.getElementById('sheetItemCount');
    const sheetTotal = document.getElementById('sheetTotal');
    const sheetCartItems = document.getElementById('sheetCartItems');
    const sheetSubtotal = document.getElementById('sheetSubtotal');
    const sheetSgst = document.getElementById('sheetSgst');
    const sheetCgst = document.getElementById('sheetCgst');
    const sheetTotalFull = document.getElementById('sheetTotalFull');
    
    if (sheetItemCount) sheetItemCount.textContent = `(${totalQty} item${totalQty !== 1 ? 's' : ''})`;
    if (sheetTotal) sheetTotal.textContent = `₹${total.toFixed(2)}`;
    if (sheetSubtotal) sheetSubtotal.textContent = `₹${subtotal.toFixed(2)}`;
    if (sheetSgst) sheetSgst.textContent = `₹${sgst.toFixed(2)}`;
    if (sheetCgst) sheetCgst.textContent = `₹${cgst.toFixed(2)}`;
    if (sheetTotalFull) sheetTotalFull.textContent = `₹${total.toFixed(2)}`;
    
    // Update sheet cart items with +/- and remove buttons
    if (sheetCartItems) {
        if (cartItems.length === 0) {
            sheetCartItems.innerHTML = '<p class="empty-cart">No items added</p>';
        } else {
            sheetCartItems.innerHTML = cartItems.map(item => 
                `<div class="sheet-cart-item">
                    <div class="sheet-item-info">
                        <span class="sheet-item-name">${item.name}</span>
                        <span class="sheet-item-price">₹${item.itemTotal.toFixed(2)}</span>
                    </div>
                    <div class="sheet-item-controls">
                        <button class="sheet-qty-btn" onclick="event.stopPropagation(); adjustSheetQty('${item.id}', -1)">−</button>
                        <span class="sheet-qty">${item.qty}</span>
                        <button class="sheet-qty-btn" onclick="event.stopPropagation(); adjustSheetQty('${item.id}', 1)">+</button>
                        <button class="sheet-remove-btn" onclick="event.stopPropagation(); removeSheetItem('${item.id}')">×</button>
                    </div>
                </div>`
            ).join('');
        }
    }
    
    // Update body class for cart state (bottom sheet always visible on mobile)
    if (totalQty > 0) {
        document.body.classList.add('has-cart-items');
    } else {
        document.body.classList.remove('has-cart-items');
        // Keep bottom sheet in peek state even when empty
        if (bottomSheetState !== 'peek') {
            setBottomSheetState('peek');
        }
    }

    // Save cart to localStorage so checkout can pick it up
    try {
        if (cartItems.length === 0) {
            localStorage.removeItem('rr_cart');
        } else {
            localStorage.setItem('rr_cart', JSON.stringify({ items: cartItems, subtotal: subtotal, sgst: sgst, cgst: cgst, tax: tax, total: total }));
        }
    } catch (err) {
        console.warn('Could not save cart to localStorage', err);
    }

    // Update header toggle total (for mobile collapsed bar)
    const toggleTotalEl = document.getElementById('toggleTotal');
    if (toggleTotalEl) toggleTotalEl.textContent = document.getElementById('total').textContent;

    const cartWarning = document.getElementById('cartWarning');
    if (cartWarning && cartItems.length > 0) cartWarning.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', function() {
    const cartSidebar = document.querySelector('.cart-sidebar');
    const cartToggle = document.getElementById('cartToggle');

    function updateToggleTotal() {
        const totalEl = document.getElementById('total');
        const toggleTotalEl = document.getElementById('toggleTotal');
        if (toggleTotalEl && totalEl) toggleTotalEl.textContent = totalEl.textContent;
    }

    if (!cartSidebar || !cartToggle) return;

    cartToggle.addEventListener('click', function() {
        const isCollapsed = cartSidebar.classList.toggle('collapsed');
        cartToggle.setAttribute('aria-expanded', (!isCollapsed).toString());
    });

    // Initialize: collapsed on small screens
    function initCartCollapse() {
        if (window.innerWidth <= 970) {
            cartSidebar.classList.add('collapsed');
            cartToggle.setAttribute('aria-expanded', 'false');
        } else {
            cartSidebar.classList.remove('collapsed');
            cartToggle.setAttribute('aria-expanded', 'true');
        }
        updateToggleTotal();
    }
    initCartCollapse();
    window.addEventListener('resize', initCartCollapse);
});

document.addEventListener('DOMContentLoaded', function() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!checkoutBtn) return;

    const cartWarning = document.getElementById('cartWarning');
    checkoutBtn.addEventListener('click', function () {
        if (checkoutBtn.disabled) return;

        let cart = null;
        try {
            cart = JSON.parse(localStorage.getItem('rr_cart') || 'null');
        } catch (e) {
            cart = null;
        }

        if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
            if (cartWarning) cartWarning.style.display = 'block';
            return;
        }

        if (cartWarning) cartWarning.style.display = 'none';
        window.location.href = '/checkout';
    });
});
// Checkout form handling
document.addEventListener('DOMContentLoaded', function() {
    const checkoutForm = document.getElementById('checkoutForm');
    if (!checkoutForm) return; // not on this page

    if (localStorage.getItem('rr_redirect_thankyou') === '1') {
        localStorage.removeItem('rr_redirect_thankyou');
        window.location.replace('/thankyou');
        return;
    }
    
    let pendingOrderData = null;
    let validPincodes = [];
    let availableDiscounts = [];
    let selectedDiscount = null;
    let collectionEnabled = false;

    // Order type handling (delivery vs collection)
    function handleOrderTypeChange() {
        const orderType = document.querySelector('input[name="orderType"]:checked')?.value || 'delivery';
        const addressSection = document.getElementById('addressSection');
        const pincodeSection = document.getElementById('pincodeSection');
        const addressInput = document.getElementById('address');
        const pincodeInput = document.getElementById('pincode');

        if (orderType === 'collection') {
            if (addressSection) addressSection.style.display = 'none';
            if (pincodeSection) pincodeSection.style.display = 'none';
            if (addressInput) addressInput.removeAttribute('required');
            if (pincodeInput) pincodeInput.removeAttribute('required');
        } else {
            if (addressSection) addressSection.style.display = '';
            if (pincodeSection) pincodeSection.style.display = '';
            if (addressInput) addressInput.setAttribute('required', 'true');
            if (pincodeInput) pincodeInput.setAttribute('required', 'true');
        }
    }

    async function loadCollectionSetting() {
        try {
            const response = await fetch('/.netlify/functions/settings');
            if (response.ok) {
                const data = await response.json();
                collectionEnabled = data.collectionEnabled !== false;
                const collectionOption = document.getElementById('collectionOption');
                if (collectionOption) {
                    collectionOption.style.display = collectionEnabled ? '' : 'none';
                }
            }
        } catch (e) { console.error('Could not load collection setting', e); }
    }

    // Set up order type radio listeners
    const orderTypeRadios = document.querySelectorAll('input[name="orderType"]');
    orderTypeRadios.forEach(radio => {
        radio.addEventListener('change', handleOrderTypeChange);
    });

    async function loadAvailableDiscounts() {
        const discountSelector = document.getElementById('discountSelector');
        const discountLoginPrompt = document.getElementById('discountLoginPrompt');
        const token = localStorage.getItem('rr_token');
        
        // Only logged-in users can use discounts
        if (!token) {
            if (discountSelector) discountSelector.style.display = 'none';
            if (discountLoginPrompt) discountLoginPrompt.style.display = '';
            return;
        }
        
        if (discountSelector) discountSelector.style.display = '';
        if (discountLoginPrompt) discountLoginPrompt.style.display = 'none';
        
        try {
            const response = await fetch('/.netlify/functions/discounts?activeOnly=true');
            if (response.ok) {
                availableDiscounts = await response.json();
                populateDiscountDropdown();
            }
        } catch (e) { console.error('Could not load discounts', e); }
    }

    function populateDiscountDropdown() {
        const select = document.getElementById('discountSelect');
        if (!select) return;
        select.innerHTML = '<option value="">No discount</option>';
        availableDiscounts.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = `${d.name} (${d.percentage}% off)`;
            select.appendChild(opt);
        });
    }

    function handleDiscountChange() {
        const select = document.getElementById('discountSelect');
        if (!select) return;
        const discountId = select.value;
        selectedDiscount = discountId ? availableDiscounts.find(d => d.id === discountId) : null;
        updateCheckoutWithDiscount();
    }

    function updateCheckoutWithDiscount() {
        const subtotalEl = document.getElementById('checkoutSubtotal');
        const discountRow = document.getElementById('discountRow');
        const discountNameEl = document.getElementById('discountName');
        const discountAmtEl = document.getElementById('checkoutDiscount');
        const sgstEl = document.getElementById('checkoutSgst');
        const cgstEl = document.getElementById('checkoutCgst');
        const totalEl = document.getElementById('checkoutTotal');

        let cart = null;
        try { cart = JSON.parse(localStorage.getItem('rr_cart') || 'null'); } catch (e) { cart = null; }
        if (!cart || !cart.subtotal) return;

        const subtotal = Number(cart.subtotal || 0);
        let discountAmount = 0;

        if (selectedDiscount) {
            discountAmount = (subtotal * selectedDiscount.percentage) / 100;
            discountRow.style.display = 'flex';
            discountNameEl.textContent = selectedDiscount.name;
            discountAmtEl.textContent = `-₹${discountAmount.toFixed(2)}`;
        } else {
            discountRow.style.display = 'none';
        }

        const discountedSubtotal = subtotal - discountAmount;
        const sgst = discountedSubtotal * 0.025;
        const cgst = discountedSubtotal * 0.025;
        const total = discountedSubtotal + sgst + cgst;

        if (sgstEl) sgstEl.textContent = `₹${sgst.toFixed(2)}`;
        if (cgstEl) cgstEl.textContent = `₹${cgst.toFixed(2)}`;
        if (totalEl) totalEl.textContent = `₹${total.toFixed(2)}`;
    }

    function renderCheckoutSummary() {
        const loadingEl = document.getElementById('checkoutLoading');
        if (loadingEl) loadingEl.style.display = 'block';
        const itemsEl = document.getElementById('checkoutItems');
        const subtotalEl = document.getElementById('checkoutSubtotal');
        const sgstEl = document.getElementById('checkoutSgst');
        const cgstEl = document.getElementById('checkoutCgst');
        const totalEl = document.getElementById('checkoutTotal');
        if (!itemsEl || !subtotalEl || !totalEl) return;

        let cart = null;
        try { cart = JSON.parse(localStorage.getItem('rr_cart') || 'null'); } catch (e) { cart = null; }
        if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
            itemsEl.innerHTML = '<p class="empty-cart">No items in your cart.</p>';
            subtotalEl.textContent = '₹0.00';
            if (sgstEl) sgstEl.textContent = '₹0.00';
            if (cgstEl) cgstEl.textContent = '₹0.00';
            totalEl.textContent = '₹0.00';
            return;
        }

        itemsEl.innerHTML = cart.items.map((item, index) => `
            <div class="checkout-item" data-index="${index}">
                <div class="left">
                    <div class="qty-controls">
                        <button type="button" class="qty-btn qty-minus" data-index="${index}" aria-label="Decrease quantity">−</button>
                        <span class="qty">${item.qty}</span>
                        <button type="button" class="qty-btn qty-plus" data-index="${index}" aria-label="Increase quantity">+</button>
                    </div>
                    <span class="name">${item.name}</span>
                </div>
                <div class="item-right">
                    <span class="item-price">₹${Number(item.itemTotal || 0).toFixed(2)}</span>
                    <button type="button" class="remove-btn" data-index="${index}" aria-label="Remove item">×</button>
                </div>
            </div>
        `).join('');

        // Attach event listeners for quantity controls
        itemsEl.querySelectorAll('.qty-minus').forEach(btn => {
            btn.addEventListener('click', () => updateCartItemQty(parseInt(btn.dataset.index), -1));
        });
        itemsEl.querySelectorAll('.qty-plus').forEach(btn => {
            btn.addEventListener('click', () => updateCartItemQty(parseInt(btn.dataset.index), 1));
        });
        itemsEl.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => removeCartItem(parseInt(btn.dataset.index)));
        });

        subtotalEl.textContent = `₹${Number(cart.subtotal || 0).toFixed(2)}`;
        // Apply discount if selected
        if (selectedDiscount) {
            updateCheckoutWithDiscount();
        } else {
            const sgst = Number(cart.sgst ?? ((Number(cart.tax || 0)) / 2 || 0));
            const cgst = Number(cart.cgst ?? ((Number(cart.tax || 0)) / 2 || 0));
            if (sgstEl) sgstEl.textContent = `₹${sgst.toFixed(2)}`;
            if (cgstEl) cgstEl.textContent = `₹${cgst.toFixed(2)}`;
            totalEl.textContent = `₹${Number(cart.total || 0).toFixed(2)}`;
        }
        if (loadingEl) loadingEl.style.display = 'none';
    }

    function updateCartItemQty(index, delta) {
        let cart = null;
        try { cart = JSON.parse(localStorage.getItem('rr_cart') || 'null'); } catch (e) { cart = null; }
        if (!cart || !Array.isArray(cart.items) || index < 0 || index >= cart.items.length) return;

        const item = cart.items[index];
        const newQty = item.qty + delta;
        
        if (newQty <= 0) {
            removeCartItem(index);
            return;
        }

        // Update quantity and recalculate item total
        item.qty = newQty;
        item.itemTotal = item.price * newQty;

        // Recalculate cart totals
        recalculateCartTotals(cart);
        
        localStorage.setItem('rr_cart', JSON.stringify(cart));
        renderCheckoutSummary();
    }

    function removeCartItem(index) {
        let cart = null;
        try { cart = JSON.parse(localStorage.getItem('rr_cart') || 'null'); } catch (e) { cart = null; }
        if (!cart || !Array.isArray(cart.items) || index < 0 || index >= cart.items.length) return;

        cart.items.splice(index, 1);

        if (cart.items.length === 0) {
            localStorage.removeItem('rr_cart');
        } else {
            recalculateCartTotals(cart);
            localStorage.setItem('rr_cart', JSON.stringify(cart));
        }
        renderCheckoutSummary();
    }

    function recalculateCartTotals(cart) {
        const subtotal = cart.items.reduce((sum, item) => sum + (Number(item.itemTotal) || 0), 0);
        const sgst = subtotal * 0.025;
        const cgst = subtotal * 0.025;
        const tax = sgst + cgst;
        const total = subtotal + tax;

        cart.subtotal = subtotal;
        cart.sgst = sgst;
        cart.cgst = cgst;
        cart.tax = tax;
        cart.total = total;
    }

    // Load valid pincodes on page load
    async function loadValidPincodes() {
        try {
            const response = await fetch('/.netlify/functions/pincodes');
            if (response.ok) {
                const pincodes = await response.json();
                validPincodes = pincodes.map(p => p.code.toString());
                console.log('Valid pincodes loaded:', validPincodes);
            }
        } catch (e) { console.error('Could not load pincodes', e); }
    }

    // Validate pincode
    async function validatePincode(code) {
        const errorEl = document.getElementById('pincodeError');
        const successEl = document.getElementById('pincodeSuccess');
        if (!errorEl || !successEl) return false;

        if (!code || code.trim() === '') {
            errorEl.textContent = 'Pincode is required';
            errorEl.style.display = 'block';
            successEl.style.display = 'none';
            return false;
        }

        if (validPincodes.includes(code.trim())) {
            successEl.textContent = '✓ Delivery available in this area';
            successEl.style.display = 'block';
            errorEl.style.display = 'none';
            return true;
        } else {
            errorEl.textContent = 'Sorry, we cannot deliver to this pincode area.';
            errorEl.style.display = 'block';
            successEl.style.display = 'none';
            return false;
        }
    }

    // Real-time pincode validation
    const pincodeInput = document.getElementById('pincode');
    if (pincodeInput) {
        pincodeInput.addEventListener('blur', async (e) => {
            await validatePincode(e.target.value);
        });
    }

    checkoutForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const form = e.target;
        if (!form.reportValidity()) return;

        const paymentLoading = document.getElementById('paymentLoading');
        if (paymentLoading) paymentLoading.style.display = 'flex';

        if (window._rr_storeOpen === false) {
            alert('Store is currently closed. Please try again later.');
            return;
        }

        const data = new FormData(form);
        const first = data.get('firstName').trim();
        const last = data.get('lastName').trim();
        const phone = data.get('phone').trim();
        const address = data.get('address')?.trim() || '';
        const pincode = data.get('pincode')?.trim() || '';
        const note = data.get('note').trim();
        const orderType = data.get('orderType') || 'delivery';

        // Validate pincode only for delivery orders
        if (orderType === 'delivery') {
            const pincodeValid = await validatePincode(pincode);
            if (!pincodeValid) {
                if (paymentLoading) paymentLoading.style.display = 'none';
                return;
            }
        }

        // Get the saved cart
        let rawCart = null;
        try { rawCart = JSON.parse(localStorage.getItem('rr_cart') || 'null'); } catch (err) { rawCart = null; }
        if (!rawCart || !rawCart.items || rawCart.items.length === 0) {
            if (paymentLoading) paymentLoading.style.display = 'none';
            alert('Your cart is empty. Please add items before placing an order.');
            return;
        }

        // Build minimal order payload (backend owns pricing/status/payment)
        const email = form.email.value.trim();
        const orderPayload = {
            customer: {
                name: `${first} ${last}`.trim(),
                phone: phone,
                email: email,
                address: orderType === 'collection' ? '' : address,
                note: note
            },
            orderType: orderType,
            items: (rawCart.items || []).map(i => {
                if (i.isCombo) {
                    return {
                        menuItemId: i.id,
                        qty: Number(i.qty),
                        isCombo: true,
                        bagelId: i.bagelId,
                        schmearId: i.schmearId,
                        bagelName: i.bagelName,
                        schmearName: i.schmearName
                    };
                }
                return {
                    menuItemId: i.id,
                    qty: Number(i.qty)
                };
            }),
            discountId: selectedDiscount ? selectedDiscount.id : null
        };

        // Create order and Razorpay order server-side before opening payment modal
        const created = await saveOrder(orderPayload);
        if (!created || !created.orderNumber) {
            if (paymentLoading) paymentLoading.style.display = 'none';
            const errMsg = created?.error || 'Failed to create order. Please try again.';
            alert(errMsg);
            return;
        }

        pendingOrderData = {
            orderNumber: created.orderNumber,
            razorpayOrderId: created.razorpay_order_id,
            amount: created.amount,
            currency: created.currency,
            keyId: created.key_id,
            customer: {
                name: `${first} ${last}`.trim(),
                phone: phone,
                email: email,
                address: address,
                note: note
            },
            cart: rawCart,
            pricing: created.pricing
        };

        // Show payment modal with server-calculated amount
        const modal = document.getElementById('paymentModal');
        const totalEl = document.getElementById('paymentTotal');
        if (modal && totalEl) {
            const amountRupees = Number(created.amount) / 100;
            totalEl.textContent = '₹' + amountRupees.toFixed(2);
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
        }

        if (paymentLoading) paymentLoading.style.display = 'none';
    });

    // Cancel payment
    const cancelBtn = document.getElementById('cancelPayment');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            const modal = document.getElementById('paymentModal');
            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }
            pendingOrderData = null;
        });
    }

    // Confirm payment and submit order
    const confirmBtn = document.getElementById('confirmPayment');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            if (!pendingOrderData) return;
            if (typeof Razorpay !== 'function') {
                alert('Razorpay checkout is not available. Please try again.');
                return;
            }

            const options = {
                key: pendingOrderData.keyId,
                amount: pendingOrderData.amount,
                currency: pendingOrderData.currency || 'INR',
                order_id: pendingOrderData.razorpayOrderId,
                name: 'The Round Room',
                description: 'Order payment',
                prefill: {
                    name: pendingOrderData.customer?.name || '',
                    email: pendingOrderData.customer?.email || '',
                    contact: pendingOrderData.customer?.phone || ''
                },
                handler: async function (response) {
                    const paymentLoading = document.getElementById('paymentLoading');
                    if (paymentLoading) paymentLoading.style.display = 'flex';
                    const verified = await verifyPayment(pendingOrderData.orderNumber, response);
                    if (!verified) {
                        if (paymentLoading) paymentLoading.style.display = 'none';
                        alert('Payment verification failed. Please contact support with your order ID.');
                        return;
                    }

                    const summary = {
                        orderNumber: pendingOrderData.orderNumber,
                        customer: pendingOrderData.customer,
                        cart: pendingOrderData.cart,
                        pricing: pendingOrderData.pricing,
                        amount: pendingOrderData.amount,
                        currency: pendingOrderData.currency,
                        payment: {
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_order_id: response.razorpay_order_id
                        }
                    };
                    try { sessionStorage.setItem('rr_thankyou', JSON.stringify(summary)); } catch (e) { /* ignore */ }

                    // Clear cart
                    try { localStorage.removeItem('rr_cart'); } catch (e) { /* ignore */ }

                    // Hide modal
                    const modal = document.getElementById('paymentModal');
                    if (modal) {
                        modal.style.display = 'none';
                        modal.setAttribute('aria-hidden', 'true');
                    }

                    // Redirect to thank you page (mobile-safe)
                    localStorage.setItem('rr_redirect_thankyou', '1');
                    window.location.replace('/thankyou');
                    setTimeout(() => {
                        if (!location.pathname.endsWith('/thankyou')) {
                            window.location.replace('/thankyou');
                        }
                    }, 600);
                    pendingOrderData = null;
                },
                modal: {
                    ondismiss: function () {
                        // Payment cancelled by user
                    }
                }
            };

            const rzp = new Razorpay(options);
            rzp.on('payment.failed', async function (response) {
                await markPaymentFailed(pendingOrderData.orderNumber, response);
                alert('Payment failed. Please try again.');
            });
            rzp.open();
        });
    }

    // Load checkout summary and pincodes when form is ready
    renderCheckoutSummary();
    loadValidPincodes();
    loadAvailableDiscounts();
    loadCollectionSetting();

    // Discount dropdown listener
    const discountSelect = document.getElementById('discountSelect');
    if (discountSelect) {
        discountSelect.addEventListener('change', handleDiscountChange);
    }
});

/* ===== Store status (open/closed) ===== */
async function initStoreStatus() {
    try {
        const response = await fetch('/.netlify/functions/settings');
        if (!response.ok) return;
        const data = await response.json();
        const isOpen = data.storeOpen !== false;
        window._rr_storeOpen = isOpen;

        const modal = document.getElementById('storeStatusModal');
        const modalMessage = document.getElementById('storeStatusMessage');
        const modalClose = modal ? modal.querySelector('.store-status-close') : null;
        const dismissed = sessionStorage.getItem('rr_store_closed_dismissed') === '1';
        const messageText = 'Store is currently closed. We are not accepting orders right now.';

        function closeModal() {
            if (!modal) return;
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            try { sessionStorage.setItem('rr_store_closed_dismissed', '1'); } catch (e) { /* ignore */ }
        }

        if (modalClose && !modalClose.dataset.bound) {
            modalClose.dataset.bound = 'true';
            modalClose.addEventListener('click', closeModal);
        }
        if (modal && !modal.dataset.bound) {
            modal.dataset.bound = 'true';
            modal.addEventListener('click', function (event) {
                if (event.target === modal) closeModal();
            });
        }

        if (modal) {
            if (!isOpen && !dismissed) {
                if (modalMessage) modalMessage.textContent = messageText;
                modal.style.display = 'flex';
                modal.setAttribute('aria-hidden', 'false');
            } else {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }
        }

        const checkoutBtn = document.querySelector('.checkout-btn');
        if (checkoutBtn) {
            if (!isOpen) {
                checkoutBtn.dataset.originalText = checkoutBtn.textContent;
                checkoutBtn.textContent = 'Orders closed';
                checkoutBtn.disabled = true;
                checkoutBtn.setAttribute('aria-disabled', 'true');
            } else if (checkoutBtn.dataset.originalText) {
                checkoutBtn.textContent = checkoutBtn.dataset.originalText;
                checkoutBtn.disabled = false;
                checkoutBtn.setAttribute('aria-disabled', 'false');
            }
        }

        const submitBtn = document.querySelector('.btn-submit');
        if (submitBtn) {
            if (!isOpen) {
                submitBtn.dataset.originalText = submitBtn.textContent;
                submitBtn.textContent = 'Store closed';
                submitBtn.disabled = true;
                submitBtn.setAttribute('aria-disabled', 'true');
            } else if (submitBtn.dataset.originalText) {
                submitBtn.textContent = submitBtn.dataset.originalText;
                submitBtn.disabled = false;
                submitBtn.setAttribute('aria-disabled', 'false');
            }
        }
    } catch (e) {
        console.warn('Could not load store status', e);
    }
}

document.addEventListener('DOMContentLoaded', initStoreStatus);

/* ===== Thank you page ===== */
document.addEventListener('DOMContentLoaded', function () {
    const container = document.getElementById('thankyouContainer');
    if (!container) return;
    let data = null;
    try { data = JSON.parse(sessionStorage.getItem('rr_thankyou') || 'null'); } catch (e) { data = null; }
    if (!data) {
        container.innerHTML = '<h3>Thanks!</h3><p>Your order is confirmed.</p><div style="margin-top:0.75rem"><a href="/order_page" class="order-button">Return to menu</a></div>';
        return;
    }

    const cart = data.cart || { items: [], subtotal: 0, sgst: 0, cgst: 0, tax: 0, total: 0 };
    const pricing = data.pricing || {};
    const discount = pricing.discount || null;
    
    // Use pricing from server if available, otherwise fallback to cart values
    const subtotal = Number(pricing.subtotal ?? cart.subtotal ?? 0);
    const tax = Number(pricing.tax ?? cart.tax ?? 0);
    const sgst = Number(tax / 2);
    const cgst = Number(tax / 2);
    const total = Number(pricing.total ?? cart.total ?? 0);
    
    const itemsHtml = (cart.items || []).map(item => `
        <div class="checkout-item">
            <div class="left"><span class="qty">${item.qty}x</span><span class="name">${item.name}</span></div>
            <div>₹${Number(item.itemTotal || 0).toFixed(2)}</div>
        </div>
    `).join('');

    // Build discount row if applicable
    const discountHtml = discount ? `
        <div class="row discount-row" style="color: #2e7d32;">
            <span>Discount (${discount.percentage}%)</span>
            <span>-₹${Number(discount.amount || 0).toFixed(2)}</span>
        </div>
    ` : '';

    container.innerHTML = `
        <h3>Thanks! Your payment is confirmed.</h3>
        <p>Order ID: <strong>${data.orderNumber}</strong></p>
        <p>We'll start preparing your order now.</p>
        <div class="checkout-items" style="margin-top:1rem;">${itemsHtml || '<p>No items.</p>'}</div>
        <div class="checkout-breakdown" style="margin-top:1rem;">
            <div class="row"><span>Subtotal</span><span>₹${subtotal.toFixed(2)}</span></div>
            ${discountHtml}
            <div class="row"><span>SGST (2.5%)</span><span>₹${sgst.toFixed(2)}</span></div>
            <div class="row"><span>CGST (2.5%)</span><span>₹${cgst.toFixed(2)}</span></div>
            <div class="row total"><span>Total</span><span>₹${total.toFixed(2)}</span></div>
        </div>
        <div class="order-actions">
            <button class="order-button" id="downloadReceiptBtn" type="button">Download receipt (PDF)</button>
            <a href="/order_page" class="order-button">Return to menu</a>
        </div>
    `;

    const downloadBtn = document.getElementById('downloadReceiptBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            const thankyouLoading = document.getElementById('thankyouLoading');
            if (thankyouLoading) thankyouLoading.style.display = 'flex';
            await generateReceiptPdf({
                orderNumber: data.orderNumber,
                customer: data.customer,
                cart: data.cart,
                pricing: data.pricing,
                amount: data.amount
            }, data.payment || {});
            if (thankyouLoading) thankyouLoading.style.display = 'none';
        });
    }
});


/* ===== Orders: create/save/manage (client-only simulation) ===== */


async function getOrders() {
    try {
        const token = localStorage.getItem('rr_admin_token');
        console.debug('[admin] Fetching orders');
        const response = await fetch('/.netlify/functions/orders', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token || '' }
        });
        if (response.ok) {
            console.debug('[admin] Orders fetched');
            return await response.json();
        }
        if (response.status === 401 && window.AdminGate) {
            window.AdminGate.lock();
        }
    } catch (e) { console.warn('Could not fetch orders', e); }
    return [];
}

async function saveOrder(orderPayload) {
    try {
        console.log('Saving order to database:', orderPayload);
        const response = await fetch('/.netlify/functions/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderPayload)
        });
        const result = await response.json();
        console.log('Server response:', result);
        if (response.ok) {
            console.log('Order saved successfully!');
            window.dispatchEvent(new Event('ordersUpdated'));
            return result;
        } else {
            console.error('Failed to save order:', result);
            return result;
        }
    } catch (e) { 
        console.error('Could not save order', e); 
    }
    return null;
}

async function verifyPayment(orderNumber, razorpayResponse) {
    if (!orderNumber || !razorpayResponse) return false;
    try {
        const response = await fetch(`/.netlify/functions/orders?orderNumber=${encodeURIComponent(orderNumber)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'VERIFY_PAYMENT',
                razorpay_order_id: razorpayResponse.razorpay_order_id,
                razorpay_payment_id: razorpayResponse.razorpay_payment_id,
                razorpay_signature: razorpayResponse.razorpay_signature
            })
        });
        if (response.ok) return true;
    } catch (e) {
        console.error('Payment verification failed', e);
    }
    return false;
}

async function markPaymentFailed(orderNumber, razorpayResponse) {
    if (!orderNumber || !razorpayResponse) return false;
    try {
        const meta = razorpayResponse?.error?.metadata || {};
        const response = await fetch(`/.netlify/functions/orders?orderNumber=${encodeURIComponent(orderNumber)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'MARK_PAYMENT_FAILED',
                razorpay_order_id: meta.order_id,
                razorpay_payment_id: meta.payment_id || null
            })
        });
        if (response.ok) return true;
    } catch (e) {
        console.error('Mark payment failed error', e);
    }
    return false;
}

async function generateReceiptPdf(orderData, razorpayResponse) {
    const now = new Date();

    function sanitizeText(value) {
        return String(value || '').replace(/[\x00-\x1F\x7F-\xFF]/g, '').trim();
    }

    function normalizeReceiptData(data) {
        const cart = data?.cart || {};
        const pricing = data?.pricing || {};
        const rawItems = Array.isArray(cart.items)
            ? cart.items
            : Array.isArray(data?.items)
                ? data.items
                : [];

        const items = rawItems.map((item) => {
            const qty = Number(item.qty ?? item.quantity ?? item.count ?? 0) || 0;
            const name = item.name || item.title || item.menuItemName || item.menuItemId || item.id || 'Item';
            const price = Number(item.price ?? item.unitPrice ?? item.unit_price ?? 0) || 0;
            const itemTotal = Number(item.itemTotal ?? item.lineTotal ?? item.total ?? (price * qty)) || 0;
            return {
                qty,
                name: sanitizeText(name),
                itemTotal: Number(itemTotal) || 0
            };
        }).filter((item) => item.qty > 0 || item.name);

        // Use server pricing if available
        const subtotal = Number(
            pricing.subtotal ?? cart.subtotal ?? cart.subTotal ?? cart.subtotalAmount ?? 0
        ) || items.reduce((sum, item) => sum + (Number(item.itemTotal) || 0), 0);
        const tax = Number(pricing.tax ?? cart.tax ?? cart.taxAmount ?? 0) || 0;
        const sgst = Number(cart.sgst ?? cart.SGST ?? cart.sgstAmount ?? 0) || (tax / 2);
        const cgst = Number(cart.cgst ?? cart.CGST ?? cart.cgstAmount ?? 0) || (tax / 2);
        const total = Number(pricing.total ?? cart.total ?? cart.totalAmount ?? 0) || (subtotal + tax);
        const discount = pricing.discount || null;

        return { items, subtotal, tax, sgst, cgst, total, discount };
    }

    const normalized = normalizeReceiptData(orderData || {});
    const amountPaise = Number(orderData?.amount || 0);
    const totalPaid = amountPaise > 0 ? amountPaise / 100 : Number(normalized.total || 0);
    // Calculate rates based on discountedSubtotal if discount exists
    const discountedSubtotal = normalized.discount 
        ? normalized.subtotal - (normalized.discount.amount || 0) 
        : normalized.subtotal;
    const sgstRate = discountedSubtotal > 0 ? (Number(normalized.sgst || 0) / discountedSubtotal) * 100 : 0;
    const cgstRate = discountedSubtotal > 0 ? (Number(normalized.cgst || 0) / discountedSubtotal) * 100 : 0;

    async function loadImageDataUrl(url) {
        const res = await fetch(url);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    if (window.jspdf && window.jspdf.jsPDF) {
        const doc = new window.jspdf.jsPDF();
        let y = 14;
        const burgundy = [109, 36, 48];
        const green = [46, 125, 50];

        doc.setFillColor(burgundy[0], burgundy[1], burgundy[2]);
        doc.rect(0, 0, 210, 18, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.text('THE ROUND ROOM', 14, 12);

        try {
            const logoDataUrl = await loadImageDataUrl('images/Icon.png');
            doc.addImage(logoDataUrl, 'PNG', 170, 3, 10, 10);
        } catch (e) {
            // ignore logo failures
        }

        doc.setTextColor(0, 0, 0);
        y = 26;
        doc.setFontSize(11);
        doc.text('Velvet Lounge Enterprises Pvt. Ltd.', 14, y);
        y += 6;
        doc.setTextColor(burgundy[0], burgundy[1], burgundy[2]);
        doc.setFontSize(12);
        doc.text('Receipt', 14, y);
        doc.setTextColor(0, 0, 0);
        y += 8;

        doc.setFontSize(11);
        doc.text(`Order ID: ${sanitizeText(orderData?.orderNumber)}`, 14, y); y += 6;
        doc.text(`Date: ${now.toLocaleString()}`, 14, y); y += 6;
        doc.text(`Customer: ${sanitizeText(orderData?.customer?.name)}`, 14, y); y += 6;
        doc.text(`Email: ${sanitizeText(orderData?.customer?.email)}`, 14, y); y += 6;
        doc.text(`Phone: ${sanitizeText(orderData?.customer?.phone)}`, 14, y); y += 6;
        doc.text(`Payment ID: ${sanitizeText(razorpayResponse?.razorpay_payment_id)}`, 14, y); y += 6;
        doc.text(`Razorpay Order ID: ${sanitizeText(razorpayResponse?.razorpay_order_id)}`, 14, y); y += 8;

        doc.text('Items:', 14, y); y += 6;
        doc.setFontSize(10);
        (normalized.items || []).forEach(item => {
            const line = `${item.qty}x ${item.name} - Rs ${Number(item.itemTotal || 0).toFixed(2)}`;
            doc.text(line, 16, y);
            y += 5;
            if (y > 270) { doc.addPage(); y = 14; }
        });

        y += 4;
        doc.setFontSize(11);
        doc.text(`Subtotal: Rs ${Number(normalized.subtotal || 0).toFixed(2)}`, 14, y); y += 6;
        
        // Add discount line if applicable
        if (normalized.discount) {
            doc.setTextColor(green[0], green[1], green[2]);
            doc.text(`Discount (${normalized.discount.percentage}%): -Rs ${Number(normalized.discount.amount || 0).toFixed(2)}`, 14, y); y += 6;
            doc.setTextColor(0, 0, 0);
        }
        
        doc.text(`SGST (${sgstRate.toFixed(2)}%): Rs ${Number(normalized.sgst || 0).toFixed(2)}`, 14, y); y += 6;
        doc.text(`CGST (${cgstRate.toFixed(2)}%): Rs ${Number(normalized.cgst || 0).toFixed(2)}`, 14, y); y += 6;
        doc.text(`Total Paid: Rs ${Number(totalPaid || 0).toFixed(2)}`, 14, y);

        doc.save(`receipt-${sanitizeText(orderData?.orderNumber) || 'order'}.pdf`);
        return;
    }

    alert('Receipt download is unavailable right now.');
}

async function updateOrderStatus(orderNumber, status) {
    try {
        const token = localStorage.getItem('rr_admin_token');
        console.debug('[admin] Update order status', orderNumber, status);
        const response = await fetch(`/.netlify/functions/orders?orderNumber=${encodeURIComponent(orderNumber)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': token || '' },
            body: JSON.stringify({ status })
        });
        if (response.ok) {
            console.debug('[admin] Status update success', orderNumber);
            window.dispatchEvent(new Event('ordersUpdated'));
            return true;
        }
        if (response.status === 401 && window.AdminGate) {
            window.AdminGate.lock();
        }
    } catch (e) { console.warn('Could not update order', e); }
    return false;
}

async function deleteOrder(orderNumber) {
    try {
        const token = localStorage.getItem('rr_admin_token');
        console.log('Deleting order:', orderNumber);
        console.debug('[admin] Delete order', orderNumber);
        const response = await fetch(`/.netlify/functions/orders?orderNumber=${encodeURIComponent(orderNumber)}`, {
            method: 'DELETE',
            headers: { 'x-admin-token': token || '' }
        });
        if (response.ok) {
            console.log('Order deleted successfully');
            console.debug('[admin] Delete success', orderNumber);
            window.dispatchEvent(new Event('ordersUpdated'));
            return true;
        }
        if (response.status === 401 && window.AdminGate) {
            window.AdminGate.lock();
        }
    } catch (e) { console.error('Could not delete order', e); }
    return false;
}

document.addEventListener('DOMContentLoaded', function () {
    if (!document.querySelector('.top-nav')) return;
    if (!(location.pathname === '/' || location.pathname.endsWith('/index.html'))) return;
    if (sessionStorage.getItem('rr_menu_prefetch')) return;
    sessionStorage.setItem('rr_menu_prefetch', '1');
    fetch('/.netlify/functions/menu', { cache: 'no-store' }).catch(function () {});
});

document.querySelector('.carousel-track').addEventListener('click', function(e) {
    const item = e.target.closest('.carousel-slide');
    if (!item) return;
    const id = item.dataset.id;
    window.loacation.href = '/product?id=${encodeURIComponent(id)}';
});

/**
 * Frontend login function
 * @param {string} email - User email
 * @param {string} password - User password
 * @param {string} errorElementId - (optional) Element ID to display error message
 * @returns {Promise<void>}
 */
async function handleLogin(email, password, errorElementId, loadingElementId) {
    const loadingEl = loadingElementId ? document.getElementById(loadingElementId) : null;
    const submitBtn = document.querySelector('.submit-btn');
    
    try {
        // Validate inputs
        if (!email || !password) {
            const message = "Email and password are required";
            if (errorElementId) {
                const errorEl = document.getElementById(errorElementId);
                if (errorEl) errorEl.textContent = message;
            } else {
                alert(message);
            }
            return;
        }

        // Clear previous error
        if (errorElementId) {
            const errorEl = document.getElementById(errorElementId);
            if (errorEl) errorEl.textContent = "";
        }

        // Show loading state
        if (loadingEl) loadingEl.style.display = 'flex';
        if (submitBtn) submitBtn.disabled = true;

        // Send login request
        const response = await fetch("/.netlify/functions/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            // Hide loading state
            if (loadingEl) loadingEl.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;
            
            const message = data.error || "Login failed";
            if (errorElementId) {
                const errorEl = document.getElementById(errorElementId);
                if (errorEl) errorEl.textContent = message;
            } else {
                alert(message);
            }
            return;
        }

        // Store token in localStorage
        if (data.token) {
            localStorage.setItem("rr_token", data.token);
        }

        // Update nav and redirect
        updateAuthNav();
        // Check for redirect parameter
        const urlParams = new URLSearchParams(window.location.search);
        const redirectTo = urlParams.get('redirect') || '/';
        window.location.href = redirectTo;
    } catch (err) {
        // Hide loading state
        if (loadingEl) loadingEl.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        
        const message = "An error occurred during login";
        if (errorElementId) {
            const errorEl = document.getElementById(errorElementId);
            if (errorEl) errorEl.textContent = message;
        } else {
            alert(message);
        }
        console.error("Login error:", err);
    }
}

/**
 * Frontend signup function
 * @param {string} email - User email
 * @param {string} phone - User phone
 * @param {string} password - User password
 * @param {string} errorElementId - (optional) Element ID to display error message
 * @returns {Promise<void>}
 */
async function handleRegister(email, phone, password, errorElementId, loadingElementId) {
    const loadingEl = loadingElementId ? document.getElementById(loadingElementId) : null;
    const submitBtn = document.querySelector('.submit-btn');
    
    try {
        // Validate inputs
        if (!email || !phone || !password) {
            const message = "Email, phone, and password are required";
            if (errorElementId) {
                const errorEl = document.getElementById(errorElementId);
                if (errorEl) errorEl.textContent = message;
            } else {
                alert(message);
            }
            return;
        }

        if (password.length < 8) {
            const message = "Password must be at least 8 characters long";
            if (errorElementId) {
                const errorEl = document.getElementById(errorElementId);
                if (errorEl) errorEl.textContent = message;
            } else {
                alert(message);
            }
            return;
        }

        // Clear previous error
        if (errorElementId) {
            const errorEl = document.getElementById(errorElementId);
            if (errorEl) errorEl.textContent = "";
        }

        // Show loading state
        if (loadingEl) loadingEl.style.display = 'flex';
        if (submitBtn) submitBtn.disabled = true;

        // Send signup request
        const response = await fetch("/.netlify/functions/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, phone, password }),
        });

        const data = await response.json();

        if (!response.ok) {
            // Hide loading state
            if (loadingEl) loadingEl.style.display = 'none';
            if (submitBtn) submitBtn.disabled = false;
            
            const message = data.error || "Registration failed";
            if (message.includes("already exists")) {
                alert(message);
            } else if (errorElementId) {
                const errorEl = document.getElementById(errorElementId);
                if (errorEl) errorEl.textContent = message;
            } else {
                alert(message);
            }
            return;
        }

        // Store token in localStorage if provided
        if (data.token) {
            localStorage.setItem("rr_token", data.token);
        }

        // Update nav and redirect
        updateAuthNav();
        // Check for redirect parameter
        const urlParams = new URLSearchParams(window.location.search);
        const redirectTo = urlParams.get('redirect') || '/';
        window.location.href = redirectTo;
    } catch (err) {
        // Hide loading state
        if (loadingEl) loadingEl.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        
        const message = "An error occurred during registration";
        if (errorElementId) {
            const errorEl = document.getElementById(errorElementId);
            if (errorEl) errorEl.textContent = message;
        } else {
            alert(message);
        }
        console.error("Register error:", err);
    }
}

/**
 * Make authenticated API calls with automatic Authorization header
 * @param {string} url - API endpoint URL
 * @param {Object} options - Fetch options (method, body, headers, etc.)
 * @returns {Promise<Object>} Parsed JSON response
 * @throws {Error} If token is missing or request fails
 */
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem("rr_token");

    if (!token) {
        throw new Error("No authentication token found. Please log in.");
    }

    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
        Authorization: `Bearer ${token}`,
    };

    const response = await fetch(url, {
        ...options,
        headers,
    });

    const data = await response.json();

    if (!response.ok) {
        // If 401, token may be expired - clear it
        if (response.status === 401) {
            localStorage.removeItem("rr_token");
            updateAuthNav();
            throw new Error("Authentication failed. Please log in again.");
        }
        throw new Error(data.error || `Request failed with status ${response.status}`);
    }

    return data;
}

/**
 * Update navigation to show login state
 * Shows login/register buttons if not logged in
 * Shows user email and logout button if logged in
 */
async function updateAuthNav() {
    const token = localStorage.getItem("rr_token");
    const authButtons = document.getElementById("authButtons");
    const loginRegisterBtn = document.getElementById("loginRegisterBtn");
    const authUser = document.getElementById("authUser");
    const authDropdown = document.getElementById("authDropdown");
    const userEmail = document.getElementById("userEmail");

    if (!authButtons) return;

    if (token) {
        // User is logged in - fetch and display user info
        try {
            const response = await authenticatedFetch("/.netlify/functions/profile");
            if (response.profile && response.profile.email) {
                loginRegisterBtn.style.display = "none";
                authUser.style.display = "flex";
                userEmail.textContent = response.profile.email;
                if (authDropdown) authDropdown.style.display = "none";
            }
        } catch (err) {
            // Token invalid, clear it
            localStorage.removeItem("rr_token");
            loginRegisterBtn.style.display = "inline-block";
            authUser.style.display = "none";
            if (authDropdown) authDropdown.style.display = "none";
        }
    } else {
        // User is not logged in
        loginRegisterBtn.style.display = "inline-block";
        authUser.style.display = "none";
        if (authDropdown) authDropdown.style.display = "none";
    }
}

// Update auth nav on page load
document.addEventListener("DOMContentLoaded", function () {
    updateAuthNav();

    const accountBtn = document.getElementById("accountBtn");
    const authDropdown = document.getElementById("authDropdown");

    if (accountBtn && authDropdown) {
        accountBtn.addEventListener("click", function () {
            const isMobile = window.matchMedia("(max-width: 970px)").matches;

            if (isMobile) {
                if (authDropdown.classList.contains("active")) {
                    authDropdown.classList.remove("active");
                    setTimeout(function () {
                        if (!authDropdown.classList.contains("active")) {
                            authDropdown.style.display = "none";
                        }
                    }, 320);
                } else {
                    authDropdown.style.display = "flex";
                    requestAnimationFrame(function () {
                        authDropdown.classList.add("active");
                    });
                }
                return;
            }

            authDropdown.style.display = authDropdown.style.display === "block" ? "none" : "block";
        });

        document.addEventListener("click", function (e) {
            if (!accountBtn.contains(e.target) && !authDropdown.contains(e.target)) {
                authDropdown.classList.remove("active");
                authDropdown.style.display = "none";
            }
        });
    }

    // Handle logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async function (e) {
            e.preventDefault();

            try {
                await authenticatedFetch("/.netlify/functions/logout", { method: "POST" });
            } catch (err) {
                console.warn("Logout API failed:", err.message || err);
            }

            localStorage.removeItem("rr_token");
            authDropdown.classList.remove("active");
            if (authDropdown) authDropdown.style.display = "none";
            updateAuthNav();
            window.location.href = "/";
        });
    }
});