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
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`
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
    if (!inputEl) return;
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

function setSliderPlaceholder() {
    const slider = document.getElementById('weather-slider');
    if (!slider || slider.children.length > 0) return;
    slider.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        const skeleton = document.createElement('div');
        skeleton.className = 'forecast-chip';
        skeleton.style.opacity = '0.35';
        skeleton.innerHTML = `
            <div style="font-size:0.7rem; color:var(--text-sub);">--:--</div>
            <div style="font-size:1rem; font-weight:800;">--°C</div>
            <div style="font-size:0.65rem;">--</div>
        `;
        slider.appendChild(skeleton);
    }
}

async function loadWeatherData() {
    if (!activeLat || !activeLon) return;
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeLat}&longitude=${activeLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,weather_code,wind_speed_10m,surface_pressure,cloud_cover&hourly=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,uv_index,visibility&timezone=Asia%2FJakarta`;
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

        const feelsLike = data.current.apparent_temperature !== undefined ? Math.round(data.current.apparent_temperature) : Math.round(data.current.temperature_2m);
        const dewPoint = data.current.dew_point_2m !== undefined ? Math.round(data.current.dew_point_2m) : '--';

        document.getElementById('feels-like-val').textContent = `${feelsLike}°C`;
        document.getElementById('dew-point-val').textContent = typeof dewPoint === 'number' ? `${dewPoint}°C` : dewPoint;

        const envStatus = document.getElementById('env-status-val');
        if (feelsLike >= 35) {
            envStatus.textContent = 'Sangat Terik';
            envStatus.style.color = 'var(--danger)';
        } else if (feelsLike >= 30) {
            envStatus.textContent = 'Cukup Panas';
            envStatus.style.color = 'var(--warning)';
        } else {
            envStatus.textContent = 'Normal Nyaman';
            envStatus.style.color = 'var(--success)';
        }

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
                <div style="color: var(--text-sub); font-size: 0.7rem;">${escapeHtml(hourLabel)}</div>
                <div style="font-size: 1.05rem; font-weight: 800;">${tempVal}°C</div>
                <div style="font-size: 0.65rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(desc)}</div>
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

        document.getElementById('hero-aqi').textContent = aqiVal;
        const badge = document.getElementById('hero-aqi-label');

        if (aqiVal <= 15) {
            badge.textContent = "Baik";
            badge.className = "badge badge-good";
        } else if (aqiVal <= 55) {
            badge.textContent = "Sedang";
            badge.className = "badge badge-warn";
        } else {
            badge.textContent = "Tidak Sehat";
            badge.className = "badge badge-danger";
        }
    } catch (err) {
        document.getElementById('hero-aqi').textContent = "--";
        document.getElementById('hero-aqi-label').textContent = "Offline";
    }
}

let lastNotifiedQuakeId = null;
let isNotificationPermitted = false;

async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("Peramban lo belum mendukung Web Notifications API.");
        return;
    }

    if (Notification.permission === "granted") {
        isNotificationPermitted = true;
        updateNotifButtonState(true);
        triggerNativeNotification("Notifikasi Aktif", "Lo bakal dapet sinyal instan saat ada update gempa baru.");
        return;
    }

    if (Notification.permission !== "denied") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
            isNotificationPermitted = true;
            updateNotifButtonState(true);
            triggerNativeNotification("Notifikasi Berhasil Diaktifkan", "Pemantauan bencana berjalan di latar belakang.");
        } else {
            updateNotifButtonState(false);
        }
    }
}

function updateNotifButtonState(active) {
    const btn = document.getElementById('btn-notif-toggle');
    if (!btn) return;
    if (active) {
        btn.classList.add('notif-active');
        btn.title = "Notifikasi Bencana Aktif";
    } else {
        btn.classList.remove('notif-active');
        btn.title = "Aktifkan Notifikasi Bencana";
    }
}

let notificationLogs = [];

async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        alert("Peramban lo belum mendukung Web Notifications API.");
        return;
    }

    if (Notification.permission === "granted") {
        openNotificationLogsModal();
        return;
    }

    if (Notification.permission === "denied") {
        alert("Izin notifikasi diblokir di peramban lo. Aktifkan manual lewat pengaturan situs di peramban ya.");
        return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
        isNotificationPermitted = true;
        updateNotifButtonState(true);

        const initialMsg = "Sistem pemantauan aktif. Peringatan dini bencana akan muncul di sini secara instan.";
        triggerNativeNotification("Notifikasi Bencana Aktif", initialMsg);

        notificationLogs.unshift({
            title: "Sistem Peringatan Diaktifkan",
            desc: initialMsg,
            time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + " WIB",
            isAlert: false
        });
    } else {
        updateNotifButtonState(false);
    }
}

