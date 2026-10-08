const { spawn } = require('child_process');

if (process.env.RENDER || process.env.VERCEL) {
  console.error(
    [
      'Do not run `npm run dev` on Render/Vercel.',
      'This monorepo splits production like this:',
      '  API  → Render start command: npm start',
      '  Web  → Vercel (Next.js production build)',
      '',
      'In the Render dashboard, set Start Command to: npm start',
    ].join('\n'),
  );
  process.exit(1);
}

const child = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  [
    'concurrently',
    '-n',
    'api,web',
    '-c',
    'blue,green',
    'npm run dev -w @go-staff/api',
    'npm run dev -w @go-staff/web',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'development' },
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
