/**
 * ระบบบริหารจัดการยืมคืนอุปกรณ์การแพทย์ - Frontend Controller API
 * พัฒนาโดย: ศบส.บ้านโทกหัวช้าง (James)
 */

// ⚠️ สำคัญมาก: กรุณานำ URL เว็บแอปที่ได้จากการ Deploy ใน Google Apps Script มาวางแทนที่ข้อความด้านล่างนี้
const API_URL = "https://script.google.com/macros/s/AKfycbxv5VBkdeJKDdxB77ca_IJROa1YEqVlXmeYZQPs8_u3Upfdy-RQY4jZkrjL2fUjLYFJzQ/exec"; 

let state = {
    isAdmin: false,
    adminId: '',
    adminName: '',
    data: [],       // ข้อมูลตาราง BorrowLog
    publics: [],    // ข้อมูลตาราง Publics (รูปโลโก้, องค์กร, ชุมชน)
    equipments: [], // ข้อมูลตาราง Equipments
    currentTab: 'dashboard'
};

// ตัวแปรควบคุมระบบแผนที่ Leaflet
let mapInstance = null;
let communityLayers = {};
let mapLayerControl = null;

// ฟังก์ชันแกนหลักในการทำ HTTP Fetch ติดต่อสื่อสารข้อมูลกับ GAS API
async function run(action, payload = {}) {
    if (localStorage.getItem('adminToken')) {
        payload.token = localStorage.getItem('adminToken');
    }

    if (API_URL === "YOUR_GAS_WEB_APP_URL") {
        console.error("กรุณาระบุ URL ของระบบ GAS Web App ในไฟล์ script.js");
        return { success: false, error: 'ยังไม่ได้ตั้งค่า API_URL ของระบบตัวแปรฐาน' };
    }

    try {
        // ใช้โหมด 'text/plain;charset=utf-8' เพื่อหลีกเลี่ยงข้อจำกัดการ Preflight CORS ของเบราว์เซอร์กับ GAS
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({ action: action, payload: payload })
        });
        const result = await response.json();
        
        if (result.needLogin) {
            logout();
            Swal.fire('หมดสิทธิ์การใช้งาน', 'เซสชั่นเข้าสู่ระบบหมดอายุ กรุณาเข้าใช้งานใหม่อีกครั้ง', 'warning');
            throw new Error('Require Login Session');
        }
        return result;
    } catch (error) {
        console.error("การเชื่อมต่อ API ผิดพลาด:", error);
        throw error;
    }
}

// เริ่มต้นโหลดระบบเมื่อเอกสาร DOM โหลดเรียบร้อยแล้ว
document.addEventListener('DOMContentLoaded', async () => {
    checkAuthSession();
    await loadSystemData();
    document.getElementById('borrow-date').valueAsDate = new Date();
});

// ตรวจสอบข้อมูลเซสชั่นสิทธิ์ของเจ้าหน้าที่ในระบบ Local Storage
function checkAuthSession() {
    if (localStorage.getItem('adminToken')) {
        state.isAdmin = true;
        state.adminId = localStorage.getItem('adminId');
        state.adminName = localStorage.getItem('adminName');
        
        // ปรับแต่งหน้า Layout ย้ายหน้าตาเข้าโหมดระบบ Sidebar แอดมิน
        document.getElementById('sidebar').classList.remove('hidden-important');
        document.getElementById('main-wrapper').classList.add('md:pl-64');
        document.getElementById('public-header-brand').classList.add('md:hidden');
        document.getElementById('btn-login-trigger').classList.add('hidden');
        document.getElementById('logged-admin-info').classList.remove('hidden');
        document.getElementById('display-admin-name').innerText = "ผู้ใช้งาน: " + state.adminName;
        document.getElementById('pdpa-badge').classList.remove('hidden');
        
        // แสดงเมนูเครื่องมือลับการจัดการทั้งหมดของแอดมินตามชั้นสิทธิ์
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => el.classList.remove('hidden'));
    }
}

