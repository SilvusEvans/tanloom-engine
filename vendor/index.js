// Minimal offline stand-in for the `electron` npm package.
// Resolves to the local dist/electron.exe that ships in this folder.
const fs = require('fs');
const path = require('path');

const pathFile = path.join(__dirname, 'path.txt');

function getElectronPath() {
  let executablePath;
  if (fs.existsSync(pathFile)) {
    executablePath = fs.readFileSync(pathFile, 'utf-8').trim();
  }
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    return path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || 'electron');
  }
  if (executablePath) {
    return path.join(__dirname, 'dist', executablePath);
  }
  throw new Error('Electron failed to install correctly (missing path.txt).');
}

module.exports = getElectronPath();
