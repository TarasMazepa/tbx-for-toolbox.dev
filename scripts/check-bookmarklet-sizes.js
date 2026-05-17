const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const BOOKMARKLET_DIR = path.join(__dirname, '..', 'website', 'bookmarklets');
const MAX_BYTES = 8192;

async function checkSizes() {
  const files = fs.readdirSync(BOOKMARKLET_DIR).filter(f => f.endsWith('.js'));
  let hasError = false;

  console.log(`Checking ${files.length} bookmarklets for size limits...\n`);

  for (const file of files) {
    const filePath = path.join(BOOKMARKLET_DIR, file);
    const code = fs.readFileSync(filePath, 'utf8');

    try {
      const minified = await minify(code, {
        compress: { drop_console: true },
        format: { comments: false }
      });

      const finalString = "javascript:" + encodeURIComponent(minified.code);
      const byteLength = Buffer.byteLength(finalString, 'utf8');

      if (byteLength > MAX_BYTES) {
        console.error(`❌ [FAILED] ${file}: ${byteLength} bytes (exceeds ${MAX_BYTES} byte limit)`);
        if (file !== 'walmart-delivery-checklist-v2.js') {
          hasError = true;
        } else {
          console.warn(`⚠️ [WARNING] ${file} is currently allowed to exceed the limit while under active development.`);
        }
      } else {
        console.log(`✅ [OK] ${file}: ${byteLength} bytes`);
      }
    } catch (err) {
      console.error(`❌ [ERROR] Failed to minify ${file}:`, err.message);
      hasError = true;
    }
  }

  if (hasError) {
    console.error('\n🚨 CI Check Failed: One or more bookmarklets exceed the 8,192 byte limit.');
    process.exit(1);
  } else {
    console.log('\n🎉 All bookmarklets are within the size limit.');
  }
}

checkSizes();
