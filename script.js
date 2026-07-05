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

let mapInstance = null;
let communityLayers = {};
let mapLayerControl = null;

async function run(action, payload = {}) {
    if (localStorage.getItem('adminToken')) {
        payload.token = localStorage.getItem('adminToken');
    }
    if (!API_URL || API_URL === "YOUR_GAS_WEB_APP_URL") {
        console.error("ยังไม่ได้ระบุที่อยู่เว็บบริการ API_URL ของระบบตัวแปรฐาน");
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
        renderEquipmentTypeGrid(); // เรนเดอร์ยอดสรุปประเภทแยกตามสูตรใหม่แบบหักลบจริง
        
        if (state.isAdmin) {
            renderBorrowTable();
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

    const setAgency1 = document.getElementById('set-agency1');
    if (setAgency1) {
        document.getElementById('set-logo-old').value = logoUrl;
        document.getElementById('set-agency1').value = title1;
        document.getElementById('set-agency2').value = title2;
        
        const commItems = state.publics.filter(item => item['ประเภท'] === 'Community');
        let commText = commItems.map(item => `${item['ข้อมูล 1']},${item['ข้อมูล 2']}`).join('\n');
        document.getElementById('set-communities').value = commText;
    }
}

// 🟢 เวอร์ชันแก้ไขบั๊กการ์ดสรุปยอด: คำนวณหักลบตัวเลขทางคณิตศาสตร์ถูกต้องแม่นยำ 100%
function renderDashboardStats() {
    // 1. ยอดรวมอุปกรณ์ทั้งหมดในคลัง
    const totalEq = state.equipments.length;
    document.getElementById('stat-total-eq').innerText = totalEq;
    
    // 2. ยอดถูกยืมไปใช้งานจริง (คำนวณแบบรองรับลูกผสมทั้งรูปแบบ Object และ Array ลำดับที่ 8)
    const borrowedCount = state.data.filter(b => {
        const status = b.Status || b[8];
        return status === 'Borrowed' || status === 'ยืม';
    }).length;
    document.getElementById('stat-borrow-eq').innerText = borrowedCount;
    
    // 3. ยอดพร้อมใช้งานว่างสุทธิ (คิดจาก ยอดรวมทั้งหมด หักลบ ยอดที่ถูกยืมจริง เพื่อป้องกันตัวเลขขัดแย้ง)
    const availableCount = totalEq - borrowedCount;
    document.getElementById('stat-avail-eq').innerText = availableCount >= 0 ? availableCount : 0;
    
    // 4. ประวัติประทับตราบันทึกรวมทั้งหมดในตาราง Log
    document.getElementById('stat-total-logs').innerText = state.data.length;
}

// 🟢 เวอร์ชันตรรกะลูกผสม (Fail-Safe): ป้องกันปัญหาโครงสร้างสลับแบบ Object / Array สรุปยอดถูกต้อง 100%
function renderEquipmentTypeGrid() {
    const grid = document.getElementById('equipment-type-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const groups = {};
    
    // 1. ดึงชื่อกลุ่มอุปกรณ์และนับยอดตั้งต้นพัสดุ (รองรับทั้ง eq.EquipmentName และ eq[1])
    state.equipments.forEach(eq => {
        let name = eq.EquipmentName || eq[1];
        name = name ? String(name).trim() : 'อุปกรณ์ทั่วไป';
        
        if (!groups[name]) {
            groups[name] = { total: 0, available: 0, borrowed: 0 };
        }
        groups[name].total++;
    });
    
    // 2. ดึงรายการประวัติยืมเฉพาะที่สถานะเป็นกำลังยืม (รองรับทั้ง r.Status และ r[8])
    const activeBorrows = state.data.filter(r => {
        const status = r.Status || r[8];
        return status === 'Borrowed' || status === 'ยืม';
    });
    
    // 3. วิ่งนับยอดถูกยืมแยกตามหมวดหมู่จริง โดยจับคู่รหัสอุปกรณ์จากคลังพัสดุหลัก
    activeBorrows.forEach(r => {
        // ดึงรหัสพัสดุจากตารางยืม: รองรับทั้ง r.EquipmentID และ r[5]
        const borrowEqId = String(r.EquipmentID || r[5]).trim();
        
        // ค้นหาเพื่อจับคู่ชื่อกลุ่มในคลังครุภัณฑ์หลัก
        const matchedEq = state.equipments.find(e => {
            const mainEqId = String(e.EquipmentID || e[0]).trim();
            return mainEqId === borrowEqId;
        });
        
        if (matchedEq) {
            let name = matchedEq.EquipmentName || matchedEq[1];
            name = name ? String(name).trim() : 'อุปกรณ์ทั่วไป';
            if (groups[name]) {
                groups[name].borrowed++;
            }
        }
    });
    
    // 4. ประมวลผลลบหักยอดคงเหลือสุทธิ (ยอดรวมคลัง - ยอดการยืมจริง)
    for (let name in groups) {
        groups[name].available = groups[name].total - groups[name].borrowed;
    }
    
    if (Object.keys(groups).length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-4">ไม่พบข้อมูลกลุ่มหมวดหมู่พัสดุในระบบคลัง</div>';
        return;
    }
    
    // 5. เรนเดอร์สร้างกล่องการ์ดพาสเทลแยกตามหมวดหมู่อย่างสวยงาม
    for (let name in groups) {
        let icon = 'fa-kit-medical';
        let colorTheme = 'bg-blue-50/70 border-blue-100/60 text-blue-700';
        let iconBg = 'text-blue-500';
        
        if (name.includes('เตียง')) {
            icon = 'fa-bed';
            colorTheme = 'bg-indigo-50/70 border-indigo-100/60 text-indigo-700';
            iconBg = 'text-indigo-500';
        } else if (name.includes('ที่นอน')) {
            icon = 'fa-wind';
            colorTheme = 'bg-teal-50/70 border-teal-100/60 text-teal-700';
            iconBg = 'text-teal-500';
        } else if (name.includes('รถเข็น') || name.includes('รถนอน') || name.includes('เปล')) {
            icon = 'fa-wheelchair';
            colorTheme = 'bg-amber-50/70 border-amber-100/60 text-amber-700';
            iconBg = 'text-amber-500';
        } else if (name.includes('ออกซิเจน')) {
            icon = 'fa-lungs';
            colorTheme = 'bg-sky-50/70 border-sky-100/60 text-sky-700';
            iconBg = 'text-sky-500';
        } else if (name.includes('วอคเกอร์') || name.includes('ไม้ค้ำ') || name.includes('ไม้เท้า')) {
            icon = 'fa-crutches';
            colorTheme = 'bg-purple-50/70 border-purple-100/60 text-purple-700';
            iconBg = 'text-purple-500';
        }
        
        const g = groups[name];
        const card = document.createElement('div');
        card.className = `${colorTheme} border p-4 rounded-2xl shadow-sm flex items-center justify-between transition-all hover:scale-[1.01]`;
        card.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="p-2.5 rounded-xl bg-white shadow-sm flex-shrink-0 ${iconBg}">
                    <i class="fa-solid ${icon} text-lg"></i>
                </div>
                <div class="overflow-hidden">
                    <h5 class="font-bold text-xs text-gray-700 truncate">${name}</h5>
                    <p class="text-[11px] text-gray-500 mt-0.5">ทั้งหมด: ${g.total} | คงเหลือว่าง: <span class="text-emerald-600 font-bold">${g.available}</span></p>
                </div>
            </div>
            <div class="text-right flex-shrink-0">
                <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100/80 text-rose-700">ยืมอยู่: ${g.borrowed}</span>
            </div>
        `;
        grid.appendChild(card);
    }
}
// เรนเดอร์ผูกรายการตารางประวัติ และติดตั้งปุ่มคำสั่ง "พิมพ์ใบยืม"
function renderBorrowTable() {
    const tbody = document.getElementById('borrow-rows');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (state.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center p-6 text-gray-400">❌ ไม่พบประวัติการยืมครุภัณฑ์</td></tr>`;
        return;
    }

    state.data.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-gray-50/70 transition-all duration-100";
        
        let statusBadge = (item.Status === 'Borrowed' || item.Status === 'ยืม') ?
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-100"><i class="fa-solid fa-clock mr-1"></i>กำลังยืม</span>` :
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"><i class="fa-solid fa-circle-check mr-1"></i>คืนคลังแล้ว</span>`;

        const borrowDateFormatted = item.BorrowDate ? new Date(item.BorrowDate).toLocaleDateString('th-TH') : '-';
        
        // 🟢 เพิ่ม: ปุ่มไอคอนเครื่องพิมพ์ (Print Receipt Button) ประจำทุกแถวประวัติแอดมิน
        const actionButtons = `
            <div class="flex items-center gap-1">
                <button onclick="printLoanReceipt('${item.EntryID}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-1.5 rounded-lg transition" title="พิมพ์ใบยืมสัญญา"><i class="fa-solid fa-print text-xs"></i></button>
                ${(item.Status === 'Borrowed' || item.Status === 'ยืม') ? 
                    `<button onclick="processReturnItem('${item.EntryID}')" class="bg-teal-50 hover:bg-teal-100 text-teal-700 font-bold text-[11px] px-2 py-1 rounded-lg transition">คืน</button>` : ''
                }
                <button onclick="deleteBorrowRecord('${item.EntryID}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition"><i class="fa-solid fa-trash-can text-xs"></i></button>
            </div>
        `;

        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-700">${item.EquipmentID || '-'}</td>
            <td class="p-3 font-medium">${item.PatientName || item.BorrowerName || '-'}</td>
            <td class="p-3 font-mono text-gray-500">${item.CitizenID || '-'}</td>
            <td class="p-3">${item.Community || '-'}</td>
            <td class="p-3">${borrowDateFormatted}</td>
            <td class="p-3 font-mono">${item.Phone || '-'}</td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3 print:hidden">${actionButtons}</td>
        `;
        tbody.appendChild(tr);
    });

    const adminContainer = document.getElementById('borrow-admin-container');
    if (adminContainer && document.getElementById('tbl-borrow-log')) {
        adminContainer.innerHTML = document.getElementById('tbl-borrow-log').outerHTML;
        const subTable = adminContainer.querySelector('table');
        if (subTable) subTable.id = "tbl-borrow-admin-root";
    }
}

// 🟢 เพิ่ม: ฟังก์ชันจัดเตรียมข้อมูลตัวแปรสัญญายืมครุภัณฑ์ทางการแพทย์ฉบับเต็มและกดยิงปริ้นท์ใบยืมออกกระดาษ
function printLoanReceipt(entryId) {
    const row = state.data.find(r => r.EntryID === entryId);
    if (!row) return;
    
    const bDate = row.BorrowDate ? new Date(row.BorrowDate) : new Date();
    const dateFormatted = bDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    // คำนวณวันสิ้นสุดโดยบวกเพิ่มระยะเวลามาตรฐาน 6 เดือน
    const dDate = new Date(bDate);
    dDate.setMonth(dDate.getMonth() + 6);
    const endDateFormatted = dDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    const matchedEq = state.equipments.find(e => e.EquipmentID === row.EquipmentID);
    const agencyText = state.publics.find(item => item['ประเภท'] === 'Agency');

    if (agencyText && agencyText['ข้อมูล 1']) {
        document.getElementById('print-agency-name').innerHTML = agencyText['ข้อมูล 2'] ? `${agencyText['ข้อมูล 1']}<br>${agencyText['ข้อมูล 2']}` : agencyText['ข้อมูล 1'];
    }

    document.getElementById('print-borrower').innerText = row.BorrowerName || row.PatientName || '-';
    document.getElementById('print-sign-borrower').innerText = row.BorrowerName || row.PatientName || '-';
    document.getElementById('print-date').innerText = dateFormatted;
    document.getElementById('print-equipment').innerText = matchedEq ? `${matchedEq.EquipmentName} (${matchedEq.SerialNumber})` : row.EquipmentID;
    
    document.getElementById('print-start-date').innerText = dateFormatted;
    document.getElementById('print-end-date').innerText = endDateFormatted;
    document.getElementById('print-phone').innerText = row.Phone || '-';
    document.getElementById('print-patient').innerText = row.PatientName || '-';
    document.getElementById('print-relation').innerText = row.Relationship || 'ตนเอง';
    document.getElementById('print-deposit').innerText = row.Deposit || '0';

    window.print();
}

// 🟢 เพิ่ม: ฟังก์ชันเปิดใช้งานระบบแสดงหน้าต่างตารางรายงานติดตามผู้ป่วยที่ค้างส่งมอบคืนกายอุปกรณ์
function openTrackingReport() {
    const borrowedItems = state.data.filter(r => r.Status === 'Borrowed' || r.Status === 'ยืม');
    let html = '';

    borrowedItems.forEach(row => {
        const eq = state.equipments.find(e => e.EquipmentID === row.EquipmentID);
        const eqName = eq ? eq.EquipmentName : row.EquipmentID;
        const borrowerDetails = `${row.PatientName || row.BorrowerName} (${row.Address || ''} เขต ${row.Community || ''})`;
        
        let borrowDateStr = '-';
        let dueDateStr = '-';
        
        if (row.BorrowDate) {
            const bDate = new Date(row.BorrowDate);
            borrowDateStr = bDate.toLocaleDateString('th-TH');
            const dDate = new Date(bDate);
            dDate.setMonth(dDate.getMonth() + 6);
            dueDateStr = dDate.toLocaleDateString('th-TH');
        }

        html += `
            <tr class="hover:bg-gray-50/70 transition">
                <td class="border border-gray-200 p-2 font-semibold text-orange-600">${row.EquipmentID}</td>
                <td class="border border-gray-200 p-2 text-left">${borrowerDetails}</td>
                <td class="border border-gray-200 p-2 text-gray-500">กำลังยืมใช้งาน</td>
                <td class="border border-gray-200 p-2">6 เดือน</td>
                <td class="border border-gray-200 p-2 text-emerald-600">${borrowDateStr}</td>
                <td class="border border-gray-200 p-2 font-bold text-rose-600 bg-rose-50/40">${dueDateStr}</td>
                <td class="border border-gray-200 p-2 font-mono">${row.Phone || '-'}</td>
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

// 🟢 เพิ่ม: ฟังก์ชันพิมพ์ตารางสรุปแผนผังรายชื่อการติดตามแนวนอนออกทางเครื่องพิมพ์
function printTrackingReport() {
    const borrowPrintSec = document.getElementById('print-section');
    borrowPrintSec.classList.remove('print:block');
    borrowPrintSec.classList.add('print:hidden');

    const trackingPrintSec = document.getElementById('print-tracking-section');
    document.getElementById('tracking-print-body').innerHTML = document.getElementById('tracking-table-body').innerHTML;
    
    trackingPrintSec.classList.remove('hidden');
    trackingPrintSec.classList.add('print:block');

    window.print();

    // คืนค่ารูปแบบเลย์เอาต์ดั้งเดิมให้กับระบบหน้าเว็บหลังกดปิด/สั่งงานปริ้นท์เสร็จ
    trackingPrintSec.classList.add('hidden');
    trackingPrintSec.classList.remove('print:block');
    borrowPrintSec.classList.add('print:block');
    borrowPrintSec.classList.remove('print:hidden');
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
        
        let statusBadge = (item.Status === 'Available' || item.Status === 'ว่าง') ?
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"><i class="fa-solid fa-check-circle mr-1"></i>ว่างพร้อมใช้</span>` :
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-100"><i class="fa-solid fa-handshake mr-1"></i>ถูกยืมไปคลัง</span>`;

        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-700">${item.EquipmentID || '-'}</td>
            <td class="p-3 font-medium text-gray-800">${item.EquipmentName || '-'}</td>
            <td class="p-3 font-mono text-gray-400">${item.SerialNumber || '-'}</td>
            <td class="p-3">${statusBadge}</td>
            <td class="p-3 print:hidden">
                <button onclick="deleteEquipmentRecord('${item.EquipmentID}')" class="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg transition" title="ลบออกจากสารบบคลัง"><i class="fa-solid fa-trash-can text-xs"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function populateFormSelectors() {
    const selectEq = document.getElementById('borrow-eq-id');
    if (!selectEq) return;
    selectEq.innerHTML = '<option value="">-- กรุณาเลือกรายการอุปกรณ์พัสดุ --</option>';
    
    const availableEqs = state.equipments.filter(e => e.Status === 'Available' || e.Status === 'ว่าง');
    availableEqs.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.EquipmentID;
        opt.text = `${e.EquipmentID} : ${e.EquipmentName}`;
        selectEq.appendChild(opt);
    });

    const selectComm = document.getElementById('borrow-community');
    selectComm.innerHTML = '<option value="">-- เลือกเขตชุมชนหมู่บ้านผู้รับบริการ --</option>';
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
        Swal.fire('ระงับการทำงาน', 'แถบข้างซ้ายถูกล็อกไว้เฉพาะเจ้าหน้าที่ที่ผ่านการล็อกอินเข้าสู่ระบบเรียบร้อยแล้วเท่านั้น', 'info');
        return;
    }
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('-translate-x-full');
}

function initLeafletGISMap() {
    const mapDiv = document.getElementById('map-canvas');
    if (!mapDiv) return;

    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }

    mapInstance = L.map('map-canvas').setView([18.2743, 99.4124], 12);

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);

    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
    });

    const baseMaps = {
        "แผนที่ลายเส้นถนนทั่วไป": osmLayer,
        "ภาพถ่ายดาวเทียมทางอากาศ": satelliteLayer
    };

    communityLayers = {};
    const activeBorrows = state.data.filter(item => (item.Status === 'Borrowed' || item.Status === 'ยืม') && item.GPS);

    activeBorrows.forEach(item => {
        const coords = item.GPS.split(',');
        if (coords.length === 2) {
            const lat = parseFloat(coords[0].trim());
            const lng = parseFloat(coords[1].trim());
            
            if (!isNaN(lat) && !isNaN(lng)) {
                const commName = item.Community || "ทั่วไปนอกเขต";
                
                if (!communityLayers[commName]) {
                    communityLayers[commName] = L.layerGroup();
                }

                const popupContent = `
                    <div style="font-family:'Sarabun',sans-serif; font-size:12px;">
                        <strong style="color:#4f46e5;font-size:13px;">📌 รหัสพัสดุ: ${item.EquipmentID}</strong><br>
                        <b>ผู้รับบริการ:</b> ${item.PatientName || item.BorrowerName}<br>
                        <b>หมู่บ้าน/ชุมชน:</b> ${commName}<br>
                        <b>เบอร์โทรติดต่อ:</b> ${item.Phone || '-'}<br>
                        <b>วันที่เริ่มขอยืม:</b> ${item.BorrowDate ? new Date(item.BorrowDate).toLocaleDateString('th-TH') : '-'}
                    </div>
                `;

                L.marker([lat, lng]).bindPopup(popupContent).addTo(communityLayers[commName]);
            }
        }
    });

    const overlayMaps = {};
    for (let key in communityLayers) {
        communityLayers[key].addTo(mapInstance);
        overlayMaps[`เขตชุมชน: ${key}`] = communityLayers[key];
    }

    mapLayerControl = L.control.layers(baseMaps, overlayMaps, { collapsed: false }).addTo(mapInstance);
    setTimeout(() => { mapInstance.invalidateSize(); }, 200);
}

