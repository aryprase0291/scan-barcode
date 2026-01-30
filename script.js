// ============================================================================
// KONFIGURASI BACKEND
// ============================================================================
// Ganti URL di bawah ini setiap kali Anda melakukan Deploy Baru (New Version)
const API_URL = "https://script.google.com/macros/s/AKfycbwesE4wgjaycp8auj_FrtrjhPwfXZIWPImEbbomCEXUWyaDcc37_kUxjVQ2pURFnP-MeQ/exec"; 

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================
let currentMode = 'scan'; // scan, unit, master, view, laporan
let html5QrcodeScanner;
let masterData = [];

// Set tanggal default hari ini untuk laporan
document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    if(document.getElementById('date-start')) {
        document.getElementById('date-start').valueAsDate = today;
        document.getElementById('date-end').valueAsDate = today;
    }
    // Jalankan scanner utama saat pertama kali load
    initMainScanner();
});

// ============================================================================
// FUNGSI UTAMA (NAVIGATION)
// ============================================================================
function setMode(mode) {
    currentMode = mode;
    
    // UI Toggle Active State
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    if(event && event.target) event.target.classList.add('active');
    
    // Sembunyikan Semua View
    ['view-scan', 'view-form', 'view-list', 'view-laporan'].forEach(id => {
        document.getElementById(id).style.display = 'none';
    });

    
    if(html5QrcodeScanner) {
        try { html5QrcodeScanner.pause(); } catch(e){}
    }

    // --- UPDATE LABEL SWITCH SESUAI MODE ---
    const lblIn = document.querySelector('.btn-in');
    const lblOut = document.querySelector('.btn-out');

    if(mode === 'scan') { // Mode Sparepart
        document.getElementById('view-scan').style.display = 'block';
        document.getElementById('scan-title').innerText = "MODE: SPAREPART / PART";
        // Label Switch
        lblIn.innerText = "MASUK (Restock)";
        lblOut.innerText = "KELUAR (Pakai)";
        initMainScanner();
    }
    else if(mode === 'unit') { // Mode Unit
        document.getElementById('view-scan').style.display = 'block';
        document.getElementById('scan-title').innerText = "MODE: UNIT KENDARAAN";
        // Label Switch
        lblIn.innerText = "TERIMA (Cek Manifest)";
        lblOut.innerText = "JUAL (Delivery)";
        initMainScanner();
    }
    else if(mode === 'master') {
        resetForm();
        document.getElementById('view-form').style.display = 'block';
        toggleCameraInput(); // Cek status toggle kamera
    }
    else if(mode === 'view') {
        document.getElementById('view-list').style.display = 'block';
        loadMasterData();
    }
    else if(mode === 'laporan') {
        document.getElementById('view-laporan').style.display = 'block';
    }
}


// ============================================================================
// LOGIKA SCANNER UTAMA (MODE WIDE & HIGH DENSITY)
// ============================================================================
function initMainScanner() {
    // TAMBAHKAN PDF_417 ke dalam daftar format!
    const formats = [ 
        Html5QrcodeSupportedFormats.PDF_417,  // <--- WAJIB ADA untuk Sparepart Honda
        Html5QrcodeSupportedFormats.CODE_128, 
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.QR_CODE 
    ];

    if(!html5QrcodeScanner) {
        html5QrcodeScanner = new Html5QrcodeScanner(
            "reader", 
            { 
                fps: 30, 
                // Pertahankan rasio Wide (Gepeng) karena PDF417 Honda juga memanjang
                qrbox: function(viewfinderWidth, viewfinderHeight) {
                    let minEdgePercentage = 0.90; 
                    let minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
                    let qrboxWidth = Math.floor(minEdgeSize * minEdgePercentage);
                    return {
                        width: qrboxWidth,
                        height: Math.floor(qrboxWidth * 0.45) 
                    };
                },
                formatsToSupport: formats, 
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                videoConstraints: {
                    facingMode: "environment",
                    focusMode: "continuous",
                    width: { min: 1024, ideal: 1920 }, // Resolusi tinggi bantu PDF417
                    height: { min: 768, ideal: 1080 } 
                }
            }, 
            false
        );
        html5QrcodeScanner.render(onScanSuccess, ()=>{});
    } else {
        try { html5QrcodeScanner.resume(); } catch(e) {}
    }
}