// ฟังก์ชันโหลดฐานข้อมูลหลักทุกส่วนเข้าสู่สเตทแอปพลิเคชัน
async function loadSystemData() {
    try {
        // ดึงค่าข้อมูลจากทั้ง 3 ตารางหลักพร้อมกันผ่านตัวยิง API
        const [resLog, resPub, resEq] = await Promise.all([
            run('getData', { sheetName: 'BorrowLog' }),
            run('getData', { sheetName: 'Publics' }),
            run('getData', { sheetName: 'Equipments' })
        ]);

        if (resLog.success) state.data = resLog.data;
        if (resPub.success) state.publics = resPub.data;
        if (resEq.success) state.equipments = resEq.data;

        applySystemConfiguration();
        renderDashboardStats();
        renderBorrowTable();
        populateFormSelectors();
        
        if (state.currentTab === 'map') {
            initLeafletGISMap();
        }
    } catch (e) {
        console.error("การดาวน์โหลดโครงสร้างข้อมูลขัดข้อง", e);
    }
}

// อัปเดตข้อมูลองค์กร โลโก้ บนหน้าหน้าจอตามฐานข้อมูล Publics จากสเปรดชีต
function applySystemConfiguration() {
    let logoUrl = "https://via.placeholder.com/150";
    let title1 = "ระบบบริหารจัดการ ยืมคืนอุปกรณ์การแพทย์";
    let title2 = "งานศูนย์บริการกายอุปกรณ์";

    const logoItem = state.publics.find(item => item['ประเภท'] === 'Logo');
    const agencyItem = state.publics.find(item => item['ประเภท'] === 'Agency');

    if (logoItem && logoItem['ข้อมูล 1']) logoUrl = logoItem['ข้อมูล 1'];
    if (agencyItem) {
        if (agencyItem['ข้อมูล 1']) title1 = agencyItem['ข้อมูล 1'];
        if (agencyItem['ข้อมูล 2']) title2 = agencyItem['ข้อมูล 2'];
    }

    document.getElementById('nav-logo').src = logoUrl;
    document.getElementById('side-logo').src = logoUrl;
    document.getElementById('nav-title').innerText = title1;
    document.getElementById('nav-subtitle').innerText = title2;
    document.getElementById('side-agency-title').innerText = title1;

    // เติมพารามิเตอร์ช่อง Inputs ในหน้าฟอร์มตั้งค่ารอไว้
    if (document.getElementById('sec-settings').classList.contains('hidden') === false || true) {
        document.getElementById('set-logo-old').value = logoUrl;
        document.getElementById('set-agency1').value = title1;
        document.getElementById('set-agency2').value = title2;
        
        const commItems = state.publics.filter(item => item['ประเภท'] === 'Community');
        let commText = commItems.map(item => `${item['ข้อมูล 1']},${item['ข้อมูล 2']}`).join('\n');
        document.getElementById('set-communities').value = commText;
    }
}

// คำนวณค่าทางสถิตินำมาเรนเดอร์ลงในกล่องพาสเทลบนหน้าแดชบอร์ด
function renderDashboardStats() {
    document.getElementById('stat-total-eq').innerText = state.equipments.length;
    
    const availableCount = state.equipments.filter(e => e.Status === 'Available' || e.Status === 'ว่าง').length;
    document.getElementById('stat-avail-eq').innerText = availableCount;
    
    const borrowedCount = state.data.filter(b => b.Status === 'Borrowed' || b.Status === 'ยืม').length;
    document.getElementById('stat-borrow-eq').innerText = borrowedCount;
    
    document.getElementById('stat-total-logs').innerText = state.data.length;
}

