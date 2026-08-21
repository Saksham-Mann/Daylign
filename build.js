/**
 * @file build.js
 * @description Generates public/js/env.js from environment variables (Cloudflare Pages, CI/CD, or local .env).
 */
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const envVars = { ...process.env };

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!envVars[key]) {
        envVars[key] = val;
      }
    }
  });
}

const config = {
  apiKey: envVars.FIREBASE_API_KEY || "",
  authDomain: envVars.FIREBASE_AUTH_DOMAIN || "",
  projectId: envVars.FIREBASE_PROJECT_ID || "",
  storageBucket: envVars.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: envVars.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: envVars.FIREBASE_APP_ID || "",
  measurementId: envVars.FIREBASE_MEASUREMENT_ID || ""
};

const output = `window.__FIREBASE_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;
const outDir = path.join(__dirname, 'public', 'js');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}
fs.writeFileSync(path.join(outDir, 'env.js'), output, 'utf8');
console.log('Successfully generated public/js/env.js');
