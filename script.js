/**
 * ระบบบริหารจัดการยืมคืนอุปกรณ์การแพทย์ - Frontend Controller API (v2.2)
 * พัฒนาโดย: ศบส.บ้านโทกหัวช้าง (James)
 */

const API_URL = "https://script.google.com/macros/s/AKfycbxERwiPD6tyzSpZMs9P1SITIYMbm_3ildTzexALzyXa9aKDtLxpwYXDPFxz8Rzfih4LIA/exec"; 

const DEFAULT_LOGO = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"><rect width="120" height="120" rx="30" fill="%23e0e7ff"/><circle cx='60' cy='60' r='40' fill='%234f46e5'/><path d="M60 42v36M42 60h36" stroke="white" stroke-width="10" stroke-linecap="round"/></svg>';
    console.log("ระบบคลังและสารสนเทศภูมิศาสตร์ศูนย์กายอุปกรณ์ทางการแพทย์ v2.2 เริ่มทำงาน...");

    // 📁 ชุดตัวแปร Global State ของระบบเดิม ผสานตัวแปรควบคุมแผนที่และแบ่งหน้าตาราง
    let state = { 
        isAdmin: false, 
        adminId: '', 
        adminName: '', 
        data: [], 
        publics: [], 
        equipments: [], 
        filteredData: [],
        page: 1, 
        limit: 15, // กำหนดแสดงแถวข้อมูลสัญญาในตารางสูงสุด 15 รายการต่อหนึ่งหน้าเพจ
        tab: 'all', 
        searchKeyword: '',
        editingId: null 
    };

    // ตัวแปรพาร์ทควบคุมแผนที่ Leaflet Maps ของระบบดั้งเดิม
    let mapInstance = null;
    let markerGroup = null; // ใช้สำหรับเคลียร์และจัดกลุ่มหมุดพิกัดผู้ป่วย

    // 🟢 ฟังก์ชันส่งข้อมูลติดต่อฝั่งเซิร์ฟเวอร์หลังบ้านผ่าน Native google.script.run ของโปรเจกต์คุณ
    function run(action, payload = {}) {
        return new Promise((resolve, reject) => {
            if (localStorage.getItem('adminToken')) {
                payload.token = localStorage.getItem('adminToken');
            }
            google.script.run
                .withSuccessHandler(res => { 
                    if (res && res.needLogin) { 
                        logout(); 
                        resolve({ success: false, error: 'สิทธิ์การใช้งานหมดอายุ กรุณาล็อกอินใหม่' }); 
                    } else { 
                        resolve(res); 
                    } 
                })
                .withFailureHandler(err => {
                    console.error("ระบบ GAS หลังบ้านเกิดข้อผิดพลาด:", err);
                    reject(err);
                })
                .clientHandler(action, payload);
        });
    }

    // 🎬 ฟังก์ชันจุดสตาร์ทระบบเมื่อโหลดหน้า DOM ของเว็บไซต์เสร็จสิ้น
    document.addEventListener('DOMContentLoaded', async () => {
        // ตรวจสอบข้อมูล Session การเข้าสู่ระบบจาก LocalStorage ดั้งเดิม
        if (localStorage.getItem('adminToken')) { 
            state.isAdmin = true; 
            state.adminId = localStorage.getItem('adminId') || ''; 
            state.adminName = localStorage.getItem('adminName') || state.adminId; 
        }
        
        // อัปเดตสิทธิ์การมองเห็น Layout หน้าเว็บทันที
        updateAuth(); 
        
        // สั่งสร้างโครงข่ายแผนที่ Leaflet เตรียมรอรับพิกัด
        initMap();

        // โหลดข้อมูลจากแผ่น Google Sheets ทั้งหมด
        await loadData();

        // กำหนดวันที่ในฟอร์มบันทึกให้ล็อกไว้ที่วันปัจจุบันเป็นค่าเริ่มต้น
        const datePicker = document.getElementById('borrow-date') || document.getElementById('form-borrow-date');
        if (datePicker) {
            datePicker.valueAsDate = new Date();
        }
    });

    // 📥 ฟังก์ชันซิงค์โหลดฐานข้อมูลหลัก 3 แผ่นจากฝั่งหลังบ้านพร้อมกัน
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
            updateMapMarkers(); // สั่งพล็อตหมุดตำแหน่งผู้ป่วยลงบนแผนที่สารสนเทศ
        } catch (e) {
            console.error("โหลดสัญญาล้มเหลว:", e);
        }
    }

    // 🔒 ฟังก์ชันสลับมุมมองหน้าเว็บ (Auth Visibility) ปิด-เปิดฟอร์มยืมฝั่งซ้ายมือตามเงื่อนไขแอดมินของคุณ
    function updateAuth() {
        const borrowFormBlock = document.getElementById('borrow-form-card') || document.getElementById('borrow-form-block');
        const guestWelcomeBlock = document.getElementById('guest-welcome') || document.getElementById('guest-welcome-block');
        const btnAdminEquip = document.getElementById('btn-manage-equip') || document.getElementById('btn-admin-equip');
        const btnAdminSettings = document.getElementById('btn-settings') || document.getElementById('btn-admin-settings');
        const adminPanel = document.getElementById('admin-panel'); 
        const btnLoginShow = document.getElementById('btn-login-show');

        if (state.isAdmin) {
            // กรณีแอดมินผ่านสิทธิ์ -> ซ่อนการ์ดต้อนรับแขกทั่วไป แล้วสไลด์ฟอร์มบันทึกข้อมูลสัญญายืมฝั่งซ้ายมือขึ้นมาทันที
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
            // กรณีผู้มาเยือนทั่วไป -> ปิดล็อกซ่อนฟอร์มสัญญายืมฝั่งซ้ายมือ และเปิดกล่องข้อความต้อนรับประชาชนทั่วไปมาแสดงแทน
            if (borrowFormBlock) borrowFormBlock.classList.add('hidden');
            if (guestWelcomeBlock) guestWelcomeBlock.classList.remove('hidden');
            if (btnAdminEquip) btnAdminEquip.classList.add('hidden');
            if (btnAdminSettings) btnAdminSettings.classList.add('hidden');
            if (adminPanel) adminPanel.classList.add('hidden');
            if (btnLoginShow) btnLoginShow.classList.remove('hidden');
        }
    }

    // ⚙️ ฟังก์ชันนำชื่อหน่วยงานหรือหัวเว็บจากแผ่นชีต Publics มาตั้งค่าให้กับระบบบราวเซอร์และพาร์ทใบพิมพ์
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
        
        const printAgency = document.getElementById('print-agency-title') || document.getElementById('print-agency-name');
        if (printAgency) printAgency.innerText = agency2;
    }

    // 📊 ฟังก์ชันคำนวณสถิติจำนวนรวม เพื่อนำไปประจุลงการ์ดแดชบอร์ด 4 ใบด้านบน
    function calculateStats() {
        const total = state.equipments.length;
        const borrowed = state.data.filter(b => (b.Status || b[8]) === 'Borrowed' || (b.Status || b[8]) === 'ยืม').length;
        const available = total - borrowed;

        const tCard = document.getElementById('card-total-eq') || document.getElementById('stat-total-eq');
        const aCard = document.getElementById('card-avail-eq') || document.getElementById('stat-avail-eq');
        const bCard = document.getElementById('card-borrow-eq') || document.getElementById('stat-borrow-eq');
        const lCard = document.getElementById('card-total-logs') || document.getElementById('stat-total-logs');

        if (tCard) tCard.innerText = `${total} ชิ้น`;
        if (aCard) aCard.innerText = `${available >= 0 ? available : 0} ชิ้น`;
        if (bCard) bCard.innerText = `${borrowed} ชิ้น`;
        if (lCard) lCard.innerText = `${state.data.length} ครั้ง`;
    }

    // 📥 ดึงชื่อพัสดุและรายชื่อกลุ่มหมู่บ้านชุมชนมาหยอดลงช่องดรอปดาวน์ฟอร์มขอยืมอุปกรณ์
    function populateFormDropdowns() {
        const selectEq = document.getElementById('equipment-id') || document.getElementById('form-equipment-id');
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

        const selectComm = document.getElementById('community-select') || document.getElementById('form-community');
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

    // 🎚️ ฟังก์ชันควบคุมปุ่มการกดสลับแท็บเพื่อกรองข้อมูลในหน้าตารางประวัติ (ทั้งหมด / กำลังยืม / คืนแล้ว)
    function filterTab(status, btnElement) {
        state.tab = status;
        state.page = 1; // รีเซ็ตหน้าตารางให้กลับไปเริ่มต้นหน้า 1 ทุกครั้งที่กดกรองสลับแท็บ
        
        const tabs = document.querySelectorAll('#borrow-tabs button') || document.querySelectorAll('#status-tab-group button');
        tabs.forEach(t => {
            t.className = "px-4 py-1.5 rounded-full text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-all";
        });
        
        if (btnElement) {
            btnElement.className = "px-4 py-1.5 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-sm transition-all";
        }

        renderFilteredTable();
    }

    // ฟังก์ชันเชื่อมแท็บสถานะสลับพอร์ตเรียกงาน
    function switchStatusTab(status) {
        const activeBtn = document.getElementById(`tab-${status.toLowerCase()}`);
        filterTab(status, activeBtn);
    }

    // 🔍 ฟังก์ชันจับคำสืบค้นใน Search Bar เพื่อกรองตารางแบบเรียลไทม์
    function handleSearch() {
        const searchBox = document.getElementById('search-input') || document.getElementById('table-search-input');
        state.searchKeyword = (searchBox.value || '').toLowerCase().trim();
        state.page = 1;
        renderFilteredTable();
    }

    function triggerSearch() {
        handleSearch();
    }

    // 🟢 ตรรกะประมวลผลจัดกลุ่มคัดกรอง ร่วมกับระบบคุมหน้าแสดงผลตาราง (Search, Filter, Pagination Middleware)
    function renderFilteredTable() {
        const tbody = document.getElementById('table-body') || document.getElementById('borrow-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // ทำการคัดกรองแถวข้อมูลจากฐานข้อมูลแผ่นชีตตามเงื่อนไขแท็บและคำค้นหา
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

        const pageInfoLabel = document.getElementById('page-info') || document.getElementById('pagination-info');
        const controlsContainer = document.getElementById('pagination') || document.getElementById('pagination-controls');

        if (paginatedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-gray-400">❌ ไม่พบประวัติข้อมูลสัญญาใดๆ ตามเงื่อนไขค้นหา</td></tr>`;
            if (pageInfoLabel) pageInfoLabel.innerText = "รายการที่ 0-0 จากทั้งหมด 0 รายการ";
            if (controlsContainer) controlsContainer.innerHTML = '';
            return;
        }

        // วาดแถวรายการข้อมูลลงตารางทีละบรรทัดอย่างละเอียด
        paginatedItems.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-gray-50/50 transition-colors border-b border-gray-100";
            
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

            // ดึงกลุ่มปุ่มพิมพ์เอกสารสัญญา และปุ่มทำรายการรับของคืนคลังสำหรับ Admin
            let actionButtons = `<button onclick="printOfficialReceipt('${entryId}')" class="bg-blue-50 hover:bg-blue-100 text-blue-600 px-2 py-1 rounded-lg text-xs font-semibold mr-1 transition-colors"><i class="fa-solid fa-print"></i> พิมพ์ใบยืม</button>`;
            
            if (state.isAdmin && (statusRaw === 'Borrowed' || statusRaw === 'ยืม')) {
                actionButtons += `<button onclick="processItemReturn('${entryId}')" class="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded-lg text-xs font-semibold transition-colors">รับคืน</button>`;
            }

            tr.innerHTML = `
                <td class="px-4 py-3">${statusBadge}</td>
                <td class="px-4 py-3">
                    <div class="font-semibold text-gray-800">${pName}</div>
                    <div class="text-[10px] text-gray-400 font-normal">ผู้ยืม: ${bName} (${comm})</div>
                </td>
                <td class="px-4 py-3 font-mono font-semibold text-gray-600">${eqId}</td>
                <td class="px-4 py-3 text-gray-400">${dateStr}</td>
                <td class="px-4 py-3 text-right whitespace-nowrap">${actionButtons}</td>
            `;
            tbody.appendChild(tr);
        });

        if (pageInfoLabel) {
            pageInfoLabel.innerText = `รายการที่ ${startIdx + 1}-${Math.min(startIdx + state.limit, totalItems)} จากทั้งหมด ${totalItems} รายการ (หน้า ${state.page} / ${totalPages})`;
        }

        // สร้างปุ่มเลขสลับควบคุมหน้าตารางเพจย้อนกลับ-ถัดไป
        if (controlsContainer) {
            controlsContainer.innerHTML = `
                <button onclick="changePage(${state.page - 1})" ${state.page === 1 ? 'disabled class="text-gray-300 cursor-not-allowed px-1"' : 'class="text-blue-600 hover:bg-gray-100 px-1 rounded"'}>◀ ย้อนกลับ</button>
                <span class="bg-white px-2.5 py-0.5 border rounded shadow-sm font-bold text-gray-700">${state.page}</span>
                <button onclick="changePage(${state.page + 1})" ${state.page === totalPages ? 'disabled class="text-gray-300 cursor-not-allowed px-1"' : 'class="text-blue-600 hover:bg-gray-100 px-1 rounded"'}>ถัดไป ▶</button>
            `;
        }
    }

    function changePage(targetPage) {
        state.page = targetPage;
        renderFilteredTable();
    }

    function setPage(targetPage) {
        changePage(targetPage);
    }

    // 🗺️ ฟังก์ชันเริ่มต้นระเบียบพิกัดแผนที่สารสนเทศภูมิศาสตร์ Leaflet Maps
    function initMap() {
        const mapDiv = document.getElementById('map');
        if (!mapDiv) return; // ข้ามฟังก์ชันถ้าหากหน้า HTML หน้าไหนไม่มีกล่องรองรับไอดีแผนที่

        // สร้างศูนย์กลางแผนที่ล็อกไว้ที่พิกัดพิกบล็อกเขตอำเภอเกาะคา / เทศบาลเมืองเขลางค์นคร ลำปาง
        mapInstance = L.map('map', { scrollWheelZoom: false }).setView([18.235, 99.415], 11);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(mapInstance);

        markerGroup = L.layerGroup().addTo(mapInstance);
    }

    // 🟢 ฟังก์ชันแกะพิกัดดาวเทียม (GPS) จากคอลัมน์ใบยืม เพื่อนำไปปักหมุดบ้านผู้ป่วยที่ขอยืมครุภัณฑ์อยู่จริง
    function updateMapMarkers() {
        if (!markerGroup || !mapInstance) return;
        markerGroup.clearLayers(); // เคลียร์หมุดเดิมออกทั้งหมดเพื่อเตรียมอัปเดตสเตตัสสดใหม่

        state.data.forEach(item => {
            const statusRaw = item.Status || item[8];
            const gpsText = item.GPS || item[16] || ''; // คิวรี่ฟิลด์ GPS ลำดับสุดท้าย

            // ปักหมุดเฉพาะเคสที่ "อยู่ระหว่างการยืม" และมีการบันทึกค่าพิกัดพิกัดละติจูด-ลองจิจูด
            if (((statusRaw === 'Borrowed' || statusRaw === 'ยืม')) && gpsText.includes(',')) {
                const parts = gpsText.split(',');
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);

                if (!isNaN(lat) && !isNaN(lng)) {
                    const pName = item.PatientName || item[13] || '-';
                    const eqId = item.EquipmentID || item[5] || '-';
                    const comm = item.Community || item[4] || '-';
                    const phone = item.Phone || item[12] || '-';

                    // สลักข้อมูลรายละเอียดพัดลงในกล่องหน้าต่างป็อปอัพ (Map InfoWindow Popup)
                    const popupContent = `
                        <div class="text-xs font-sans p-1">
                            <div class="font-bold text-blue-800 text-sm mb-1"><i class="fa-solid fa-user-injured mr-1"></i>${pName}</div>
                            <div class="text-gray-600"><b>ครุภัณฑ์:</b> ${eqId}</div>
                            <div class="text-gray-600"><b>พื้นที่:</b> ${comm}</div>
                            <div class="text-gray-600 mt-1"><b>เบอร์โทร:</b> ${phone}</div>
                        </div>
                    `;

                    L.marker([lat, lng]).bindPopup(popupContent).addTo(markerGroup);
                }
            }
        });
    }

    // 📄 ฟังก์ชันแกะสแนปช็อตข้อมูล เพื่อจัดวางแบบฟอร์มเอกสารสัญญาพิมพ์ออกเครื่องพิมพ์ตรงตาม PDF 100%
    function printOfficialReceipt(entryId) {
        const row = state.data.find(r => (r.EntryID || r[0]) === entryId);
        if (!row) return;

        const borrowDateRaw = row.BorrowDate ? new Date(row.BorrowDate) : new Date();
        const dateFormatted = borrowDateRaw.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        
        const returnDeadlineDate = new Date(borrowDateRaw);
        returnDeadlineDate.setMonth(returnDeadlineDate.getMonth() + 6); // สัญญาสิ้นสุดประกันการคืนเงินมัดจำเมื่ออายุการขอยืมก้าวข้าม 6 เดือนเต็มพอดี
        const endDateFormatted = returnDeadlineDate.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

        const eqId = row.EquipmentID || row[5];
        const matchedEq = state.equipments.find(e => String(e.EquipmentID || e[0]).trim() === String(eqId).trim());
        const displayEquipmentText = matchedEq ? `${matchedEq[1] || matchedEq.EquipmentName} [รหัส: ${matchedEq[0] || matchedEq.EquipmentID}] (S/N: ${matchedEq[2] || matchedEq.SerialNumber})` : eqId;

        // ผูกตัวอักษรเข้าหากระดาษแบบฟอร์มพิมพ์สัญญาฝั่ง HTML
        const pBorrower = document.getElementById('print-borrower') || document.getElementById('print-borrower-name');
        const pPhone = document.getElementById('print-phone') || document.getElementById('print-borrower-phone');
        const pPatient = document.getElementById('print-patient') || document.getElementById('print-patient-name');
        const pRelation = document.getElementById('print-relation') || document.getElementById('print-patient-relation');
        const pEquipment = document.getElementById('print-equipment') || document.getElementById('print-equipment-name');
        const pDeposit = document.getElementById('print-deposit') || document.getElementById('print-equipment-deposit');
        const pDate = document.getElementById('print-date') || document.getElementById('print-receipt-date');
        const pStart = document.getElementById('print-start-date') || document.getElementById('print-loan-start');
        const pEnd = document.getElementById('print-end-date') || document.getElementById('print-loan-end');
        const pSignName = document.getElementById('print-sign-borrower') || document.getElementById('print-sign-name');

        if(pBorrower) pBorrower.innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';
        if(pPhone) pPhone.innerText = row.Phone || row[12] || '-';
        if(pPatient) pPatient.innerText = row.PatientName || row[13] || '-';
        if(pRelation) pRelation.innerText = row.Relationship || row[14] || 'ตนเอง';
        if(pEquipment) pEquipment.innerText = displayEquipmentText;
        if(pDeposit) pDeposit.innerText = row.Deposit || row[15] || '0';
        if(pDate) pDate.innerText = dateFormatted;
        if(pStart) pStart.innerText = dateFormatted;
        if(pEnd) pEnd.innerText = endDateFormatted;
        if(pSignName) pSignName.innerText = row.BorrowerName || row.PatientName || row[1] || row[13] || '-';

        // ปล่อยคำสั่งพิมพ์ของตัวเบราว์เซอร์หน้างานทันที
        window.print();
    }

    function printLoanReceipt(entryId) {
        printOfficialReceipt(entryId);
    }

    // 📡 ดึงข้อมูลพิกัดภูมิศาสตร์ดาวเทียมหน้างาน (HTML5 Geolocation Mobile System API)
    function getCurrentLocation() {
        if (!navigator.geolocation) { 
            Swal.fire('ไม่รองรับ', 'อุปกรณ์ควบคุมระบบของท่านไม่สนับสนุนเสาระบุตำแหน่งพิกัด', 'error'); 
            return; 
        }
        Swal.fire({ title: 'กำลังจับพิกัดเสาดาวเทียม...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        navigator.geolocation.getCurrentPosition((pos) => {
            const gpsField = document.getElementById('borrow-gps') || document.getElementById('form-gps');
            if (gpsField) {
                gpsField.value = `${pos.coords.latitude}, ${pos.coords.longitude}`;
            }
            Swal.fire('สำเร็จ', 'บันทึกค่าพิกัดละติจูด ลองจิจูด เรียบร้อย', 'success');
        }, () => { 
            Swal.fire('พิกัดล้มเหลว', 'กรุณาเปิดระบบระบุตำแหน่งพิกัดตำแหน่งบนเครื่องโทรศัพท์ของท่านก่อนใช้งาน', 'error'); 
        }, { enableHighAccuracy: true });
    }

    // 💾 ฟังก์ชันส่งแบบฟอร์มสัญญายืมเรื่องใหม่กลับขึ้นไปบันทึกลงฐานข้อมูลหลังบ้าน
    async function submitBorrowForm(event) {
        event.preventDefault();
        Swal.fire({ title: 'กำลังบันทึกสัญญายืม...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        const eqVal = document.getElementById('equipment-id') || document.getElementById('form-equipment-id');
        const patVal = document.getElementById('patient-name') || document.getElementById('form-patient-name');
        const borVal = document.getElementById('borrower-name') || document.getElementById('form-borrower-name');
        const citVal = document.getElementById('citizen-id') || document.getElementById('form-citizen-id');
        const phnVal = document.getElementById('phone') || document.getElementById('form-phone');
        const relVal = document.getElementById('relationship') || document.getElementById('form-relationship');
        const comVal = document.getElementById('community-select') || document.getElementById('form-community');
        const adrVal = document.getElementById('address') || document.getElementById('form-address');
        const datVal = document.getElementById('borrow-date') || document.getElementById('form-borrow-date');
        const depVal = document.getElementById('deposit') || document.getElementById('form-deposit');
        const gpsVal = document.getElementById('borrow-gps') || document.getElementById('form-gps');
        const nteVal = document.getElementById('borrow-note') || document.getElementById('form-note');

        const payload = {
            EquipmentID: eqVal ? eqVal.value : '',
            PatientName: patVal ? patVal.value : '',
            BorrowerName: borVal ? borVal.value : '',
            CitizenID: citVal ? citVal.value : '',
            Phone: phnVal ? phnVal.value : '',
            Relationship: relVal ? relVal.value : '',
            Community: comVal ? comVal.value : '',
            Address: adrVal ? adrVal.value : '',
            BorrowDate: datVal && datVal.value ? new Date(datVal.value).toISOString() : new Date().toISOString(),
            Deposit: depVal ? depVal.value : '0',
            GPS: gpsVal ? gpsVal.value.trim() : '',
            Note: nteVal ? nteVal.value : '',
            Status: 'Borrowed'
        };

        try {
            const res = await run('addBorrow', payload);
            if (res && res.success) {
                Swal.fire('สำเร็จ', 'บันทึกใบยืมและหักตัดสต็อกยอดพัสดุเรียบร้อย', 'success');
                const mainForm = document.getElementById('borrow-form');
                if (mainForm) mainForm.reset();
                if (datVal) datVal.valueAsDate = new Date();
                await loadData();
            } else {
                Swal.fire('เกิดข้อผิดพลาด', res.error || 'ระบบปฏิเสธการเซฟบันทึก', 'error');
            }
        } catch (error) {
            Swal.fire('ล้มเหลว', 'เชื่อมต่อเซิร์ฟเวอร์ฐานข้อมูลขัดข้อง', 'error');
        }
    }

    // 🟢 ฟังก์ชันส่งเรื่องบันทึกรับสิ่งของอุปกรณ์ส่งคืนกลับเข้าคลังส่วนกลาง
    function processItemReturn(id) {
        Swal.fire({
            title: 'ยืนยันรับคืนอุปกรณ์ทางการแพทย์?',
            text: "ระบบจะอัปเดตสเตตัสในคลังสินค้าเพื่อให้ชิ้นพัสดุชิ้นนี้กลับมาว่างพร้อมใช้ของคนถัดไปทันที",
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'ยืนยันการรับคืน',
            cancelButtonText: 'ยกเลิก'
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.fire({ title: 'กำลังอัปเดตสต็อกรับคืนสินค้า...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                try {
                    const res = await run('returnBorrow', { EntryID: id, ReturnDate: new Date().toISOString() });
                    if (res && res.success) {
                        Swal.fire('รับคืนสำเร็จ', 'อุปกรณ์ทางการแพทย์กลับสถานะว่างพร้อมใช้งานแล้ว', 'success');
                        await loadData();
                    } else {
                        Swal.fire('ข้อผิดพลาด', res.error, 'error');
                    }
                } catch (e) {
                    Swal.fire('ล้มเหลว', 'ไม่สามารถส่งสัญญาณติดต่อปลายทางได้', 'error');
                }
            }
        });
    }

    function processReturnItem(id) {
        processItemReturn(id);
    }

    // 🚪 หน้าต่างฟังก์ชันสวิตช์เปิด-ปิด โหมดกล่องโมดอลงานส่วนควบคุมเจ้าหน้าที่อื่นๆ ของระบบเดิมของคุณ
    function openSettings() { const m = document.getElementById('settings-modal'); if(m) m.classList.remove('hidden'); }
    function openEquipManager() { const m = document.getElementById('equip-modal'); if(m) m.classList.remove('hidden'); }
    function openTrackingReport() { const m = document.getElementById('tracking-modal'); if(m) m.classList.remove('hidden'); }
    function logout() { localStorage.clear(); window.location.reload(); }
