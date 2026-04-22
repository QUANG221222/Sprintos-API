# Deploy Sprintos API to EC2 (Amazon Linux 2023 + Nginx + PM2)

## 1. Provision EC2

- Use Amazon Linux 2023.
- Attach an Elastic IP.
- Open Security Group inbound:
  - `22` (SSH) from your IP
  - `80` (HTTP) from anywhere
  - `443` (HTTPS) from anywhere

## 2. SSH to server

```bash
ssh -i <your-key>.pem ec2-user@<ec2-public-ip>
```

## 3. Install Node.js, pnpm, PM2, Nginx

```bash
sudo dnf update -y
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs nginx git
sudo corepack enable
sudo corepack prepare pnpm@10.17.0 --activate
sudo npm i -g pm2
```

Verify:

```bash
node -v
pnpm -v
pm2 -v
nginx -v
```

## 4. Clone repository

```bash
sudo mkdir -p /var/www/sprintos-api
sudo chown -R ec2-user:ec2-user /var/www/sprintos-api
cd /var/www/sprintos-api
git clone https://github.com/QUANG221222/Sprintos-API.git current
cd current
```

## 5. Configure environment variables

Create `.env` from `.env.example` and fill real secrets:

```bash
cp .env.example .env
nano .env
```

Must-have in production:

- `BUILD_MODE=production`
- `PORT=8080`
- `MONGODB_URI`, `DATABASE_NAME`
- JWT secrets
- Cloudinary/Brevo keys
- Production domains (`WEBSITE_DOMAIN_PRODUCTION`, `COOKIE_DOMAIN`)

## 6. Install dependencies and build

```bash
pnpm install --frozen-lockfile
pnpm build
```

## 7. Run app with PM2

```bash
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd
```

Run the printed `sudo` command from `pm2 startup systemd`, then:

```bash
pm2 save
```

Useful PM2 commands:

```bash
pm2 status
pm2 logs sprintos-api
pm2 restart sprintos-api
```

## 8. Configure Nginx reverse proxy

Copy config:

```bash
sudo cp deploy/nginx/sprintos-api.conf /etc/nginx/conf.d/sprintos-api.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

Test:

```bash
curl http://127.0.0.1:8080/v1
curl http://<ec2-public-ip>/v1
```

## 9. Add HTTPS with Certbot (recommended)

```bash
ls /etc/nginx/
sudo dnf install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sprintos-apis.fittrackwk.online
```

## 10. Update app later

```bash
cd /var/www/sprintos-api/current
git pull origin master
pnpm install --frozen-lockfile
pnpm build
pm2 restart sprintos-api
pm2 save
```

## Config User Data In Launch Template

```
#!/bin/bash
set -euxo pipefail

# Chạy dưới user ec2-user để dùng đúng PM2 home

su - ec2-user -c '
cd /var/www/sprintos-api/current
pm2 resurrect
pm2 save
'
```

## Troubleshooting

- App does not start: `pm2 logs sprintos-api`
- Nginx fails: `sudo nginx -t` and `sudo journalctl -u nginx -n 100 --no-pager`
- Port in use: `sudo lsof -i :8080`
- Mongo connection issue: check `MONGODB_URI` and network access to MongoDB
