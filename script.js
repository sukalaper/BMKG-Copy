let activeLat = null;
let activeLon = null;
let activePlaceName = "MEMUAT LOKASI...";

let rawQuakes = [];
let rawHourlyWeather = [];
let editTaskId = null;
let isSearching = false;

let tasks = [];
try {
    const stored = localStorage.getItem('bmkg_facilities_list');
    tasks = stored ? JSON.parse(stored) : [];
} catch (e) {
    tasks = [];
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function updateStatusSync(msg) {
    const el = document.getElementById('sys-sync-tag');
    if (el) el.textContent = msg;
}

function getLocalIsoHour() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}`;
}

async function fetchJsonSafe(targetUrl) {
    try {
        const direct = await fetch(targetUrl);
        if (direct.ok) return await direct.json();
    } catch (e) { }

    const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const proxy of proxies) {
        try {
            const res = await fetch(proxy);
            if (res.ok) return await res.json();
        } catch (err) { }
    }
    throw new Error(`Semua jalur proxy gagal untuk URL: ${targetUrl}`);
}

async function detectCurrentGeoLocation() {
    if (!navigator.geolocation) {
        updateStatusSync("Geolokasi tidak didukung peramban.");
        return;
    }
    document.getElementById('current-loc-name').textContent = "MENDETEKSI GPS...";
    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            activeLat = pos.coords.latitude;
            activeLon = pos.coords.longitude;
            await reverseGeocode(activeLat, activeLon);
            refreshAllFeeds();
        },
        (err) => {
            updateStatusSync("Akses GPS ditolak/timeout. Menggunakan wilayah default.");
            if (!activeLat) {
                activeLat = -6.2146;
                activeLon = 106.8451;
                activePlaceName = "DKI JAKARTA (DEFAULT)";
            }
            refreshAllFeeds();
        },
        { timeout: 8000, enableHighAccuracy: false }
    );
}

async function searchLocationByName() {
    if (isSearching) return;
    const inputEl = document.getElementById('loc-search-input');
    const q = inputEl.value.trim();
    if (!q) return;

    isSearching = true;
    updateStatusSync("Mencari koordinat wilayah...");
    document.getElementById('current-loc-name').textContent = "MENCARI LOKASI...";

    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=id&format=json`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Gagal mengakses server geocoding");
        const data = await res.json();

        if (data.results && data.results.length > 0) {
            const matchId = data.results.find(r => r.country_code === 'ID') || data.results[0];
            activeLat = matchId.latitude;
            activeLon = matchId.longitude;

            const adminPart = matchId.admin1 ? `, ${matchId.admin1}` : '';
            activePlaceName = `${matchId.name}${adminPart}`.toUpperCase();

            refreshAllFeeds();
        } else {
            alert("Lokasi tidak ditemukan. Coba ketik nama kota utama.");
            document.getElementById('current-loc-name').textContent = activePlaceName;
        }
    } catch (err) {
        alert("Gagal melakukan pencarian wilayah. Periksa koneksi data.");
        document.getElementById('current-loc-name').textContent = activePlaceName;
    } finally {
        isSearching = false;
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm2_5&timezone=Asia%2FJakarta`;
        const res = await fetch(url);
        if (res.ok) {
            activePlaceName = `KOORDINAT (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
        }
    } catch (err) {
        activePlaceName = `KOORDINAT (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
    }
}

async function loadWeatherData() {
    if (!activeLat || !activeLon) return;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeLat}&longitude=${activeLon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,surface_pressure,cloud_cover&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,uv_index,visibility&timezone=Asia%2FJakarta`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Koneksi Open-Meteo gagal");
        const data = await res.json();

        document.getElementById('current-loc-name').textContent = activePlaceName;
        document.getElementById('current-temp').textContent = `${Math.round(data.current.temperature_2m)}°C`;
        document.getElementById('hero-humidity').textContent = `Kelembapan: ${data.current.relative_humidity_2m}%`;
        document.getElementById('hero-wind').textContent = `Angin: ${data.current.wind_speed_10m} km/j`;
        document.getElementById('hero-coords').textContent = `Koordinat: ${activeLat.toFixed(2)}, ${activeLon.toFixed(2)}`;

        const weatherDescriptions = {
            0: 'Cerah', 1: 'Sebagian Besar Cerah', 2: 'Cerah Berawan', 3: 'Berawan Tebal',
            45: 'Berkabut', 48: 'Kabut Tebal', 51: 'Gerimis Ringan', 53: 'Gerimis Sedang',
            55: 'Gerimis Lebat', 61: 'Hujan Ringan', 63: 'Hujan Sedang', 65: 'Hujan Lebat',
            80: 'Hujan Mendadak', 95: 'Badai Petir'
        };
        document.getElementById('current-weather-desc').textContent = weatherDescriptions[data.current.weather_code] || 'Berawan';

        const slider = document.getElementById('weather-slider');
        slider.innerHTML = '';
        rawHourlyWeather = [];

        const hourly = data.hourly;
        const currentTargetHour = getLocalIsoHour();
        let startIdx = hourly.time.findIndex(t => t.startsWith(currentTargetHour));
        if (startIdx === -1) startIdx = 0;

        const currentUv = hourly.uv_index ? hourly.uv_index[startIdx] : 0;
        const currentVis = hourly.visibility ? (hourly.visibility[startIdx] / 1000).toFixed(1) : '--';
        const currentPres = data.current.surface_pressure ? Math.round(data.current.surface_pressure) : '--';
        const currentCloud = data.current.cloud_cover !== undefined ? data.current.cloud_cover : '--';

        document.getElementById('uv-val').textContent = currentUv !== undefined ? currentUv : '--';
        let uvText = "Rendah";
        if (currentUv >= 3 && currentUv < 6) uvText = "Sedang";
        else if (currentUv >= 6 && currentUv < 8) uvText = "Tinggi";
        else if (currentUv >= 8) uvText = "Sangat Tinggi";
        document.getElementById('uv-desc').textContent = `Tingkat: ${uvText}`;

        document.getElementById('vis-val').textContent = `${currentVis} km`;
        document.getElementById('pres-val').textContent = `${currentPres} hPa`;
        document.getElementById('cloud-val').textContent = `${currentCloud}%`;

        for (let i = startIdx; i < Math.min(startIdx + 12, hourly.time.length); i++) {
            const tIso = hourly.time[i];
            const hourLabel = tIso.split('T')[1];
            const tempVal = Math.round(hourly.temperature_2m[i]);
            const code = hourly.weather_code[i];
            const hum = hourly.relative_humidity_2m[i];
            const wSpeed = hourly.wind_speed_10m[i];
            const desc = weatherDescriptions[code] || 'Berawan';

            rawHourlyWeather.push({ hour: hourLabel, temp: `${tempVal}°C`, desc: desc, hum: `${hum}%`, wind: `${wSpeed} km/j` });

            const chip = document.createElement('div');
            chip.className = 'forecast-chip';
            chip.innerHTML = `
                <div style="color: var(--text-sub); font-size: 0.75rem;">${escapeHtml(hourLabel)}</div>
                <div style="font-size: 1.1rem; font-weight: 800;">${tempVal}°C</div>
                <div style="font-size: 0.7rem;">${escapeHtml(desc)}</div>
            `;
            slider.appendChild(chip);
        }
    } catch (err) {
        document.getElementById('current-weather-desc').textContent = 'Prakiraan cuaca offline';
    }
}

