#!/usr/bin/env node
// Launcher that removes ELECTRON_RUN_AS_NODE before spawning Electron,
// so that Electron runs as a proper GUI app (browser process) instead of Node.js mode.
const { spawn } = require('child_process');
const path = require('path');

const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env,
  windowsHide: false,
});

child.on('close', (code) => {
  process.exit(code ?? 0);
});