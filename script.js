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

    function renderCheckoutSummary() {
        const loadingEl = document.getElementById('checkoutLoading');
        if (loadingEl) loadingEl.style.display = 'block';
        const itemsEl = document.getElementById('checkoutItems');
        const subtotalEl = document.getElementById('checkoutSubtotal');
        const taxEl = document.getElementById('checkoutTax');
        const totalEl = document.getElementById('checkoutTotal');
        if (!itemsEl || !subtotalEl || !taxEl || !totalEl) return;

        let cart = null;
        try { cart = JSON.parse(localStorage.getItem('rr_cart') || 'null'); } catch (e) { cart = null; }
        if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
            itemsEl.innerHTML = '<p class="empty-cart">No items in your cart.</p>';
            subtotalEl.textContent = '₹0.00';
            taxEl.textContent = '₹0.00';
            totalEl.textContent = '₹0.00';
            return;
        }

        itemsEl.innerHTML = cart.items.map(item => `
            <div class="checkout-item">
                <div class="left"><span class="qty">${item.qty}x</span><span class="name">${item.name}</span></div>
                <div>₹${Number(item.itemTotal || 0).toFixed(2)}</div>
            </div>
        `).join('');

        subtotalEl.textContent = `₹${Number(cart.subtotal || 0).toFixed(2)}`;
        taxEl.textContent = `₹${Number(cart.tax || 0).toFixed(2)}`;
        totalEl.textContent = `₹${Number(cart.total || 0).toFixed(2)}`;
        if (loadingEl) loadingEl.style.display = 'none';
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
        const address = data.get('address').trim();
        const pincode = data.get('pincode').trim();
        const note = data.get('note').trim();

        // Validate pincode
        const pincodeValid = await validatePincode(pincode);
        if (!pincodeValid) {
            if (paymentLoading) paymentLoading.style.display = 'none';
            return;
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
                address: address,
                note: note
            },
            items: (rawCart.items || []).map(i => ({
                menuItemId: i.id,
                qty: Number(i.qty)
            }))
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
            cart: rawCart
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
});

/* ===== Store status (open/closed) ===== */
async function initStoreStatus() {
    try {
        const response = await fetch('/.netlify/functions/settings');
        if (!response.ok) return;
        const data = await response.json();
        const isOpen = data.storeOpen !== false;
        window._rr_storeOpen = isOpen;

        const banner = document.getElementById('storeStatusBanner');
        if (banner) {
            if (!isOpen) {
                banner.textContent = 'Store is currently closed. We are not accepting orders right now.';
                banner.style.display = 'block';
            } else {
                banner.style.display = 'none';
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

    const cart = data.cart || { items: [], subtotal: 0, tax: 0, total: 0 };
    const itemsHtml = (cart.items || []).map(item => `
        <div class="checkout-item">
            <div class="left"><span class="qty">${item.qty}x</span><span class="name">${item.name}</span></div>
            <div>₹${Number(item.itemTotal || 0).toFixed(2)}</div>
        </div>
    `).join('');

    container.innerHTML = `
        <h3>Thanks! Your payment is confirmed.</h3>
        <p>Order ID: <strong>${data.orderNumber}</strong></p>
        <p>We'll start preparing your order now.</p>
        <div class="checkout-items" style="margin-top:1rem;">${itemsHtml || '<p>No items.</p>'}</div>
        <div class="checkout-breakdown" style="margin-top:1rem;">
            <div class="row"><span>Subtotal</span><span>₹${Number(cart.subtotal || 0).toFixed(2)}</span></div>
            <div class="row"><span>Tax</span><span>₹${Number(cart.tax || 0).toFixed(2)}</span></div>
            <div class="row total"><span>Total</span><span>₹${Number(cart.total || 0).toFixed(2)}</span></div>
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
        const cart = orderData.cart || { items: [], subtotal: 0, tax: 0, total: 0 };
        const totalPaid = Number(orderData.amount || 0) / 100;
        const taxRate = cart.subtotal > 0 ? (Number(cart.tax || 0) / Number(cart.subtotal || 1)) * 100 : 0;

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
            doc.text(`Order ID: ${orderData.orderNumber}`, 14, y); y += 6;
            doc.text(`Date: ${now.toLocaleString()}`, 14, y); y += 6;
            doc.text(`Customer: ${orderData.customer?.name || ''}`, 14, y); y += 6;
            doc.text(`Email: ${orderData.customer?.email || ''}`, 14, y); y += 6;
            doc.text(`Phone: ${orderData.customer?.phone || ''}`, 14, y); y += 6;
            doc.text(`Payment ID: ${razorpayResponse?.razorpay_payment_id || ''}`, 14, y); y += 6;
            doc.text(`Razorpay Order ID: ${razorpayResponse?.razorpay_order_id || ''}`, 14, y); y += 8;

            doc.text('Items:', 14, y); y += 6;
            doc.setFontSize(10);
            (cart.items || []).forEach(item => {
                const line = `${item.qty}x ${item.name} — ₹${Number(item.itemTotal || 0).toFixed(2)}`;
                doc.text(line, 16, y);
                y += 5;
                if (y > 270) { doc.addPage(); y = 14; }
            });

            y += 4;
            doc.setFontSize(11);
            doc.text(`Subtotal: ₹${Number(cart.subtotal || 0).toFixed(2)}`, 14, y); y += 6;
            doc.text(`Tax (${taxRate.toFixed(2)}%): ₹${Number(cart.tax || 0).toFixed(2)}`, 14, y); y += 6;
            doc.text(`Total Paid: ₹${totalPaid.toFixed(2)}`, 14, y);

            doc.save(`receipt-${orderData.orderNumber}.pdf`);
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
    fetch('/.netlify/functions/menu', { cache: 'force-cache' }).catch(function () {});
});