async function loadAirQuality() {
    if (!activeLat || !activeLon) return;
    try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${activeLat}&longitude=${activeLon}&current=pm2_5&timezone=Asia%2FJakarta`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Gagal mengambil sensor PM2.5");
        const data = await res.json();
        const aqiVal = Math.round(data.current.pm2_5);

        document.getElementById('hero-aqi').textContent = `${aqiVal} µg/m³`;
        const badge = document.getElementById('hero-aqi-label');

        if (aqiVal <= 15) {
            badge.textContent = "Kualitas Baik";
            badge.className = "badge badge-good";
        } else if (aqiVal <= 55) {
            badge.textContent = "Kualitas Sedang";
            badge.className = "badge badge-warn";
        } else {
            badge.textContent = "Tidak Sehat (PM2.5)";
            badge.className = "badge badge-danger";
        }
    } catch (err) {
        document.getElementById('hero-aqi').textContent = "--";
        document.getElementById('hero-aqi-label').textContent = "Offline";
    }
}

async function loadQuakes() {
    try {
        const json = await fetchJsonSafe('https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json');
        const list = (json.Infogempa && json.Infogempa.gempa) ? json.Infogempa.gempa : [];
        rawQuakes = list;

        if (list.length > 0) {
            const latest = list[0];
            document.getElementById('qk-mag').textContent = `${latest.Magnitude} SR`;
            document.getElementById('qk-potensi').textContent = latest.Potensi;
            document.getElementById('qk-time').textContent = `${latest.Tanggal} ${latest.Jam}`;
            document.getElementById('qk-loc').textContent = latest.Wilayah;
            document.getElementById('qk-depth').textContent = latest.Kedalaman;
        } else {
            throw new Error("Payload gempa kosong");
        }
    } catch (err) {
        document.getElementById('qk-loc').textContent = 'Server TEWS BMKG tidak terjangkau.';
        document.getElementById('qk-mag').textContent = '--';
        document.getElementById('qk-potensi').textContent = 'Status Tak Tentu';
    }
}

function renderTasks() {
    const container = document.getElementById('task-container');
    const counter = document.getElementById('task-counter');
    container.innerHTML = '';
    counter.textContent = `${tasks.length} Catatan Fasilitas Terdaftar`;

    if (tasks.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'padding: 1rem; text-align: center; color: var(--text-sub); font-size: 0.85rem;';
        emptyLi.textContent = 'Tidak ada laporan kerusakan. Fasilitas beroperasi normal.';
        container.appendChild(emptyLi);
        return;
    }

    tasks.forEach(t => {
        const li = document.createElement('li');
        li.className = `todo-item ${t.done ? 'done' : ''}`;

        let prioBadge = 'badge-good';
        if (t.prio === 'CRITICAL') prioBadge = 'badge-danger';
        if (t.prio === 'HIGH') prioBadge = 'badge-warn';

        const contentDiv = document.createElement('div');
        contentDiv.style.flex = '1';

        const textDiv = document.createElement('div');
        textDiv.className = 'todo-text';
        textDiv.style.cssText = 'font-weight: 700; font-size: 0.85rem;';
        textDiv.textContent = t.text;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'todo-meta';
        metaDiv.innerHTML = `
            <span class="badge ${prioBadge}">${escapeHtml(t.prio)}</span>
            <span>Dicatat: ${escapeHtml(t.time)}</span>
        `;

        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(metaDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.style.display = 'flex';
        actionsDiv.style.gap = '0.35rem';

        const btnToggle = document.createElement('button');
        btnToggle.className = 'btn';
        btnToggle.style.cssText = 'padding: 0.35rem 0.65rem;';
        btnToggle.textContent = t.done ? 'Aktifkan' : 'Selesai';
        btnToggle.onclick = () => toggleTask(t.id);

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn';
        btnEdit.style.cssText = 'padding: 0.35rem 0.65rem;';
        btnEdit.textContent = 'Edit';
        btnEdit.onclick = () => editTask(t.id);

        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn btn-danger';
        btnDelete.style.cssText = 'padding: 0.35rem 0.65rem;';
        btnDelete.textContent = 'Hapus';
        btnDelete.onclick = () => deleteTask(t.id);

        actionsDiv.appendChild(btnToggle);
        actionsDiv.appendChild(btnEdit);
        actionsDiv.appendChild(btnDelete);

        li.appendChild(contentDiv);
        li.appendChild(actionsDiv);
        container.appendChild(li);
    });
}

function handleTaskSubmit() {
    const input = document.getElementById('task-text');
    const prio = document.getElementById('task-prio').value;
    const text = input.value.trim();

    if (!text) return;

    const now = new Date();
    const timeStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (editTaskId) {
        const item = tasks.find(t => t.id === editTaskId);
        if (item) {
            item.text = text;
            item.prio = prio;
            item.time = `${timeStr} (Diperbarui)`;
        }
        editTaskId = null;
        document.getElementById('btn-task-submit').textContent = 'Tambah Fasilitas';
    } else {
        tasks.unshift({
            id: Date.now().toString(),
            text: text,
            prio: prio,
            done: false,
            time: timeStr
        });
    }

    input.value = '';
    localStorage.setItem('bmkg_facilities_list', JSON.stringify(tasks));
    renderTasks();
}

function toggleTask(id) {
    tasks = tasks.map(t => t.id === id ? { ...t, done: !t.done } : t);
    localStorage.setItem('bmkg_facilities_list', JSON.stringify(tasks));
    renderTasks();
}

function editTask(id) {
    const item = tasks.find(t => t.id === id);
    if (!item) return;
    document.getElementById('task-text').value = item.text;
    document.getElementById('task-prio').value = item.prio;
    editTaskId = id;
    document.getElementById('btn-task-submit').textContent = 'Simpan';
    document.getElementById('task-text').focus();
}

function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    if (editTaskId === id) {
        editTaskId = null;
        document.getElementById('btn-task-submit').textContent = 'Tambah Fasilitas';
        document.getElementById('task-text').value = '';
    }
    localStorage.setItem('bmkg_facilities_list', JSON.stringify(tasks));
    renderTasks();
}

function openQuakeModal() {
    document.getElementById('modal-title').textContent = '10 Riwayat Gempa Bumi BMKG Terakhir';
    const content = document.getElementById('modal-content');
    content.innerHTML = '';

    const top10 = rawQuakes.slice(0, 10);
    if (top10.length === 0) {
        content.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-sub);">Data InaTEWS BMKG tidak tersedia.</div>';
    } else {
        top10.forEach((q, idx) => {
            const item = document.createElement('div');
            item.style.cssText = 'border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem; background: var(--bg-canvas);';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:900; color:var(--danger); font-size:0.95rem;">#${idx + 1} Magnitude ${escapeHtml(q.Magnitude)} SR</span>
                    <span style="font-size:0.75rem; color:var(--text-sub);">${escapeHtml(q.Tanggal)} ${escapeHtml(q.Jam)}</span>
                </div>
                <div style="font-weight:700; margin: 0.25rem 0; font-size: 0.85rem;">${escapeHtml(q.Wilayah)}</div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-sub);">
                    <span>Kedalaman: ${escapeHtml(q.Kedalaman)}</span>
                    <span>Koordinat: ${escapeHtml(q.Coordinates)}</span>
                </div>
                <div style="font-size:0.75rem; color:var(--warning); font-weight:700; margin-top: 0.2rem;">${escapeHtml(q.Potensi)}</div>
            `;
            content.appendChild(item);
        });
    }

    document.getElementById('modal-box').classList.add('open');
}