function getCurrentLocation() {
    if (!navigator.geolocation) {
        Swal.fire('ระบบไม่รองรับ', 'เบราว์เซอร์หรือเครื่องของคุณไม่เปิดสิทธิ์แชร์ระบบดาวเทียมระบุพิกัด', 'error');
        return;
    }
    Swal.fire({
        title: 'กำลังคำนวณหาตำแหน่งดาวเทียม',
        text: 'โปรดกดยอมรับแชร์สิทธิ์พิกัดบนหน้าต่างเว็บ และรอสัญญาณสักครู่...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    navigator.geolocation.getCurrentPosition((pos) => {
        document.getElementById('borrow-gps').value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
        Swal.fire('สำเร็จ', 'ดึงตำแหน่งพิกัดภูมิศาสตร์ปัจจุบันเรียบร้อย', 'success');
    }, (err) => {
        Swal.fire('ขัดข้อง', 'สัญญาณดาวเทียมอับหรือผู้ใช้งานกดยกเลิกสิทธิ์ส่งต่อพิกัด', 'error');
    }, { enableHighAccuracy: true, timeout: 8000 });
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
    if (dataset.length === 0) {
        Swal.fire('ระงับสั่งงาน', 'ไม่มีตารางชุดข้อมูลที่จะดึงออกรายงานไฟล์', 'info');
        return;
    }
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
            Swal.fire('บันทึกสำเร็จ', 'ระบบลงทะเบียนพิมพ์สัญญาใบยืมอุปกรณ์เรียบร้อย', 'success');
            closeBorrowModal();
            await loadSystemData();
        }
    } catch (e) { Swal.fire('ล้มเหลว', 'เกิดข้อผิดพลาดเครือข่าย', 'error'); }
}

