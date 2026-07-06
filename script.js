/**
 * ระบบบริหารจัดการยืมคืนอุปกรณ์การแพทย์ - Frontend Controller API (v2.2)
 * พัฒนาโดย: ศบส.บ้านโทกหัวช้าง (James)
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxERwiPD6tyzSpZMs9P1SITIYMbm_3ildTzexALzyXa9aKDtLxpwYXDPFxz8Rzfih4LIA/exec"; 

const DEFAULT_LOGO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="%23e0e7ff"/><circle cx='60' cy='60' r='40' fill='%234f46e5'/><path d="M60 42v36M42 60h36" stroke="white" stroke-width="10" stroke-linecap="round"/></svg>';
    console.log("ระบบคลังสารสนเทศภูมิศาสตร์และแบบฟอร์มใบยืมศูนย์กายอุปกรณ์ v2.2 เริ่มทำงาน...");

    // 📁 กล่องข้อมูลสภาวะระบบหลัก (Global State Management Architecture)
    let state = { 
        isAdmin: false, 
        adminId: '', 
        adminName: '', 
        data: [], 
        publics: [], 
        equipments: [], 
        filteredData: [],
        page: 1, 
        limit: 15, // กำหนดคุมจำกัดยอดแสดงผลสูงสุดที่หน้าละ 15 แถวรายการป้องกันหน้าระเบิด
        tab: 'all', 
        searchKeyword: '',
        editingId: null 
    };

    // ตัวแปรแกนหมุนของแผนที่ภูมิสารสนเทศ Leaflet Maps
    let mapInstance = null;
    let markerGroup = null;

    // 🟢 ตัวสั่งยิงติดต่อฝั่งเซิร์ฟเวอร์หลังบ้านผ่าน Native google.script.run ของระบบเดิมคุณ 100%
    function run(action, payload = {}) {
        return new Promise((resolve, reject) => {
            if (localStorage.getItem('adminToken')) {
                payload.token = localStorage.getItem('adminToken');
            }
            google.script.run
                .withSuccessHandler(res => { 
                    if (res && res.needLogin) { 
                        logout(); 
                        resolve({ success: false, error: 'สิทธิ์ล็อกอินหมดอายุกรุณาเข้าระบบใหม่' }); 
                    } else { 
                        resolve(res); 
                    } 
                })
                .withFailureHandler(err => {
                    console.error("ระบบ GAS เซิร์ฟเวอร์ขัดข้อง:", err);
                    reject(err);
                })
                .clientHandler(action, payload);
        });
    }

    // 🎬 สตาร์ทโหลดระบบงานทันทีเมื่อบราวเซอร์จัดเตรียมหน้าจอเสร็จสิ้น
    document.addEventListener('DOMContentLoaded', async () => {
        // แกะตัวแปร Session ตรวจสอบสถานะการล็อกอินเดิมจาก LocalStorage
        if (localStorage.getItem('adminToken')) { 
            state.isAdmin = true; 
            state.adminId = localStorage.getItem('adminId') || ''; 
            state.adminName = localStorage.getItem('adminName') || state.adminId; 
        }
        
        // รันคำสั่งเปลี่ยนสถานะซ่อน/แสดงของหน้าฟอร์มฝั่งซ้ายมือทันที
        updateAuth(); 
        
        // ขึ้นโครงฐานแผนที่ Leaflet รอบันทึกพิกัดผู้รับบริการ
        initMap();

        // รันคำสั่งคิวรี่ดึงฐานข้อมูลหลักจากชีตเซิร์ฟเวอร์
        await loadData();

        // ตั้งเวลาหน้าฟอร์มวันที่ให้จับค่าวันปัจจุบันเป็นค่า Default ต้นทาง
        const dateInput = document.getElementById('form-borrow-date');
        if (dateInput) {
            dateInput.valueAsDate = new Date();
        }
    });

    // 📥 ฟังก์ชันรวมกลุ่มประมวลผลซิงค์ข้อมูลชีต 3 แผ่นเข้ามาใน State ระบบหลัก
    async function loadData() {
        try {
            const [log, pub, eq] = await Promise.all([
                run('getData', { sheetName: 'BorrowLog' }), 
                run('getData', { sheetName: 'Publics' }), 
                run('getData', { sheetName: 'Equipments' })
            ]);

            if (log && log.success) state.data = log.data;
            if (pub && pub.success) state.publics = pub.data;
            if (eq && eq.success) state.equipments = eq.data;

            applyConfig();
            calculateStats();
            populateFormDropdowns();
            renderFilteredTable();
            updateMapMarkers(); // พล็อตหมุดสารสนเทศพิกัดบ้านผู้ป่วยลงบนแผนที่โดยอัตโนมัติ
        } catch (e) {
            console.error("ข้อผิดพลาดในการโหลดข้อมูลสัญญารวม:", e);
        }
    }

    // 🔒 ฟังก์ชันคุมสิทธิ์เปิด-ปิดฟอร์มฝั่งซ้ายมือสไตล์พรีเมียม (Auth Layout Handler) ของเดิมคุณ 100%
    function updateAuth() {
        const borrowFormBlock = document.getElementById('borrow-form-block');
        const guestWelcomeBlock = document.getElementById('guest-welcome-block');
        const btnAdminEquip = document.getElementById('btn-admin-equip');
        const btnAdminSettings = document.getElementById('btn-admin-settings');
        const adminPanel = document.getElementById('admin-panel'); 
        const btnLoginShow = document.getElementById('btn-login-show');

        if (state.isAdmin) {
            // หาก Admin เข้าสู่ระบบสำเร็จ -> ซ่อนกล่องยินดีต้อนรับผู้ใช้ทั่วไป แล้วเปิดฟอร์มสัญญายืมฝั่งซ้ายมือทันที
            if (borrowFormBlock) borrowFormBlock.classList.remove('hidden');
            if (guestWelcomeBlock) guestWelcomeBlock.classList.add('hidden');
            if (btnAdminEquip) btnAdminEquip.classList.remove('hidden');
            if (btnAdminSettings) btnAdminSettings.classList.remove('hidden');
            if (adminPanel) {
                adminPanel.classList.remove('hidden');
                const displayNameTag = document.getElementById('admin-display-name');
                if (displayNameTag) displayNameTag.innerText = state.adminName;
            }
            if (btnLoginShow) btnLoginShow.classList.add('hidden');
        } else {
            // หากผู้เข้าชมทั่วไปเข้าสู่ระบบ -> ซ่อนฟอร์มสัญญายืมฝั่งซ้ายมือ และดึงเอาการ์ดต้อนรับประชาชนทั่วไปขึ้นมาล็อกแทน
            if (borrowFormBlock) borrowFormBlock.classList.add('hidden');
            if (guestWelcomeBlock) guestWelcomeBlock.classList.remove('hidden');
            if (btnAdminEquip) btnAdminEquip.classList.add('hidden');
            if (btnAdminSettings) btnAdminSettings.classList.add('hidden');
            if (adminPanel) adminPanel.classList.add('hidden');
            if (btnLoginShow) btnLoginShow.classList.remove('hidden');
        }
    }

    // ⚙️ นำชื่อสังกัดและหัวเว็บจากชีต Publics ของคุณมาสลักลงบน Navbar และพาร์ทใบพิมพ์
    function applyConfig() {
        let agency1 = "ระบบบริหารจัดการ ยืมคืนอุปกรณ์การแพทย์";
        let agency2 = "เทศบาลเมืองเขลางค์นคร";
        
        const agencyItem = state.publics.find(item => item['ประเภท'] === 'Agency' || item[0] === 'Agency');
        if (agencyItem) {
            agency1 = agencyItem['ข้อมูล 1'] || agencyItem[1] || agency1;
            agency2 = agencyItem['ข้อมูล 2'] || agencyItem[2] || agency2;
        }

        const navTitle = document.getElementById('nav-title');
        if (navTitle) navTitle.innerText = agency1;
        
        const printAgency = document.getElementById('print-agency-title');
        if (printAgency) printAgency.innerText = agency2;
    }

    // 📊 ฟังก์ชันคำนวณสถิติจำนวนรวม เพื่อนำไปประจุลงการ์ดแดชบอร์ด 4 ใบด้านบนแบบเรียลไทม์
    function calculateStats() {
        const total = state.equipments.length;
        const borrowed = state.data.filter(b => (b.Status || b[8]) === 'Borrowed' || (b.Status || b[8]) === 'ยืม').length;
        const available = total - borrowed;

        const tCard = document.getElementById('card-total-eq');
        const aCard = document.getElementById('card-avail-eq');
        const bCard = document.getElementById('card-borrow-eq');
        const lCard = document.getElementById('card-total-logs');

        if (tCard) tCard.innerText = `${total} ชิ้น`;
        if (aCard) aCard.innerText = `${available >= 0 ? available : 0} ชิ้น`;
        if (bCard) bCard.innerText = `${borrowed} ชิ้น`;
        if (lCard) lCard.innerText = `${state.data.length} ครั้ง`;
    }

    // 📥 หยอดข้อมูลชิ้นพัสดุกับรายชื่อกลุ่มเขตชุมชนหมู่บ้านใส่ลงฟิลด์เลือกดรอปดาวน์ฟอร์มขอยืม
    function populateFormDropdowns() {
        const selectEq = document.getElementById('form-equipment-id');
        if (selectEq) {
            selectEq.innerHTML = '<option value="">-- เลือกอุปกรณ์ในคลัง --</option>';
            const availableEqs = state.equipments.filter(e => (e.Status || e[3]) === 'Available' || (e.Status || e[3]) === 'ว่าง');
            availableEqs.forEach(e => {
                const opt = document.createElement('option');
                opt.value = e.EquipmentID || e[0];
                opt.text = `${e.EquipmentID || e[0]} : ${e.EquipmentName || e[1]} [S/N: ${e.SerialNumber || e[2]}]`;
                selectEq.appendChild(opt);
            });
        }

        const selectComm = document.getElementById('form-community');
        if (selectComm) {
            selectComm.innerHTML = '<option value="">-- เลือกพื้นที่ชุมชน --</option>';
            const commItems = state.publics.filter(item => item['ประเภท'] === 'Community' || item[0] === 'Community');
            commItems.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c['ข้อมูล 2'] || c[2];
                opt.text = `หมู่ ${c['ข้อมูล 1'] || c[1]} - ${c['ข้อมูล 2'] || c[2]}`;
                selectComm.appendChild(opt);
            });
        }
    }

    // 🎚️ ฟังก์ชันประมวลผลเมื่อกดคลิกเลือกสลับแท็บสถานะข้อมูลตาราง (ทั้งหมด / กำลังยืม / คืนแล้ว)
    function switchStatusTab(status) {
        state.tab = status;
        state.page = 1; // ดีดหน้ากลับไปตั้งต้นหน้า 1 เสมอทุกครั้งที่สั่งกรองข้อมูลใหม่
        
        const tabs = document.querySelectorAll('#status-tab-group button');
        tabs.forEach(t => {
            t.className = "px-4 py-1.5 rounded-full text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-all";
        });
        
        const activeTabBtn = document.getElementById(`tab-${status.toLowerCase()}`);
        if (activeTabBtn) {
            activeTabBtn.className = "px-4 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-sm transition-all";
        }

        renderFilteredTable();
    }

    // 🔍 ฟังก์ชันรับคำสืบค้นใน Search Input ช่องสืบค้นเพื่อทำการ Filter ตารางเรียลไทม์
    function handleSearch() {
        const searchBox = document.getElementById('table-search-input');
        state.searchKeyword = (searchBox.value || '').toLowerCase().trim();
        state.page = 1;
        renderFilteredTable();
    }

    // 🟢 โครงข่ายคัดกรองข้อมูลผสานระบบแบ่งหน้าตารางแบบอัตโนมัติ (Search, Filter, Pagination Logic Middleware)
    function renderFilteredTable() {
        const tbody = document.getElementById('borrow-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // ทำการคัดกรองแถวข้อมูลจากฐานข้อมูลแผ่นชีตตามเงื่อนไขแท็บและคำค้นหาหน้างาน
        state.filteredData = state.data.filter(item => {
            const statusRaw = item.Status || item[8] || '';
            const patient = (item.PatientName || item[13] || '').toLowerCase();
            const borrower = (item.BorrowerName || item[1] || '').toLowerCase();
            const eqId = (item.EquipmentID || item[5] || '').toLowerCase();

            let matchStatus = true;
            if (state.tab === 'Borrowed') matchStatus = (statusRaw === 'Borrowed' || statusRaw === 'ยืม');
            if (state.tab === 'Returned') matchStatus = (statusRaw === 'Returned' || statusRaw === 'คืน');

            let matchText = patient.includes(state.searchKeyword) || 
                            borrower.includes(state.searchKeyword) || 
                            eqId.includes(state.searchKeyword);

            return matchStatus && matchText;
        });

        const totalItems = state.filteredData.length;
        const totalPages = Math.ceil(totalItems / state.limit) || 1;
        if (state.page > totalPages) state.page = totalPages;

        const startIdx = (state.page - 1) * state.limit;
        const paginatedItems = state.filteredData.slice(startIdx, startIdx + state.limit);

        const pageInfoLabel = document.getElementById('pagination-info');
        const controlsContainer = document.getElementById('pagination-controls');

        if (paginatedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">❌ ไม่พบประวัติข้อมูลสัญญาใดๆ ตามเงื่อนไขที่ระบุ</td></tr>`;
            if (pageInfoLabel) pageInfoLabel.innerText = "รายการที่ 0-0 จากทั้งหมด 0 รายการ";
            if (controlsContainer) controlsContainer.innerHTML = '';
            return;
        }

        // เริ่มต้นเรนเดอร์จัดวางรายการข้อมูลลงบนโครงแถวตาราง HTML DOM
        paginatedItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-50/50 transition-colors border-b border-slate-100";
            
            const entryId = item.EntryID || item[0];
            const statusRaw = item.Status || item[8];
            const eqId = item.EquipmentID || item[5] || '-';
            const bName = item.BorrowerName || item[1] || '-';
            const pName = item.PatientName || item[13] || '-';
            const comm = item.Community || item[4] || '-';
            const dateStr = item.BorrowDate ? new Date(item.BorrowDate).toLocaleDateString('th-TH') : '-';

            let statusBadge = (statusRaw === 'Borrowed' || statusRaw === 'ยืม') ?
                `<span class="px-2 py-0.5 font-bold text-[10px] rounded-full bg-rose-50 text-rose-700 border border-rose-100">กำลังยืม</span>` :
                `<span class="px-2 py-0.5 font-bold text-[10px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">คืนแล้ว</span>`;

            // จัดชุดคำสั่งสร้างปุ่มพิมพ์ใบยืมสัญญาทางการ และปุ่มตัดยอดรับของคืนเข้าคลังสินค้า
            let actionButtons = `<button onclick="printOfficialReceipt('${entryId}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 px-2.5 py-1 rounded-lg text-xs font-semibold mr-1 transition-colors"><i class="fa-solid fa-print"></i> พิมพ์ใบยืม</button>`;
            
            if (state.isAdmin && (statusRaw === 'Borrowed' || statusRaw === 'ยืม')) {
                actionButtons += `<button onclick="processItemReturn('${entryId}')" class="bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors">รับคืน</button>`;
            }

            tr.innerHTML = `
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-slate-800">${pName}</div>
                    <div class="text-[10px] text-slate-400 font-normal">ผู้ยืม: ${bName} (${comm})</div>
                </td>
                <td class="px-4 py-3 font-mono font-semibold text-slate-600">${eqId}</td>
                <td class="px-4 py-3 text-slate-400">${dateStr}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">${actionButtons}</td>
            `;
            tbody.appendChild(tr);
        });

        if (pageInfoLabel) {
            pageInfoLabel.innerText = `รายการที่ ${startIdx + 1}-${Math.min(startIdx + state.limit, totalItems)} จากทั้งหมด ${totalItems} รายการ (หน้า ${state.page} / ${totalPages})`;
        }

        // บรรจุกลุ่มปุ่มสลับหมายเลขหน้าเพจข้อมูลตารางลงปลายทาง
        if (controlsContainer) {
            controlsContainer.innerHTML = `
                <button onclick="changePage(${state.page - 1})" ${state.page === 1 ? 'disabled class="text-slate-300 cursor-not-allowed px-1.5"' : 'class="text-blue-600 hover:bg-slate-100 px-1.5 rounded"'}>◀ ย้อนกลับ</button>
                <span class="bg-white px-2.5 py-0.5 border border-slate-200 rounded shadow-sm font-bold text-slate-700">${state.page}</span>
                <button onclick="changePage(${state.page + 1})" ${state.page === totalPages ? 'disabled class="text-slate-300 cursor-not-allowed px-1.5"' : 'class="text-blue-600 hover:bg-slate-100 px-1.5 rounded"'}>ถัดไป ▶</button>
            `;
        }
    }

    function changePage(targetPage) {
        state.page = targetPage;
        renderFilteredTable();
    }

    // 🗺️ ฟังก์ชันขึ้นโครงร่างตั้งค่าแผนที่ภูมิสารสนเทศพิกัด Leaflet Maps ดั้งเดิมของระบบ
    function initMap() {
        const mapContainer = document.getElementById('map');
        if (!mapContainer) return;

        // ล็อกจุดศูนย์กลางแผนที่สารสนเทศไว้ที่พิกัดพิกบล็อกเขตอำเภอเกาะคา / ลำปาง
        mapInstance = L.map('map', { scrollWheelZoom: false }).setView([18.235, 99.415], 11);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance);

        markerGroup = L.layerGroup().addTo(mapInstance);
    }

    // 🟢 ดึงข้อมูลพิกัด GPS จากฐานข้อมูลชีตมาแยกชุดข้อมูล แล้วปักหมุดบ้านผู้ป่วยที่กำลังขอยืมอุปกรณ์อยู่
    function updateMapMarkers() {
        if (!markerGroup || !mapInstance) return;
        markerGroup.clearLayers(); // ล้างหมุดพิกัดเดิมออกทั้งหมดเตรียมรอการอัปเดตสเตตัสรอบใหม่

        state.data.forEach(item => {
            const statusRaw = item.Status || item[8];
            const gpsText = item.GPS || item[16] || ''; 

            // กรองทำรายการพล็อตหมุดเฉพาะผู้ป่วยที่ "อยู่ระหว่างการกู้ยืม" และมีการป้อนข้อมูลพิกัดละติจูด-ลองจิจูด
            if (((statusRaw === 'Borrowed' || statusRaw === 'ยืม')) && gpsText.includes(',')) {
                const coordinates = gpsText.split(',');
                const lat = parseFloat(coordinates[0]);
                const lng = parseFloat(coordinates[1]);

                if (!isNaN(lat) && !isNaN(lng)) {
                    const patientName = item.PatientName || item[13] || '-';
                    const equipmentId = item.EquipmentID || item[5] || '-';
                    const communityArea = item.Community || item[4] || '-';
                    const contactPhone = item.Phone || item[12] || '-';

                    // ประกอบฟอร์แมตข้อความขึ้นกล่องหน้าต่าง Tooltip บอลลูนเมื่อคลิกหมุด (Leaflet Infowindow Popup)
                    const tooltipContent = `
                        <div class="text-xs font-sans p-1" style="line-height:1.5;">
                            <div class="font-bold text-blue-700 text-sm mb-1"><i class="fa-solid fa-user-injured mr-1"></i>${patientName}</div>
                            <div class="text-slate-600"><b>รหัสพัสดุ:</b> ${equipmentId}</div>
                            <div class="text-slate-600"><b>พื้นที่หมู่บ้าน:</b> ${communityArea}</div>
                            <div class="text-slate-600 mt-1"><b>เบอร์ติดต่อ:</b> ${contactPhone}</div>
                        </div>
                    `;

                    L.marker([lat, lng]).bindPopup(tooltipContent).addTo(markerGroup);
                }
            }
        });
    }

    // 📄 ฟังก์ชันแกะข้อมูลแถวสัญญายืม เพื่อประจุค่าส่งพิมพ์ตัวกระดาษแบบฟอร์มตรงตามไฟล์ PDF เทศบาลเขลางค์นคร 100%
    function printOfficialReceipt(entryId) {
        const row = state.data.find(r => (r.EntryID || r[0]) === entryId);
        if (!row) return;

        const borrowDateRaw = row.BorrowDate ? new Date(row.BorrowDate) : new Date();
        const dateFormatted = borrowDateRaw.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const returnDeadlineDate = new Date(borrowDateRaw);
        returnDeadlineDate.setMonth(returnDeadlineDate.getMonth() + 6); // ล็อกสัญญาคำนวณวันสิ้นสุดการริบเงินมัดจำครบรอบอายุ 6 เดือนพอดี
        const endDateFormatted = returnDeadlineDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

        const eqId = row.EquipmentID || row[5];
        const matchedEq = state.equipments.find(e => String(e.EquipmentID || e[0]).trim() === String(eqId).trim());
        const displayEquipmentText = matchedEq ? `${matchedEq[1] || matchedEq.EquipmentName} [รหัส: ${matchedEq[0] || matchedEq.EquipmentID}] (S/N: ${matchedEq[2] || matchedEq.SerialNumber})` : eqId;

        // จับคู่อักษรวิ่งไปแมปลงบนแผ่นพิมพ์ใบสัญญากู้ยืมตัวจริงฝั่ง HTML
        document.getElementById('print-borrower-name').innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';
        document.getElementById('print-sign-name').innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';
        document.getElementById('print-receipt-date').innerText = dateFormatted;
        document.getElementById('print-equipment-name').innerText = displayEquipmentText;
        
        document.getElementById('print-loan-start').innerText = dateFormatted;
        document.getElementById('print-loan-end').innerText = endDateFormatted;
        document.getElementById('print-borrower-phone').innerText = row.Phone || row[12] || '-';
        document.getElementById('print-patient-name').innerText = row.PatientName || row[13] || '-';
        document.getElementById('print-patient-relation').innerText = row.Relationship || row[14] || 'ตนเอง';
        document.getElementById('print-equipment-deposit').innerText = row.Deposit || row[15] || '0';

        // ปล่อยกลไกยิงคำสั่งพิมพ์ออกพริ้นเตอร์ของเบราว์เซอร์หน้างาน
        window.print();
    }

    // 📡 ดึงข้อมูลพิกัดละติจูด-ลองจิจูดจากอุปกรณ์เคลื่อนที่ผ่านเครือข่ายดาวเทียม (HTML5 Geolocation Tracking API)
    function getCurrentLocation() {
        if (!navigator.geolocation) { 
            Swal.fire('ระบบไม่รองรับ', 'เครื่องคอมพิวเตอร์หรืออุปกรณ์ของท่านไม่สนับสนุนระบบระบุตำแหน่งพิกัดพิกัดตำแหน่ง', 'error'); 
            return; 
        }
        Swal.fire({ title: 'กำลังดึงพิกัดสัญญาณดาวเทียม...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        navigator.geolocation.getCurrentPosition((pos) => {
            const gpsField = document.getElementById('form-gps');
            if (gpsField) {
                gpsField.value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
            }
            Swal.fire('สำเร็จ', 'บันทึกค่าพิกัดพิกัดสารสนเทศหน้างานเรียบร้อย', 'success');
        }, () => { 
            Swal.fire('พิกัดล้มเหลว', 'ไม่สามารถเชื่อมต่อระบบรับสัญญาณดาวเทียมได้ กรุณาเปิดระบบระบุตำแหน่งพิกัดบนเครื่องก่อนใช้งาน', 'error'); 
        }, { enableHighAccuracy: true });
    }

    // 💾 ฟังก์ชันส่งแบบฟอร์มสัญญายืมเรื่องใหม่ส่งขึ้นไปบันทึกลงแผ่นชีตฐานข้อมูลหลังบ้าน
    async function submitBorrowForm(event) {
        event.preventDefault();
        Swal.fire({ title: 'กำลังบันทึกสัญญายืม...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        const payload = {
            EquipmentID: document.getElementById('form-equipment-id').value,
            PatientName: document.getElementById('form-patient-name').value,
            BorrowerName: document.getElementById('form-borrower-name').value,
            CitizenID: document.getElementById('form-citizen-id').value,
            Phone: document.getElementById('form-phone').value,
            Relationship: document.getElementById('form-relationship').value,
            Community: document.getElementById('form-community').value,
            Address: document.getElementById('form-address').value,
            BorrowDate: document.getElementById('form-borrow-date').value ? new Date(document.getElementById('form-borrow-date').value).toISOString() : new Date().toISOString(),
            Deposit: document.getElementById('form-deposit').value,
            GPS: document.getElementById('form-gps').value.trim(),
            Note: document.getElementById('form-note').value,
            Status: 'Borrowed'
        };

        try {
            const res = await run('addBorrow', payload);
            if (res && res.success) {
                Swal.fire('สำเร็จ', 'บันทึกเอกสารใบสัญญายืมและตัดสต็อกพัสดุในคลังเรียบร้อย', 'success');
                document.getElementById('borrow-form').reset();
                document.getElementById('form-borrow-date').valueAsDate = new Date();
                await loadData();
            } else {
                Swal.fire('เกิดข้อผิดพลาด', res.error || 'ระบบฝั่งหลังบ้านปฏิเสธการเซฟข้อมูล', 'error');
            }
        } catch (error) {
            Swal.fire('ล้มเหลว', 'เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่ายเน็ตเวิร์กเซิร์ฟเวอร์', 'error');
        }
    }

    // 🟢 ฟังก์ชันส่งเรื่องทำรายการตัดยอดรับพัสดุกายอุปกรณ์ส่งคืนกลับเข้าคลังส่วนกลาง
    function processItemReturn(id) {
        Swal.fire({
            title: 'ยืนยันรับคืนอุปกรณ์ทางการแพทย์?',
            text: "ระบบจะอัปเดตสถานะของพัสดุชิ้นนี้ให้กลับมาว่างพร้อมใช้งานสำหรับเคสถัดไปทันที",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันรับคืนคลัง',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.fire({ title: 'กำลังบันทึกตัดสต็อกรับคืนของ...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                try {
                    const res = await run('returnBorrow', { EntryID: id, ReturnDate: new Date().toISOString() });
                    if (res && res.success) {
                        Swal.fire('รับคืนเสร็จสิ้น', 'ครุภัณฑ์พัสดุกลับคืนสถานะพร้อมใช้เรียบร้อยแล้ว', 'success');
                        await loadData();
                    } else {
                        Swal.fire('ข้อผิดพลาด', res.error, 'error');
                    }
                } catch (e) {
                    Swal.fire('ล้มเหลว', 'ไม่สามารถส่งเรื่องสืบค้นติดต่อฐานข้อมูลหลักหลังบ้านได้', 'error');
                }
            }
        });
    }

    // ฟังก์ชันเสริมสำหรับเปิดหน้าต่างโมดอลแอดมินตัวอื่นๆ ตามชุดคำสั่งสถาปัตยกรรมเดิมของคุณ
    function openSettings() { const m = document.getElementById('settings-modal'); if(m) m.classList.remove('hidden'); }
    function openEquipManager() { const m = document.getElementById('equip-modal'); if(m) m.classList.remove('hidden'); }
    function openTrackingReport() { const m = document.getElementById('tracking-modal'); if(m) m.classList.remove('hidden'); }
    function logout() { localStorage.clear(); window.location.reload(); }