// แสดงตารางบันทึกรายงานข้อมูลการยืมอุปกรณ์การแพทย์
function renderBorrowTable() {
    const tbody = document.getElementById('borrow-rows');
    tbody.innerHTML = '';

    if (state.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-slate-400">❌ ไม่มีรายการข้อมูลประวัติการทำรายการในฐานระบบ</td></tr>`;
        return;
    }

    state.data.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/80 transition-all duration-150";
        
        // รูปแบบสีสถานะพาสเทลสดใสเด่นชัด
        let statusBadge = '';
        if (item.Status === 'Borrowed' || item.Status === 'ยืม') {
            statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-100/50"><i class="fa-solid fa-clock mr-1"></i>กำลังยืม</span>`;
        } else {
            statusBadge = `<span class="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100/50"><i class="fa-solid fa-circle-check mr-1"></i>คืนแล้ว</span>`;
        }

        const borrowDateFormatted = item.BorrowDate ? new Date(item.BorrowDate).toLocaleDateString('th-TH') : '-';
        
        let actionButtons = '';
        if (state.isAdmin) {
            actionButtons = `
                <div class="flex items-center gap-1.5">
                    ${(item.Status === 'Borrowed' || item.Status === 'ยืม') ? 
                        `<button onclick="processReturnItem('${item.EntryID}')" class="bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-xs px-2.5 py-1.5 rounded-lg transition"><i class="fa-solid fa-rotate-left mr-1"></i>รับคืน</button>` : ''
                    }
                    <button onclick="deleteBorrowRecord('${item.EntryID}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition" title="ลบข้อมูลรายการ"><i class="fa-solid fa-trash-can"></i></button>
                </div>
            `;
        }

        tr.innerHTML = `
            <td class="p-4 font-semibold text-slate-700">${item.EquipmentID || '-'}</td>
            <td class="p-4">${item.PatientName || item.BorrowerName || '-'}</td>
            <td class="p-4 font-mono text-xs text-slate-500">${item.CitizenID || '-'}</td>
            <td class="p-4">${item.Community || '-'}</td>
            <td class="p-4">${borrowDateFormatted}</td>
            <td class="p-4 font-mono text-xs">${item.Phone || '-'}</td>
            <td class="p-4">${statusBadge}</td>
            <td class="p-4 admin-only ${state.isAdmin ? '' : 'hidden'} print:hidden">${actionButtons}</td>
        `;
        tbody.appendChild(tr);
    });

    // คัดลอกสร้างตารางย้ายไปหน้าเมนูผู้ดูแลหากเปิดโหมดแอดมินอยู่
    const adminContainer = document.getElementById('borrow-admin-container');
    if (state.isAdmin && adminContainer) {
        adminContainer.innerHTML = document.getElementById('tbl-borrow-log').outerHTML;
        // ทำความสะอาดรูปลักษณ์ ID ให้ไม่ชนกัน
        adminContainer.querySelector('table').id = "tbl-borrow-admin-root";
        adminContainer.querySelector('input') ? adminContainer.querySelector('input').id = "search-admin-borrow" : null;
    }
}

// โหลดข้อมูลคอมโบ้บ็อกซ์รายการเลือกพัสดุและรายชื่อหมู่บ้านชุมชนในฟอร์ม
function populateFormSelectors() {
    const selectEq = document.getElementById('borrow-eq-id');
    selectEq.innerHTML = '<option value="">-- กรุณาเลือกอุปกรณ์พัสดุ --</option>';
    
    // เลือกเฉพาะเครื่องมือพัสดุที่มีสถานะ 'Available' เท่านั้นนำขึ้นมาเปิดให้ยืมคลัง
    const availableEqs = state.equipments.filter(e => e.Status === 'Available' || e.Status === 'ว่าง');
    availableEqs.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.EquipmentID;
        opt.text = `${e.EquipmentID} : ${e.EquipmentName}`;
        selectEq.appendChild(opt);
    });

    const selectComm = document.getElementById('borrow-community');
    selectComm.innerHTML = '<option value="">-- เลือกเขตชุมชนหมู่บ้าน --</option>';
    const commItems = state.publics.filter(item => item['ประเภท'] === 'Community');
    commItems.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c['ข้อมูล 2'];
        opt.text = `หมู่ ${c['ข้อมูล 1']} - ${c['ข้อมูล 2']}`;
        selectComm.appendChild(opt);
    });
}

function syncSerialNumber() {
    const eqId = document.getElementById('borrow-eq-id').value;
    const match = state.equipments.find(e => e.EquipmentID === eqId);
    document.getElementById('borrow-serial').value = match ? match.SerialNumber : '';
}

// ฟังก์ชันเปิด-ปิดสลับแท็บเมนูการทำงานหลักด้านซ้ายมือ
function switchTab(tabId) {
    state.currentTab = tabId;
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.add('hidden'));
    
    document.getElementById(`sec-${tabId}`).classList.remove('hidden');
    
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(m => m.classList.remove('active'));
    
    const targetMenu = document.getElementById(`btn-menu-${tabId}`);
    if (targetMenu) targetMenu.classList.add('active');

    // เรียกโหลดแผนที่เมื่อคลิกสลับเข้ามาที่หน้า GIS แผนที่พิกัด
    if (tabId === 'map') {
        setTimeout(() => {
            initLeafletGISMap();
        }, 150);
    }
    
    // ปิดเมนูเวอร์ชันมือถือกรณีเปิดใช้งานอยู่
    const sidebar = document.getElementById('sidebar');
    if (!sidebar.classList.contains('-translate-x-full')) {
        sidebar.classList.add('-translate-x-full');
    }
}