function onScanSuccess(decodedText) {
    if (window.navigator.vibrate) window.navigator.vibrate(200);

    // --- LOGIKA BARU SCAN SPAREPART ---
    if (currentMode === 'scan') {
        html5QrcodeScanner.pause(); // Pause kamera
        
        // Ambil Jenis Transaksi dari Radio Button
        const mode = document.querySelector('input[name="tx_mode"]:checked').value;
        
        // Buka Popup Qty
        showQtyModal(decodedText, mode);
    } 
    // --- LOGIKA LAMA (UNIT) ---
    else if (currentMode === 'unit') {
        html5QrcodeScanner.pause();
        kirimData({ action: 'scan_kendaraan', barcode: decodedText });
    }
    // --- LOGIKA MASTER ---
    else if (currentMode === 'master') {
        document.getElementById('inp_barcode').value = decodedText;
        showToast("Barcode Terbaca");
        html5QrcodeScanner.pause();
    }
}

// ============================================================================
// KOMUNIKASI SERVER (FETCH API)
// ============================================================================

// KIRIM DATA (POST)
function kirimData(json) {
    showToast("Menyimpan...", true);
    fetch(API_URL, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(json)
    }).then(() => {
        showToast("Berhasil!");
        
        // Animasi Sukses jika mode scan
        if(currentMode === 'scan' || currentMode === 'unit') {
            const overlay = document.getElementById('overlay-success');
            overlay.classList.add('active');
            setTimeout(() => {
                overlay.classList.remove('active');
                if(html5QrcodeScanner) html5QrcodeScanner.resume();
            }, 1500);
        } else if(currentMode === 'master') {
            resetForm();
        } else if(currentMode === 'view') {
            // Jika hapus/edit dari view, refresh list
            if(json.action === 'delete_master') {
                // update lokal array biar cepet
                masterData = masterData.filter(i => i.barcode !== json.barcode);
                renderList(masterData);
            }
        }
    }).catch(err => {
        console.error(err);
        showToast("Gagal Kirim Data");
    });
}

// AMBIL DATA MASTER (GET)
function loadMasterData() {
    document.getElementById('list-loader').style.display = 'block';
    
    fetch(`${API_URL}?action=read_master`)
    .then(res => res.json())
    .then(data => {
        // --- TAMBAHAN BARU: SORTING A-Z ---
        // Kita urutkan data berdasarkan 'nama' sebelum disimpan ke masterData
        data.sort((a, b) => {
            // Gunakan toLowerCase agar huruf besar/kecil tidak berpengaruh
            let namaA = a.nama.toLowerCase();
            let namaB = b.nama.toLowerCase();
            if (namaA < namaB) return -1;
            if (namaA > namaB) return 1;
            return 0;
        });
        // ----------------------------------

        masterData = data; 
        renderList(data);
        document.getElementById('list-loader').style.display = 'none';
    })
    .catch(err => {
        console.error(err);
        document.getElementById('list-loader').innerText = "Gagal mengambil data.";
    });
}

