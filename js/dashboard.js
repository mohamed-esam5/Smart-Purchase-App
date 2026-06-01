/* js/dashboard.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الواجهة
const logoutBtn = document.getElementById('logout-btn');
const totalAmountEl = document.getElementById('total-amount');
const pendingCountEl = document.getElementById('pending-count');
const nearestDueDateEl = document.getElementById('nearest-due-date');
const latestBillsRows = document.getElementById('latest-bills-rows');

// ✨ عناصر طرق الدفع الفرعية المضافة حديثاً لتقسيم المديونية
const creditSubEl = document.getElementById('dash-credit-sub');
const cashSubEl = document.getElementById('dash-cash-sub');
const instapaySubEl = document.getElementById('dash-instapay-sub');

// 🛡️ فحص الأمان والحماية (Route Guard)
onAuthStateChanged(auth, (user) => {
    if (!user) {
        // لو مش مسجل دخول ارجع لصفحة تسجيل الدخول فوراً
        window.location.href = 'index.html';
    } else {
        // المستخدم تمام، ابدأ في سحب بياناته هو فقط
        fetchDashboardData(user.uid);
    }
});

// دالة جلب وحساب بيانات الـ Dashboard بدقة محاسبية
async function fetchDashboardData(uid) {
    try {
        // الإشارة لمجموعة فواتير المستخدم المعزولة برمز حماية الـ UID
        const billsRef = collection(db, 'users', uid, 'bills');
        
        // استعلام لجلب الفواتير الغير مدفوعة لحساب المديونيات والأقرب سداداً
        const q = query(billsRef, where('status', '==', 'غير مدفوع'));
        const querySnapshot = await getDocs(q);
        
        let totalDebt = 0;
        let totalCredit = 0;
        let totalCash = 0;
        let totalInstapay = 0;
        let pendingCount = 0;
        let dueDates = [];
        let allBills = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();

            // 🛑 حماية إضافية: تخطي وتجاهل أي فاتورة مؤرشفة حتى لو كانت تحت السداد
            if (data.archived === true) {
                return; 
            }

            let currentBillRemaining = 0;

            // 🧮 الحساب الذكي للمتبقي الفعلي غير المسدد فقط (منع التضخيم الوهمي)
            if (data.breakdown && typeof data.breakdown === 'object') {
                Object.entries(data.breakdown).forEach(([name, totalShare]) => {
                    let paidSoFar = (data.partiallyPaid && data.partiallyPaid[name]) ? data.partiallyPaid[name] : 0;
                    let remaining = totalShare - paidSoFar;
                    if (remaining > 0) {
                        currentBillRemaining += remaining;
                    }
                });
            } else {
                // دالة احتياطية في حال غياب تفصيل المبالغ لأي سبب
                currentBillRemaining = (parseFloat(data.amount) || 0);
            }

            // 💰 تجميع المديونيات وتوزيعها حسب طريقة الدفع بدقة
            totalDebt += currentBillRemaining;
            
            // قراءة حقل طريقة الدفع وتطهيره من الفراغات وحالة الحروف (تأكد من مطابقة الكلمات المخزنة عندك)
            const method = data.paymentMethod ? data.paymentMethod.trim() : 'Cash';
            
            if (method === 'Credit Card') {
                totalCredit += currentBillRemaining;
            } else if (method === 'InstaPay') {
                totalInstapay += currentBillRemaining;
            } else {
                // الافتراضي في حال كانت طريقة الدفع كاش أو غير محددة
                totalCash += currentBillRemaining;
            }

            pendingCount++;
            
            if (data.dueDate) {
                // تجنب دفع فوري ⚡ عند تحويل التاريخ لـ Date Object
                if (!data.dueDate.includes("دفع فوري")) {
                    dueDates.push(new Date(data.dueDate));
                }
            }
            
            // تخزين قيمة المتبقي الصافي داخل الكائن الممرر للجدول المصغر لتوحيد الرؤية المالية
            allBills.push({ ...data, remainingDebt: currentBillRemaining });
        });

        // تحديث كروت الإحصائيات في الواجهة بحماية الـ Optional Chaining
        if (totalAmountEl) totalAmountEl.textContent = `${totalDebt.toFixed(2)} ج.م`;
        if (pendingCountEl) pendingCountEl.textContent = `${pendingCount} فواتير`;

        // ✨ تحديث تقسيمات طرق الدفع بالأرقام الحقيقية الموزعة لايف
        if (creditSubEl) creditSubEl.textContent = totalCredit.toFixed(2);
        if (cashSubEl) cashSubEl.textContent = totalCash.toFixed(2);
        if (instapaySubEl) instapaySubEl.textContent = totalInstapay.toFixed(2);

        // حساب أقرب موعد سداد
        if (nearestDueDateEl) {
            if (dueDates.length > 0) {
                const nearestDate = new Date(Math.min(...dueDates));
                nearestDueDateEl.textContent = nearestDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
            } else {
                nearestDueDateEl.textContent = "لا يوجد";
            }
        }

        // 📅 ترتيب الفواتير غير المؤرشفة تنازلياً (من الأحدث شراءً للأقدم) قبل العرض في الجدول المصغر
        allBills.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());

        // عرض آخر 4 فواتير نشطة ومعلقة في الجدول المصغر للتوضيح
        renderLatestBills(allBills.slice(0, 4));

    } catch (error) {
        console.error("حدث خطأ أثناء تحميل بيانات لوحة التحكم: ", error);
        if (latestBillsRows) {
            latestBillsRows.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--status-unpaid-text, #d9534f); font-weight:600;">حدث خطأ غير متوقع أثناء مزامنة لوحة التحكم.</td></tr>`;
        }
    }
}

// عرض الفواتير في الجدول المصغر بتوافق كامل مع الثيمات والشارات الجديدة
function renderLatestBills(bills) {
    if (!latestBillsRows) return;

    if (bills.length === 0) {
        latestBillsRows.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted, #999); padding: 15px;">لا توجد فواتير معلقة حالياً 🎉</td></tr>`;
        return;
    }

    latestBillsRows.innerHTML = '';
    bills.forEach(bill => {
        const row = document.createElement('tr');
        
        // 🏷️ بناء شارة طريقة الدفع ديناميكياً لتتوافق مع كلاسات الـ CSS
        let badgeClass = 'payment-cash';
        let badgeText = 'كاش';
        
        const method = bill.paymentMethod ? bill.paymentMethod.trim() : 'Cash';
        if (method === 'Credit Card') {
            badgeClass = 'payment-credit';
            badgeText = '💳 كريديت';
        } else if (method === 'InstaPay') {
            badgeClass = 'payment-instapay';
            badgeText = '📱 إنستا باي';
        }

        row.innerHTML = `
            <td><strong>${bill.title}</strong></td>
            <td><span class="badge ${badgeClass}">${badgeText}</span></td>
            <td style="color: var(--status-unpaid-text, #d9534f); font-weight:700;">${parseFloat(bill.remainingDebt).toFixed(2)} ج.م</td>
            <td><span style="font-weight: 500;"><i class="fa-regular fa-clock" style="font-size: 11px; margin-left: 3px;"></i> ${bill.dueDate || 'غير محدد'}</span></td>
        `;
        latestBillsRows.appendChild(row);
    });
}

// 🚪 عملية تسجيل الخروج (Logout) المحمية والمؤمنة بالكامل
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm("هل أنت متأكد من رغبتك في تسجيل الخروج؟")) {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                alert('حدث خطأ غير متوقع أثناء محاولة تسجيل الخروج: ' + error.message);
            }
        }
    });
}