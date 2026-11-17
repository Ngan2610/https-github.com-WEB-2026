const { readFileSync, writeFileSync } = require('node:fs');
const { createRequire } = require('node:module');

function replaceDependencyCode(file, original, replacement) {
  const source = readFileSync(file, 'utf8');
  if (source.includes(replacement)) return;

  if (source.split(original).length !== 2) {
    throw new Error(`Dependency changed: review the compatibility patch for ${file}`);
  }

  writeFileSync(file, source.replace(original, replacement));
}

// Keep query-string 7 compatible with the patched ESM decoder.
const requireNavigation = createRequire(require.resolve('@react-navigation/core/package.json'));
replaceDependencyCode(
  requireNavigation.resolve('query-string'),
  "const decodeComponent = require('decode-uri-component');",
  "const { default: decodeComponent } = require('decode-uri-component');",
);

// Expo 51's Metro expects image-size 1's callable export and file-path support.
const requireMetro = createRequire(require.resolve('metro/package.json'));
const metroAssets = requireMetro.resolve('./src/Assets.js');
replaceDependencyCode(
  metroAssets,
  'const getImageSize = require("image-size");',
  'const { imageSize: getImageSize } = require("image-size");',
);
replaceDependencyCode(
  metroAssets,
  '  const isImageInput = assetInfo.files[0].includes(".zip/")\n    ? fs.readFileSync(assetInfo.files[0])\n    : assetInfo.files[0];\n  const dimensions = isImage ? getImageSize(isImageInput) : null;',
  '  const dimensions = isImage ? getImageSize(await fs.promises.readFile(assetInfo.files[0])) : null;',
);
