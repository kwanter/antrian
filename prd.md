# PRD — Project Requirements Document

## 1. Overview
Sistem Antrian Digital adalah platform terintegrasi yang dirancang untuk mengelola, memantau, dan mengoptimalkan alur pelayanan di instansi atau loket layanan masyarakat. Sistem ini menghubungkan perangkat kiosk (penyerah tiket), aplikasi petugas loket, layar display ruang tunggu, dan dashboard admin ke dalam satu ekosistem yang terpusat di backend. Proyek ini dibangun menggunakan **Laravel 11** sebagai backend dan **React/Next.js** sebagai frontend, dengan fokus pada real-time sync, konfigurasi dinamis perangkat keras (printer thermal & display), serta manajemen akses berbasis peran yang ketat.

## 2. Tujuan & Lingkup Proyek
### 2.1 Tujuan
- Mengurangi waktu tunggu dan antrian fisik yang tidak terkontrol.
- Memberikan kontrol penuh kepada admin atas media display (video & volume), hak akses lokasi, dan format cetakan tiket.
- Mengintegrasikan printer thermal USB secara langsung tanpa dialog print browser atau install driver tambahan.
- Menyediakan monitoring antrian real-time dan laporan pelayanan yang akurat.
- Menjaga jejak aktivitas administratif yang lengkap untuk keperluan audit internal.

### 2.2 Lingkup (In-Scope)
- Dashboard Admin: CRUD user, pengisian loket, pengaturan video/volume, konfigurasi printer, monitoring real-time, dan audit trail.
- Aplikasi Kiosk: Pemilihan layanan, generate nomor, pencetakan tiket via USB bridge.
- Aplikasi Loket: Login petugas, panggilan antrian, penyelesaian layanan, histori.
- Aplikasi Display: Tampilan nomor antrian aktif & pemutar video dengan kontrol volume dinamis.
- Backend API: Laravel 11, manajemen antrian, WebSocket/SSE untuk sinkronisasi, logging terpusat.

### 2.3 Di Luar Lingkup (Out-of-Scope)
- Aplikasi mobile khusus pengunjung (bisa dikembangkan di fase lanjutan).
- Integrasi sistem pembayaran atau e-ticketing digital.
- Dukungan printer jaringan/lans (fokus awal: USB lokal).

## 3. Role & Target Pengguna
| Role | Deskripsi |
|------|-----------|
| **Admin** | Pengelola sistem penuh: konfigurasi printer, manajemen user & loket, unggah/atur video & volume, monitoring antrian, export laporan, dan akses penuh ke audit trail. |
| **Petugas Loket (User Loket)** | Pengguna yang diassign ke loket tertentu. Berhak memanggil, melayani, dan menyelesaikan antrian hanya pada loket yang ditugaskan. |
| **Pengunjung** | Pengguna akhir yang mengambil tiket di kiosk, melihat nomor di display, dan menunggu dipanggil. |
| **Sistem/Backend** | Penyeimbang antrian (FIFO), validator hak akses, pencatat log, dan penjaga state real-time. |

## 4. Fitur Utama (Core Features)
### 4.1 Modul Admin
- **Dashboard Monitoring**: Statistik antrian aktif, rata-rata waktu pelayanan, status loket, dan kesehatan koneksi printer/kiosk.
- **Manajemen User & Loket**: 
  - CRUD akun petugas (username, password, role).
  - Assign/unassign user ke counter spesifik.
  - Validasi bahwa hanya user yang diassign ke loket X yang bisa login dan memanggil di aplikasi loket X.
- **Manajemen Media Display**:
  - Upload video, atur urutan putar, jadwal tayang.
  - **Kontrol Volume**: Slider 0–100% per video/layar. Pengaturan disimpan di DB dan dikirim via WebSocket ke client display.
- **Pengaturan Printer Thermal**:
  - Template tiket dinamis: Header (nama instansi), Footer (pesan/instruksi), Logo, Garis pembatas.
  - Konfigurasi hardware: Tipe kertas (58mm/80mm), jumlah rangkap (single/duplicate), kecepatan cetak, karakter encoding.
  - Status koneksi bridge (online/offline) dan log cetak terakhir.
