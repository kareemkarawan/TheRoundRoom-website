/**
 * FILE: product.js
 * PURPOSE: Fetches and displays a single product from the menu based on URL parameter.
 *
 * NOTES:
 * - Reads product ID from URL query string (?id=xxx)
 * - Fetches menu data from /.netlify/functions/menu
 * - Calls rendererProduct() to display the product (defined elsewhere)
 * - Shows error message if product not found or network fails
 */

const container = document.getElementById('product')

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

if (!productId) {
    container.textContent = 'Product not found';
    throw new Error('Missing product id');
}

fetch('/.netlify/functions/menu')
    .then(res => {
        if (!res.ok) throw new Error('Network error');
        return res.json();
    })
    .then(items => {
        const product = items.find(i => i.id === productId);
        if (!product) throw new Error('Product not found');
        rendererProduct(product);
    })
    .catch(err => {
        console.error(err);
        container.textContent = 'Error loading product';
    });