function openWeatherModal() {
    document.getElementById('modal-title').textContent = `10 Periode Prakiraan Cuaca Mendatang (${activePlaceName})`;
    const content = document.getElementById('modal-content');
    content.innerHTML = '';

    const top10 = rawHourlyWeather.slice(0, 10);
    if (top10.length === 0) {
        content.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-sub);">Data prakiraan cuaca tidak tersedia.</div>';
    } else {
        top10.forEach(w => {
            const item = document.createElement('div');
            item.style.cssText = 'border: 1px solid var(--border); border-radius: 10px; padding: 0.75rem; background: var(--bg-canvas);';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:800; color:var(--primary);">${escapeHtml(w.hour)} WIB</span>
                    <span style="font-weight:900; font-size:1rem;">${escapeHtml(w.temp)}</span>
                </div>
                <div style="font-weight:700; font-size:0.85rem; margin:0.2rem 0;">${escapeHtml(w.desc)}</div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-sub);">
                    <span>Kelembapan: ${escapeHtml(w.hum)}</span>
                    <span>Angin: ${escapeHtml(w.wind)}</span>
                </div>
            `;
            content.appendChild(item);
        });
    }

    document.getElementById('modal-box').classList.add('open');
}

function closeModal() {
    document.getElementById('modal-box').classList.remove('open');
}

function refreshAllFeeds() {
    const now = new Date();
    updateStatusSync(`Sinkronisasi Data: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`);
    loadWeatherData();
    loadAirQuality();
    loadQuakes();
}

document.getElementById('loc-search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchLocationByName();
});

window.addEventListener('DOMContentLoaded', () => {
    detectCurrentGeoLocation();
    renderTasks();
});