// หน้าแผนที่พิกัดระบบสารสนเทศภูมิศาสตร์จำแนกเลเยอร์หมู่บ้านของผู้ขอยืมอุปกรณ์
function initLeafletGISMap() {
    const mapDiv = document.getElementById('map-canvas');
    if (!mapDiv) return;

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    // กำหนดจุดพิกัดเริ่มต้นแผนที่ (จุดศูนย์กลางอำเภอเกาะคา จังหวัดลำปาง)
    mapInstance = L.map('map-canvas').setView([18.2045, 99.4124], 12);

    // เลเยอร์พื้นฐานแบบแผนที่ถนนลายเส้นสากล
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);

    // เลเยอร์พื้นฐานแบบภาพถ่ายดาวเทียมมองเห็นตัวบ้านหลังคาจริง
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri & DigitalGlobe'
    });

    const baseMaps = {
        "แผนที่เส้นทาง (OpenStreetMap)": osmLayer,
        "ภาพถ่ายดาวเทียม (Satellite)": satelliteLayer
    };

    // ล้างและสร้างระบบเลเยอร์จำแนกตามรายชื่อกลุ่มชุมชน (Layer Groups)
    communityLayers = {};
    
    // กรองดึงเฉพาะเคสผู้ขอยืมที่ยังคงสถานะกำลังยืมอุปกรณ์แพทย์อยู่ และมีการบันทึกพิกัด GPS ไว้เท่านั้น
    const activeBorrows = state.data.filter(item => (item.Status === 'Borrowed' || item.Status === 'ยืม') && item.GPS);

    activeBorrows.forEach(item => {
        const coords = item.GPS.split(',');
        if (coords.length === 2) {
            const lat = parseFloat(coords[0].trim());
            const lng = parseFloat(coords[1].trim());
            
            if (!isNaN(lat) && !isNaN(lng)) {
                const commName = item.Community || "ทั่วไป/นอกเขต";
                
                if (!communityLayers[commName]) {
                    communityLayers[commName] = L.layerGroup();
                }

                const popupContent = `
                    <div style="font-family: 'Sarabun', sans-serif; font-size:13px; line-height:1.4;">
                        <strong style="color: #4f46e5; font-size:14px;">📦 รายการ: ${item.EquipmentID}</strong><br>
                        <b>ผู้ป่วย:</b> ${item.PatientName || item.BorrowerName}<br>
                        <b>ชุมชน:</b> เขต ${commName}<br>
                        <b>เบอร์ติดต่อ:</b> ${item.Phone || '-'}<br>
                        <b>วันที่ทำเรื่องยืม:</b> ${item.BorrowDate ? new Date(item.BorrowDate).toLocaleDateString('th-TH') : '-'}<br>
                        ${item.Note ? `<b>หมายเหตุ:</b> <span style="color:#d97706">${item.Note}</span>` : ''}
                    </div>
                `;

                // สร้างหมุดปักแผนที่ผูกหน้าต่างป๊อปอัพพิกัด
                const marker = L.marker([lat, lng]).bindPopup(popupContent);
                marker.addTo(communityLayers[commName]);
            }
        }
    });

    // บรรจุกลุ่มเลเยอร์ชุมชนทั้งหมดเข้าสู่คอนโทรลสวิตช์ควบคุมแผนที่
    const overlayMaps = {};
    for (let key in communityLayers) {
        communityLayers[key].addTo(mapInstance); // เปิดทุกเลเยอร์แสดงผลทั้งหมดตั้งต้น
        overlayMaps[`กลุ่มพิกัด: ${key}`] = communityLayers[key];
    }

    mapLayerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(mapInstance);
    
    // บังคับคำสั่งแก้ไขมิติขนาดแผนที่เพื่อป้องกันการประมวลผลการจัดเรียงพิกเซลแผนที่ผิดพลาดบนบราวเซอร์
    setTimeout(() => {
        mapInstance.invalidateSize();
    }, 250);
}

