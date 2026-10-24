#!/usr/bin/env node
/**
 * Versions local assets in HTML, CSS, and JavaScript before deploying.
 */

const fs = require('fs');
const path = require('path');

const VERSION = Date.now(); // Use timestamp as version
const HTML_FILES = fs.readdirSync(__dirname).filter(file => file.endsWith('.html'));

console.log(`Updating version to: ${VERSION}`);

function versionStaticAssets(content) {
  return content
    .replace(
      /((?:\.\/|\/)?(?:images|webpimages|fonts|videos)\/[^"'?#]+)\?v=\d+/g,
      '$1'
    )
    .replace(
      /(["'])((?:\.\/|\/)?(?:images|webpimages|fonts|videos)\/[^"'?#]+)\1/g,
      `$1$2?v=${VERSION}$1`
    )
    .replace(
      /(url\(\s*)((?:\.\/|\/)?(?:images|webpimages|fonts|videos)\/[^)'"\s?#]+)(\s*\))/g,
      `$1$2?v=${VERSION}$3`
    );
}

function versionHtmlAssets(content) {
  return content
    .replace(
      /((?:\.\/|\/)?(?:images|webpimages|fonts|videos)\/[^"'?#]+)\?v=\d+/g,
      '$1'
    )
    .replace(
      /((?:src|href|poster|data-fallback)=["'])((?:\.\/|\/)?(?:images|webpimages|fonts|videos)\/[^"'?#]+)(["'])/g,
      `$1$2?v=${VERSION}$3`
    );
}

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

  content = content.replace(
    /(src=["'])(js\/[^"']+\.js)(?:\?v=\d+)?(["'])/g,
    `$1$2?v=${VERSION}$3`
  );
  content = versionHtmlAssets(content);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✓ Updated ${file}`);
});

['style.css', 'script.js', 'js/renderMenu.js'].forEach(file => {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return;

  let content = fs.readFileSync(filePath, 'utf8');
  content = versionStaticAssets(content);
  if (file === 'js/renderMenu.js') {
    content = content.replace(
      /(['"]\.\/models\/MenuItem\.js)(?:\?v=\d+)?(['"])/g,
      `$1?v=${VERSION}$2`
    );
  }
  fs.writeFileSync(filePath, content, 'utf8');
});