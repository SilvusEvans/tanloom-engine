#!/usr/bin/env node
const { spawn } = require('child_process');
const electron = require('./index.js');

const child = spawn(electron, process.argv.slice(2), { stdio: 'inherit' });
child.on('close', (code) => process.exit(code));