// ฟังก์ชันใช้ระบบเว็บ API ของเบราว์เซอร์ดึงค่าพิกัด GPS ปัจจุบัน ณ สถานที่หน้างานทำสัญญา
function getCurrentLocation() {
    if (!navigator.geolocation) {
        Swal.fire('ข้อผิดพลาด', 'อุปกรณ์เครื่องนี้ไม่รองรับระบบเทคโนโลยี Geolocation ค้นหาพิกัด', 'error');
        return;
    }

    Swal.fire({
        title: 'กำลังเชื่อมต่อดาวเทียมพิกัด',
        text: 'โปรดอนุญาตสิทธิ์เข้าถึงพิกัดที่หน้าจอ และรอสัญญาณดาวเทียมจับคู่ตำแหน่งสักครู่...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    navigator.geolocation.getCurrentPosition((position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        document.getElementById('borrow-gps').value = `${lat}, ${lng}`;
        Swal.fire('สำเร็จ', `ดึงค่าพิกัด GPS เรียบร้อยแล้ว (${lat}, ${lng})`, 'success');
    }, (err) => {
        Swal.fire('ดึงพิกัดล้มเหลว', 'ไม่สามารถค้นหาตำแหน่งได้เนื่องจากผู้ใช้ไม่ได้กดยอมรับแชร์สิทธิ์พิกัด หรือสัญญาณอับขัดข้อง', 'error');
    }, { enableHighAccuracy: true, timeout: 10000 });
}

// การค้นหาข้อมูลคัดกรองแถวในตารางยืมคืนหน้าบ้านแบบ Reactive Realtime Search
function filterBorrowTable() {
    const text = document.getElementById('search-borrow-table').value.toLowerCase();
    const rows = document.querySelectorAll('#borrow-rows tr');
    
    rows.forEach(row => {
        if(row.cells.length < 2) return;
        const match = row.innerText.toLowerCase().includes(text);
        row.style.display = match ? '' : 'none';
    });
}

