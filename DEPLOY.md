# Production Deploy: Ubuntu VPS

Target:
- Domain: `antrian.pn`
- App path: `/var/www/antrian`
- Web server: Apache
- Database: MySQL
- PHP: 8.4
- Frontend: Next.js
- Backend: Laravel
- Realtime: Laravel Reverb

## Important

VPS Node.js `18.19.1` is too old for Next.js `16.2.4`.

Required Node.js: `>=20.9.0`. Use Node.js 22 LTS.

Current local state warning:
- The `frontend` directory has many untracked files.
- Git deploy will miss those files unless committed/pushed.
- Uploading local copy with `rsync` is safest for current state.

Do not commit real production secrets into this file. Replace placeholders directly on the VPS.

## 0. SSH

```bash
ssh SSH_USER@SERVER_IP
```

## 1. Upgrade Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

## 2. Install server dependencies

```bash
sudo apt update
sudo apt install -y git unzip curl composer certbot python3-certbot-apache \
  php8.4-cli php8.4-fpm php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-bcmath php8.4-intl

sudo a2enmod rewrite proxy proxy_http proxy_wstunnel headers ssl
sudo systemctl restart apache2
```

## 3. Create MySQL database

Use the VPS MySQL credentials provided out-of-band.

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE IF NOT EXISTS antrian CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '<DB_USER>'@'localhost' IDENTIFIED BY '<DB_PASSWORD>';
GRANT ALL PRIVILEGES ON antrian.* TO '<DB_USER>'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 4. Put app in `/var/www/antrian`

### Option A: Git deploy

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER:www-data" /var/www

git clone GIT_URL /var/www/antrian
cd /var/www/antrian
```

Only use this if all local changes are committed and pushed.

### Option B: Upload local copy

Run from local machine:

```bash
rsync -az --delete \
  --exclude='.git' \
  --exclude='backend/vendor' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/.next' \
  /Users/macbook/Developer/php/antrian/ SSH_USER@SERVER_IP:/var/www/antrian/
```

## 5. Backend `.env`

On VPS:

```bash
cd /var/www/antrian/backend
cp .env.example .env
php artisan key:generate
nano .env
```

Use:

```env
APP_NAME="Antrian"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://antrian.pn
FRONTEND_URL=https://antrian.pn
CORS_ALLOWED_ORIGINS=https://antrian.pn

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=antrian
DB_USERNAME=<DB_USER>
DB_PASSWORD=<DB_PASSWORD>

SESSION_DRIVER=database
SESSION_DOMAIN=antrian.pn
SANCTUM_STATEFUL_DOMAINS=antrian.pn

CACHE_STORE=database
QUEUE_CONNECTION=database
FILESYSTEM_DISK=public
BROADCAST_CONNECTION=reverb

REVERB_ENABLED=true
REVERB_APP_ID=antrian
REVERB_APP_KEY=<REVERB_APP_KEY>
REVERB_APP_SECRET=<REVERB_APP_SECRET>
REVERB_HOST=127.0.0.1
REVERB_PORT=8080
REVERB_SCHEME=http

PUSHER_APP_ID="${REVERB_APP_ID}"
PUSHER_APP_KEY="${REVERB_APP_KEY}"
PUSHER_APP_SECRET="${REVERB_APP_SECRET}"
PUSHER_HOST="${REVERB_HOST}"
PUSHER_PORT="${REVERB_PORT}"
PUSHER_SCHEME="${REVERB_SCHEME}"
```

Generate Reverb secrets:

```bash
openssl rand -hex 24
openssl rand -hex 32
```

Use generated values for:
- `REVERB_APP_KEY`
- `REVERB_APP_SECRET`

## 6. Backend install and optimize

```bash
cd /var/www/antrian/backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache

sudo chown -R www-data:www-data storage bootstrap/cache
sudo chmod -R ug+rw storage bootstrap/cache
```

## 7. Frontend `.env.production`

```bash
cd /var/www/antrian/frontend
nano .env.production
```

Use:

```env
NEXT_PUBLIC_API_URL=https://antrian.pn/api/v1
NEXT_PUBLIC_PUSHER_KEY=<REVERB_APP_KEY>
NEXT_PUBLIC_PUSHER_HOST=antrian.pn
NEXT_PUBLIC_PUSHER_PORT=443
NEXT_PUBLIC_PUSHER_SCHEME=https
```

`NEXT_PUBLIC_PUSHER_KEY` must match backend `REVERB_APP_KEY`.

Build frontend:

```bash
npm ci
npm run build
```

## 8. systemd frontend service

```bash
sudo nano /etc/systemd/system/antrian-frontend.service
```

```ini
[Unit]
Description=Antrian Next.js Frontend
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/antrian/frontend
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run start -- -H 127.0.0.1 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 9. systemd queue service

