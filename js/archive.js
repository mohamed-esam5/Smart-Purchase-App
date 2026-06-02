/* js/archive.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const logoutBtn = document.getElementById('logout-btn');
const archiveTableBody = document.getElementById('archive-table-body');

let currentUserId = null;

// 🛡️ فحص الحماية والأمان (Route Guard)
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        currentUserId = user.uid;
        fetchArchivedBills(); 
    }
});

// 📥 جلب الفواتير المؤرشفة فقط وعرضها بسجل مالي للقراءة والتاريخ
async function fetchArchivedBills() {
    if (!currentUserId) return;
    
    try {
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        const querySnapshot = await getDocs(billsRef);
        
        archiveTableBody.innerHTML = '';
        let archivedBillsList = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // الفلترة الذكية: هنجيب اللي معملهم أرشيف فقط archived == true
            if (data.archived === true) {
                archivedBillsList.push({ id: doc.id, ...data });
            }
        });

        if (archivedBillsList.length === 0) {
            archiveTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-muted, #999); padding: 30px;"><i class="fa-solid fa-folder-open" style="font-size: 24px; color: var(--border-color, #ccc); display:block; margin-bottom:10px;"></i> الأرشيف فارغ حالياً. لا يوجد فواتير مؤرشفة.</td></tr>`;
            return;
        }

        // ترتيب الأرشيف تنازلياً من الأحدث شراءً للأقدم
        archivedBillsList.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());

        archivedBillsList.forEach(bill => {
            const row = document.createElement('tr');
            
            // الفواتير المؤرشفة مغلقة ومسددة بالكامل - استخدام متغيرات الحالة المحدثة في السي إس إس
            const statusBadge = `<span class="badge paid"><i class="fa-solid fa-circle-check"></i> مغلقة ومسددة</span>`;

            // تفاصيل المبالغ المسددة التاريخية لكل شخص مع مواءمة تامة للوضع الداكن
            let personsDetailsHtml = 'غير محدد';
            if (bill.breakdown && typeof bill.breakdown === 'object') {
                personsDetailsHtml = Object.entries(bill.breakdown).map(([name, totalShare]) => {
                    return `
                        <div style="margin-bottom: 4px; padding: 4px 8px; border-radius: 4px; background: var(--action-card-bg, #f1f3f5); color: var(--text-color, #495057); border: 1px solid var(--border-color, #dee2e6); font-size:12px; font-weight:600;">
                            👤 ${name}: <span style="color: var(--status-paid-text, #2b8a3e);">خالص (${totalShare.toFixed(2)} ج.م)</span>
                        </div>
                    `;
                }).join('');
            }

            let methodIcon = bill.paymentMethod === 'Credit Card' ? '💳' : bill.paymentMethod === 'InstaPay' ? '📱' : '💵';
            let currentMethod = bill.paymentMethod || 'Credit Card';

            row.innerHTML = `
                <td><strong>${bill.title}</strong><br><small style="color: var(--text-muted, #666); font-weight:600;">${methodIcon} ${currentMethod}</small></td>
                <td>${personsDetailsHtml}</td>
                <td style="font-weight:700; color: var(--text-heading, #1e3c72);">${parseFloat(bill.amount).toFixed(2)} ج.م</td>
                <td>${bill.purchaseDate}</td>
                <td><i class="fa-regular fa-calendar-check"></i> ${bill.dueDate}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-action-unarchive" data-id="${bill.id}" title="إعادة الفاتورة للفواتير النشطة" style="background: #1098ad; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-family:'Cairo'; font-weight:600; font-size:12px;">
                        <i class="fa-solid fa-arrow-rotate-left"></i> استعادة الفاتورة
                    </button>
                </td>
            `;
            archiveTableBody.appendChild(row);
        });

        addUnarchiveListeners();

    } catch (error) {
        console.error("خطأ في جلب أرشيف الفواتير: ", error);
        archiveTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#d9534f;">حدث خطأ أثناء تحميل خزنة الأرشيف.</td></tr>`;
    }
}

// 🔓 الاستماع لزرار إلغاء الأرشفة وإعادة إحياء الفاتورة
function addUnarchiveListeners() {
    document.querySelectorAll('.btn-action-unarchive').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            
            if (confirm("هل تريد استعادة هذه الفاتورة وإخراجها من الأرشيف لإعادتها إلى صفحة الفواتير النشطة؟")) {
                try {
                    const billDocRef = doc(db, 'users', currentUserId, 'bills', id);
                    // تغيير الحالة لـ false لتعود حية في الجدول الرئيسي
                    await updateDoc(billDocRef, { archived: false });
                    
                    alert("🔓 تم استعادة الفاتورة بنجاح وإعادتها لقائمة الفواتير الجارية.");
                    fetchArchivedBills(); // تحديث جدول الأرشيف لايف
                } catch (error) {
                    alert("خطأ أثناء استعادة الفاتورة: " + error.message);
                }
            }
        });
    });
}

// 🚪 خروج آمن ومحمي من النظام
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm("هل تريد تسجيل الخروج؟")) {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                console.error("خطأ أثناء تسجيل الخروج: ", error);
            }
        }
    });
}