// ระบบดาวน์โหลดส่งออกเอกสารรายงานตารางมาเป็นไฟล์ Excel / CSV ที่รองรับฟอนต์ไทยสมบูรณ์
function exportToCSV(sheetName) {
    let sourceData = [];
    if (sheetName === 'BorrowLog') sourceData = state.data;
    if (sheetName === 'Equipments') sourceData = state.equipments;

    if (sourceData.length === 0) {
        Swal.fire('ระงับการทำงาน', 'ไม่มีชุดข้อมูลสารสนเทศอยู่ในคลังตารางรายงานที่จะจัดส่งออกได้', 'info');
        return;
    }

    const columns = Object.keys(sourceData[0]);
    let csvContent = "\uFEFF"; // ใส่เครื่องหมาย BOM หลีกเลี่ยงปัญหาภาษาไทยแสดงผลเป็นภาษาวิบัติในโปรแกรม Microsoft Excel
    csvContent += columns.join(",") + "\n";

    sourceData.forEach(row => {
        let line = columns.map(col => {
            let cell = row[col] === null || row[col] === undefined ? '' : String(row[col]);
            cell = cell.replace(/"/g, '""');
            if (cell.includes(',') || cell.includes('\n') || cell.includes('"')) {
                cell = `"${cell}"`;
            }
            return cell;
        });
        csvContent += line.join(",") + "\n";
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${sheetName}_Report_${new Date().toLocaleDateString('th-TH').replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ส่วนงานแอดมิน: ฟังก์ชันรันจัดการกดลงทะเบียนบันทึกใบขอยืมพัสดุอุปกรณ์แพทย์ชิ้นใหม่
async function submitBorrowForm(event) {
    event.preventDefault();
    
    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    const payload = {
        EquipmentID: document.getElementById('borrow-eq-id').value,
        SerialNumber: document.getElementById('borrow-serial').value,
        PatientName: document.getElementById('borrow-patient').value,
        BorrowerName: document.getElementById('borrow-name').value || document.getElementById('borrow-patient').value,
        CitizenID: document.getElementById('borrow-citizen').value,
        Phone: document.getElementById('borrow-phone').value,
        Relationship: document.getElementById('borrow-relationship').value,
        Community: document.getElementById('borrow-community').value,
        Address: document.getElementById('borrow-address').value,
        GPS: document.getElementById('borrow-gps').value.trim(),
        BorrowDate: new Date(document.getElementById('borrow-date').value).toISOString(),
        Deposit: document.getElementById('borrow-deposit').value,
        Note: document.getElementById('borrow-note').value,
        blobs: [] // สามารถเขียนโปรแกรมแปลงรูปภาพใส่เข้าไปทาง FileReader เพิ่มเติมได้ทีหลัง
    };

    try {
        const res = await run('addBorrow', payload);
        if (res.success) {
            Swal.fire('บันทึกสำเร็จ', 'ระบบได้ทำการลงทะเบียนเอกสารสัญญาใบยืมกายอุปกรณ์และตัดคลังเรียบร้อย', 'success');
            closeBorrowModal();
            await loadSystemData(); // รีเฟรชโหลดหน้ากระดานใหม่ทั้งหมดแบบออโต้
        } else {
            Swal.fire('เกิดข้อผิดพลาดในการบันทึก', res.error, 'error');
        }
    } catch (e) {
        Swal.fire('การเชื่อมต่อล้มเหลว', 'เกิดความผิดพลาดในการส่งถ่ายข้อมูลกับ API ตรวจสอบอินเทอร์เน็ต', 'error');
    }
}

// ส่วนงานแอดมิน: ทำเรื่องทำธุรกรรมส่งคืนพัสดุอุปกรณ์การแพทย์กลับเข้าคลัง
function processReturnItem(id) {
    Swal.fire({
        title: 'ยืนยันการรับคืนอุปกรณ์การแพทย์?',
        text: "เมื่อกดยืนยัน อุปกรณ์จะปรับสถานะเป็นว่างพร้อมใช้งานส่งต่อให้ผู้ป่วยรายอื่นทันที",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#0d9488',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยันการรับคืนพัสดุ',
        cancelButtonText: 'ยกเลิก',
        input: 'text',
        inputLabel: 'บันทึกหมายเหตุการรับคืน (เช่น สภาพอุปกรณ์ปกติดี, ชำรุดบางส่วน)',
        inputPlaceholder: 'กรอกหมายเหตุเพิ่มเติม...'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังอัปเดตระบบคลัง...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            try {
                const res = await run('returnBorrow', { EntryID: id, ReturnDate: new Date().toISOString(), Note: result.value });
                if (res.success) {
                    Swal.fire('ทำรายการคืนสำเร็จ', 'อุปกรณ์แพทย์ได้รับการส่งคืนและอัปเดตยอดคงคลังแล้ว', 'success');
                    await loadSystemData();
                } else {
                    Swal.fire('ข้อผิดพลาด API', res.error, 'error');
                }
            } catch (e) {
                Swal.fire('ระบบขัดข้อง', 'ไม่สามารถเชื่อมฐานข้อมูลหลักทางระบบเครือข่ายได้', 'error');
            }
        }
    });
}

// ส่วนงานแอดมิน: ฟังก์ชันสั่งลบเอกสารบันทึกประวัติใบยืมพัสดุ
function deleteBorrowRecord(id) {
    Swal.fire({
        title: 'คุณมั่นใจที่จะลบรายการนี้ใช่ไหม?',
        text: "ระวัง! การลบรายการนี้จะหายไปจากตารางประวัติถาวร และอุปกรณ์จะถูกดีดกลับมาว่างในคลังอัตโนมัติ",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยันคำสั่งลบ',
        cancelButtonText: 'ยกเลิก'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                const res = await run('deleteBorrow', { id: id });
                if (res.success) {
                    Swal.fire('ลบข้อมูลเรียบร้อย', 'ข้อมูลประวัติรายการดังกล่าวถูกถอนออกจากระบบแล้ว', 'success');
                    await loadSystemData();
                }
            } catch(e){}
        }
    });
}

// ส่วนงานแอดมิน: การลงทะเบียนเครื่องมือชิ้นพัสดุอุปกรณ์แพทย์ตัวใหม่เข้าคลังสินค้า
async function submitEquipmentForm(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังเพิ่มอุปกรณ์ในคลัง...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    
    const payload = {
        EquipmentID: document.getElementById('eq-id').value.trim(),
        EquipmentName: document.getElementById('eq-name').value.trim(),
        SerialNumber: document.getElementById('eq-serial').value.trim()
    };

    try {
        const res = await run('addEquipment', payload);
        if (res.success) {
            Swal.fire('สำเร็จ', 'บันทึกประวัติเครื่องมืออุปกรณ์ใหม่เข้าคลังพร้อมให้กดยืมแล้ว', 'success');
            closeEquipmentModal();
            await loadSystemData();
        } else {
            Swal.fire('ล้มเหลว', res.error, 'error');
        }
    } catch(e){}
}

// ส่วนงานแอนมิน: จัดเก็บฟอร์มบันทึกข้อมูลโครงสร้างระบบ (Settings)
async function saveSettingsForm(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังปรับใช้การตั้งค่าองค์กร...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

    const rawComm = document.getElementById('set-communities').value.split('\n');
    const communities = [];
    rawComm.forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 2 && parts[0].trim() !== '' && parts[1].trim() !== '') {
            communities.push({ moo: parts[0].trim(), name: parts[1].trim() });
        }
    });

    const payload = {
        agency1: document.getElementById('set-agency1').value.trim(),
        agency2: document.getElementById('set-agency2').value.trim(),
        oldLogoUrl: document.getElementById('set-logo-old').value,
        communities: communities,
        logoBase64: null
    };

    const logoFile = document.getElementById('set-logo-file').files[0];
    if (logoFile) {
        const reader = new FileReader();
        reader.readAsDataURL(logoFile);
        reader.onload = async () => {
            payload.logoBase64 = reader.result;
            executeSaveSettings(payload);
        };
    } else {
        executeSaveSettings(payload);
    }
}

