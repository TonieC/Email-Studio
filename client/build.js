'use strict';

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const outdir = path.join(__dirname, '..', 'public');

fs.mkdirSync(outdir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'main.js')],
  bundle: true,
  outfile: path.join(outdir, 'app.js'),
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  sourcemap: false,
  minify: process.env.NODE_ENV === 'production',
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development') },
  logLevel: 'info',
});

console.log('[build] client bundle written to public/app.js');
