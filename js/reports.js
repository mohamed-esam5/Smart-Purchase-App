/* js/reports.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الواجهة
const logoutBtn = document.getElementById('logout-btn');
const filterPerson = document.getElementById('filter-person');
const filterPaymentMethod = document.getElementById('filter-payment-method'); // ✨ العنصر الجديد
const filterMonth = document.getElementById('filter-month');
const filterYear = document.getElementById('filter-year');
const btnResetFilters = document.getElementById('btn-reset-filters');

const reportsTableBody = document.getElementById('reports-table-body');
const filteredTotalAmount = document.getElementById('filtered-total-amount');
const filteredCount = document.getElementById('filtered-count');

let currentUserId = null;
let allBills = []; // لتخزين الفواتير محلياً للفلترة السريعة

// 🛡️ فحص الحماية والأمان (Route Guard)
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        currentUserId = user.uid;
        // تشغيل التحميل بالترتيب الصحيح لضمان استقرار الواجهة
        await loadPersonsInFilter();
        await fetchAllBills();
    }
});

// 👥 جلب الأشخاص وتعبئة قائمة الفلترة
async function loadPersonsInFilter() {
    if (!currentUserId || !filterPerson) return;
    try {
        const personsRef = collection(db, 'users', currentUserId, 'persons');
        const querySnapshot = await getDocs(personsRef);
        
        // تصفير القائمة وترك الخيار الافتراضي
        filterPerson.innerHTML = '<option value="all">كل الأشخاص</option>';
        
        querySnapshot.forEach((doc) => {
            const person = doc.data();
            if (person.name) {
                const option = document.createElement('option');
                option.value = person.name.trim();
                option.textContent = person.name.trim();
                filterPerson.appendChild(option);
            }
        });
    } catch (error) {
        console.error("خطأ في تحميل أسماء الأشخاص بداخل الفلتر: ", error);
    }
}

// 📥 جلب كل الفواتير من السيرفر
async function fetchAllBills() {
    if (!currentUserId || !reportsTableBody) return;
    try {
        reportsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--primary-color, #1e3c72); padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> جاري جلب البيانات من السيرفر...</td></tr>`;
        
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        const querySnapshot = await getDocs(billsRef);
        
        allBills = [];
        querySnapshot.forEach((doc) => {
            allBills.push({ id: doc.id, ...doc.data() });
        });

        // تشغيل الفلترة لأول مرة لعرض البيانات فوراً بعد التحميل
        applyFilters(); 

    } catch (error) {
        console.error("خطأ في جلب الفواتير للتقارير: ", error);
        reportsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--status-unpaid-text, #d9534f); padding: 20px;">حدث خطأ أثناء سحب البيانات.</td></tr>`;
    }
}

// 🔍 محرك الفلترة الذكي والمطور (مع دعم فلترة طرق الدفع واستبعاد المؤرشف)
function applyFilters() {
    if (!filterPerson || !filterPaymentMethod || !filterMonth || !filterYear) return;

    const selectedPerson = filterPerson.value.trim();
    const selectedMethod = filterPaymentMethod.value;
    const selectedMonth = filterMonth.value;
    const selectedYear = filterYear.value;

    let filteredList = allBills.filter(bill => {
        // 🛡️ استبعاد الفواتير المؤرشفة من التقارير المالية النشطة
        if (bill.archived === true) return false;

        // 1. الفلترة المرنة حسب الشخص
        let matchPerson = true;
        if (selectedPerson !== 'all') {
            if (bill.breakdown && typeof bill.breakdown === 'object') {
                const keys = Object.keys(bill.breakdown).map(k => k.trim());
                matchPerson = keys.includes(selectedPerson);
            } else {
                matchPerson = (bill.person && bill.person.trim() === selectedPerson);
            }
        }

        // ✨ 2. الفلترة المتقدمة حسب طريقة دفع الفاتورة الأصلية (دعم صيغ متعددة)
        let matchMethod = true;
        if (selectedMethod !== 'all') {
            const billMethod = bill.paymentMethod || '';
            if (selectedMethod === 'Credit Card') {
                matchMethod = (billMethod === 'Credit Card');
            } else if (selectedMethod === 'Cash') {
                matchMethod = (billMethod === 'Cash' || billMethod === 'كاش');
            } else if (selectedMethod === 'InstaPay') {
                matchMethod = (billMethod === 'InstaPay');
            }
        }

        // تحليل تاريخ الشراء الموحد (صيغته: YYYY-MM-DD)
        let billYear = '';
        let billMonth = '';
        if (bill.purchaseDate) {
            const dateParts = bill.purchaseDate.split('-'); // [YYYY, MM, DD]
            billYear = dateParts[0] || '';
            billMonth = dateParts[1] || '';
        }

        // 3. الفلترة حسب الشهر
        let matchMonth = true;
        if (selectedMonth !== 'all') {
            matchMonth = (billMonth === selectedMonth);
        }

        // 4. الفلترة حسب السنة
        let matchYear = true;
        if (selectedYear !== 'all') {
            matchYear = (billYear === selectedYear);
        }

        return matchPerson && matchMethod && matchMonth && matchYear;
    });

    // ترتيب تنازلي من الأحدث شراءً إلى الأقدم
    filteredList.sort((a, b) => {
        const timeA = a.purchaseDate ? new Date(a.purchaseDate).getTime() : 0;
        const timeB = b.purchaseDate ? new Date(b.purchaseDate).getTime() : 0;
        return timeB - timeA;
    });

    // إرسال البيانات المفلترة للجدول وعرضها
    renderFilteredBills(filteredList, selectedPerson);
}

// 📊 عرض البيانات المفلترة وحساب المبالغ المخصصة بدقة محاسبية متناهية
function renderFilteredBills(list, selectedPerson) {
    if (!reportsTableBody) return;
    reportsTableBody.innerHTML = '';
    let totalSum = 0;

    if (list.length === 0) {
        reportsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-muted, #999); padding: 30px;">لا توجد فواتير نشطة مطابقة للفلاتر المختارة حالياً.</td></tr>`;
        if (filteredTotalAmount) filteredTotalAmount.textContent = "0.00 ج.م";
        if (filteredCount) filteredCount.textContent = "0 فاتورة";
        return;
    }

    list.forEach(bill => {
        const row = document.createElement('tr');
        
        let displayedAmountHtml = '';
        let breakdownHtml = '';
        let billAmount = parseFloat(bill.amount || 0);

        if (bill.breakdown && typeof bill.breakdown === 'object' && Object.keys(bill.breakdown).length > 0) {
            // [نمط مطور]: فاتورة موزعة على أطراف متعددة
            breakdownHtml = Object.entries(bill.breakdown).map(([name, amt]) => {
                const trimmedName = name.trim();
                let originalShare = parseFloat(amt || 0);
                let paidSoFar = (bill.partiallyPaid && bill.partiallyPaid[name]) ? parseFloat(bill.partiallyPaid[name]) : 0;
                let remainingShare = originalShare - paidSoFar;

                let remainingClass = remainingShare <= 0 ? 'status-badge-paid' : 'status-badge-unpaid';
                let remainingText = remainingShare <= 0 ? 'خالص ✓' : `${remainingShare.toFixed(2)} ج.م`;

                let isTargetStyle = trimmedName === selectedPerson 
                    ? 'border: 1px solid var(--primary-color, #1e3c72); background: var(--bg-muted, #eef2f7); font-weight: bold;' 
                    : 'background: var(--card-bg-nested, #f8f9fa); color: var(--text-color);';

                return `<div style="font-size:11px; margin-bottom:4px; padding:4px 6px; border-radius:4px; ${isTargetStyle}">
                            <strong>👤 ${trimmedName}:</strong> ${originalShare.toFixed(2)} ج.م 
                            <br><small class="${remainingClass}" style="display:inline-block; margin-top:2px; font-weight:600;">(متبقي: ${remainingText})</small>
                        </div>`;
            }).join('');

            if (selectedPerson !== 'all') {
                // الفلترة لشخص معين: نظهر نصيبه الفردي ونجمعه بالحسبة الإجمالية
                let personShare = parseFloat(bill.breakdown[selectedPerson] || 0);
                displayedAmountHtml = `
                    <span style="color: var(--primary-color, #1e3c72); display:block; font-size:13px; font-weight:700;">نصيب الفرد: ${personShare.toFixed(2)} ج.م</span>
                    <span style="font-size:11px; color: var(--text-muted, #777); font-weight:400;">إجمالي الفاتورة: ${billAmount.toFixed(2)} ج.م</span>
                `;
                totalSum += personShare;
            } else {
                // عرض كل الأشخاص: نظهر الإجمالي ونجمعه مباشرة
                displayedAmountHtml = `<span style="font-weight:700; color: var(--primary-color, #1e3c72);">${billAmount.toFixed(2)} ج.م</span>`;
                totalSum += billAmount;
            }
        } else {
            // [نمط تقليدي تراجعي]: شخص واحد يملك الفاتورة بالكامل
            const pName = (bill.person || 'غير محدد').trim();
            breakdownHtml = `<div class="status-badge-neutral" style="padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600;">👤 ${pName}</div>`;
            displayedAmountHtml = `<span style="font-weight:700; color: var(--primary-color, #1e3c72);">${billAmount.toFixed(2)} ج.م</span>`;
            
            if (selectedPerson === 'all' || pName === selectedPerson) {
                totalSum += billAmount;
            }
        }

        // شارات الحالة المحاسبية المحدثة للتقارير الجارية
        let statusBadge = bill.status === 'مدفوع' 
            ? `<span class="badge status-badge-paid-solid">مدفوع بالكامل</span>` 
            : `<span class="badge status-badge-unpaid-solid">تحت السداد</span>`;

        // صياغة شكل شارة طريقة الدفع للعمود المخصص الجديد في جدول التقارير
        let methodBadge = '';
        const billMethod = bill.paymentMethod || 'كاش';
        if (billMethod === 'InstaPay') {
            methodBadge = `<span class="badge payment-instapay" style="font-size:12px; padding:4px 8px;"><i class="fa-solid fa-mobile-screen-button"></i> InstaPay</span>`;
        } else if (billMethod === 'Credit Card') {
            methodBadge = `<span class="badge payment-credit" style="font-size:12px; padding:4px 8px;"><i class="fa-solid fa-credit-card"></i> Credit Card</span>`;
        } else {
            methodBadge = `<span class="badge payment-cash" style="font-size:12px; padding:4px 8px;"><i class="fa-solid fa-money-bill-wave"></i> كاش</span>`;
        }

        // بناء الصف متوافقاً مع ترتيب أعمدة HTML الجديدة:
        // 1. البيان | 2. توزيع الحساب | 3. المبلغ | 4. تاريخ الشراء | 5. طريقة الدفع | 6. الحالة
        row.innerHTML = `
            <td><strong style="color: var(--text-color);">${bill.title || 'بدون بيان'}</strong></td>
            <td>${breakdownHtml}</td>
            <td>${displayedAmountHtml}</td>
            <td style="color: var(--text-color);">${bill.purchaseDate || '---'}</td>
            <td>${methodBadge}</td>
            <td>${statusBadge}</td>
        `;
        reportsTableBody.appendChild(row);
    });

    // تحديث كروت الإحصائيات العلوية مع علاج كسور الـ Floating Points
    if (filteredTotalAmount) filteredTotalAmount.textContent = `${(Math.round(totalSum * 100) / 100).toFixed(2)} ج.م`;
    if (filteredCount) filteredCount.textContent = `${list.length} فاتورة`;
}

// ربط مستمعي التغيير بالفلاتر حياً (شاملاً الفلتر الجديد)
if (filterPerson) filterPerson.addEventListener('change', applyFilters);
if (filterPaymentMethod) filterPaymentMethod.addEventListener('change', applyFilters);
if (filterMonth) filterMonth.addEventListener('change', applyFilters);
if (filterYear) filterYear.addEventListener('change', applyFilters);

// زر إعادة تعيين كافة الفلاتر للوضع الافتراضي
if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
        if (filterPerson) filterPerson.value = 'all';
        if (filterPaymentMethod) filterPaymentMethod.value = 'all'; // تصفير فلتر طريقة الدفع
        if (filterMonth) filterMonth.value = 'all';
        if (filterYear) filterYear.value = 'all';
        applyFilters();
    });
}

// 🚪 تسجيل الخروج الآمن وبحماية الـ Confirmation
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm("هل تريد بالتأكيد تسجيل الخروج والعودة لصفحة الدخول؟")) {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                alert('حدث خطأ أثناء تسجيل الخروج: ' + error.message);
            }
        }
    });
}