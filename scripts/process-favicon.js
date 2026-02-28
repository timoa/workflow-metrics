import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const SOURCE_FAVICON = join(projectRoot, 'static', 'logo.svg');
const OUTPUT_DIR = join(projectRoot, 'static');

const FAVICON_VARIANTS = [
  {
    name: 'favicon-16x16.png',
    size: 16,
    description: 'Standard favicon for browsers (16x16)'
  },
  {
    name: 'favicon-32x32.png',
    size: 32,
    description: 'Standard favicon for browsers (32x32)'
  },
  {
    name: 'favicon-48x48.png',
    size: 48,
    description: 'Standard favicon for browsers (48x48)'
  },
  {
    name: 'apple-touch-icon.png',
    size: 180,
    description: 'Apple touch icon for iOS devices'
  },
  {
    name: 'android-chrome-192x192.png',
    size: 192,
    description: 'Android Chrome icon (192x192)'
  },
  {
    name: 'android-chrome-512x512.png',
    size: 512,
    description: 'Android Chrome icon (512x512)'
  },
  {
    name: 'favicon.ico',
    size: 32,
    description: 'Legacy ICO format for older browsers',
    format: 'ico'
  }
];

async function processFavicons() {
  console.log('🎨 Processing favicons...\n');

  if (!existsSync(SOURCE_FAVICON)) {
    console.error(`❌ Source favicon not found: ${SOURCE_FAVICON}`);
    console.error('   Please ensure favicon.svg exists in the static/ directory');
    process.exit(1);
  }

  try {
    console.log(`📸 Source favicon: ${SOURCE_FAVICON}\n`);

    for (const variant of FAVICON_VARIANTS) {
      const outputPath = join(OUTPUT_DIR, variant.name);
      const format = variant.format || 'png';
      
      const sharpInstance = sharp(SOURCE_FAVICON)
        .resize(variant.size, variant.size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        });

      if (format === 'ico') {
        await sharpInstance.png().toFile(outputPath);
      } else {
        await sharpInstance.png().toFile(outputPath);
      }

      console.log(`✅ ${variant.name.padEnd(30)} ${variant.size}x${variant.size}`);
      console.log(`   ${variant.description}`);
    }

    // Generate web app manifest
    const manifest = {
      name: 'Workflow Editor',
      short_name: 'Workflow Editor',
      description: 'Visual workflow editor for building automation workflows',
      icons: [
        {
          src: '/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ],
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone'
    };

    const manifestPath = join(OUTPUT_DIR, 'site.webmanifest');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n✅ site.webmanifest created`);
    console.log(`   Web app manifest for PWA support`);

    // Generate browserconfig.xml for Windows tiles
    const browserconfig = `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square150x150logo src="/android-chrome-192x192.png"/>
      <TileColor>#ffffff</TileColor>
    </tile>
  </msapplication>
</browserconfig>`;

    const browserconfigPath = join(OUTPUT_DIR, 'browserconfig.xml');
    writeFileSync(browserconfigPath, browserconfig);
    console.log(`\n✅ browserconfig.xml created`);
    console.log(`   Browser configuration for Windows tiles`);

    console.log('\n✨ Favicon processing complete!\n');
    console.log('📝 Add these tags to your HTML <head>:');
    console.log('');
    console.log('  <link rel="icon" type="image/svg+xml" href="/favicon.svg">');
    console.log('  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">');
    console.log('  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">');
    console.log('  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">');
    console.log('  <link rel="manifest" href="/site.webmanifest">');
    console.log('  <meta name="theme-color" content="#ffffff">');
    console.log('');
  } catch (error) {
    console.error('❌ Error processing favicons:', error.message);
    process.exit(1);
  }
}

processFavicons();
