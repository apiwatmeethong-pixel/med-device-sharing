/**
 * ระบบบริหารจัดการยืมคืนอุปกรณ์การแพทย์ - Frontend Controller API (v2.2)
 * พัฒนาโดย: ศบส.บ้านโทกหัวช้าง (James)
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxERwiPD6tyzSpZMs9P1SITIYMbm_3ildTzexALzyXa9aKDtLxpwYXDPFxz8Rzfih4LIA/exec"; 

const DEFAULT_LOGO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="%23e0e7ff"/><circle cx="60" cy="60" r="40" fill="%234f46e5"/><path d="M60 42v36M42 60h36" stroke="white" stroke-width="10" stroke-linecap="round"/></svg>';

let state = {
    isAdmin: false,
    adminId: '',
    adminName: '',
    data: [],       
    publics: [],    
    equipments: [], 
    currentTab: 'dashboard'
};
// ตัวแปรควบคุมระบบการแบ่งหน้าแสดงผลทั้ง 3 ส่วนหลัก (หน้าละ 20 แถว)
let publicCurrentPage = 1;
let equipCurrentPage = 1;
const rowsPerPageLimit = 20; // ล็อกเป้าหมายการแสดงผลไว้ที่หน้าละ 20 แถวถ้วนตามกำหนด
// ตัวแปรควบคุมระบบการแบ่งหน้าแสดงผลพาร์ทแอดมิน (Pagination States)
let adminCurrentPage = 1;
const adminPageLimit = 10; // แสดงผลแถวข้อมูลรายการยืมเพจละ 10 รายการ

let mapInstance = null;
let communityLayers = {};
let mapLayerControl = null;

async function run(action, payload = {}) {
    if (localStorage.getItem('adminToken')) {
        payload.token = localStorage.getItem('adminToken');
    }
    if (!API_URL || API_URL === "YOUR_GAS_WEB_APP_URL") {
        console.error("ยังไม่ได้ระบุที่อยู่เว็บบริการ API_URL ของระบบ");
        return { success: false, error: 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์เชื่อมต่อ' };
    }
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: action, payload: payload })
        });
        return await response.json();
    } catch (error) {
        console.error("การเชื่อมต่อระบบเซิร์ฟเวอร์ API ล้มเหลว:", error);
        throw error;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    checkAuthSession();
    await loadSystemData();
    document.getElementById('borrow-date').valueAsDate = new Date();
});

function checkAuthSession() {
    if (localStorage.getItem('adminToken')) {
        state.isAdmin = true;
        state.adminId = localStorage.getItem('adminId');
        state.adminName = localStorage.getItem('adminName');
        
        const sidebar = document.getElementById('sidebar');
        const wrapper = document.getElementById('main-wrapper');
        
        sidebar.classList.remove('hidden');
        wrapper.classList.add('md:pl-64');
        
        document.getElementById('public-header-brand').classList.add('md:hidden');
        document.getElementById('btn-login-trigger').classList.add('hidden');
        document.getElementById('logged-admin-info').classList.remove('hidden');
        document.getElementById('display-admin-name').innerText = "เจ้าหน้าที่: " + state.adminName;
        document.getElementById('pdpa-badge').classList.remove('hidden');
        
        document.getElementById('borrow-log-section').classList.remove('hidden');
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => el.classList.remove('hidden'));
    }
}

async function loadSystemData() {
    try {
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
        renderEquipmentTypeGrid();
        
        if (state.isAdmin) {
            renderBorrowTable(); // โหลดหน้าตารางสรุปแดชบอร์ดล่าง
            renderAdminBorrowContainer(); // ✅ โหลดระเบียบแบ่งตารางแอดมินแยกต่างหาก
            renderEquipmentTable();
            populateFormSelectors();
            if (state.currentTab === 'map') initLeafletGISMap();
        }
    } catch (e) {
        console.error("ข้อผิดพลาดในการดึงค่าชุดข้อมูลสรุปโครงสร้าง:", e);
    }
}

function applySystemConfiguration() {
    let logoUrl = DEFAULT_LOGO;
    let title1 = "ระบบบริหารจัดการ ยืมคืนอุปกรณ์การแพทย์";
    let title2 = "งานบริการศูนย์กายอุปกรณ์ทางการแพทย์สาธารณสุข";

    const logoItem = state.publics.find(item => item['ประเภท'] === 'Logo' || item[0] === 'Logo');
    const agencyItem = state.publics.find(item => item['ประเภท'] === 'Agency' || item[0] === 'Agency');

    if (logoItem) logoUrl = logoItem['ข้อมูล 1'] || logoItem[1] || DEFAULT_LOGO;
    if (agencyItem) {
        title1 = agencyItem['ข้อมูล 1'] || agencyItem[1] || title1;
        title2 = agencyItem['ข้อมูล 2'] || agencyItem[2] || title2;
    }

    document.getElementById('nav-logo').src = logoUrl;
    document.getElementById('side-logo').src = logoUrl;
    document.getElementById('nav-title').innerText = title1;
    document.getElementById('nav-subtitle').innerText = title2;
    document.getElementById('side-agency-title').innerText = title1;

    const setAgency1 = document.getElementById('set-agency1');
    if (setAgency1) {
        document.getElementById('set-logo-old').value = logoUrl;
        document.getElementById('set-agency1').value = title1;
        document.getElementById('set-agency2').value = title2;
        
        const commItems = state.publics.filter(item => item['ประเภท'] === 'Community' || item[0] === 'Community');
        let commText = commItems.map(item => `${item['ข้อมูล 1'] || item[1]},${item['ข้อมูล 2'] || item[2]}`).join('\n');
        document.getElementById('set-communities').value = commText;
    }
}

function renderDashboardStats() {
    const totalEq = state.equipments.length;
    document.getElementById('stat-total-eq').innerText = totalEq;
    const borrowedCount = state.data.filter(b => {
        const status = b.Status || b[8];
        return status === 'Borrowed' || status === 'ยืม';
    }).length;
    document.getElementById('stat-borrow-eq').innerText = borrowedCount;
    const availableCount = totalEq - borrowedCount;
    document.getElementById('stat-avail-eq').innerText = availableCount >= 0 ? availableCount : 0;
    document.getElementById('stat-total-logs').innerText = state.data.length;
}

function renderEquipmentTypeGrid() {
    const grid = document.getElementById('equipment-type-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const groups = {};
    
    state.equipments.forEach(eq => {
        let name = eq.EquipmentName || eq[1];
        name = name ? String(name).trim() : 'อุปกรณ์ทั่วไป';
        if (!groups[name]) groups[name] = { total: 0, available: 0, borrowed: 0 };
        groups[name].total++;
    });
    
    const activeBorrows = state.data.filter(r => {
        const status = r.Status || r[8];
        return status === 'Borrowed' || status === 'ยืม';
    });
    
    activeBorrows.forEach(r => {
        const borrowEqId = String(r.EquipmentID || r[5]).trim();
        const matchedEq = state.equipments.find(e => String(e.EquipmentID || e[0]).trim() === borrowEqId);
        if (matchedEq) {
            let name = matchedEq.EquipmentName || matchedEq[1];
            name = name ? String(name).trim() : 'อุปกรณ์ทั่วไป';
            if (groups[name]) groups[name].borrowed++;
        }
    });
    
    for (let name in groups) {
        groups[name].available = groups[name].total - groups[name].borrowed;
    }
    
    for (let name in groups) {
        let icon = 'fa-kit-medical', colorTheme = 'bg-blue-50/70 border-blue-100/60 text-blue-700', iconBg = 'text-blue-500';
        if (name.includes('เตียง')) { icon = 'fa-bed'; colorTheme = 'bg-indigo-50/70 border-indigo-100/60 text-indigo-700'; iconBg = 'text-indigo-500'; }
        else if (name.includes('ที่นอน')) { icon = 'fa-wind'; colorTheme = 'bg-teal-50/70 border-teal-100/60 text-teal-700'; iconBg = 'text-teal-500'; }
        else if (name.includes('รถเข็น') || name.includes('รถนอน')) { icon = 'fa-wheelchair'; colorTheme = 'bg-amber-50/70 border-amber-100/60 text-amber-700'; iconBg = 'text-amber-500'; }
        else if (name.includes('ออกซิเจน')) { icon = 'fa-lungs'; colorTheme = 'bg-sky-50/70 border-sky-100/60 text-sky-700'; iconBg = 'text-sky-500'; }
        else if (name.includes('วอคเกอร์') || name.includes('ไม้ค้ำ')) { icon = 'fa-crutches'; colorTheme = 'bg-purple-50/70 border-purple-100/60 text-purple-700'; iconBg = 'text-purple-500'; }
        
        const g = groups[name];
        const card = document.createElement('div');
        card.className = `${colorTheme} border p-4 rounded-2xl shadow-sm flex items-center justify-between transition-all hover:scale-[1.01]`;
        card.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="p-2.5 rounded-xl bg-white shadow-sm flex-shrink-0 ${iconBg}"><i class="fa-solid ${icon} text-lg"></i></div>
                <div class="overflow-hidden">
                    <h5 class="font-bold text-xs text-gray-700 truncate">${name}</h5>
                    <p class="text-[11px] text-gray-500 mt-0.5">ทั้งหมด: ${g.total} | คงเหลือว่าง: <span class="text-emerald-600 font-bold">${g.available}</span></p>
                </div>
            </div>
            <div class="text-right flex-shrink-0"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100/80 text-rose-700">ยืมอยู่: ${g.borrowed}</span></div>
        `;
        grid.appendChild(card);
    }
}

// เรนเดอร์ตารางสรุปประวัติภาพรวม (แดชบอร์ดสาธารณะล่างสุด)
function renderBorrowTable() {
    const tbody = document.getElementById('borrow-rows');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (state.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center p-6 text-gray-400">❌ ไม่พบประวัติการทำรายการขอยืมครุภัณฑ์</td></tr>`;
        return;
    }
    state.data.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/70 transition-all duration-100";
        const statusRaw = item.Status || item[8];
        let statusBadge = (statusRaw === 'Borrowed' || statusRaw === 'ยืม') ?
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-100">กำลังยืม</span>` :
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">คืนคลังแล้ว</span>`;
        const rawDate = item.BorrowDate || item[9];
        const borrowDateFormatted = rawDate ? new Date(rawDate).toLocaleDateString('th-TH') : '-';

        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-700">${item.EquipmentID || item[5] || '-'}</td>
            <td class="p-3 font-medium">${item.PatientName || item.BorrowerName || item[13] || item[1] || '-'}</td>
            <td class="p-3 font-mono text-gray-400">${item.CitizenID || item[2] || '-'}</td>
            <td class="p-3">${item.Community || item[4] || '-'}</td>
            <td class="p-3">${borrowDateFormatted}</td>
            <td class="p-3 font-mono text-gray-400">${item.Phone || item[12] || '-'}</td>
            <td class="p-3">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ✅ เพิ่มส่วนสำคัญ: ฟังก์ชันจัดทำระบบตารางแบบแบ่งเพจ สืบคัน คัดกรอง และประมวลผลคำสั่งพิมพ์หน้าแอดมินงานยืมคืน
function renderAdminBorrowContainer() {
    const container = document.getElementById('borrow-admin-container');
    if (!container) return;

    const searchKeyword = (document.getElementById('admin-search-input').value || '').toLowerCase().trim();
    const filterStatus = document.getElementById('admin-status-filter').value;

    // ประมวลผลทำการฟิลเตอร์ข้อมูลขั้นสูงลูกผสม
    const filteredList = state.data.filter(item => {
        const eqId = String(item.EquipmentID || item[5] || '').toLowerCase();
        const patient = String(item.PatientName || item[13] || '').toLowerCase();
        const borrower = String(item.BorrowerName || item[1] || '').toLowerCase();
        const status = String(item.Status || item[8] || '').trim().toLowerCase();

        // 1. ตรวจสอบเงื่อนไขตัวกรองสถานะ
        let statusMatch = true;
        if (filterStatus === 'borrowed') statusMatch = (status === 'borrowed' || status === 'ยืม');
        if (filterStatus === 'returned') statusMatch = (status === 'returned' || status === 'returned' || status === 'คืน');

        // ค้นหารายละเอียดชื่อประเภทพัสดุประกอบการสืบค้นคำค้นหาเพิ่มเติม
        const matchedEq = state.equipments.find(e => String(e.EquipmentID || e[0]).trim().toLowerCase() === eqId);
        const eqName = matchedEq ? String(matchedEq.EquipmentName || matchedEq[1] || '').toLowerCase() : '';

        // 2. ตรวจสอบเงื่อนไขคำค้นหาครอบจักรวาล
        const keywordMatch = eqId.includes(searchKeyword) || patient.includes(searchKeyword) || borrower.includes(searchKeyword) || eqName.includes(searchKeyword);

        return statusMatch && keywordMatch;
    });

    // คำนวณหาสถิติอัตราส่วนหน้าเพจทั้งหมด
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / adminPageLimit) || 1;
    if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;

    const startIndex = (adminCurrentPage - 1) * adminPageLimit;
    const endIndex = startIndex + adminPageLimit;
    const paginatedItems = filteredList.slice(startIndex, endIndex);

    // ประกอบสร้างตาราง HTML ชุดจัดการแอดมินตัวจริง
    let tableStructureHtml = `
        <div class="overflow-x-auto rounded-xl border border-gray-100">
            <table class="w-full text-left border-collapse table-report">
                <thead class="bg-gray-50 text-gray-600 text-xs font-bold uppercase">
                    <tr>
                        <th class="p-3">รหัสพัสดุ</th>
                        <th class="p-3">ชื่อผู้ป่วย / ผู้ยืม</th>
                        <th class="p-3">เลขบัตรประจำตัวประชาชน</th>
                        <th class="p-3">ชุมชน/หมู่บ้าน</th>
                        <th class="p-3">วันที่ยืม</th>
                        <th class="p-3">เบอร์โทรศัพท์</th>
                        <th class="p-3">สถานะ</th>
                        <th class="p-3 text-center print:hidden">การจัดการสิทธิ์</th>
                    </tr>
                </thead>
                <tbody class="text-xs divide-y divide-gray-100 text-gray-600">
    `;

    if (paginatedItems.length === 0) {
        tableStructureHtml += `<tr><td colspan="8" class="text-center p-6 text-gray-400">❌ ไม่พบประวัติผลลัพธ์ที่สอดคล้องกับตัวกรองหรือคำค้นหาของคุณ</td></tr>`;
    } else {
        paginatedItems.forEach(item => {
            const entryId = item.EntryID || item[0];
            const eqId = item.EquipmentID || item[5] || '-';
            const patientName = item.PatientName || item.BorrowerName || item[13] || item[1] || '-';
            const citizenId = item.CitizenID || item[2] || '-';
            const community = item.Community || item[4] || '-';
            const rawDate = item.BorrowDate || item[9];
            const dateFormatted = rawDate ? new Date(rawDate).toLocaleDateString('th-TH') : '-';
            const phone = item.Phone || item[12] || '-';
            const status = item.Status || item[8];

            let statusBadge = (status === 'Borrowed' || status === 'ยืม') ?
                `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-100"><i class="fa-solid fa-clock mr-1"></i>กำลังยืม</span>` :
                `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"><i class="fa-solid fa-circle-check mr-1"></i>คืนคลังแล้ว</span>`;

            // ออกปุ่มควบคุมการปริ้นท์ที่ผูกกับตรรกะตัดฟอร์แมตหน้าจอฉบับสมบูรณ์
            const actionButtons = `
                <div class="flex items-center justify-center gap-1.5">
                    <button onclick="printLoanReceipt('${entryId}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-1.5 rounded-lg transition" title="พิมพ์ใบอนุมัติสัญญาค้ำประกันคลัง"><i class="fa-solid fa-print text-xs"></i></button>
                    ${(status === 'Borrowed' || status === 'ยืม') ? 
                        `<button onclick="processReturnItem('${entryId}')" class="bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] px-2.5 py-1 rounded-lg transition">คืน</button>` : ''
                    }
                    <button onclick="deleteBorrowRecord('${entryId}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition"><i class="fa-solid fa-trash-can text-xs"></i></button>
                </div>
            `;

            tableStructureHtml += `
                <tr class="hover:bg-gray-50/70 transition-all duration-100">
                    <td class="p-3 font-semibold text-gray-700">${eqId}</td>
                    <td class="p-3 font-medium">${patientName}</td>
                    <td class="p-3 font-mono">${citizenId}</td>
                    <td class="p-3">${community}</td>
                    <td class="p-3">${dateFormatted}</td>
                    <td class="p-3 font-mono">${phone}</td>
                    <td class="p-3">${statusBadge}</td>
                    <td class="p-3 print:hidden">${actionButtons}</td>
                </tr>
            `;
        });
    }

    tableStructureHtml += `</tbody></table></div>`;
    container.innerHTML = tableStructureHtml;

    // เรนเดอร์จัดโครงสร้างชุดปุ่มเลขหน้าเพจควบคุม (Pagination Elements)
    renderPaginationControlsBar(totalPages);
}

function renderPaginationControlsBar(totalPages) {
    const paginationBox = document.getElementById('admin-table-pagination');
    if (!paginationBox) return;

    let html = `
        <button onclick="changeAdminPage(1)" ${adminCurrentPage === 1 ? 'disabled class="text-gray-300 cursor-not-allowed px-1.5"' : 'class="text-indigo-600 hover:bg-indigo-50 px-1.5 rounded-md"'}><i class="fa-solid fa-angles-left"></i></button>
        <button onclick="changeAdminPage(${adminCurrentPage - 1})" ${adminCurrentPage === 1 ? 'disabled class="text-gray-300 cursor-not-allowed px-2 py-1"' : 'class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg"'}><i class="fa-solid fa-chevron-left"></i> ย้อนกลับ</button>
        <span class="px-3 py-1 font-bold text-gray-600 bg-gray-100/80 border rounded-xl">หน้า ${adminCurrentPage} / ${totalPages}</span>
        <button onclick="changeAdminPage(${adminCurrentPage + 1})" ${adminCurrentPage === totalPages ? 'disabled class="text-gray-300 cursor-not-allowed px-2 py-1"' : 'class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg"'} class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg">ถัดไป <i class="fa-solid fa-chevron-right"></i></button>
        <button onclick="changeAdminPage(${totalPages})" ${adminCurrentPage === totalPages ? 'disabled class="text-gray-300 cursor-not-allowed px-1.5"' : 'class="text-indigo-600 hover:bg-indigo-50 px-1.5 rounded-md"'}><i class="fa-solid fa-angles-right"></i></button>
    `;
    paginationBox.innerHTML = html;
}

function changeAdminPage(target) {
    adminCurrentPage = target;
    renderAdminBorrowContainer();
}

// ✅ แก้ไขปัญหาปริ้นท์หลุดฟอร์แมต: ล็อกระดับ Body Class ปิดหน้าเว็บอื่นเพื่อพิมพ์ใบยืมแบบโบราณดั้งเดิมตามสัญญาจริง
function printLoanReceipt(entryId) {
    // 🔍 ค้นหาเรคคอร์ดแถวข้อมูลสัญญาใน State ด้วย EntryID หรือดัชนีแรก
    const row = state.data.find(r => (r.EntryID || r[0]) === entryId);
    if (!row) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลแถวสัญญานี้ในคลังระบบ', 'error');
        return;
    }
    
    // 🗓️ ถอดค่าและจัดรูปแบบวันที่เริ่มต้นสัญญา และวันครบกำหนดส่งคืนรับประกันมัดจำ (บวก 6 เดือน)
    const rawDate = row.BorrowDate || row[9];
    const bDate = rawDate ? new Date(rawDate) : new Date();
    const dateFormatted = bDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const dDate = new Date(bDate);
    dDate.setMonth(dDate.getMonth() + 6); // บวกกรอบสัญญาระยะเวลา 6 เดือนสากล
    const endDateFormatted = dDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    // 📦 ค้นหารหัสครุภัณฑ์และแมปข้อมูลชื่อรุ่นกายอุปกรณ์จากสต็อกพัสดุ
    const eqId = row.EquipmentID || row[5];
    const matchedEq = state.equipments.find(e => String(e.EquipmentID || e[0]).trim() === String(eqId).trim());
    
    // 📡 ดึงข้อมูลสัญญลักษณ์ Logo และชื่อต้นสังกัดจากแผ่นข้อมูลพับลิกส์ (Publics Sheet)
    const agencyText = state.publics.find(item => item['ประเภท'] === 'Agency' || item[0] === 'Agency');
    const logoText = state.publics.find(item => item['ประเภท'] === 'Logo' || item[0] === 'Logo');

    // 🖼️ ดึงรูปตราสัญลักษณ์ของหน่วยงานมาผูกเข้ากับ Element โครงสร้างรูปภาพตัวใหม่
    if (logoText && document.getElementById('print-logo')) {
        document.getElementById('print-logo').src = logoText['ข้อมูล 1'] || logoText[1] || '';
    }

    // 🏢 จัดสายอักษรชื่อหน่วยงานเทศบาล/ศูนย์แพทย์ เว้นบรรทัดแบบยืดหยุ่นตามเวอร์ชัน 2.1 ดั้งเดิมของคุณ
    if (agencyText && document.getElementById('print-agency-name')) {
        const title1 = agencyText['ข้อมูล 1'] || agencyText[1] || '';
        const title2 = agencyText['ข้อมูล 2'] || agencyText[2] || '';
        document.getElementById('print-agency-name').innerHTML = title2 ? `${title1}<br>${title2}` : title1;
    }

    // ✍️ รันคำสั่งกระจายข้อมูลลงสู่แผ่น ID ในชุดแบบฟอร์มตัวใหม่ที่กำหนดสไตล์สีน้ำเงินเข้มและตัวหนา
    if (document.getElementById('print-borrower')) {
        document.getElementById('print-borrower').innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';
    }
    if (document.getElementById('print-sign-borrower')) {
        document.getElementById('print-sign-borrower').innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';
    }
    if (document.getElementById('print-date')) {
        document.getElementById('print-date').innerText = dateFormatted;
    }
    if (document.getElementById('print-equipment')) {
        document.getElementById('print-equipment').innerText = matchedEq ? `${matchedEq[1] || matchedEq.EquipmentName} รหัส: ${matchedEq[0] || matchedEq.EquipmentID} (${matchedEq[2] || matchedEq.SerialNumber})` : eqId;
    }
    
    if (document.getElementById('print-start-date')) {
        document.getElementById('print-start-date').innerText = dateFormatted;
    }
    if (document.getElementById('print-end-date')) {
        document.getElementById('print-end-date').innerText = endDateFormatted;
    }
    if (document.getElementById('print-phone')) {
        document.getElementById('print-phone').innerText = row.Phone || row[12] || '-';
    }
    if (document.getElementById('print-patient')) {
        document.getElementById('print-patient').innerText = row.PatientName || row[13] || '-';
    }
    if (document.getElementById('print-relation')) {
        document.getElementById('print-relation').innerText = row.Relationship || row[14] || 'ตนเอง';
    }
    if (document.getElementById('print-deposit')) {
        document.getElementById('print-deposit').innerText = row.Deposit || row[15] || '0';
    }
    
    // 🔒 ระบบความปลอดภัยอัตโนมัติ: ดึงชื่อบัญชีแอดมินผู้ที่เข้าสู่ระบบพิมพ์ในขณะนั้นหยอดลงช่องเจ้าหน้าที่ผู้ให้ยืมทันที
    if (document.getElementById('print-sign-staff')) {
        document.getElementById('print-sign-staff').innerText = state.adminName || 'เจ้าหน้าที่ผู้มอบ';
    }

    // 🖨️ บังคับเปลี่ยนสถานะโครงสร้างสไตล์ชีตคุมเลย์เอาต์เฉพาะเครื่องปริ้นท์ตามระเบียบเวอร์ชัน 2.1 ดั้งเดิมของคุณ
    document.body.classList.add('print-mode-receipt');
    window.print();
    document.body.classList.remove('print-mode-receipt');
}

function openTrackingReport() {
    const borrowedItems = state.data.filter(r => {
        const status = r.Status || r[8];
        return status === 'Borrowed' || status === 'ยืม';
    });
    let html = '';

    borrowedItems.forEach(row => {
        const eqId = row.EquipmentID || row[5];
        const eq = state.equipments.find(e => e.EquipmentID === eqId || e[0] === eqId);
        const eqName = eq ? (eq.EquipmentName || eq[1]) : eqId;
        const patient = row.PatientName || row.BorrowerName || row[13] || row[1];
        const address = row.Address || row[3] || '';
        const community = row.Community || row[4] || '';
        const borrowerDetails = `${patient} (${address} เขต ${community})`;
        
        let borrowDateStr = '-';
        let dueDateStr = '-';
        const rawDate = row.BorrowDate || row[9];
        if (rawDate) {
            const bDate = new Date(rawDate);
            borrowDateStr = bDate.toLocaleDateString('th-TH');
            const dDate = new Date(bDate);
            dDate.setMonth(dDate.getMonth() + 6);
            dueDateStr = dDate.toLocaleDateString('th-TH');
        }

        html += `
            <tr class="hover:bg-gray-50/70 transition">
                <td class="border border-gray-200 p-2 font-semibold text-orange-600">${eqId}</td>
                <td class="border border-gray-200 p-2 text-left">${borrowerDetails}</td>
                <td class="border border-gray-200 p-2 text-gray-500">กำลังยืมใช้งาน</td>
                <td class="border border-gray-200 p-2">6 เดือน</td>
                <td class="border border-gray-200 p-2 text-emerald-600">${borrowDateStr}</td>
                <td class="border border-gray-200 p-2 font-bold text-rose-600 bg-rose-50/40">${dueDateStr}</td>
                <td class="border border-gray-200 p-2 font-mono">${row.Phone || row[12] || '-'}</td>
                <td class="border border-gray-200 p-2 text-gray-400">${new Date().toLocaleDateString('th-TH')}</td>
            </tr>
        `;
    });

    if (borrowedItems.length === 0) {
        html = `<tr><td colspan="8" class="text-center p-6 text-gray-400">🎉 ไม่มีรายการกายอุปกรณ์ค้างส่งคืนในขณะนี้</td></tr>`;
    }

    document.getElementById('tracking-table-body').innerHTML = html;
    document.getElementById('tracking-modal').classList.add('active');
}

function closeTrackingReport() {
    document.getElementById('tracking-modal').classList.remove('active');
}

function printTrackingReport() {
    document.getElementById('tracking-print-body').innerHTML = document.getElementById('tracking-table-body').innerHTML;
    document.body.classList.add('print-mode-tracking');
    window.print();
    document.body.classList.remove('print-mode-tracking');
}

function renderEquipmentTable() {
    const tbody = document.getElementById('equipment-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.equipments.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-400">❌ ไม่พบชุดข้อมูลพัสดุอุปกรณ์ที่ลงทะเบียนในคลัง</td></tr>`;
        return;
    }

    state.equipments.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/70 transition-all duration-100";
        const status = item.Status || item[3];
        let statusBadge = (status === 'Available' || status === 'ว่าง') ?
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"><i class="fa-solid fa-check-circle mr-1"></i>ว่างพร้อมใช้</span>` :
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-100"><i class="fa-solid fa-handshake mr-1"></i>ถูกยืมไปคลัง</span>`;

        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-700">${item.EquipmentID || item[0] || '-'}</td>
            <td class="p-3 font-medium text-gray-800">${item.EquipmentName || item[1] || '-'}</td>
            <td class="p-3 font-mono text-gray-400">${item.SerialNumber || item[2] || '-'}</td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3 print:hidden">
                <button onclick="deleteEquipmentRecord('${item.EquipmentID || item[0]}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition"><i class="fa-solid fa-trash-can text-xs"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateFormSelectors() {
    const selectEq = document.getElementById('borrow-eq-id');
    if (!selectEq) return;
    selectEq.innerHTML = '<option value="">-- กรุณาเลือกรายการอุปกรณ์พัสดุ --</option>';
    
    const availableEqs = state.equipments.filter(e => {
        const s = e.Status || e[3];
        return s === 'Available' || s === 'ว่าง';
    });
    availableEqs.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.EquipmentID || e[0];
        opt.text = `${e.EquipmentID || e[0]} : ${e.EquipmentName || e[1]}`;
        selectEq.appendChild(opt);
    });

    const selectComm = document.getElementById('borrow-community');
    selectComm.innerHTML = '<option value="">-- เลือกเขตชุมชนหมู่บ้านผู้รับบริการ --</option>';
    const commItems = state.publics.filter(item => item['ประเภท'] === 'Community' || item[0] === 'Community');
    commItems.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c['ข้อมูล 2'] || c[2];
        opt.text = `หมู่ ${c['ข้อมูล 1'] || c[1]} - ${c['ข้อมูล 2'] || c[2]}`;
        selectComm.appendChild(opt);
    });
}

function syncSerialNumber() {
    const eqId = document.getElementById('borrow-eq-id').value;
    const match = state.equipments.find(e => (e.EquipmentID || e[0]) === eqId);
    document.getElementById('borrow-serial').value = match ? (match.SerialNumber || match[2]) : '';
}

function switchTab(tabId) {
    if (!state.isAdmin && tabId !== 'dashboard') {
        Swal.fire('สิทธิ์ไม่เพียงพอ', 'กรุณาเข้าสู่ระบบด้วยบัญชีแอดมินเจ้าหน้าที่ก่อน', 'warning');
        return;
    }
    state.currentTab = tabId;
    const views = document.querySelectorAll('.app-view');
    views.forEach(v => v.classList.add('hidden'));
    
    document.getElementById(`sec-${tabId}`).classList.remove('hidden');
    
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(m => m.classList.remove('active'));
    
    const targetMenu = document.getElementById(`btn-menu-${tabId}`);
    if (targetMenu) targetMenu.classList.add('active');

    if (tabId === 'map') {
        setTimeout(() => { initLeafletGISMap(); }, 200);
    }
}

function toggleSidebarMinimize() {
    const sidebar = document.getElementById('sidebar');
    const wrapper = document.getElementById('main-wrapper');
    const icon = document.getElementById('minimize-icon');
    
    sidebar.classList.toggle('collapsed');
    wrapper.classList.toggle('sidebar-collapsed');
    
    if (sidebar.classList.contains('collapsed')) {
        icon.className = "fa-solid fa-chevron-right";
    } else {
        icon.className = "fa-solid fa-chevron-left";
    }
    
    if (state.currentTab === 'map' && mapInstance) {
        setTimeout(() => { mapInstance.invalidateSize(); }, 300);
    }
}

function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!state.isAdmin) {
        Swal.fire('ระงับการทำงาน', 'แถบข้างซ้ายถูกล็อกไว้เฉพาะเจ้าหน้าที่ที่ผ่านการล็อกอินแล้ว', 'info');
        return;
    }
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('-translate-x-full');
}

function initLeafletGISMap() {
    const mapDiv = document.getElementById('map-canvas');
    if (!mapDiv) return;
    if (mapInstance) { mapInstance.remove(); mapInstance = null; }

    mapInstance = L.map('map-canvas').setView([18.2743, 99.4124], 12);
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapInstance);
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}');

    const baseMaps = { "แผนที่ทั่วไป": osmLayer, "ภาพดาวเทียม": satelliteLayer };
    communityLayers = {};
    
    const activeBorrows = state.data.filter(item => {
        const s = item.Status || item[8];
        const g = item.GPS || item[16];
        return (s === 'Borrowed' || s === 'ยืม') && g;
    });

    activeBorrows.forEach(item => {
        const gpsStr = item.GPS || item[16];
        const coords = gpsStr.split(',');
        if (coords.length === 2) {
            const lat = parseFloat(coords[0].trim());
            const lng = parseFloat(coords[1].trim());
            
            if (!isNaN(lat) && !isNaN(lng)) {
                const commName = item.Community || item[4] || "ทั่วไปนอกเขต";
                if (!communityLayers[commName]) communityLayers[commName] = L.layerGroup();

                const popupContent = `
                    <div style="font-family:'Sarabun'; font-size:12px;">
                        <strong style="color:#4f46e5;">📌 รหัสพัสดุ: ${item.EquipmentID || item[5]}</strong><br>
                        <b>ผู้ป่วย:</b> ${item.PatientName || item[13] || item[1]}<br>
                        <b>ชุมชน:</b> ${commName}<br>
                        <b>โทร:</b> ${item.Phone || item[12]}
                    </div>
                `;
                L.marker([lat, lng]).bindPopup(popupContent).addTo(communityLayers[commName]);
            }
        }
    });

    const overlayMaps = {};
    for (let key in communityLayers) {
        communityLayers[key].addTo(mapInstance);
        overlayMaps[`เขต: ${key}`] = communityLayers[key];
    }

    mapLayerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(mapInstance);
    setTimeout(() => { mapInstance.invalidateSize(); }, 200);
}

function getCurrentLocation() {
    if (!navigator.geolocation) { Swal.fire('ไม่รองรับ', 'อุปกรณ์ไม่เปิดสิทธิ์แชร์ระบบระบุพิกัดดาวเทียม', 'error'); return; }
    Swal.fire({ title: 'กำลังคำนวณหาตำแหน่ง...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    navigator.geolocation.getCurrentPosition((pos) => {
        document.getElementById('borrow-gps').value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
        Swal.fire('สำเร็จ', 'ดึงตำแหน่งพิกัดภูมิศาสตร์เรียบร้อย', 'success');
    }, (err) => { Swal.fire('ขัดข้อง', 'สัญญาณดาวเทียมอับหรือยกเลิกสิทธิ์ส่งต่อพิกัด', 'error'); }, { enableHighAccuracy: true, timeout: 8000 });
}

function filterBorrowTable() {
    const text = document.getElementById('search-borrow-table').value.toLowerCase();
    const rows = document.querySelectorAll('#borrow-rows tr');
    rows.forEach(row => {
        if (row.cells.length < 2) return;
        row.style.display = row.innerText.toLowerCase().includes(text) ? '' : 'none';
    });
}

function exportToCSV(sheetName) {
    let dataset = sheetName === 'BorrowLog' ? state.data : state.equipments;
    if (dataset.length === 0) { Swal.fire('ระงับสั่งงาน', 'ไม่มีชุดข้อมูลที่จะรายงานไฟล์', 'info'); return; }
    const columns = Object.keys(dataset[0]);
    let csvStr = "\uFEFF" + columns.join(",") + "\n";
    dataset.forEach(row => {
        let line = columns.map(c => {
            let cell = row[c] === null || row[c] === undefined ? '' : String(row[c]);
            return `"${cell.replace(/"/g, '""')}"`;
        });
        csvStr += line.join(",") + "\n";
    });
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${sheetName}_Report.csv`;
    link.click();
}

async function submitBorrowForm(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังบันทึกเอกสาร...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

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
        Note: document.getElementById('borrow-note').value
    };

    try {
        const res = await run('addBorrow', payload);
        if (res.success) {
            Swal.fire('บันทึกสำเร็จ', 'ระบบลงทะเบียนอนุมัติพิมพ์สัญญาเรียบร้อย', 'success');
            closeBorrowModal();
            await loadSystemData();
        }
    } catch (e) { Swal.fire('ล้มเหลว', 'เกิดข้อผิดพลาดเครือข่าย', 'error'); }
}

function processReturnItem(id) {
    Swal.fire({
        title: 'ยืนยันรับคืนอุปกรณ์แพทย์?',
        text: "กรอกบันทึกสภาพเพื่อตรวจสอบร่องรอยครุภัณฑ์รับคืนเข้าสู่คลังชิ้นงาน",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันรับคืน',
        input: 'text',
        inputPlaceholder: 'ตัวอย่าง: สภาพสมบูรณ์ดี, มีตำหนิบางส่วน...'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังตัดยอดคืนคลัง...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            const res = await run('returnBorrow', { EntryID: id, ReturnDate: new Date().toISOString(), Note: result.value || 'คืนสภาพปกติ' });
            if (res.success) { Swal.fire('รับคืนเสร็จสิ้น', 'อัปเดตสถานะว่างพร้อมใช้งานในคลังแล้ว', 'success'); await loadSystemData(); }
        }
    });
}

function deleteBorrowRecord(id) {
    Swal.fire({
        title: 'มั่นใจขอลบรายการประวัตินี้?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ยืนยันคำสั่งลบ'
    }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await run('deleteBorrow', { id: id });
            if (res.success) { Swal.fire('ถอนรากข้อมูลแล้ว', '', 'success'); await loadSystemData(); }
        }
    });
}

async function submitEquipmentForm(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังบันทึกครุภัณฑ์...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const payload = {
        EquipmentID: document.getElementById('eq-id').value.trim(),
        EquipmentName: document.getElementById('eq-name').value.trim(),
        SerialNumber: document.getElementById('eq-serial').value.trim()
    };
    const res = await run('addEquipment', payload);
    if (res.success) { Swal.fire('เพิ่มขึ้นคลังสำเร็จ', '', 'success'); closeEquipmentModal(); await loadSystemData(); }
}

async function deleteEquipmentRecord(id) {
    Swal.fire({ title: 'ยืนยันลบพัสดุออกจากคลัง?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#e11d48' }).then(async (r) => {
        if (r.isConfirmed) {
            const res = await run('deleteEquipment', { id: id });
            if (res.success) { Swal.fire('ลบรายการสำเร็จ', '', 'success'); await loadSystemData(); }
        }
    });
}

async function saveSettingsForm(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังปรับโครงสร้างระบบ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const rawComm = document.getElementById('set-communities').value.split('\n');
    const communities = [];
    rawComm.forEach(line => {
        const parts = line.split(',');
        if (parts.length >= 2) communities.push({ moo: parts[0].trim(), name: parts[1].trim() });
    });

    const payload = {
        agency1: document.getElementById('set-agency1').value.trim(),
        agency2: document.getElementById('set-agency2').value.trim(),
        oldLogoUrl: document.getElementById('set-logo-old').value,
        communities: communities
    };

    const file = document.getElementById('set-logo-file').files[0];
    if (file) {
        const rd = new FileReader();
        rd.readAsDataURL(file);
        rd.onload = async () => {
            payload.logoBase64 = rd.result;
            const res = await run('saveSettings', payload);
            if (res.success) { Swal.fire('อัปเดตระบบแล้ว', '', 'success'); await loadSystemData(); }
        };
    } else {
        const res = await run('saveSettings', payload);
        if (res.success) { Swal.fire('อัปเดตระบบแล้ว', '', 'success'); await loadSystemData(); }
    }
}

async function submitLogin(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังพิสูจน์สิทธิ์...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const uid = document.getElementById('login-uid').value;
    const pwd = document.getElementById('login-pwd').value;

    const res = await run('login', { adminId: uid, password: pwd });
    if (res.success) {
        localStorage.setItem('adminToken', res.token);
        localStorage.setItem('adminId', res.adminId);
        localStorage.setItem('adminName', res.adminName);
        Swal.fire('สิทธิ์ล็อกอินผ่านสำเร็จ', 'ยินดีต้อนรับเข้าใช้งานหน้าต่างควบคุม', 'success').then(() => { window.location.reload(); });
    } else { Swal.fire('เข้าสู่ระบบล้มเหลว', res.error, 'error'); }
}

function logout() { localStorage.clear(); window.location.reload(); }
function openLoginModal() { document.getElementById('modal-login').classList.add('active'); }
function closeLoginModal() { document.getElementById('modal-login').classList.remove('active'); }
function openBorrowModal() { document.getElementById('modal-borrow').classList.add('active'); }
function closeBorrowModal() { document.getElementById('modal-borrow').classList.remove('active'); }
function openEquipmentModal() { document.getElementById('modal-equipment').classList.add('active'); }
function closeEquipmentModal() { document.getElementById('modal-equipment').classList.remove('active'); }