function triggerNativeNotification(title, bodyText, isEmergency = false) {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} WIB`;

    notificationLogs.unshift({
        title: title,
        desc: bodyText,
        time: timeStr,
        isAlert: isEmergency
    });

    if (notificationLogs.length > 10) notificationLogs.pop();

    if (Notification.permission === "granted") {
        try {
            new Notification(title, {
                body: bodyText,
                icon: 'https://bmkg.go.id/asset/img/logo-bmkg.png',
                tag: 'bmkg-disaster-alert',
                renotify: true
            });
        } catch (e) {
            console.warn("Gagal menampilkan pop-up native:", e);
        }
    }
}

function openNotificationLogsModal() {
    document.getElementById('modal-title').textContent = 'Pusat Log Notifikasi Sistem';
    const content = document.getElementById('modal-content');
    content.innerHTML = '';

    if (notificationLogs.length === 0) {
        content.innerHTML = `
            <div style="text-align: center; padding: 2rem 1rem; color: var(--text-sub);">
                <div style="font-size: 1.5rem; margin-bottom: 0.5rem; opacity: 0.6;">🔔</div>
                <div style="font-weight: 700; font-size: 0.9rem; color: var(--text-main);">Belum Ada Pemberitahuan Terbaru</div>
                <div style="font-size: 0.75rem; margin-top: 0.35rem;">Sistem sedang bersiaga memantau sensor BMKG secara real-time.</div>
            </div>
        `;
    } else {
        notificationLogs.forEach(item => {
            const card = document.createElement('div');
            card.className = 'modal-item-card';
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.25rem;">
                    <span style="font-weight:800; font-size: 0.85rem; color: ${item.isAlert ? 'var(--danger)' : 'var(--primary)'};">
                        ${escapeHtml(item.title)}
                    </span>
                    <span style="font-size:0.7rem; color:var(--text-sub);">${escapeHtml(item.time)}</span>
                </div>
                <div style="font-size:0.78rem; color:var(--text-main); line-height: 1.4;">${escapeHtml(item.desc)}</div>
            `;
            content.appendChild(card);
        });
    }

    document.getElementById('modal-box').classList.add('open');
}

async function loadQuakes() {
    const timestamp = Date.now();
    try {
        const autoJson = await fetchJsonSafe(`https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json?_=${timestamp}`);

        if (autoJson && autoJson.Infogempa && autoJson.Infogempa.gempa) {
            const latest = autoJson.Infogempa.gempa;
            const currentQuakeId = `${latest.Tanggal}_${latest.Jam}_${latest.Coordinates}`;

            if (lastNotifiedQuakeId && lastNotifiedQuakeId !== currentQuakeId) {
                triggerNativeNotification(
                    `PERINGATAN GEMPA M ${latest.Magnitude} SR`,
                    `${latest.Wilayah} | Kedalaman: ${latest.Kedalaman} | ${latest.Potensi}`,
                    true
                );
            }
            lastNotifiedQuakeId = currentQuakeId;

            document.getElementById('qk-mag').textContent = `${latest.Magnitude} SR`;
            document.getElementById('qk-potensi').textContent = latest.Potensi;
            document.getElementById('qk-time').textContent = `${latest.Tanggal} ${latest.Jam}`;
            document.getElementById('qk-loc').textContent = latest.Wilayah;
            document.getElementById('qk-depth').textContent = latest.Kedalaman;

            const shakeImg = document.getElementById('shakemap-img');
            if (shakeImg && latest.Shakemap) {
                shakeImg.src = `https://data.bmkg.go.id/DataMKG/TEWS/${latest.Shakemap}?_=${timestamp}`;
            }
        }

        const listJson = await fetchJsonSafe(`https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json?_=${timestamp}`);
        if (listJson && listJson.Infogempa && listJson.Infogempa.gempa) {
            rawQuakes = listJson.Infogempa.gempa;
        }
    } catch (err) {
        try {
            const fallbackJson = await fetchJsonSafe(`https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json?_=${timestamp}`);
            if (fallbackJson && fallbackJson.Infogempa && fallbackJson.Infogempa.gempa) {
                rawQuakes = fallbackJson.Infogempa.gempa;
                const latest = rawQuakes[0];
                document.getElementById('qk-mag').textContent = `${latest.Magnitude} SR`;
                document.getElementById('qk-potensi').textContent = latest.Potensi;
                document.getElementById('qk-time').textContent = `${latest.Tanggal} ${latest.Jam}`;
                document.getElementById('qk-loc').textContent = latest.Wilayah;
                document.getElementById('qk-depth').textContent = latest.Kedalaman;
            }
        } catch (e) {
            document.getElementById('qk-loc').textContent = 'Server TEWS BMKG sedang sinkronisasi.';
        }
    }
}

