module.exports = {
  apps: [
    {
      name: 'sprintos-api',
      script: './dist/server.js',
      cwd: '/var/www/sprintos-api/current',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        BUILD_MODE: 'production',
        PORT: 8080,
        NODE_ENV: 'production'
      }
    }
  ]
}
