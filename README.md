# Portal Pantau Bencana dan Mitigasi BMKG

Dashboard monitoring tanggap darurat dan peringatan dini bencana real-time berbasis web. Aplikasi ini mengintegrasikan feed data seismik resmi dari BMKG InaTEWS, prakiraan atmosfer serta kualitas udara dari Open-Meteo, serta sistem pencatatan kerusakan fasilitas darurat berbasis lokal.

Antarmuka dirancang dengan pendekatan modular, bertema gelap pekat (terminal-style dark mode), berorientasi tipografi monospace, dan responsif dari layar smartphone hingga monitor desktop.

---

## Fitur Utama

* **Pemantauan Seismik BMKG InaTEWS:** Menyajikan data gempa bumi terkini (magnitudo, kedalaman, koordinat, waktu, dan potensi tsunami) serta riwayat 10 gempa terakhir melalui modal interaktif.
* **Prakiraan Cuaca Per Jam:** Sinkronisasi model atmosfer Open-Meteo untuk menampilkan temperatur, kelembapan, kecepatan angin, tutupan awan, jarak pandang, dan indeks radiasi UV.
* **Sensor Polusi Udara (PM2.5):** Memantau konsentrasi partikulat halus dengan klasifikasi status otomatis (Baik, Sedang, Tidak Sehat).
* **Geolokasi Dinamis:** Penentuan lokasi otomatis via W3C Geolocation API peramban serta fitur pencarian nama kota di seluruh wilayah Indonesia via Open-Meteo Geocoding.
* **Peringatan Dini Sistem (Push Notifications):** Notifikasi desktop dan seluler berbasis Web Notifications API saat sistem mendeteksi gempa bumi baru dari server BMKG.
* **Mitigasi Fasilitas Vital (CRUD):** Pencatatan inventaris fasilitas yang rusak, padam, atau hilang di zona bencana dengan status prioritas (Kritis, Tinggi, Normal). Data tersimpan permanen di localStorage peramban.
* **Ekspor Laporan WhatsApp:** Mengonversi daftar fasilitas darurat menjadi pesan teks terstruktur (plain text) yang siap dikirim langsung via protokol tautan WhatsApp.
* **Toleransi Jaringan dan CORS Fallback:** Implementasi mekanisme multi-proxy untuk menjamin kelancaran penarikan data publik BMKG tanpa hambatan kebijakan lintas domain.

---

## Arsitektur dan Sumber Data

| Komponen | Sumber / Protokol | Siklus Pembaruan |
| :--- | :--- | :--- |
| **Data Gempa Bumi** | BMKG InaTEWS (`data.bmkg.go.id`) | Polling otomatis per 2 menit |
| **Prakiraan Atmosfer** | Open-Meteo Forecast API | Polling otomatis per 15 menit |
| **Kualitas Udara (PM2.5)** | Open-Meteo Air Quality API | Polling otomatis per 15 menit |
| **Pencarian Wilayah** | Open-Meteo Geocoding API | Berbasis masukan pengguna (on-demand) |
| **Geolokasi Pengguna** | W3C Geolocation API | Berbasis izin akses perangkat |
| **Penyimpanan Lokal** | Web Storage API (`localStorage`) | Sinkronisasi instan pada sesi peramban |

---

## Struktur Berkas

```text
bmkg-disaster-hub/
├── index.html        # Struktur semantik markup antarmuka dan modal dialog
├── style.css         # Desain sistem responsif, token CSS variabel, dan layout grid
├── script.js         # Logika fetch API, polling, state management, dan CRUD
└── README.md         # Dokumentasi teknis proyek
```

---

## Cara Menjalankan Proyek

Proyek ini dibuat menggunakan standar Vanilla Web (HTML5, CSS3 murni, dan Modern JavaScript ES6+) tanpa ketergantungan pada framework atau pustaka eksternal.

### 1. Kloning Repositori
```bash
git clone [https://github.com/username/bmkg-disaster-hub.git](https://github.com/username/bmkg-disaster-hub.git)
cd bmkg-disaster-hub
```

### 2. Menjalankan via Local Server
Jalankan proyek melalui lingkungan server lokal agar fitur peramban modern (seperti Geolocation dan Push Notifications) berjalan optimal tanpa pembatasan protokol `file://`:

**Menggunakan Python:**
```bash
python3 -m http.server 8000
```

**Menggunakan Node.js:**
```bash
npx serve .
```

Akses aplikasi pada peramban melalui alamat `http://localhost:8000`.

---

## Konfigurasi Polling dan Jaringan

### 1. Interval Pembaruan Otomatis
Pengaturan timer polling diatur pada bagian bawah berkas `script.js`:

* **Gempa Bumi:** Dijalankan berkala setiap 120.000 ms (2 menit).
* **Kondisi Atmosfer & Kualitas Udara:** Dijalankan berkala setiap 900.000 ms (15 menit).

### 2. Penanganan Proxy CORS
Daftar server proksi pihak ketiga untuk bypass CORS data BMKG dapat disesuaikan pada fungsi `fetchJsonSafe()` di `script.js`:

```javascript
const proxies = [
    `[https://api.allorigins.win/raw?url=$](https://api.allorigins.win/raw?url=$){encodeURIComponent(targetUrl)}`,
    `[https://corsproxy.io/?$](https://corsproxy.io/?$){encodeURIComponent(targetUrl)}`
];
```

---

## Atribusi dan Lisensi

* Seluruh basis kode dirilis secara terbuka di bawah ketentuan lisensi **MIT License**.
* Data seismik bersumber dari portal terbuka **BMKG InaTEWS**.
* Data meteorologi serta geocoding disediakan oleh **Open-Meteo** (lisensi CC BY 4.0).

---

## Referensi Sumber Data dan Jurnal

1. Badan Meteorologi, Klimatologi, dan Geofisika (BMKG) Regulasi Layanan Informasi Terbuka: https://data.bmkg.go.id/
2. Open-Meteo Weather APIs Open Data License (CC BY 4.0): https://open-meteo.com/en/terms
3. World Wide Web Consortium (W3C) Web Application Manifest and Storage Guidelines: https://www.w3.org/TR/appmanifest/