function handleBackdropClick(e) {
    if (e.target.id === 'modal-box') {
        closeModal();
    }
}

function renderTasks() {
    const container = document.getElementById('task-container');
    const counter = document.getElementById('task-counter');
    container.innerHTML = '';
    counter.textContent = `${tasks.length} Catatan`;

    if (tasks.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.style.cssText = 'padding: 1rem; text-align: center; color: var(--text-sub); font-size: 0.85rem;';
        emptyLi.textContent = 'Tidak ada catatan fasilitas darurat.';
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
        textDiv.textContent = t.text;

        const metaDiv = document.createElement('div');
        metaDiv.className = 'todo-meta';
        metaDiv.innerHTML = `
            <span class="badge ${prioBadge}">${escapeHtml(t.prio)}</span>
            <span>${escapeHtml(t.time)}</span>
        `;

        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(metaDiv);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'todo-actions';

        const btnToggle = document.createElement('button');
        btnToggle.className = 'btn btn-sm';
        btnToggle.textContent = t.done ? 'Aktif' : 'Selesai';
        btnToggle.onclick = () => toggleTask(t.id);

        const btnEdit = document.createElement('button');
        btnEdit.className = 'btn btn-sm';
        btnEdit.textContent = 'Edit';
        btnEdit.onclick = () => editTask(t.id);

        const btnDelete = document.createElement('button');
        btnDelete.className = 'btn btn-sm btn-danger';
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

    if (editTaskId !== null) {
        const cleanEditId = String(editTaskId);
        const targetIndex = tasks.findIndex(t => String(t.id) === cleanEditId);
        if (targetIndex !== -1) {
            tasks[targetIndex].text = text;
            tasks[targetIndex].prio = prio;
            tasks[targetIndex].time = `${timeStr} (Diperbarui)`;
        }
        editTaskId = null;
        document.getElementById('btn-task-submit').textContent = 'Tambah';
    } else {
        const newTask = {
            id: String(Date.now()),
            text: text,
            prio: prio,
            done: false,
            time: timeStr
        };
        tasks.unshift(newTask);
    }

    input.value = '';
    localStorage.setItem('bmkg_facilities_list', JSON.stringify(tasks));
    renderTasks();
}

function deleteTask(targetId) {
    const cleanId = String(targetId);
    tasks = tasks.filter(t => String(t.id) !== cleanId);

    if (editTaskId !== null && String(editTaskId) === cleanId) {
        editTaskId = null;
        document.getElementById('btn-task-submit').textContent = 'Tambah';
        document.getElementById('task-text').value = '';
    }

    localStorage.setItem('bmkg_facilities_list', JSON.stringify(tasks));
    renderTasks();
}

function toggleTask(targetId) {
    const cleanId = String(targetId);
    tasks = tasks.map(t => {
        if (String(t.id) === cleanId) {
            return { ...t, done: !t.done };
        }
        return t;
    });

    localStorage.setItem('bmkg_facilities_list', JSON.stringify(tasks));
    renderTasks();
}

function editTask(targetId) {
    const cleanId = String(targetId);
    const item = tasks.find(t => String(t.id) === cleanId);
    if (!item) return;
    document.getElementById('task-text').value = item.text;
    document.getElementById('task-prio').value = item.prio;
    editTaskId = cleanId;
    document.getElementById('btn-task-submit').textContent = 'Simpan';
    document.getElementById('task-text').focus();
}

function openQuakeModal() {
    document.getElementById('modal-title').textContent = '10 Gempa Terakhir (BMKG M 5.0+)';
    const content = document.getElementById('modal-content');
    content.innerHTML = '';

    const top10 = rawQuakes.slice(0, 10);
    if (top10.length === 0) {
        content.innerHTML = '<div style="font-size:0.85rem; color:var(--text-sub); padding:1rem; text-align:center;">Data BMKG tidak tersedia.</div>';
    } else {
        top10.forEach((q, idx) => {
            const item = document.createElement('div');
            item.className = 'modal-item-card';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:900; color:var(--danger); font-size:1rem;">#${idx + 1} M ${escapeHtml(q.Magnitude)} SR</span>
                    <span style="font-size:0.75rem; color:var(--text-sub);">${escapeHtml(q.Tanggal)} ${escapeHtml(q.Jam)}</span>
                </div>
                <div style="font-weight:700; font-size:0.85rem;">${escapeHtml(q.Wilayah)}</div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-sub); margin-top:0.25rem;">
                    <span>Kedalaman: ${escapeHtml(q.Kedalaman)}</span>
                    <span>Koordinat: ${escapeHtml(q.Coordinates)}</span>
                </div>
                <div style="font-size:0.75rem; color:var(--warning); font-weight:700; margin-top:0.25rem;">${escapeHtml(q.Potensi)}</div>
            `;
            content.appendChild(item);
        });
    }

    document.getElementById('modal-box').classList.add('open');
}

function openWeatherModal() {
    document.getElementById('modal-title').textContent = `Prakiraan Jam Mendatang (${activePlaceName})`;
    const content = document.getElementById('modal-content');
    content.innerHTML = '';

    const top10 = rawHourlyWeather.slice(0, 10);
    if (top10.length === 0) {
        content.innerHTML = '<div style="font-size:0.85rem; color:var(--text-sub); padding:1rem; text-align:center;">Prakiraan cuaca belum dimuat.</div>';
    } else {
        top10.forEach(w => {
            const item = document.createElement('div');
            item.className = 'modal-item-card';
            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:800; color:var(--primary); font-size:0.9rem;">Pukul ${escapeHtml(w.hour)} WIB</span>
                    <span style="font-weight:900; font-size:1.1rem;">${escapeHtml(w.temp)}</span>
                </div>
                <div style="font-weight:700; font-size:0.85rem;">${escapeHtml(w.desc)}</div>
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-sub); margin-top:0.25rem;">
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

function exportTasksToWhatsApp() {
    if (!tasks || tasks.length === 0) {
        alert("Belum ada catatan fasilitas darurat untuk diekspor.");
        return;
    }

    const now = new Date();
    const dateHeader = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;

    let message = `*LAPORAN FASILITAS DARURAT BENCANA*\n`;
    message += `Lokasi Pantau: ${activePlaceName || 'Tidak Diketahui'}\n`;
    message += `Waktu Laporan: ${dateHeader}\n`;
    message += `------------------------------------\n\n`;

    tasks.forEach((t, idx) => {
        const statusMark = t.done ? "[SELESAI]" : "[BELUM SELESAI]";
        message += `${idx + 1}. *[${t.prio}]* ${t.text}\n`;
        message += `   Status: ${statusMark}\n`;
        message += `   Waktu Dicatat: ${t.time}\n\n`;
    });

    message += `------------------------------------\n`;
    message += `_Dihasilkan via Portal Pantau Mitigasi BMKG_`;

    const encodedText = encodeURIComponent(message);
    const waUrl = `https://wa.me/?text=${encodedText}`;

    window.open(waUrl, '_blank');
}

function refreshAllFeeds() {
    const now = new Date();
    updateStatusSync(`Sinkronisasi Data: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`);
    loadWeatherData();
    loadAirQuality();
    loadQuakes();
}

window.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('loc-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchLocationByName();
        });
    }

    if ("Notification" in window && Notification.permission === "granted") {
        isNotificationPermitted = true;
        updateNotifButtonState(true);
    }

    setSliderPlaceholder();
    detectCurrentGeoLocation();
    renderTasks();
});

setInterval(() => {
    loadQuakes();
}, 120000);

setInterval(() => {
    loadWeatherData();
    loadAirQuality();
    const now = new Date();
    updateStatusSync(`Sinkronisasi Data: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`);
}, 900000);
