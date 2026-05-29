/* js/dashboard.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الواجهة
const logoutBtn = document.getElementById('logout-btn');
const totalAmountEl = document.getElementById('total-amount');
const pendingCountEl = document.getElementById('pending-count');
const nearestDueDateEl = document.getElementById('nearest-due-date');
const latestBillsRows = document.getElementById('latest-bills-rows');

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

// دالة جلب وحساب بيانات الـ Dashboard
async function fetchDashboardData(uid) {
    try {
        // الإشارة لمجموعة فواتير المستخدم المعزولة برمز حماية الـ UID
        const billsRef = collection(db, 'users', uid, 'bills');
        
        // استعلام لجلب الفواتير الغير مدفوعة لحساب المديونيات والأقرب سداداً
        const q = query(billsRef, where('status', '==', 'غير مدفوع'));
        const querySnapshot = await getDocs(q);
        
        let totalDebt = 0;
        let pendingCount = 0;
        let dueDates = [];
        let allBills = [];

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const amount = parseFloat(data.amount) || 0;
            totalDebt += amount;
            pendingCount++;
            
            if (data.dueDate) {
                dueDates.push(new Date(data.dueDate));
            }
            
            allBills.push(data);
        });

        // تحديث كروت الإحصائيات في الواجهة
        totalAmountEl.textContent = `${totalDebt.toFixed(2)} ج.م`;
        pendingCountEl.textContent = `${pendingCount} فواتير`;

        // حساب أقرب موعد سداد
        if (dueDates.length > 0) {
            const nearestDate = new Date(Math.min(...dueDates));
            nearestDueDateEl.textContent = nearestDate.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        } else {
            nearestDueDateEl.textContent = "لا يوجد";
        }

        // عرض آخر 4 فواتير في الجدول المصغر للتوضيح
        renderLatestBills(allBills.slice(0, 4));

    } catch (error) {
        console.error("حدث خطأ أثناء تحميل بيانات لوحة التحكم: ", error);
        latestBillsRows.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#d9534f;">خطأ في تحميل البيانات.</td></tr>`;
    }
}

// عرض الفواتير في الجدول
function renderLatestBills(bills) {
    if (bills.length === 0) {
        latestBillsRows.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#999;">لا توجد فواتير معلقة حالياً.</td></tr>`;
        return;
    }

    latestBillsRows.innerHTML = '';
    bills.forEach(bill => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${bill.title}</strong></td>
            <td style="color: #d9534f; font-weight:600;">${parseFloat(bill.amount).toFixed(2)} ج.م</td>
            <td>${bill.dueDate || 'غير محدد'}</td>
        `;
        latestBillsRows.appendChild(row);
    });
}

// 🚪 عملية تسجيل الخروج (Logout)
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'index.html';
    } catch (error) {
        alert('حدث خطأ أثناء محاولة تسجيل الخروج: ' + error.message);
    }
});