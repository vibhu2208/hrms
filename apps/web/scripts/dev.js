const { spawn } = require('child_process');

const child = spawn(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'dev', '-p', '3000'],
  {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
