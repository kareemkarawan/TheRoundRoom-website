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

    if (navLinks && navLinks.length) {
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
    }

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

        // Autoplay (optional): 4-second interval (disabled on mobile for UX)
        var autoplayTimer = null;
        if (!isMobile) {
            autoplayTimer = setInterval(function () {
                // stop autoplay if we've reached the last slide
                if (currentIndex < slides.length - 1) moveNext(); else { clearInterval(autoplayTimer); autoplayTimer = null; }
            }, 4000);
        }
        // Pause on hover and ensure we don't create stacked timers
        carousel.addEventListener('mouseenter', function () { clearInterval(autoplayTimer); autoplayTimer = null; });
        carousel.addEventListener('mouseleave', function () { if (!autoplayTimer) { autoplayTimer = setInterval(moveNext, 4000); } });

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

        /* --- Drag / Swipe Support (pointer events) --- */
        var isDragging = false;
        var startX = 0;
        var currentTranslate = 0;
        var lastTranslate = 0;
        var pointerId = null;

        function getWrapperTranslate() {
            var style = window.getComputedStyle(track);
            var matrix = new WebKitCSSMatrix(style.transform);
            return matrix.m41; // translateX value
        }

        function onPointerDown(e) {
            isDragging = true;
            pointerId = e.pointerId;
            startX = e.clientX;
            lastTranslate = getWrapperTranslate();
            track.style.transition = 'none';
            // Pause autoplay
            if (autoplayTimer) { clearInterval(autoplayTimer); autoplayTimer = null; }
            // Capture pointer
            track.setPointerCapture(pointerId);
        }

        function onPointerMove(e) {
            if (!isDragging || e.pointerId !== pointerId) return;
            var dx = e.clientX - startX;
            var translate = lastTranslate + dx;
            track.style.transform = 'translateX(' + translate + 'px)';
        }

        function onPointerUp(e) {
            if (!isDragging || e.pointerId !== pointerId) return;
            isDragging = false;
            track.releasePointerCapture(pointerId);
            // Decide based on how far we dragged whether to move next/prev
            var dx = e.clientX - startX;
            var threshold = wrapper.clientWidth * (isMobile ? 0.08 : 0.12); // tighter threshold on mobile
            if (dx > threshold) {
                movePrev();
            } else if (dx < -threshold) {
                moveNext();
            } else {
                // Snap back to current
                centerIndex(currentIndex, true);
            }
            // Resume autoplay when not hovering
            if (!autoplayTimer) { autoplayTimer = setInterval(moveNext, 4000); }
        }

        // Attach pointer events (fallback to touch/mouse via pointer events support)
        try {
            track.addEventListener('pointerdown', onPointerDown, { passive: false });
            window.addEventListener('pointermove', onPointerMove, { passive: false });
            window.addEventListener('pointerup', onPointerUp, { passive: false });
            track.addEventListener('pointercancel', onPointerUp, { passive: false });
        } catch (err) {
            // ignore if pointer events not supported
        }
    }

    // Kick off the bagel carousel if present
    initCarousel('bagelCarousel');
});

// Menu rendering and quantity button initialization moved to an ES module: js/renderMenu.js
// This keeps `script.js` focused on site behaviour (carousels, cart updates, checkout, etc.).

