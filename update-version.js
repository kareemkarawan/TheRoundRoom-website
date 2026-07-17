#!/usr/bin/env node
/**
 * Cache busting helper - updates version timestamp in all HTML files
 * Run this before deploying to ensure users get the latest CSS/JS
 */

const fs = require('fs');
const path = require('path');

const VERSION = Date.now(); // Use timestamp as version
const HTML_FILES = [
  'index.html',
  'admin.html', 
  'careers.html',
  'checkout.html',
  'collections-admin.html',
  'contact.html',
  'discounts-admin.html',
  'login.html',
  'menu-admin.html',
  'order_page.html',
  'pincodes-admin.html',
  'pookie-admin.html',
  'pookie.html',
  'privacy.html',
  'production.html',
  'refund.html',
  'register.html',
  'settings.html',
  'terms.html',
  'thankyou.html',
  'user-logs.html'
];

console.log(`Updating version to: ${VERSION}`);

HTML_FILES.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  Skipping ${file} (not found)`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Update style.css links
  content = content.replace(
    /href="style\.css(\?v=\d+)?"/g,
    `href="style.css?v=${VERSION}"`
  );
  
  // Update script.js links  
  content = content.replace(
    /src="script\.js(\?v=\d+)?"/g,
    `src="script.js?v=${VERSION}"`
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Updated ${file}`);
});

console.log('\n✅ Version update complete!');
console.log('Your CSS and JS files will now reload on next deploy.\n');