function processReturnItem(id) {
    Swal.fire({
        title: 'ยืนยันรับคืนอุปกรณ์แพทย์?',
        text: "กรอกข้อมูลบันทึกรายละเอียดเพื่อตรวจสอบสภาพตอนรับคืนสินค้าเข้าคลังชิ้นงาน",
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันรับคืน',
        input: 'text',
        inputPlaceholder: 'ตัวอย่าง: สภาพสมบูรณ์ดี, ชำรุดหักงอบางชิ้น...'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังตัดยอดคืนคลัง...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            const res = await run('returnBorrow', { EntryID: id, ReturnDate: new Date().toISOString(), Note: result.value || 'คืนสภาพปกติ' });
            if (res.success) {
                Swal.fire('รับคืนเสร็จสิ้น', 'อัปเดตยอดคงเหลือคลังพัสดุเรียบร้อย', 'success');
                await loadSystemData();
            }
        }
    });
}

function deleteBorrowRecord(id) {
    Swal.fire({
        title: 'มั่นใจขอลบรายการประวัตินี้?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ยืนยันคำสั่งลบข้อมูล'
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
    Swal.fire({
        title: 'ยืนยันลบพัสดุอุปกรณ์ออกจากคลัง?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48'
    }).then(async (r) => {
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
        Swal.fire('สิทธิ์ล็อกอินผ่านสำเร็จ', 'ยินดีต้อนรับเข้าใช้งานหน้าต่างควบคุมเมนูแอดมิน', 'success').then(() => {
            window.location.reload();
        });
    } else { Swal.fire('เข้าสู่ระบบล้มเหลว', res.error, 'error'); }
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

function openLoginModal() { document.getElementById('modal-login').classList.add('active'); }
function closeLoginModal() { document.getElementById('modal-login').classList.remove('active'); }
function openBorrowModal() { document.getElementById('modal-borrow').classList.add('active'); }
function closeBorrowModal() { document.getElementById('modal-borrow').classList.remove('active'); }
function openEquipmentModal() { document.getElementById('modal-equipment').classList.add('active'); }
function closeEquipmentModal() { document.getElementById('modal-equipment').classList.remove('active'); }
