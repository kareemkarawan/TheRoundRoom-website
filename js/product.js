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