- **Audit Trail & Logging**: Sistem mencatat secara otomatis setiap perubahan data sensitif yang dilakukan di dashboard admin, meliputi perubahan user, konfigurasi printer, pengaturan video/volume, dan penugasan loket. Setiap log menyimpan pelaku aksi, modul yang diubah, data sebelum & sesudah perubahan, alamat IP, dan waktu kejadian. Fitur ini dapat diakses oleh admin via antarmuka khusus untuk keperluan audit internal, pelacakan kesalahan, dan kepatuhan standar operasional.

### 4.2 Modul Kiosk
- Antarmuka fullscreen responsif dengan minimal interaksi.
- Pemilihan jenis layanan -> Generate nomor antrian otomatis.
- **Integrasi Printer USB**: Kiosk mengirimkan data tiket ke layanan bridge lokal (browser/web runtime) yang menerjemahkannya menjadi perintah ESC/POS dan mengirimkannya via kabel USB. Tanpa dialog print OS.
- Indikator status cetak (Berhasil/Gagal/Printer Offline). Jika gagal, antrian tetap tercatat dan cetak ulang tersedia di admin.

### 4.3 Modul Loket
- Login berbasis username + PIN/password.
- Tampilan antrian berikutnya, tombol **Panggil**, **Selesai**, **Ulang/Skip**.
- Notifikasi audio visual saat antrian masuk atau dipanggil.
- Riwayat pelayanan harian dengan rata-rata waktu per layanan.
- Terikat secara sistem ke counter yang diassign oleh admin. Tidak bisa mengakses nomor loket lain.

### 4.4 Modul Display
- Tampilan utama: Nomor antrian saat ini, Nama loket tujuan, Informasi layanan.
- Pemutar video latar belakang dengan overlay transparan.
- **Sinkronisasi Real-time**: Update nomor & video settings instan saat admin mengubah volume atau petugas memanggil antrian.
- Mode idle/hemat layar saat tidak ada antrian aktif.

### 4.5 Backend & API
- Laravel 11 (PHP 8.2+) dengan RESTful API.
- WebSocket (Laravel Reverb/Pusher) untuk: update antrian, perubahan display, status printer bridge, notifikasi loket.
- Queue Worker: menangani proses cetak, logging, sinkronisasi data yang tertunda, dan pencatatan audit secara asinkron untuk menjaga performa API.

## 5. User Flow (Alur Utama)
1. **Start**: Admin mengonfigurasi printer (header/footer), mengatur video, dan meng-assign petugas ke loket melalui dashboard. Semua perubahan tercatat di audit trail.
2. **Pengambilan Tiket**: Pengunjung ke kiosk -> Pilih layanan -> Sistem generate nomor -> Kirim data ke bridge kiosk -> Bridge print tiket via USB.
3. **Penunggu**: Nomor masuk ke antrian server -> Display update real-time -> Video diputar dengan volume yang diatur admin.
4. **Panggilan**: Petugas loket login -> Klik "Panggil" -> Sistem kirim notifikasi -> Display update nomor & loket -> Audio panggilan berbunyi.
5. **Pelayanan**: Layanan selesai -> Petugas klik "Selesai" -> Antrian berikutnya dipanggil (otomatis/manual tergantung konfigurasi).
6. **Monitoring & Audit**: Admin pantau dashboard, atur volume video, ubah template tiket, dan memeriksa log aktivitas sistem tanpa restart sistem.