function updateCart() {
    let cartItems = [];
    let subtotal = 0;

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

    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    document.getElementById('toggleTotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('subtotal').textContent = `₹${subtotal.toFixed(2)}`;
    document.getElementById('tax').textContent = `₹${tax.toFixed(2)}`;
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

    // Save cart to localStorage so checkout can pick it up
    try {
        if (cartItems.length === 0) {
            localStorage.removeItem('rr_cart');
        } else {
            localStorage.setItem('rr_cart', JSON.stringify({ items: cartItems, subtotal: subtotal, tax: tax, total: total }));
        }
    } catch (err) {
        console.warn('Could not save cart to localStorage', err);
    }

    // Update header toggle total (for mobile collapsed bar)
    const toggleTotalEl = document.getElementById('toggleTotal');
    if (toggleTotalEl) toggleTotalEl.textContent = document.getElementById('total').textContent; }

function scrollToCheckout() {
    const checkoutSection = document.getElementById('checkoutSection');
    if (checkoutSection) {
        checkoutSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function submitOrder() {
    // Collect form data
    const order = {
        name: document.getElementById('fullName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        city: document.getElementById('city').value,
        postal: document.getElementById('postal').value,
        instructions: document.getElementById('instructions').value,
        delivery: document.querySelector('input[name="delivery"]:checked').value,
        payment: document.querySelector('input[name="payment"]:checked').value,
    };

    // Get cart items
    const cartItems = [];
    document.querySelectorAll('.menu-item').forEach(item => {
        const id = item.dataset.id;
        const qty = parseInt(document.querySelector(`.qty[data-id="${id}"]`).textContent);
        if (qty > 0) {
            cartItems.push({
                name: item.dataset.name,
                qty: qty,
                price: item.dataset.price
            });
        }
    });

    if (cartItems.length === 0) {
        alert('Please add items to your cart');
        return;
    }

    if (!order.name || !order.phone) {
        alert('Please fill in all required fields');
        return;
    }

    // Prepare WhatsApp message
    let message = `*Order from The Round Room*\n\n`;
    message += `*Customer:* ${order.name}\n`;
    message += `*Phone:* ${order.phone}\n`;
    message += `*Email:* ${order.email}\n\n`;
    message += `*Items:*\n`;
            
    let total = 0;
    cartItems.forEach(item => {
        const itemTotal = item.qty * parseFloat(item.price);
        message += `• ${item.qty}x ${item.name} - $${itemTotal.toFixed(2)}\n`;
        total += itemTotal;
    });

    const tax = total * 0.05;
    message += `\n*Subtotal:* ₹${total.toFixed(2)}\n`;
    message += `*Tax:* ₹${tax.toFixed(2)}\n`;
    message += `*Total:* ₹{(total + tax).toFixed(2)}\n\n`;
    message += `*Delivery:* ${order.delivery}\n`;
    message += `*Address:* ${order.address}, ${order.city} ${order.postal}\n`;
    if (order.instructions) {
        message += `*Instructions:* ${order.instructions}\n`;
    }
    message += `*Payment:* ${order.payment}`;

    // Open WhatsApp
    const whatsappUrl = `https://wa.me/YOUR_PHONE_NUMBER?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
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
// Checkout form handling
document.addEventListener('DOMContentLoaded', function() {
    const checkoutForm = document.getElementById('checkoutForm');
    if (!checkoutForm) return; // not on this page
    
    let pendingOrderData = null;
    let validPincodes = [];

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

        const data = new FormData(form);
        const first = data.get('firstName').trim();
        const last = data.get('lastName').trim();
        const phone = data.get('phone').trim();
        const address = data.get('address').trim();
        const pincode = data.get('pincode').trim();
        const note = data.get('note').trim();

        // Validate pincode
        const pincodeValid = await validatePincode(pincode);
        if (!pincodeValid) {
            return;
        }

        // Get the saved cart
        let rawCart = null;
        try { rawCart = JSON.parse(localStorage.getItem('rr_cart') || 'null'); } catch (err) { rawCart = null; }
        if (!rawCart || !rawCart.items || rawCart.items.length === 0) {
            alert('Your cart is empty. Please add items before placing an order.');
            return;
        }

        // Store order data and show payment modal
        pendingOrderData = {
            customer: {
                firstName: first,
                lastName: last,
                phone: phone,
                address: address,
                pincode: pincode,
                note: note
            },
            cart: rawCart
        };

        // Show payment modal
        const modal = document.getElementById('paymentModal');
        const totalEl = document.getElementById('paymentTotal');
        if (modal && totalEl) {
            totalEl.textContent = '₹' + Number(rawCart.total).toFixed(2);
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
        }
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

            // Build order object
            const order = createOrderObject(pendingOrderData.customer, pendingOrderData.cart);

            // Save order to MongoDB via Netlify function
            const saved = await saveOrder(order);
            if (!saved) {
                alert('Failed to save order. Please try again.');
                return;
            }

            // Clear cart
            try { localStorage.removeItem('rr_cart'); } catch (e) { /* ignore */ }

            // Hide modal
            const modal = document.getElementById('paymentModal');
            if (modal) {
                modal.style.display = 'none';
                modal.setAttribute('aria-hidden', 'true');
            }

            // Show success view with order id and summary
            const form = document.getElementById('checkoutForm');
            if (form) {
                form.innerHTML = `\
                    <div class="form-success">\
                        <h3>Thanks, ${pendingOrderData.customer.firstName}! Your order is confirmed.</h3>\
                        <p>Order ID: <strong>${order.id}</strong></p>\
                        <p>We've received your payment and will start preparing your order.</p>\
                        <div style="margin-top:0.75rem">\
                            <a href="order_page.html" class="order-button">Return to menu</a>\
                        </div>\
                    </div>\
                `;
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            pendingOrderData = null;
        });
    }

    // Load pincodes when form is ready
    loadValidPincodes();
});