```bash
sudo nano /etc/systemd/system/antrian-queue.service
```

```ini
[Unit]
Description=Antrian Laravel Queue Worker
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/antrian/backend
ExecStart=/usr/bin/php artisan queue:work --sleep=3 --tries=3 --timeout=90
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 10. systemd Reverb service

```bash
sudo nano /etc/systemd/system/antrian-reverb.service
```

```ini
[Unit]
Description=Antrian Laravel Reverb
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/antrian/backend
ExecStart=/usr/bin/php artisan reverb:start --host=127.0.0.1 --port=8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable services:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now antrian-frontend antrian-queue antrian-reverb
sudo systemctl status antrian-frontend antrian-queue antrian-reverb
```

## 11. Apache virtual host

```bash
sudo nano /etc/apache2/sites-available/antrian.pn.conf
```

```apache
<VirtualHost *:80>
    ServerName antrian.pn

    DocumentRoot /var/www/antrian/backend/public

    <Directory /var/www/antrian/backend/public>
        AllowOverride All
        Require all granted
    </Directory>

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "http"

    ProxyPass /app ws://127.0.0.1:8080/app
    ProxyPassReverse /app ws://127.0.0.1:8080/app

    ProxyPassMatch ^/(api|sanctum|broadcasting|storage|up)(/.*)?$ !

    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/

    ErrorLog ${APACHE_LOG_DIR}/antrian-error.log
    CustomLog ${APACHE_LOG_DIR}/antrian-access.log combined
</VirtualHost>
```

Enable site:

```bash
sudo a2ensite antrian.pn.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

## 12. HTTPS

Create DNS record first:

```txt
antrian.pn -> SERVER_IP
```

Then run:

```bash
sudo certbot --apache -d antrian.pn
```

After Certbot, verify SSL vhost keeps these proxy rules:

```apache
ProxyPreserveHost On
ProxyPass /app ws://127.0.0.1:8080/app
ProxyPassReverse /app ws://127.0.0.1:8080/app
ProxyPassMatch ^/(api|sanctum|broadcasting|storage|up)(/.*)?$ !
ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/
```

For HTTPS vhost, set forwarded proto:

```apache
RequestHeader set X-Forwarded-Proto "https"
```

## 13. Verify

```bash
curl -I http://antrian.pn/up
curl -I https://antrian.pn/up

sudo journalctl -u antrian-frontend -n 100 --no-pager
sudo journalctl -u antrian-queue -n 100 --no-pager
sudo journalctl -u antrian-reverb -n 100 --no-pager
sudo tail -n 100 /var/www/antrian/backend/storage/logs/laravel.log
```

Browser checks:
- `https://antrian.pn/login`
- login admin
- `/kiosk` create queue ticket
- `/display` receives realtime updates
- `/displays` volume slider saves once after drag/release

## 14. Common fixes

### Frontend service fails

```bash
sudo journalctl -u antrian-frontend -n 200 --no-pager
node -v
```

If Node is below `20.9.0`, upgrade to Node 22.

### Laravel permission errors

```bash
sudo chown -R www-data:www-data /var/www/antrian/backend/storage /var/www/antrian/backend/bootstrap/cache
sudo chmod -R ug+rw /var/www/antrian/backend/storage /var/www/antrian/backend/bootstrap/cache
```

### Config changes not applied

```bash
cd /var/www/antrian/backend
php artisan optimize:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan event:cache
sudo systemctl restart antrian-queue antrian-reverb
sudo systemctl restart apache2
```

### Reverb/websocket fails

```bash
sudo systemctl status antrian-reverb
sudo journalctl -u antrian-reverb -n 100 --no-pager
```

Check matching values:
- backend `REVERB_APP_KEY`
- frontend `NEXT_PUBLIC_PUSHER_KEY`
- frontend `NEXT_PUBLIC_PUSHER_SCHEME=https`
- frontend `NEXT_PUBLIC_PUSHER_PORT=443`
