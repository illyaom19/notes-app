import { spawn } from 'node:child_process';
const server = spawn('python3', ['-m', 'http.server', '4174', '--bind', '127.0.0.1'], { stdio: 'ignore' });
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:4174')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  for (const name of ['implementation', 'full-check', 'recovery-check', 'source-check', 'offline-check', 'scaling-check', 'library-touch-check', 'reliability-check']) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [`tests/browser/${name}.mjs`], { stdio: 'inherit', env: process.env });
      child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${name} failed (${code})`)));
    });
  }
} finally { server.kill(); }