## 6. Arsitektur & Tech Stack
| Komponen | Teknologi | Catatan Implementasi |
|----------|-----------|----------------------|
| Frontend | Next.js (React 18+) + TypeScript | SSR/CSR hybrid, Tailwind CSS, React Query |
| Backend | Laravel 11 + MySQL/PostgreSQL | Sanctum/JWT Auth, Eloquent ORM, Laravel Echo |
| Real-time | WebSocket (Laravel Reverb / Socket.io) | Sinkronisasi antrian <1 detik |
| Hardware Bridge | Web Serial API / ESC-POS JS | Jalan di browser kiosk (Chrome/Edge) atau lightweight Electron wrapper |
| Database | MySQL 8 / PostgreSQL 15 | Indexing pada kolom antrian & status, struktur audit teroptimasi |
| Infrastructure | Docker, Nginx, Redis (Cache), SSL | Siap horizontal scaling |

## 7. Database Skema (High-Level)
```sql
-- Users & Auth
users: id, name, email, password, role enum('admin', 'loket', 'super'), is_active, created_at
counters: id, name, code, status enum('active','inactive'), created_at
counters_users: id, counter_id, user_id, assigned_at (pivot untuk assign loket)

-- Queue Management
queues: id, ticket_number, service_type, status enum('waiting','called','serving','completed','skipped'), counter_id, called_at, completed_at, created_at
queue_logs: id, queue_id, action, performed_by, metadata_json, timestamp

-- Display & Media
displays: id, name, location, is_active, settings_json (layout, timeout)
videos: id, file_url, title, duration, volume_level decimal(3,2), is_active, display_id
video_configs: id, display_id, playlist_order, start_time, end_time, volume_override

-- Printer & Kiosk
printer_profiles: id, name, paper_size enum('58mm','80mm'), copy_count, header_text, footer_text, logo_url, template_json
kiosk_stations: id, name, bridge_token, status, last_heartbeat, printer_profile_id

-- Audit & System
audit_logs: id, user_id, action, model, model_id, changes_json, ip_address, created_at
```
*Catatan: Relasi 1-to-many dan many-to-many diterapkan sesuai normalisasi. `volume_level`, `template_json`, dan `audit_logs.changes_json` memungkinkan fleksibilitas konfigurasi dan pelacakan perubahan tanpa perlu deploy ulang atau migrasi skema berulang.*

## 8. Antarmuka & UX (Konsep)
- **Admin Dashboard**: Sidebar navigasi, grid monitoring, form konfigurasi modular (printer, video, user), dan tab/page khusus Audit Trail dengan fitur filter, pencarian, dan export CSV. Warna netral, data visual dengan Chart.js.
- **Kiosk UI**: Fullscreen, tombol besar, feedback haptic/visual saat print, layar error jika USB disconnect, mode kiosk lock.
- **Loket UI**: Minimalis, tombol panggilan dominan, daftar antrian pending, toggle notifikasi suara, profil petugas yang sedang login.
- **Display UI**: Layar terbagi: 70% video, 30% overlay antrian. Font besar, kontras tinggi, animasi transisi halus saat nomor berubah.

## 9. Kebutuhan Teknis & Integrasi Hardware
### 9.1 Komunikasi Printer USB
- Menggunakan **Web Serial API** pada browser modern (Chrome 89+) atau fallback ke **Electron/Local Bridge Service** jika lingkungan IT membatasi akses browser langsung.
- Data tiket dikonversi menjadi array byte **ESC/POS**. Contoh perintah: Header (`\x1B\x40` + teks), Font, Cutting (`\x1D\x56\x00`), dll.
- Kiosk mengirim payload JSON ke bridge -> bridge generate buffer ESC/POS -> kirim via USB serial port.
- Retry mechanism: 3x percobaan cetak, fallback log ke server jika gagal persisten.

### 9.2 Kontrol Volume Video
- Menggunakan HTML5 `<video>` + Web Audio API untuk normalisasi gain.
- Level volume (`0.0` - `1.0`) ditarik dari endpoint `/api/displays/{id}/video-config` dan diupdate real-time via WebSocket channel `display-volume-updates`.
- Audio panggilan tetap terpisah (tidak terpengaruh volume video).