/* ===== Orders: create/save/manage (client-only simulation) ===== */

function createOrderObject(customer, cart) {
    const id = `ORD-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
    const createdAt = new Date().toISOString();
    return {
        id,
        createdAt,
        customer: {
            firstName: customer.firstName || '',
            lastName: customer.lastName || '',
            phone: customer.phone || '',
            address: customer.address || '',
            note: customer.note || ''
        },
        items: (cart.items || []).map(i => ({ id: i.id, name: i.name, qty: i.qty, price: i.price, itemTotal: Number(i.itemTotal) })),
        subtotal: Number((cart.subtotal || 0).toFixed(2)),
        tax: Number((cart.tax || 0).toFixed(2)),
        total: Number((cart.total || 0).toFixed(2)),
        payment: {
            method: 'Online',
            status: 'Paid',
            ref: `PAY-${Math.random().toString(36).slice(2,9)}`
        },
        status: 'Placed' // statuses: Placed -> Preparing -> Ready -> Completed / Cancelled
    };
}

async function getOrders() {
    try {
        const response = await fetch('/.netlify/functions/orders', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
            return await response.json();
        }
    } catch (e) { console.warn('Could not fetch orders', e); }
    return [];
}

async function saveOrder(order) {
    try {
        console.log('Saving order to database:', order);
        const response = await fetch('/.netlify/functions/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order)
        });
        const result = await response.json();
        console.log('Server response:', result);
        if (response.ok) {
            console.log('Order saved successfully!');
            window.dispatchEvent(new Event('ordersUpdated'));
            return true;
        } else {
            console.error('Failed to save order:', result);
        }
    } catch (e) { 
        console.error('Could not save order', e); 
    }
    return false;
}

async function updateOrderStatus(orderId, status) {
    try {
        const response = await fetch(`/.netlify/functions/orders?id=${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (response.ok) {
            window.dispatchEvent(new Event('ordersUpdated'));
            return true;
        }
    } catch (e) { console.warn('Could not update order', e); }
    return false;
}

async function deleteOrder(orderId) {
    try {
        console.log('Deleting order:', orderId);
        const response = await fetch(`/.netlify/functions/orders?id=${orderId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            console.log('Order deleted successfully');
            window.dispatchEvent(new Event('ordersUpdated'));
            return true;
        }
    } catch (e) { console.error('Could not delete order', e); }
    return false;
}

// Small helper to format ISO -> local readable
function fmtDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}
