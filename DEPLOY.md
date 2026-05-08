# Deploy Produksi: VPS Ubuntu

Target:
- Domain: `antrian.pn`
- Path aplikasi: `/var/www/antrian`
- Web server: Apache
- Database: MySQL
- PHP: 8.4
- Frontend: Next.js
- Backend: Laravel
- Realtime: Laravel Reverb

## Prasyarat

Node.js `18.19.1` di VPS terlalu lama untuk Next.js `16.2.4`. Minimum: `>=20.9.0`. Gunakan Node.js 22 LTS.

Peringatan status lokal:
- Direktori `frontend` memiliki banyak file yang belum di-track.
- Git deploy akan terlewat jika belum di-commit/push.
- Upload lokal dengan `rsync` paling aman untuk kondisi saat ini.

Jangan commit secret produksi asli ke file ini. Ganti placeholder langsung di VPS.

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

## 2. Install dependensi server

```bash
sudo apt update
sudo apt install -y git unzip curl composer certbot python3-certbot-apache \
  php8.4-cli php8.4-fpm php8.4-mysql php8.4-mbstring php8.4-xml php8.4-curl php8.4-zip php8.4-bcmath php8.4-intl

sudo a2enmod rewrite proxy proxy_http proxy_wstunnel headers ssl
sudo systemctl restart apache2
```

## 3. Buat database MySQL

Gunakan kredensial MySQL VPS yang disediakan terpisah.

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

## 4. Taruh aplikasi di `/var/www/antrian`

### Opsi A: Git deploy

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER:www-data" /var/www

git clone <GIT_URL> /var/www/antrian
cd /var/www/antrian
```

Hanya gunakan jika semua perubahan lokal sudah di-commit dan push.

### Opsi B: Upload dari lokal

Jalankan dari mesin lokal:

```bash
rsync -az --delete \
  --exclude='.git' \
  --exclude='backend/vendor' \
  --exclude='frontend/node_modules' \
  --exclude='frontend/.next' \
  /Users/macbook/Developer/php/antrian/ SSH_USER@SERVER_IP:/var/www/antrian/
```

## 5. Backend `.env`

Di VPS:

```bash
cd /var/www/antrian/backend
cp .env.example .env
php artisan key:generate
nano .env
```

Gunakan:

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

Generate secret Reverb:

```bash
openssl rand -hex 24
openssl rand -hex 32
```

Gunakan nilai yang dihasilkan untuk:
- `REVERB_APP_KEY`
- `REVERB_APP_SECRET`

## 6. Install dan optimasi backend

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

Gunakan:

```env
NEXT_PUBLIC_API_URL=https://antrian.pn/api/v1
NEXT_PUBLIC_PUSHER_KEY=<REVERB_APP_KEY>
NEXT_PUBLIC_PUSHER_HOST=antrian.pn
NEXT_PUBLIC_PUSHER_PORT=443
NEXT_PUBLIC_PUSHER_SCHEME=https
```

`NEXT_PUBLIC_PUSHER_KEY` harus sama dengan `REVERB_APP_KEY` di backend.

Build frontend:

```bash
npm ci
npm run build
```

## 8. Service systemd frontend

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

## 9. Service systemd queue worker

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

## 10. Service systemd Reverb

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

Aktifkan semua service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now antrian-frontend antrian-queue antrian-reverb
sudo systemctl status antrian-frontend antrian-queue antrian-reverb
```

## 11. Virtual host Apache

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

Aktifkan site:

```bash
sudo a2ensite antrian.pn.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

## 12. HTTPS

Buat DNS record terlebih dahulu:

```txt
antrian.pn -> SERVER_IP
```

Lalu jalankan:

```bash
sudo certbot --apache -d antrian.pn
```

Setelah Certbot, pastikan SSL vhost tetap memiliki proxy rules berikut:

```apache
ProxyPreserveHost On
ProxyPass /app ws://127.0.0.1:8080/app
ProxyPassReverse /app ws://127.0.0.1:8080/app
ProxyPassMatch ^/(api|sanctum|broadcasting|storage|up)(/.*)?$ !
ProxyPass / http://127.0.0.1:3000/
ProxyPassReverse / http://127.0.0.1:3000/
```

Untuk vhost HTTPS, set forwarded proto:

```apache
RequestHeader set X-Forwarded-Proto "https"
```

## 13. Verifikasi

```bash
curl -I http://antrian.pn/up
curl -I https://antrian.pn/up

sudo journalctl -u antrian-frontend -n 100 --no-pager
sudo journalctl -u antrian-queue -n 100 --no-pager
sudo journalctl -u antrian-reverb -n 100 --no-pager
sudo tail -n 100 /var/www/antrian/backend/storage/logs/laravel.log
```

Cek browser:
- `https://antrian.pn/login` — login admin
- `/kiosk` — buat tiket antrian
- `/display` — menerima pembaruan realtime
- `/displays` — slider volume tersimpan setelah drag/release

## 14. Perbaikan Umum

### Service frontend gagal

```bash
sudo journalctl -u antrian-frontend -n 200 --no-pager
node -v
```

Jika Node di bawah `20.9.0`, upgrade ke Node 22.

### Error permission Laravel

```bash
sudo chown -R www-data:www-data /var/www/antrian/backend/storage /var/www/antrian/backend/bootstrap/cache
sudo chmod -R ug+rw /var/www/antrian/backend/storage /var/www/antrian/backend/bootstrap/cache
```

### Perubahan config tidak diterapkan

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

### Reverb/websocket gagal

```bash
sudo systemctl status antrian-reverb
sudo journalctl -u antrian-reverb -n 100 --no-pager
```

Cek kesesuaian nilai:
- backend `REVERB_APP_KEY`
- frontend `NEXT_PUBLIC_PUSHER_KEY`
- frontend `NEXT_PUBLIC_PUSHER_SCHEME=https`
- frontend `NEXT_PUBLIC_PUSHER_PORT=443`

## Referensi Versi Teknologi

| Komponen | Versi |
|----------|-------|
| PHP | 8.3+ |
| Laravel | 13.x |
| Laravel Reverb | 1.10+ |
| Laravel Sanctum | 4.0+ |
| Node.js | 22 LTS |
| Next.js | 16.2.4 |
| React | 19.2.4 |
| MySQL | 8.x |