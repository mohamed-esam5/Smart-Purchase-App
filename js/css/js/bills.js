/* js/bills.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الواجهة
const logoutBtn = document.getElementById('logout-btn');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalSpan = document.querySelector('.close-modal');
const billModal = document.getElementById('bill-modal');
const billForm = document.getElementById('bill-form');
const billsTableBody = document.getElementById('bills-table-body');

let currentUserId = null;

// 🛡️ فحص الحماية والأمان (Route Guard)
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        currentUserId = user.uid;
        fetchUserBills(); // جلب فواتير المستخدم الحالي فقط
    }
});

// ⏳ خوارزمية حساب الـ 55 يوم سماح للفيزا الائتمانية
function calculateDueDate(purchaseDateString) {
    const purchaseDate = new Date(purchaseDateString);
    
    // المبدأ الهندسي للـ 55 يوم:
    // الفواتير التي تشتريها في شهر معين، تظهر فاتورتها في نهاية الشهر، ومعك 25 يوم سماح في الشهر التالي.
    // المعادلة التقريبية الآمنة والدقيقة لتحديد تاريخ نهاية السماح:
    const year = purchaseDate.getFullYear();
    const month = purchaseDate.getMonth(); // الشهر الحالي (0-11)
    
    // تاريخ الاستحقاق يكون يوم 25 من الشهر التالي لشهر الشراء
    const dueDate = new Date(year, month + 1, 25);
    
    // ارجاع التاريخ بصيغة مقروءة YYYY-MM-DD
    return dueDate.toISOString().split('T')[0];
}

// 📥 جلب وعرض الفواتير من Firebase
async function fetchUserBills() {
    if (!currentUserId) return;
    
    try {
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        const querySnapshot = await getDocs(billsRef);
        
        billsTableBody.innerHTML = '';
        let billsList = [];
        
        querySnapshot.forEach((doc) => {
            billsList.push({ id: doc.id, ...doc.data() });
        });

        if (billsList.length === 0) {
            billsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#999; padding: 20px;">لا يوجد فواتير مسجلة حالياً. أضف فاتورة جديدة!</td></tr>`;
            return;
        }

        billsList.forEach(bill => {
            const row = document.createElement('tr');
            
            const statusBadge = bill.status === 'مدفوع' 
                ? `<span class="badge paid">مدفوع</span>` 
                : `<span class="badge unpaid">غير مدفوع</span>`;
                
            const statusActionText = bill.status === 'مدفوع' ? 'تبديل لغير مدفوع' : 'تعديل كمدفوع';

            row.innerHTML = `
                <td><strong>${bill.title}</strong></td>
                <td style="font-weight:600; color:${bill.status === 'مدفوع' ? '#2b8a3e' : '#c92a2a'}">${parseFloat(bill.amount).toFixed(2)} ج.م</td>
                <td>${bill.purchaseDate}</td>
                <td><i class="fa-regular fa-calendar-check"></i> ${bill.dueDate}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn-action-status" data-id="${bill.id}" data-status="${bill.status}">${statusActionText}</button>
                    <button class="btn-action-delete" data-id="${bill.id}"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            billsTableBody.appendChild(row);
        });

        // ربط أحداث الأزرار للتعديل والحذف ديناميكياً
        addButtonListeners();

    } catch (error) {
        console.error("خطأ في جلب الفواتير: ", error);
        billsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#d9534f;">حدث خطأ أثناء تحميل جدول الفواتير.</td></tr>`;
    }
}

// 💾 إضافة فاتورة جديدة وحساب التواريخ
billForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('bill-title').value.trim();
    const amount = document.getElementById('bill-amount').value;
    const purchaseDate = document.getElementById('purchase-date').value;
    
    // استدعاء دالة الـ 55 يوم الذكية
    const dueDate = calculateDueDate(purchaseDate);

    try {
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        await addDoc(billsRef, {
            title,
            amount: parseFloat(amount),
            purchaseDate,
            dueDate,
            status: 'غير مدفوع',
            createdAt: new Date().toISOString()
        });

        // ريست وأقفل المودال
        billForm.reset();
        billModal.style.display = 'none';
        
        // تحديث الجدول تلقائياً
        fetchUserBills();
    } catch (error) {
        alert("خطأ أثناء حفظ الفاتورة: " + error.message);
    }
});

// 🔄 وظائف التعديل والحذف
function addButtonListeners() {
    // أزرار تغيير الحالة (مدفوع / غير مدفوع)
    document.querySelectorAll('.btn-action-status').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.getAttribute('data-id');
            const currentStatus = e.target.getAttribute('data-status');
            const newStatus = currentStatus === 'مدفوع' ? 'غير مدفوع' : 'مدفوع';
            
            const billDocRef = doc(db, 'users', currentUserId, 'bills', id);
            await updateDoc(billDocRef, { status: newStatus });
            fetchUserBills();
        });
    });

    // أزرار الحذف
    document.querySelectorAll('.btn-action-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm("هل أنت متأكد من حذف هذه الفاتورة نهائياً؟")) {
                const billDocRef = doc(db, 'users', currentUserId, 'bills', id);
                await deleteDoc(billDocRef);
                fetchUserBills();
            }
        });
    });
}

// 🕹️ فتح وغلق النافذة المنبثقة (Modal Controls)
openModalBtn.onclick = () => billModal.style.display = 'flex';
closeModalSpan.onclick = () => billModal.style.display = 'none';
window.onclick = (e) => { if (e.target == billModal) billModal.style.display = 'none'; }

// 🚪 تسجيل الخروج
logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
});