### 9.3 Manajemen User Loket
- Middleware `AssignCounterMiddleware` memvalidasi `counters_users` saat login.
- Petugas hanya bisa memanggil nomor dengan `counter_id = assigned_counter_id`.
- GantiShift/Reassign dilakukan oleh admin tanpa logout paksa (session refresh). Perubahan ini otomatis tercatat di audit trail.

### 9.4 Real-time & Fallback
- WebSocket channel: `queue-updates`, `loket-notif`, `display-sync`.
- Mode Offline: Jika koneksi putus, kiosk & loket cache operasi ke IndexedDB/localStorage, sync otomatis saat online.
- Printer tidak bergantung pada koneksi internet untuk cetak jika data tiket sudah tersedia di bridge.
- Pencatatan audit trail menggunakan queue worker untuk mengurangi beban request langsung pada saat form submit.

## 10. Kebutuhan Non-Fungsional
- **Keamanan**: JWT authentication, CSRF protection, parameterized queries, input sanitization, dan perlindungan terhadap manipulasi langsung endpoint API.
- **Kinerja**: API latency <200ms, concurrent load 500+ antrian, display 60fps, WebSocket heartbeat 5s.
- **Keandalan**: Graceful degradation pada printer disconnect, auto-reconnect WebSocket, graceful shutdown queue worker, dan mekanisme sinkronisasi audit yang tidak mengganggu UX admin.
- **Kompatibilitas**: Chrome/Edge terbaru (Web Serial API), Windows 10/11 & Linux kiosk, Smart TV/Android Box via browser atau lightweight app untuk display.
- **Maintainability**: API versioning (`/api/v1`), struktur folder modular, dokumentasi Swagger/OpenAPI, error logging terpusat (Sentry/Laravel Log).
- **Transparansi & Akuntabilitas**: Penerapan audit trail mewajibkan pencatatan jejak digital untuk setiap aksi administratif yang mengubah konfigurasi sistem atau data master. Fitur ini menjamin transparansi operasional, memudahkan pelacakan tanggung jawab atas perubahan data, mendukung investigasi insiden, serta memenuhi standar kepatuhan internal instansi.

## 11. Milestone & Roadmap
| Fase | Durasi | Deliverables |
|------|--------|--------------|
| 1. Setup & Core API | Minggu 1-2 | Laravel 11 setup, DB schema, Auth/Sanctum, Antrian FIFO API, WebSocket, Audit Trail Middleware/Queue |
| 2. Admin & Loket App | Minggu 3-4 | Dashboard admin, CRUD user/counter, assign logic, UI loket, logging, halaman audit history |
| 3. Kiosk & Printer Bridge | Minggu 5-6 | UI kiosk, Web Serial/ESC-POS integration, template engine tiket, error handling, retry mechanism |
| 4. Display & Media Sync | Minggu 7-8 | UI display, video player, volume control via WebSocket, real-time overlay, idle mode |
| 5. Testing & Deployment | Minggu 9-10 | UAT, load testing, deployment VPS, training admin, verifikasi audit trail, dokumen teknis |

## 12. Glossary
- **ESC/POS**: Standar bahasa perintah untuk printer thermal Epson-kompatibel.
- **Web Serial API**: Interface browser yang mengizinkan komunikasi serial/USB langsung dari halaman web.
- **Bridge (Kiosk)**: Layanan lokal yang menjembatani aplikasi web server dengan perangkat keras USB.
- **RBAC**: Role-Based Access Control, model keamanan berbasis peran pengguna.
- **WebSocket Channel**: Saluran komunikasi dua arah real-time antara server dan klien.
- **FIFO**: First In, First Out, mekanisme pengurutan antrian default.
- **Audit Trail**: Sistem pencatatan jejak aktivitas pengguna yang mencatat siapa, apa, kapan, di mana, dan bagaimana perubahan data dilakukan.

## 13. Persetujuan & Tambahan
Dokumen ini menjadi panduan pengembangan utama. Perubahan signifikan pada scope, arsitektur hardware, atau regulasi keamanan wajib didiskusikan dan disetujui sebelum implementasi. Versi PRD: `v1.1 - Final Draft`.