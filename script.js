// ============================================================================
// KONFIGURASI BACKEND
// ============================================================================
// Ganti URL di bawah ini setiap kali Anda melakukan Deploy Baru (New Version)
const API_URL = "https://script.google.com/macros/s/AKfycbyGg8CAi3Dq616JcIsae_va0FY0QMUELMoDhbCqbLjR9rLuz1gf1uZy0OM-Is6rOdxbFw/exec"; 

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
// LOGIKA SCANNER UTAMA (PERFORMA TINGGI)
// ============================================================================
function initMainScanner() {
    // HANYA aktifkan format yang benar-benar dipakai agar scanning Cepat!
    const formats = [ 
        Html5QrcodeSupportedFormats.CODE_128, // Barcode Garis (Paling Sering)
        Html5QrcodeSupportedFormats.PDF_417,  // Barcode Bintik (Honda)
        Html5QrcodeSupportedFormats.QR_CODE   // Barcode Unit
    ];

    if(!html5QrcodeScanner) {
    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader", 
        { 
            fps: 30,
            
            // 1. UPDATE QRBOX (Agar proporsional di layar pendek)
            qrbox: function(viewfinderWidth, viewfinderHeight) {
                // Gunakan 80% dari lebar layar
                let width = Math.floor(viewfinderWidth * 0.8);
                return {
                    width: width,
                    // Tinggi box dibuat tipis (misal 150px - 180px) agar pas
                    height: 180 
                };
            },
            
            formatsToSupport: formats, 
            experimentalFeatures: { useBarCodeDetectorIfSupported: false },

            videoConstraints: {
                facingMode: "environment",
                width: { ideal: 1280 }, 
                height: { ideal: 720 },
                focusMode: "continuous"
            },
            
            // 2. UPDATE ASPECT RATIO
            // Ganti 1.0 menjadi 1.777 (Format 16:9 - Landscape)
            // Ini membuat kamera tidak memaksa bentuk kotak tinggi
            aspectRatio: 1.777
        }, 
        false
    );
    html5QrcodeScanner.render(onScanSuccess, ()=>{});
} 

else {
        try { html5QrcodeScanner.resume(); } catch(e) {}
    }
}

