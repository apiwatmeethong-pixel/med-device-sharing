/**
 * ระบบบริหารจัดการยืมคืนอุปกรณ์การแพทย์ - Frontend Controller API (v2.2)
 * พัฒนาโดย: ศบส.บ้านโทกหัวช้าง (James)
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxERwiPD6tyzSpZMs9P1SITIYMbm_3ildTzexALzyXa9aKDtLxpwYXDPFxz8Rzfih4LIA/exec"; 

// 🟢 แก้ไขบั๊กเครื่องหมายชนกันด้วยการใช้ Backtick (``) ครอบ SVG แทน
const DEFAULT_LOGO = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="%23e0e7ff"/><circle cx="60" cy="60" r="40" fill="%234f46e5"/><path d="M60 42v36M42 60h36" stroke="white" stroke-width="10" stroke-linecap="round"/></svg>`;

let state = {
    isAdmin: false,
    adminId: '',
    adminName: '',
    data: [],       
    publics: [],    
    equipments: [], 
    currentTab: 'dashboard'
};

// ตัวแปรแบ่งหน้าสัญญายืมฝั่งเจ้าหน้าที่
let adminCurrentPage = 1;
const adminPageLimit = 15; // แสดงตารางแอดมินจำกัดที่หน้าละ 15 แถวเพื่อไม่ให้แน่นจอ

async function run(action, payload = {}) {
    if (localStorage.getItem('adminToken')) {
        payload.token = localStorage.getItem('adminToken');
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
        return { success: false, error: 'เชื่อมต่อเครือข่ายขัดข้อง' };
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
        
        document.getElementById('btn-login-trigger').classList.add('hidden');
        document.getElementById('logged-admin-info').classList.remove('hidden');
        document.getElementById('display-admin-name').innerText = "เจ้าหน้าที่: " + state.adminName;
        
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
        renderBorrowTable(); // โหลดตารางแดชบอร์ดล่างสุด
        
        if (state.isAdmin) {
            renderAdminBorrowContainer(); // โหลดตารางแบ่งหน้าจัดการพาร์ทแอดมิน
            populateFormSelectors();
        }
    } catch (e) {
        console.error("ข้อผิดพลาดในการโหลดระบบสารสนเทศสรุปพัสดุ:", e);
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
    document.getElementById('nav-title').innerText = title1;
    document.getElementById('nav-subtitle').innerText = title2;
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
        
        const g = groups[name];
        const card = document.createElement('div');
        card.className = `${colorTheme} border p-4 rounded-2xl shadow-sm flex items-center justify-between transition-all`;
        card.innerHTML = `
            <div class="flex items-center gap-3 overflow-hidden">
                <div class="p-2.5 rounded-xl bg-white flex-shrink-0 ${iconBg}"><i class="fa-solid ${icon} text-lg"></i></div>
                <div class="overflow-hidden">
                    <h5 class="font-bold text-xs text-gray-700 truncate">${name}</h5>
                    <p class="text-[11px] text-gray-500 mt-0.5">ทั้งหมด: ${g.total} | ว่าง: <span class="text-emerald-600 font-bold">${g.available}</span></p>
                </div>
            </div>
            <div class="text-right flex-shrink-0"><span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">ยืมอยู่: ${g.borrowed}</span></div>
        `;
        grid.appendChild(card);
    }
}

function renderBorrowTable() {
    const tbody = document.getElementById('borrow-rows');
    if (!tbody) return;
    tbody.innerHTML = '';
    state.data.forEach(item => {
        const tr = document.createElement('tr');
        const statusRaw = item.Status || item[8];
        let statusBadge = (statusRaw === 'Borrowed' || statusRaw === 'ยืม') ?
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-100">กำลังยืม</span>` :
            `<span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">คืนคลังแล้ว</span>`;

        tr.innerHTML = `
            <td class="p-3 font-semibold text-gray-700">${item.EquipmentID || item[5] || '-'}</td>
            <td class="p-3 font-medium">${item.PatientName || item.BorrowerName || item[13] || item[1] || '-'}</td>
            <td class="p-3 font-mono text-gray-400">${item.CitizenID || item[2] || '-'}</td>
            <td class="p-3">${item.Community || item[4] || '-'}</td>
            <td class="p-3">${item.BorrowDate ? new Date(item.BorrowDate).toLocaleDateString('th-TH') : '-'}</td>
            <td class="p-3 font-mono text-gray-400">${item.Phone || item[12] || '-'}</td>
            <td class="p-3">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderAdminBorrowContainer() {
    const wrapper = document.getElementById('borrow-admin-table-wrapper');
    if (!wrapper) return;

    const keyword = (document.getElementById('admin-search-input').value || '').toLowerCase().trim();
    const filterStatus = document.getElementById('admin-status-filter').value;

    const filtered = state.data.filter(item => {
        const eqId = String(item.EquipmentID || item[5] || '').toLowerCase();
        const patient = String(item.PatientName || item[13] || '').toLowerCase();
        const borrower = String(item.BorrowerName || item[1] || '').toLowerCase();
        const status = String(item.Status || item[8] || '').trim().toLowerCase();

        let statusMatch = true;
        if (filterStatus === 'borrowed') statusMatch = (status === 'borrowed' || status === 'ยืม');
        if (filterStatus === 'returned') statusMatch = (status === 'returned' || status === 'คืน');

        const textMatch = eqId.includes(keyword) || patient.includes(keyword) || borrower.includes(keyword);
        return statusMatch && textMatch;
    });

    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / adminPageLimit) || 1;
    if (adminCurrentPage > totalPages) adminCurrentPage = totalPages;

    const start = (adminCurrentPage - 1) * adminPageLimit;
    const paginated = filtered.slice(start, start + adminPageLimit);

    let html = `
        <table class="w-full text-left border-collapse table-report">
            <thead class="bg-gray-50 text-gray-600 text-xs font-bold uppercase">
                <tr>
                    <th class="p-3">รหัสพัสดุ</th>
                    <th class="p-3">ชื่อผู้ป่วย / ผู้ยืม</th>
                    <th class="p-3">เลขประจำตัวประชาชน</th>
                    <th class="p-3">ชุมชน/หมู่บ้าน</th>
                    <th class="p-3">วันที่ยืม</th>
                    <th class="p-3">เบอร์ติดต่อ</th>
                    <th class="p-3">สถานะ</th>
                    <th class="p-3 text-center">การจัดการ</th>
                </tr>
            </thead>
            <tbody class="text-xs divide-y divide-gray-100 text-gray-600">
    `;

    if (paginated.length === 0) {
        html += `<tr><td colspan="8" class="text-center p-6 text-gray-400">❌ ไม่พบประวัติสัญญากู้ยืมตามเงื่อนไขค้นหา</td></tr>`;
    } else {
        paginated.forEach(item => {
            const entryId = item.EntryID || item[0];
            const eqId = item.EquipmentID || item[5] || '-';
            const name = item.PatientName || item.BorrowerName || item[13] || item[1] || '-';
            const citizen = item.CitizenID || item[2] || '-';
            const comm = item.Community || item[4] || '-';
            const dateStr = item.BorrowDate ? new Date(item.BorrowDate).toLocaleDateString('th-TH') : '-';
            const phone = item.Phone || item[12] || '-';
            const status = item.Status || item[8];

            let badge = (status === 'Borrowed' || status === 'ยืม') ?
                `<span class="px-2 py-0.5 font-bold rounded-full bg-rose-50 text-rose-700 border">กำลังยืม</span>` :
                `<span class="px-2 py-0.5 font-bold rounded-full bg-emerald-50 text-emerald-700 border">คืนแล้ว</span>`;

            html += `
                <tr class="hover:bg-gray-50 transition">
                    <td class="p-3 font-semibold text-gray-700">${eqId}</td>
                    <td class="p-3 font-medium text-gray-900">${name}</td>
                    <td class="p-3 font-mono">${citizen}</td>
                    <td class="p-3">${comm}</td>
                    <td class="p-3">${dateStr}</td>
                    <td class="p-3 font-mono">${phone}</td>
                    <td class="p-3">${badge}</td>
                    <td class="p-3 text-center">
                        <div class="flex items-center justify-center gap-2">
                            <button onclick="printLoanReceipt('${entryId}')" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-1.5 rounded-lg transition" title="พิมพ์ใบยืมตาม PDF"><i class="fa-solid fa-print text-xs"></i> พิมพ์ใบยืม</button>
                            ${(status === 'Borrowed' || status === 'ยืม') ? `<button onclick="processReturnItem('${entryId}')" class="bg-teal-50 hover:bg-teal-100 text-teal-700 px-2 py-1 rounded-lg font-bold">รับคืน</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });
    }

    html += `</tbody></table>`;
    wrapper.innerHTML = html;

    // เรนเดอร์ปุ่มสลับหน้าถัดไป/ย้อนกลับ
    const paginationBox = document.getElementById('admin-table-pagination');
    if (paginationBox) {
        paginationBox.innerHTML = `
            <button onclick="changeAdminPage(${adminCurrentPage - 1})" ${adminCurrentPage === 1 ? 'disabled class="text-gray-300 cursor-not-allowed"' : 'class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg"'}>ย้อนกลับ</button>
            <span class="bg-gray-100 px-3 py-1 border rounded-xl">หน้า ${adminCurrentPage} / ${totalPages}</span>
            <button onclick="changeAdminPage(${adminCurrentPage + 1})" ${adminCurrentPage === totalPages ? 'disabled class="text-gray-300 cursor-not-allowed"' : 'class="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg"'}>ถัดไป</button>
        `;
    }
}

function changeAdminPage(target) {
    adminCurrentPage = target;
    renderAdminBorrowContainer();
}

function printLoanReceipt(entryId) {
    const row = state.data.find(r => (r.EntryID || r[0]) === entryId);
    if (!row) return;
    
    const bDate = row.BorrowDate ? new Date(row.BorrowDate) : new Date();
    const dateFormatted = bDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const dDate = new Date(bDate);
    dDate.setMonth(dDate.getMonth() + 6); // สัญญาสิ้นสุดค่ามัดจำเมื่อครบ 6 เดือน
    const endDateFormatted = dDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    const eqId = row.EquipmentID || row[5];
    const matchedEq = state.equipments.find(e => String(e.EquipmentID || e[0]).trim() === String(eqId).trim());
    const agencyText = state.publics.find(item => item['ประเภท'] === 'Agency' || item[0] === 'Agency');

    if (agencyText) {
        document.getElementById('print-agency-name').innerText = agencyText['ข้อมูล 2'] || agencyText[2] || 'เทศบาลเมืองเขลางค์นคร';
    }

    document.getElementById('print-borrower').innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';
    document.getElementById('print-sign-borrower').innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';
    document.getElementById('print-date').innerText = dateFormatted;
    document.getElementById('print-equipment').innerText = matchedEq ? `${matchedEq[1] || matchedEq.EquipmentName} (${matchedEq[2] || matchedEq.SerialNumber})` : eqId;
    
    document.getElementById('print-start-date').innerText = dateFormatted;
    document.getElementById('print-end-date').innerText = endDateFormatted;
    document.getElementById('print-phone').innerText = row.Phone || row[12] || '-';
    document.getElementById('print-patient').innerText = row.PatientName || row[13] || '-';
    document.getElementById('print-relation').innerText = row.Relationship || row[14] || 'ตนเอง';
    document.getElementById('print-deposit').innerText = row.Deposit || row[15] || '0';

    // ยิงคำสั่งปริ้นท์ของตัวเบราว์เซอร์
    window.print();
}

function populateFormSelectors() {
    const selectEq = document.getElementById('borrow-eq-id');
    if (!selectEq) return;
    selectEq.innerHTML = '<option value="">-- กรุณาเลือกรายการอุปกรณ์พัสดุ --</option>';
    
    const availableEqs = state.equipments.filter(e => (e.Status || e[3]) === 'Available' || (e.Status || e[3]) === 'ว่าง');
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

function getCurrentLocation() {
    if (!navigator.geolocation) { Swal.fire('ไม่รองรับ', 'เครื่องไม่รองรับระบบระบุพิกัด', 'error'); return; }
    Swal.fire({ title: 'กำลังดึงพิกัดดาวเทียม...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    navigator.geolocation.getCurrentPosition((pos) => {
        document.getElementById('borrow-gps').value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
        Swal.fire('สำเร็จ', 'บันทึกค่าพิกัดพิกัดหน้างานเรียบร้อย', 'success');
    }, () => { Swal.fire('ขัดข้อง', 'ไม่สามารถระบุตำแหน่งพิกัดได้', 'error'); }, { enableHighAccuracy: true });
}

async function submitBorrowForm(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังบันทึกสัญญายืม...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

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

    const res = await run('addBorrow', payload);
    if (res.success) {
        Swal.fire('สำเร็จ', 'บันทึกใบยืมและตัดยอดพัสดุเรียบร้อย', 'success');
        closeBorrowModal();
        await loadSystemData();
    } else {
        Swal.fire('ล้มเหลว', res.error, 'error');
    }
}

function processReturnItem(id) {
    Swal.fire({
        title: 'ยืนยันรับคืนพัสดุอุปกรณ์?',
        text: "ระบุบันทึกสภาพเครื่องมือแพทย์ตอนส่งคืนกลับเข้าคลังสินค้า",
        icon: 'question',
        input: 'text',
        inputPlaceholder: 'ตัวอย่าง: สภาพปกติซิลครบ, ชำรุดตามการใช้งาน...',
        showCancelButton: true,
        confirmButtonText: 'ยืนยันรับคืน'
    }).then(async (result) => {
        if (result.isConfirmed) {
            Swal.fire({ title: 'กำลังบันทึกรับคืน...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            const res = await run('returnBorrow', { EntryID: id, ReturnDate: new Date().toISOString(), Note: result.value || 'คืนสภาพปกติ' });
            if (res.success) {
                Swal.fire('สำเร็จ', 'อุปกรณ์กลับคืนสถานะว่างพร้อมใช้งานแล้ว', 'success');
                await loadSystemData();
            }
        }
    });
}

async function submitLogin(event) {
    event.preventDefault();
    Swal.fire({ title: 'กำลังตรวจสอบสิทธิ์...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
    const uid = document.getElementById('login-uid').value;
    const pwd = document.getElementById('login-pwd').value;

    const res = await run('login', { adminId: uid, password: pwd });
    if (res.success) {
        localStorage.setItem('adminToken', res.token);
        localStorage.setItem('adminId', res.adminId);
        localStorage.setItem('adminName', res.adminName);
        Swal.fire('ยินดีต้อนรับ', 'เข้าสู่ระบบแอดมินเจ้าหน้าที่เรียบร้อย', 'success').then(() => { window.location.reload(); });
    } else { Swal.fire('ล้มเหลว', 'บัญชีผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง', 'error'); }
}

function logout() { localStorage.clear(); window.location.reload(); }
function openLoginModal() { document.getElementById('modal-login').classList.add('active'); }
function closeLoginModal() { document.getElementById('modal-login').classList.remove('active'); }
function openBorrowModal() { document.getElementById('modal-borrow').classList.add('active'); }
function closeBorrowModal() { document.getElementById('modal-borrow').classList.remove('active'); }