async function executeSaveSettings(payload) {
    try {
        const res = await run('saveSettings', payload);
        if (res.success) {
            Swal.fire('ปรับค่าสำเร็จ', 'ระบบข้อมูลองค์กรและพิกัดหมู่บ้านชุมชนได้รับอัปเดตแล้ว', 'success');
            await loadSystemData();
        }
    } catch(e){}
}

// ระบบพิสูจน์ยืนยันตัวตนแอดมินเจ้าหน้าที่ศูนย์กายอุปกรณ์เพื่อล็อกอิน
async function submitLogin(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์เข้าถึง...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    
    const uid = document.getElementById('login-uid').value;
    const pwb = document.getElementById('login-pwd').value;

    try {
        const res = await run('login', { adminId: uid, password: pwb });
        if (res.success) {
            localStorage.setItem('adminToken', res.token);
            localStorage.setItem('adminId', res.adminId);
            localStorage.setItem('adminName', res.adminName);
            
            Swal.fire('ยินดีต้อนรับเข้าสู่ระบบ', 'เจ้าหน้าที่ยืนยันตัวตนเสร็จสมบูรณ์ ยินดีต้อนรับเข้าจัดการระบบหลังบ้าน', 'success').then(() => {
                window.location.reload(); // รีโหลดระบบเพื่อเซ็ตอินเทอร์เฟซเข้าโหมดเมนูด้านซ้าย Sidebar
            });
        } else {
            Swal.fire('สิทธิ์เข้าถึงถูกปฏิเสธ', res.error, 'error');
        }
    } catch (e) {
        Swal.fire('เซิร์ฟเวอร์ปฏิเสธการเชื่อมต่อ', 'กรุณาตรวจสอบโครงสร้างการดีพลอย์ API', 'error');
    }
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

// ฟังก์ชันเปิดและปิดใช้งานกล่องโมดอลตัวเลือกดีไซน์ต่าง ๆ บนหน้าแอปพลิเคชัน
function openLoginModal() { document.getElementById('modal-login').classList.remove('hidden'); }
function closeLoginModal() { document.getElementById('modal-login').classList.add('hidden'); }
function openBorrowModal() { document.getElementById('modal-borrow').classList.remove('hidden'); }
function closeBorrowModal() { document.getElementById('modal-borrow').classList.add('hidden'); }
function openEquipmentModal() { document.getElementById('modal-equipment').classList.remove('hidden'); }
function closeEquipmentModal() { document.getElementById('modal-equipment').classList.add('hidden'); }
function toggleMobileSidebar() { document.getElementById('sidebar').classList.toggle('-translate-x-full'); }