function onScanSuccess(decodedText) {
    if (window.navigator.vibrate) window.navigator.vibrate(200);
    
    // Gunakan popup qty/konfirmasi untuk mode Scan Sparepart DAN Unit
    if (currentMode === 'scan' || currentMode === 'unit') {
        html5QrcodeScanner.pause();
        const mode = document.querySelector('input[name="tx_mode"]:checked').value;
        showQtyModal(decodedText, mode); // Munculkan popup untuk konfirmasi status
    } 
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
// LOGIC INPUT MASTER (AUTO OFF & FOCUS)
// ============================================================================
let miniScanner = null;

function toggleCameraInput() {
    const chk = document.getElementById('chk-camera');
    const isCameraOn = chk.checked;
    const barcodeInput = document.getElementById('inp_barcode');

    if (isCameraOn) {
        // --- MODE KAMERA ON ---
        document.getElementById('input-camera-wrapper').style.display = 'block';
        barcodeInput.readOnly = true;
        barcodeInput.placeholder = "Menunggu Scan...";
        
        if (!miniScanner) {
            const formats = [ 
                Html5QrcodeSupportedFormats.PDF_417,  // Prioritas Honda
                Html5QrcodeSupportedFormats.CODE_128, 
                Html5QrcodeSupportedFormats.QR_CODE 
            ];

            miniScanner = new Html5QrcodeScanner(
                "reader-mini", 
                { 
                    fps: 30, 
                    
                    // 1. UPDATE QRBOX
                    // Agar sesuai dengan frame tinggi 250px
                    qrbox: function(viewfinderWidth, viewfinderHeight) {
                        let width = Math.floor(viewfinderWidth * 0.7);
                        // Tinggi fix 140px (Sesuai CSS .scan-frame-custom)
                        return { width: width, height: 140 }; 
                    },
            
                    formatsToSupport: formats,
                    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                    
                    videoConstraints: {
                        facingMode: "environment",
                        width: { ideal: 1280 }, 
                        height: { ideal: 720 },
                        focusMode: "continuous"
                    },
                    
                    // 2. TAMBAHKAN ASPECT RATIO (Landscape)
                    aspectRatio: 1.777 
                }, 
                false
            );

            // --- CALLBACK SAAT SCAN BERHASIL (UPDATE DISINI) ---
            miniScanner.render((decodedText) => {
                // 1. Isi Barcode
                document.getElementById('inp_barcode').value = decodedText;
                showToast("Barcode Terisi!");
                if (window.navigator.vibrate) window.navigator.vibrate(200);
                
                // 2. MATIKAN KAMERA OTOMATIS
                chk.checked = false; // Matikan switch visual
                toggleCameraInput(); // Panggil fungsi ini lagi untuk eksekusi shutdown kamera
                
                // 3. PINDAH FOKUS KE NAMA BARANG
                // Beri jeda 300ms agar animasi tutup kamera selesai dulu
                setTimeout(() => {
                    const inputNama = document.getElementById('inp_nama');
                    inputNama.focus(); 
                    // Opsional: Scroll agar input nama pas di tengah layar
                    inputNama.scrollIntoView({ behavior: "smooth", block: "center" });
                }, 300);

            }, (error) => {});
        }
    } else {
        // --- MODE KAMERA OFF (MANUAL) ---
        document.getElementById('input-camera-wrapper').style.display = 'none';
        barcodeInput.readOnly = false;
        barcodeInput.placeholder = "Ketik Barcode Manual...";
        
        // Logic Matikan & Hapus Scanner dari Memori
        if (miniScanner) {
            miniScanner.clear().then(() => {
                miniScanner = null;
            }).catch((err) => {
                console.error("Gagal stop scanner", err);
                miniScanner = null;
            });
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
                DATA TIDAK DITEMUKAN
            </div>`;
        return;
    }

    data.forEach(item => {
        // Format Harga
        let hargaFmt = new Intl.NumberFormat('en-US', { 
            style: 'currency', currency: 'USD', minimumFractionDigits: 0 
        }).format(item.harga || 0);

        // Logic Stok
        let stok = item.stok || 0;
        let stokClass = stok < 1 ? "stok-habis" : "stok-aman";
        let stokText = stok < 1 ? "⚠️ HABIS" : `Stok: ${stok} ${item.satuan}`;

        // RENDER KARTU
        // Perhatikan: onclick di div utama untuk View Detail
        container.innerHTML += `
            <div class="item-card" onclick="viewItem('${item.barcode}')">
                
                <div class="floating-actions">
                    <button class="btn-float btn-edit" onclick="event.stopPropagation(); editItem('${item.barcode}')">✏️</button>
                    <button class="btn-float btn-del" onclick="event.stopPropagation(); deleteItem('${item.barcode}', '${item.nama}')">🗑️</button>
                </div>

                <div class="item-info">
                    <div class="item-name">${item.nama}</div>
                    <div class="item-code">${item.barcode}</div>
                </div>

                <div class="bottom-row">
                    <div class="big-price">${hargaFmt}</div>
                    <div class="${stokClass} stok-badge">${stokText}</div>
                </div>
            </div>`;
    });
}

// ============================================================================
// PERBAIKAN 1: FUNGSI PENCARIAN (FIX CASE SENSITIVE)
// ============================================================================
function filterList() {
    const searchInput = document.getElementById('search-input').value;
    
    // Konversi input pencarian ke huruf kecil agar pencarian tidak peduli besar/kecil
    const key = searchInput.toLowerCase();

    const filtered = masterData.filter(i => {
        // Ambil data nama & barcode, pastikan string, lalu kecilkan hurufnya
        const nama = String(i.nama).toLowerCase();
        const barcode = String(i.barcode).toLowerCase(); // <--- INI KUNCI PERBAIKANNYA

        // Cek apakah input ada di nama ATAU barcode
        return nama.includes(key) || barcode.includes(key);
    });

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
    const areaUnit = document.getElementById('area-info-unit');
    const qtyCont = document.getElementById('qty-container');
    const inputKet = document.getElementById('tx-ket');

    if (currentMode === 'unit') {
        title.innerText = (mode === 'IN') ? "TERIMA UNIT" : "JUAL UNIT";
        areaUnit.style.display = "block";
        qtyCont.style.display = "none"; // Unit tidak pakai Qty +/-
        document.getElementById('tx-qty').value = 1;
        inputKet.placeholder = "Masukkan Kondisi Unit...";

        // Cari data tipe & warna di masterData
        const item = masterData.find(i => i.barcode === barcode);
        if (item) {
            document.getElementById('info-tipe').innerText = item.tipe || "-";
            document.getElementById('info-warna').innerText = item.warna || "-";
        }
    } else {
        title.innerText = (mode === 'IN') ? "RESTOCK PART" : "PEMAKAIAN PART";
        areaUnit.style.display = "none";
        qtyCont.style.display = "flex";
        inputKet.placeholder = "Keterangan...";
    }

    document.getElementById('tx-barcode').value = barcode;
    modal.style.display = 'flex';
    inputKet.focus();
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
// MODUL EXPORT DATA (REVISI FORMAT TEKS & WRAPPING)
// ============================================================================

function downloadExcel() {
    if (!masterData || masterData.length === 0) {
        showToast("Tidak ada data untuk didownload");
        return;
    }

    // 1. Format Data
    const dataExport = masterData.map(item => ({
        "Barcode": item.barcode,
        "Nama Barang": item.nama,
        "Satuan": item.satuan,
        "Harga Jual": item.harga,
        "Stok": item.stok || 0,
        "Keterangan": item.keterangan || "-" // Pastikan tidak kosong
    }));

    // 2. Buat Worksheet
    const ws = XLSX.utils.json_to_sheet(dataExport);

    // 3. ATUR LEBAR KOLOM (Agar Teks Keterangan Muat)
    // wch = width character count
    const wscols = [
        {wch: 15}, // Barcode
        {wch: 35}, // Nama Barang
        {wch: 10}, // Satuan
        {wch: 15}, // Harga
        {wch: 10}, // Stok
        {wch: 50}  // Keterangan (Dibuat lebar agar rapi di Excel)
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stok Gudang");

    // 4. Download
    const tanggal = new Date().toISOString().slice(0,10);
    XLSX.writeFile(wb, `Laporan_Stok_${tanggal}.xlsx`);
}

function downloadPDF() {
    if (!masterData || masterData.length === 0) {
        showToast("Tidak ada data untuk didownload");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });

    // --- 1. SETTING FONT JUDUL (Header) ---
    doc.setFont("helvetica", "bold"); 
    doc.setFontSize(16);
    doc.text("LAPORAN STOK BARANG", 148, 15, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const tanggal = new Date().toLocaleDateString('id-ID', { 
        day: 'numeric', month: 'long', year: 'numeric' 
    });
    doc.text(`Per Tanggal: ${tanggal}`, 148, 22, { align: "center" });

    // Siapkan Data Tabel
    const tableColumn = ["Barcode", "Nama Barang", "Satuan", "Harga", "Stok", "Keterangan"];
    const tableRows = [];

    masterData.forEach(item => {
        let hargaFmt = new Intl.NumberFormat('en-US', { 
            style: 'currency', currency: 'USD', minimumFractionDigits: 0 
        }).format(item.harga || 0);

        // Bersihkan karakter aneh agar font tidak rusak
        let ketClean = (item.keterangan || "-").replace(/[^\x20-\x7E\n]/g, " ");

        const rowData = [
            item.barcode,
            item.nama,
            item.satuan,
            hargaFmt,
            item.stok || 0,
            ketClean
        ];
        tableRows.push(rowData);
    });

    // --- 2. GENERATE TABEL ---
    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 30,
        theme: 'grid',
        
        // SETTING STYLE UTAMA
        styles: { 
            font: 'helvetica',
            fontSize: 9, 
            cellPadding: 4,         
            overflow: 'linebreak',
            textColor: [40, 40, 40]
        },
        
        // Style Header Tabel (Merah)
        headStyles: { 
            fillColor: [220, 38, 38], 
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'center',
            font: 'helvetica'
        },

        // --- UPDATE PENTING DISINI ---
        columnStyles: {
            0: { cellWidth: 35 }, // Barcode
            1: { cellWidth: 60 }, // Nama Barang
            2: { cellWidth: 20, halign: 'center' }, // Satuan
            
            // REVISI 1: Harga dibuat Rata Kiri ('left')
            3: { cellWidth: 25, halign: 'left' },  
            
            4: { cellWidth: 20, halign: 'center', fontStyle: 'bold' }, // Stok
            
            // REVISI 2: Keterangan dibuat Rata Kiri-Kanan ('justify')
            5: { cellWidth: 'auto', halign: 'justify' } 
        },

        margin: { top: 30, left: 10, right: 10 },
        tableWidth: 'auto'
    });

    doc.save(`Laporan_Stok_${new Date().toISOString().slice(0,10)}.pdf`);
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

// ============================================================================
// MODUL VIEW DETAIL
// ============================================================================
function viewItem(barcode) {
    // REVISI: Gunakan String() agar Angka & Teks dianggap cocok
    // Mengubah kedua sisi menjadi String sebelum membandingkan
    const item = masterData.find(i => String(i.barcode) === String(barcode));
    
    if(!item) {
        console.log("Item tidak ditemukan:", barcode); // Debugging
        return;
    }

    // Isi Data ke Modal
    document.getElementById('det-barcode').innerText = item.barcode;
    document.getElementById('det-nama').innerText = item.nama;
    
    // Format Harga
    let hargaFmt = new Intl.NumberFormat('en-US', { 
            style: 'currency', currency: 'USD', minimumFractionDigits: 0 
    }).format(item.harga || 0);
    document.getElementById('det-harga').innerText = hargaFmt;
    
    // Format Stok
    let stok = item.stok || 0;
    document.getElementById('det-stok').innerText = stok + ' ' + item.satuan;
    
    // Keterangan
    document.getElementById('det-ket').innerText = item.keterangan || "-";

    // Tampilkan Modal
    document.getElementById('modal-detail').style.display = 'flex';
}

function closeDetailModal() {
    document.getElementById('modal-detail').style.display = 'none';
}

// Fitur Copy Text saat barcode diklik (Opsional, biar keren)
function copyText(element) {
    const text = element.innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast("Teks disalin!");
    });
}