// TARIK LAPORAN (GET)
function tarikLaporan() {
    const start = document.getElementById('date-start').value;
    const end = document.getElementById('date-end').value;
    
    if(!start || !end) { alert("Pilih tanggal dulu!"); return; }
    
    showToast("Menghitung Data...", true);
    
    fetch(`${API_URL}?action=get_report&startDate=${start}&endDate=${end}`)
    .then(res => res.json())
    .then(data => {
        showToast("Selesai!");
        document.getElementById('report-result').style.display = 'block';
        document.getElementById('total-unit').innerText = data.total;
        
        const tbody = document.getElementById('report-body');
        tbody.innerHTML = "";
        
        for (const [barcode, count] of Object.entries(data.details)) {
            tbody.innerHTML += `
                <tr>
                    <td>${barcode}</td>
                    <td style="text-align:right;"><span class="badge-count">${count} Unit</span></td>
                </tr>
            `;
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Gagal tarik laporan");
    });
}

// ============================================================================
// LOGIC INPUT MASTER (TOGGLE KAMERA & FORM)
// ============================================================================
let miniScanner = null;

function toggleCameraInput() {
    const isCameraOn = document.getElementById('chk-camera').checked;
    const barcodeInput = document.getElementById('inp_barcode');
    
    if (isCameraOn) {
        // Mode Kamera ON
        document.getElementById('input-camera-wrapper').style.display = 'block';
        barcodeInput.readOnly = true;
        barcodeInput.placeholder = "Menunggu Scan...";
        
        // Init Scanner Kecil jika belum ada
        if (!miniScanner) {
            // Config Formats (Sama dengan Main Scanner)
            const formats = [ 
                Html5QrcodeSupportedFormats.CODE_128, 
                Html5QrcodeSupportedFormats.CODE_39, 
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.QR_CODE 
            ];

            miniScanner = new Html5QrcodeScanner(
                "reader-mini", 
                { 
                    fps: 30, // Scan lebih cepat (sebelumnya 10)
                    
                    // KOREKSI PROPORSI: Ubah jadi Wide (Persegi Panjang)
                    qrbox: function(viewfinderWidth, viewfinderHeight) {
                        // Gunakan 90% lebar container karena areanya sempit
                        let minEdgePercentage = 0.90; 
                        let minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
                        let qrboxWidth = Math.floor(minEdgeSize * minEdgePercentage);
                        
                        return {
                            width: qrboxWidth,
                            height: Math.floor(qrboxWidth * 0.45) // Tinggi 45% dari lebar
                        };
                    },
                    
                    formatsToSupport: formats,
                    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                    
                    // Paksa Fokus Kamera Belakang
                    videoConstraints: {
                        facingMode: "environment",
                        focusMode: "continuous" 
                    }
                }, 
                false
            );

            miniScanner.render((decodedText) => {
                // Saat scan berhasil
                document.getElementById('inp_barcode').value = decodedText;
                showToast("Barcode Terisi!");
                if (window.navigator.vibrate) window.navigator.vibrate(200);
                
                // Opsional: Matikan kamera otomatis setelah dapat data (biar hemat baterai)
                // document.getElementById('chk-camera').click(); 
            });
        }
    } else {
        // Mode Kamera OFF (Manual)
        document.getElementById('input-camera-wrapper').style.display = 'none';
        barcodeInput.readOnly = false;
        barcodeInput.placeholder = "Ketik Barcode Manual...";
        barcodeInput.focus();
        
        // Matikan scanner kecil biar hemat baterai
        if (miniScanner) {
            miniScanner.clear();
            miniScanner = null;
        }
    }
}

function simpanData() {
    const barcode = document.getElementById('inp_barcode').value;
    const nama = document.getElementById('inp_nama').value;
    const harga = document.getElementById('inp_harga').value; 
    
    if(!barcode || !nama) { alert("Barcode dan Nama wajib diisi!"); return; }

    const isEdit = document.getElementById('edit_mode').value === 'true';

    kirimData({
        action: isEdit ? 'edit_master' : 'input_master',
        barcode: barcode,
        nama: nama,
        harga: harga, 
        satuan: document.getElementById('inp_satuan').value,
        keterangan: document.getElementById('inp_ket').value
    });
}

function resetForm() {
    document.getElementById('form-title').innerText = "INPUT PART BARU";
    document.getElementById('edit_mode').value = "false";
    document.getElementById('inp_barcode').value = "";
    document.getElementById('inp_nama').value = "";
    document.getElementById('inp_harga').value = ""; // Reset Harga
    document.getElementById('inp_ket').value = "";
}

function editItem(barcode) {
    const item = masterData.find(i => i.barcode === barcode);
    if(item) {
        setMode('master'); // Pindah ke tab input
        
        document.getElementById('form-title').innerText = "EDIT DATA";
        document.getElementById('edit_mode').value = "true";
        document.getElementById('inp_barcode').value = item.barcode;
        document.getElementById('inp_nama').value = item.nama;
        document.getElementById('inp_harga').value = item.harga; // Isi Harga
        document.getElementById('inp_satuan').value = item.satuan;
        document.getElementById('inp_ket').value = item.keterangan;
        
        // Saat edit, matikan kamera agar mudah edit manual
        document.getElementById('chk-camera').checked = false;
        toggleCameraInput();
    }
}

function deleteItem(barcode, nama) {
    if(confirm(`Yakin hapus "${nama}"?`)) {
        kirimData({ action: 'delete_master', barcode: barcode });
        // Hapus lokal sementara agar UI responsif
        masterData = masterData.filter(i => i.barcode !== barcode);
        renderList(masterData);
    }
}

// ============================================================================
// HELPER & UI FUNCTIONS
// ============================================================================
function renderList(data) {
    const container = document.getElementById('list-content');
    container.innerHTML = "";
    
    if(data.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:#9CA3AF;">
                <div style="font-size:40px; margin-bottom:10px;">📦</div>
                Data tidak ditemukan.
            </div>`;
        return;
    }

    data.forEach(item => {
        // Format Harga Dollar
        let hargaFmt = new Intl.NumberFormat('en-US', { 
            style: 'currency', currency: 'USD', minimumFractionDigits: 0 
        }).format(item.harga || 0);

        // --- LOGIKA STOK WARNING ---
        let stok = item.stok || 0;
        let stokBadgeClass = "badge-stok-aman"; // Default Biru (Aman)
        let stokWarningText = ""; 

        // Jika Stok Kurang dari 1 (0 atau minus)
        if (stok < 1) {
            stokBadgeClass = "badge-stok-habis"; // Jadi Merah
            stokWarningText = `<span class="warning-blink">⚠️ HABIS!</span>`;
        }
        // ---------------------------

        container.innerHTML += `
            <div class="item-card">
                <div class="item-info">
                    <div class="item-name">${item.nama}</div>
                    
                    <div style="margin-bottom:6px; display:flex; align-items:center;">
                        <span class="badge-price">${hargaFmt}</span>
                        
                        <span class="${stokBadgeClass}">
                            Stok: ${stok} ${item.satuan}
                        </span>
                        
                        ${stokWarningText}
                    </div>
                    
                    <div class="item-desc">${item.barcode} | ${item.keterangan || "-"}</div>
                </div>
                
                <div class="action-group">
                    <button class="btn-icon btn-edit" onclick="editItem('${item.barcode}')">✏️</button>
                    <button class="btn-icon btn-del" onclick="deleteItem('${item.barcode}', '${item.nama}')">🗑️</button>
                </div>
            </div>`;
    });
}

function filterList() {
    const key = document.getElementById('search-input').value.toLowerCase();
    const filtered = masterData.filter(i => 
        String(i.nama).toLowerCase().includes(key) || 
        String(i.barcode).includes(key)
    );
    renderList(filtered);
}

function showToast(text, persistent=false) {
    const el = document.getElementById('toast');
    el.innerText = text; el.classList.add('show');
    if(!persistent) setTimeout(() => el.classList.remove('show'), 3000);
}

// ============================================================================
// MODUL BARU: TRANSAKSI POPUP
// ============================================================================
function showQtyModal(barcode, mode) {
    const modal = document.getElementById('modal-qty');
    const title = document.getElementById('modal-title');
    const qtyWrapper = document.getElementById('tx-qty').parentElement.parentElement; // Wrapper input qty
    
    // Set UI Title
    if(mode === 'IN') {
        title.innerText = currentMode === 'unit' ? "TERIMA UNIT?" : "RESTOCK PART";
        title.style.color = "#059669"; 
    } else {
        title.innerText = currentMode === 'unit' ? "JUAL UNIT?" : "PEMAKAIAN PART";
        title.style.color = "#DC2626"; 
    }

    // Set UI Title
    if(mode === 'IN') {
        title.innerText = currentMode === 'unit' ? "TERIMA UNIT?" : "RESTOCK PART";
        title.style.color = "#059669"; 
    } else {
        title.innerText = currentMode === 'unit' ? "JUAL UNIT?" : "PEMAKAIAN PART";
        title.style.color = "#DC2626"; 
    }

    // Isi Form
    document.getElementById('tx-barcode').value = barcode;
    document.getElementById('tx-ket').value = "";
    
    // Tampilkan
    modal.style.display = 'flex';
    // Fokus ke keterangan kalau unit, ke qty kalau part
    if(currentMode === 'unit') document.getElementById('tx-ket').focus();
    else document.getElementById('tx-qty').focus();
}

function closeModal() {
    document.getElementById('modal-qty').style.display = 'none';
    // Resume kamera jika diclose
    if(html5QrcodeScanner) html5QrcodeScanner.resume();
}

function adjustQty(amount) {
    const el = document.getElementById('tx-qty');
    let val = parseInt(el.value) || 0;
    val += amount;
    if(val < 1) val = 1;
    el.value = val;
}

function kirimTransaksi() {
    const barcode = document.getElementById('tx-barcode').value;
    const qty = document.getElementById('tx-qty').value;
    const ket = document.getElementById('tx-ket').value;
    const mode = document.querySelector('input[name="tx_mode"]:checked').value;

    if(!qty || qty < 1) { alert("Jumlah minimal 1!"); return; }

    document.getElementById('modal-qty').style.display = 'none';

    // --- BAGIAN INI SANGAT PENTING ---
    // Cek kita sedang di mode apa?
    let actionName = 'transaksi_part'; 
    
    // Jika sedang mode unit, ganti nama actionnya
    if(currentMode === 'unit') {
        actionName = 'transaksi_unit';
    }

    // Kirim ke Backend
    kirimData({
        action: actionName, // <--- Jangan di-hardcode jadi 'transaksi_part'
        barcode: barcode,
        qty: qty,
        jenis: mode,
        keterangan: ket
    });
}

function prosesManual() {
    const code = document.getElementById('manual-barcode').value;
    if(!code) {
        showToast("Isi kode dulu!");
        return;
    }
    
    // Ambil mode saat ini (IN/OUT)
    const mode = document.querySelector('input[name="tx_mode"]:checked').value;
    
    // Panggil logika yang sama dengan hasil scan kamera
    showQtyModal(code, mode);
    
    // Reset input manual
    document.getElementById('manual-barcode').value = "";
}

// ============================================================================
// MODUL EXPORT DATA (EXCEL & PDF)
// ============================================================================

function downloadExcel() {
    if (!masterData || masterData.length === 0) {
        showToast("Tidak ada data untuk didownload");
        return;
    }

    // 1. Format Data agar Rapi di Excel
    const dataExport = masterData.map(item => ({
        "Barcode": item.barcode,
        "Nama Barang": item.nama,
        "Satuan": item.satuan,
        "Harga Jual": item.harga, // Biarkan angka agar bisa dijumlah
        "Stok Saat Ini": item.stok || 0,
        "Keterangan": item.keterangan
    }));

    // 2. Buat Worksheet & Workbook
    const ws = XLSX.utils.json_to_sheet(dataExport);
    
    // Auto-width kolom (biar gak sempit)
    const wscols = [
        {wch: 15}, {wch: 30}, {wch: 10}, {wch: 15}, {wch: 10}, {wch: 25}
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok Gudang");

    // 3. Download File
    const tanggal = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Laporan_Stok_${tanggal}.xlsx`);
}

function downloadPDF() {
    if (!masterData || masterData.length === 0) {
        showToast("Tidak ada data untuk didownload");
        return;
    }

    const { jsPDF } = window.jspdf;
    
    // 1. KOREKSI: Set Orientation ke 'landscape' (Mendatar)
    const doc = new jsPDF({ orientation: "landscape" }); 

    // 2. Judul Laporan (Center di Landscape A4: Lebar 297mm / 2 = ~148.5)
    const tanggal = new Date().toLocaleDateString('id-ID', { 
        day: 'numeric', month: 'long', year: 'numeric' 
    });
    
    doc.setFontSize(16);
    doc.text("LAPORAN STOK BARANG", 148, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Per Tanggal: ${tanggal}`, 148, 22, { align: "center" });

    // 3. Siapkan Data Tabel
    const tableColumn = ["Barcode", "Nama Barang", "Satuan", "Harga ($)", "Stok", "Keterangan"];
    const tableRows = [];

    masterData.forEach(item => {
        let hargaFmt = new Intl.NumberFormat('en-US', { 
            style: 'currency', currency: 'USD', minimumFractionDigits: 0 
        }).format(item.harga || 0);

        const rowData = [
            item.barcode,
            item.nama,
            item.satuan,
            hargaFmt,
            item.stok || 0,
            item.keterangan || "-"
        ];
        tableRows.push(rowData);
    });

    // 4. Generate Tabel (AutoTable) dengan Layout Fixed Landscape
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 }, // Font sedikit diperbesar
        headStyles: { fillColor: [204, 0, 0], halign: 'center' }, // Header Merah
        
        // KOREKSI: Setting Margin & Lebar agar Full Kertas
        margin: { top: 30, left: 10, right: 10 }, // Margin kiri kanan tipis agar muat banyak
        tableWidth: 'auto', // Otomatis memenuhi margin (Fixed width relative to page)
        
        columnStyles: {
            0: { cellWidth: 35 }, // Barcode
            1: { cellWidth: 60 }, // Nama Barang (Diberi porsi lebar)
            2: { cellWidth: 20, halign: 'center' }, // Satuan
            3: { cellWidth: 25, halign: 'right' }, // Harga
            4: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, // Stok
            5: { cellWidth: 'auto' } // Keterangan (Memakai sisa ruang yang ada / Fill)
        }
    });

    doc.save(`Laporan_Stok_${tanggal}.pdf`);
}

// ============================================================================
// MODUL LAPORAN MUTASI (GABUNGAN SATU TABEL)
// ============================================================================
async function downloadMutasi(format) {
    showToast("Menyiapkan Data Laporan...", true);

    try {
        // 1. Ambil Data Master (Untuk Lookup Nama Barang)
        let resMaster = await fetch(`${API_URL}?action=read_master`);
        let dataMaster = await resMaster.json();
        
        // Buat Kamus Nama (Barcode -> Nama) biar pencarian cepat
        let mapNama = {};
        dataMaster.forEach(m => mapNama[m.barcode] = m.nama);

        // 2. Ambil Data Log Transaksi
        let resLog = await fetch(`${API_URL}?action=read_log`);
        let dataLog = await resLog.json();

        if(!dataLog || dataLog.length === 0) {
            showToast("Belum ada riwayat transaksi."); return;
        }

        // 3. Olah Data (Gabung & Sortir)
        // Urutkan dari yang terbaru (Descending)
        dataLog.sort((a,b) => new Date(b.waktu) - new Date(a.waktu));

        const processedData = dataLog.map(item => {
            return {
                tanggal: new Date(item.waktu).toLocaleDateString('id-ID'),
                jam: new Date(item.waktu).toLocaleTimeString('id-ID'),
                barcode: item.barcode,
                nama: mapNama[item.barcode] || "(Item Dihapus)", // Ambil nama dari master
                // KUNCI PERUBAHAN: Pisahkan kolom Masuk & Keluar
                masuk: item.jenis === 'IN' ? item.qty : 0,
                keluar: item.jenis === 'OUT' ? item.qty : 0,
                ket: item.ket
            };
        });

        // 4. Generate File Sesuai Format
        const tglCetak = new Date().toLocaleDateString('id-ID').replace(/\//g, '-');
        const judulFile = `MUTASI_STOK_${tglCetak}`;

        if (format === 'EXCEL') {
            // --- EXCEL ---
            const dataExport = processedData.map(item => ({
                "Tanggal": item.tanggal,
                "Jam": item.jam,
                "Barcode": item.barcode,
                "Nama Barang": item.nama,
                "Masuk": item.masuk,   // Kolom Terpisah
                "Keluar": item.keluar, // Kolom Terpisah
                "Keterangan": item.ket
            }));
            
            const ws = XLSX.utils.json_to_sheet(dataExport);
            // Atur lebar kolom
            ws['!cols'] = [
                {wch: 12}, {wch: 10}, {wch: 15}, {wch: 30}, 
                {wch: 8}, {wch: 8}, {wch: 25}
            ];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Mutasi Stok");
            XLSX.writeFile(wb, `${judulFile}.xlsx`);

        } else {
            // --- PDF (Landscape) ---
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: "landscape" });

            doc.setFontSize(16);
            doc.text("LAPORAN MUTASI STOK (KELUAR/MASUK)", 148, 15, { align: "center" });
            doc.setFontSize(10);
            doc.text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, 148, 22, { align: "center" });

            const tableRows = processedData.map(item => [
                item.tanggal + "\n" + item.jam, // Gabung tgl jam biar hemat kolom
                item.barcode,
                item.nama,
                item.masuk > 0 ? item.masuk : "-", // Tampilkan strip jika 0
                item.keluar > 0 ? item.keluar : "-",
                item.ket
            ]);

            doc.autoTable({
                head: [["Waktu", "Barcode", "Nama Barang", "Masuk", "Keluar", "Keterangan"]],
                body: tableRows,
                startY: 30,
                theme: 'grid',
                headStyles: { fillColor: [50, 50, 50], halign: 'center' }, // Header Abu Gelap
                columnStyles: {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 35 },
                    2: { cellWidth: 80 }, // Nama Barang Lebar
                    3: { cellWidth: 20, halign: 'center', textColor: [0, 150, 0], fontStyle: 'bold' }, // Masuk (Hijau)
                    4: { cellWidth: 20, halign: 'center', textColor: [200, 0, 0], fontStyle: 'bold' }, // Keluar (Merah)
                    5: { cellWidth: 'auto' }
                }
            });
            doc.save(`${judulFile}.pdf`);
        }

        showToast("Download Selesai!");

    } catch(e) {
        console.error(e);
        showToast("Gagal: " + e.message);
    }
}