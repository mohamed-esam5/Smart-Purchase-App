/* js/persons.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الواجهة
const logoutBtn = document.getElementById('logout-btn');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalSpan = document.querySelector('.close-modal');
const personModal = document.getElementById('bill-modal'); 
const personForm = document.getElementById('person-form');
const personsTableBody = document.getElementById('persons-table-body');

let currentUserId = null;
let cachedBills = []; 
let cachedWallets = {}; 
let localPersonsNames = []; 

console.log("🚀 تم تحميل ملف persons.js وبدء مراقبة المستخدم...");

// 🛡️ حماية الصفحة (Route Guard)
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        console.log("🛑 لا يوجد مستخدم مسجل، تحويل إلى index.html");
        window.location.href = 'index.html';
    } else {
        currentUserId = user.uid;
        console.log("✅ مستخدم مسجل بنجاح:", currentUserId);
        
        try {
            // تحميل الكاش ثم عرض الأشخاص فوراً وبشكل آمن
            await fetchAllBillsCache();
            await fetchAllWalletsCache();
            await fetchUserPersons();
        } catch (e) {
            console.error("❌ خطأ أثناء تتابع تهيئة البيانات:", e);
        }
    }
});

// جلب كاش الفواتير مع حماية البيانات
async function fetchAllBillsCache() {
    if (!currentUserId) return;
    try {
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        const querySnapshot = await getDocs(billsRef);
        cachedBills = [];
        querySnapshot.forEach(doc => {
            cachedBills.push({ id: doc.id, ...doc.data() });
        });
        console.log(`📦 تم جلب فواتير الكاش بنجاح. العدد: ${cachedBills.length}`);
    } catch (error) {
        console.error("❌ خطأ في جلب كاش الفواتير:", error);
    }
}

// جلب كاش المحافظ مع حماية البيانات
async function fetchAllWalletsCache() {
    if (!currentUserId) return;
    try {
        const walletsRef = collection(db, 'users', currentUserId, 'wallets');
        const querySnapshot = await getDocs(walletsRef);
        cachedWallets = {};
        querySnapshot.forEach(doc => {
            const data = doc.data();
            if (data) {
                cachedWallets[doc.id] = parseFloat(data.balance) || 0;
            }
        });
        console.log("📦 تم جلب كاش المحافظ بنجاح.");
    } catch (error) {
        console.error("❌ خطأ في جلب كاش المحافظ:", error);
    }
}

// جلب وعرض الأشخاص وحل مشكلة البلوك المحاسبي بالكامل
async function fetchUserPersons() {
    if (!currentUserId) return;
    if (!personsTableBody) {
        console.error("🛑 خطأ حرج: العنصر persons-table-body غير موجود في الـ HTML!");
        return;
    }
    
    try {
        personsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--primary-color, #1e3c72); padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل الحسابات...</td></tr>`;
        
        const personsRef = collection(db, 'users', currentUserId, 'persons');
        const querySnapshot = await getDocs(personsRef);
        
        personsTableBody.innerHTML = '';
        let personsList = [];
        localPersonsNames = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            personsList.push({ id: doc.id, ...data });
            if (data.name) localPersonsNames.push(data.name.trim());
        });

        console.log(`👥 عدد الأشخاص المستلمين من الفايربيز: ${personsList.length}`);

        if (personsList.length === 0) {
            personsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted, #999); padding: 20px;">لم تقم بإضافة أي أشخاص بعد.</td></tr>`;
            return;
        }

        personsList.forEach(person => {
            let totalBillDebt = 0;

            // حماية كاملة ومحكمة لعملية تصفح حسابات الفواتير لتفادي أي عطل صامت
            try {
                cachedBills.forEach(bill => {
                    if (bill && bill.archived !== true && bill.breakdown && typeof bill.breakdown === 'object') {
                        if (person.name && Object.prototype.hasOwnProperty.call(bill.breakdown, person.name)) {
                            let originalShare = parseFloat(bill.breakdown[person.name]) || 0;
                            let paidSoFar = 0;
                            if (bill.partiallyPaid && bill.partiallyPaid[person.name]) {
                                paidSoFar = parseFloat(bill.partiallyPaid[person.name]) || 0;
                            }
                            totalBillDebt += (originalShare - paidSoFar);
                        }
                    }
                });
            } catch (err) {
                console.warn("⚠️ تنبيه محاسبي: تم تخطي صامت لقراءة فاتورة تالفة البيانات تلافياً للتعليق:", err);
            }

            let personWalletBalance = cachedWallets[person.name] || 0;
            let finalNetStatus = totalBillDebt - personWalletBalance;
            finalNetStatus = Math.round(finalNetStatus * 100) / 100; 

            const row = document.createElement('tr');
            
            let debtClass = finalNetStatus <= 0 ? 'status-badge-paid' : 'status-badge-unpaid';
            let debtText = finalNetStatus < 0 
                ? `له فائض: ${Math.abs(finalNetStatus).toFixed(2)} ج.م` 
                : (finalNetStatus === 0 ? 'خالص ✓' : `${finalNetStatus.toFixed(2)} ج.م`);

            let customStyle = finalNetStatus <= 0 
                ? 'color: var(--status-paid-text, #155724); background: var(--status-paid-bg, #d4edda); padding: 2px 8px; border-radius: 12px;' 
                : 'color: var(--status-unpaid-text, #721c24); background: var(--status-unpaid-bg, #f8d7da); padding: 2px 8px; border-radius: 12px;';

            let displayDate = person.createdAt ? person.createdAt.split('T')[0] : '—';

            row.innerHTML = `
                <td style="padding: 15px 20px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
                    <a href="#" class="person-statement-link" data-name="${person.name}" style="text-decoration:none; color: var(--text-color, #333); font-weight:700; border-bottom:1px dashed var(--primary-color, #1e3c72);">
                        <i class="fa-solid fa-id-card-alt"></i> ${person.name}
                    </a>
                    <br><small style="display:inline-block; margin-top:8px; font-size:11px; ${customStyle}">الوضعية الحالية: ${debtText}</small>
                </td>
                <td style="padding: 15px 20px; border-bottom: 1px solid var(--border-color, #e2e8f0); color: var(--text-color, #333);"><i class="fa-solid fa-phone" style="color: var(--text-muted, #666); font-size:12px;"></i> ${person.phone || '—'}</td>
                <td style="padding: 15px 20px; border-bottom: 1px solid var(--border-color, #e2e8f0); color: var(--text-color, #333);"><i class="fa-regular fa-calendar-alt"></i> ${displayDate}</td>
                <td style="padding: 15px 20px; border-bottom: 1px solid var(--border-color, #e2e8f0);">
                    <button class="btn-action-delete btn-delete-person" data-id="${person.id}" data-name="${person.name}" data-debt="${finalNetStatus}" title="حذف الشخص" style="cursor:pointer;">
                        <i class="fa-solid fa-trash"></i> حذف
                    </button>
                </td>
            `;
            personsTableBody.appendChild(row);
        });

        console.log("🎯 تم بناء ورسم جدول الأشخاص بنجاح كامل.");
        addTableListeners();

    } catch (error) {
        console.error("❌ خطأ قاتل أثناء معالجة ورسم جدول الأشخاص: ", error);
        if (personsTableBody) {
            personsTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: var(--status-unpaid-text, #721c24); padding: 20px;">حدث عطل أثناء جلب البيانات وعرضها.</td></tr>`;
        }
    }
}

// ربط المستمعين للأزرار
function addTableListeners() {
    document.querySelectorAll('.person-statement-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const personName = e.currentTarget.getAttribute('data-name');
            openPersonStatementModal(personName);
        });
    });

    document.querySelectorAll('.btn-delete-person').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const name = e.currentTarget.getAttribute('data-name');
            const netDebt = parseFloat(e.currentTarget.getAttribute('data-debt') || 0);

            if (netDebt > 0) {
                alert(`🛑 لا يمكن حذف (${name}) لأن لديه مديونية متبقية قيمتها (${netDebt.toFixed(2)} ج.م). يرجى تسوية فواتيره أولاً من صفحة السداد.`);
                return;
            }
            if (netDebt < 0) {
                alert(`🛑 لا يمكن حذف (${name}) لأن لديه رصيد مالي فائض بالمحفظة قدره (${Math.abs(netDebt).toFixed(2)} ج.م). يرجى تصفير أو استرداد رصيده أولاً.`);
                return;
            }

            if (confirm(`هل أنت متأكد من حذف الشخص (${name}) نهائياً من النظام؟ سيتسبب هذا في تنظيف سجلات محفظته.`)) {
                try {
                    const personDocRef = doc(db, 'users', currentUserId, 'persons', id);
                    await deleteDoc(personDocRef);
                    
                    const walletDocRef = doc(db, 'users', currentUserId, 'wallets', name);
                    await deleteDoc(walletDocRef);

                    await fetchAllBillsCache(); 
                    await fetchAllWalletsCache();
                    fetchUserPersons();
                } catch (error) {
                    alert("خطأ أثناء حذف الشخص: " + error.message);
                }
            }
        });
    });
}

// كشف الحساب التفصيلي المتوافق
function openPersonStatementModal(personName) {
    const personBills = cachedBills.filter(bill => {
        return bill && bill.breakdown && typeof bill.breakdown === 'object' && Object.prototype.hasOwnProperty.call(bill.breakdown, personName);
    });

    let totalPurchased = 0;
    let totalPaid = 0;
    let rowsHtml = '';

    if (personBills.length === 0) {
        rowsHtml = `<tr><td colspan="4" style="text-align:center; color: var(--text-muted); padding:20px;">الشخص غير مسجل بأي فواتير حالية أو مؤرشفة.</td></tr>`;
    } else {
        personBills.forEach(bill => {
            let originalShare = parseFloat(bill.breakdown[personName]) || 0;
            let paidSoFar = (bill.partiallyPaid && bill.partiallyPaid[personName]) ? parseFloat(bill.partiallyPaid[personName]) : 0;
            let remaining = originalShare - paidSoFar;
            remaining = Math.round(remaining * 100) / 100;

            if (!bill.archived) {
                totalPurchased += originalShare;
                totalPaid += paidSoFar;
            }

            let remainingColor = remaining <= 0 ? 'var(--status-paid-text, #155724)' : 'var(--status-unpaid-text, #721c24)';
            let billStatusText = bill.archived ? '📦 مؤرشفة (خارج الصافي)' : (remaining <= 0 ? '✓ خالص' : '⏳ تحت السداد');

            rowsHtml += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding:12px 10px; font-size:13px; color: var(--text-color);"><strong>${bill.title || 'فاتورة بدون عنوان'}</strong><br><small style="color: var(--text-muted);">${bill.purchaseDate || '---'}</small></td>
                    <td style="padding:12px 10px; font-size:13px; color: var(--primary-color); font-weight:600;">${originalShare.toFixed(2)} ج.م</td>
                    <td style="padding:12px 10px; font-size:13px; color: var(--status-paid-text);">${paidSoFar.toFixed(2)} ج.م</td>
                    <td style="padding:12px 10px; font-size:13px; color: ${remainingColor}; font-weight:bold;">${remaining.toFixed(2)} ج.م <br><small style="color: var(--text-muted); font-size:10px;">${billStatusText}</small></td>
                </tr>
            `;
        });
    }

    let currentWalletBalance = cachedWallets[personName] || 0;
    let totalRemainingDebt = (totalPurchased - totalPaid) - currentWalletBalance;
    totalRemainingDebt = Math.round(totalRemainingDebt * 100) / 100;

    const statementModal = document.createElement('div');
    statementModal.id = 'statement-dynamic-modal';
    statementModal.className = 'custom-modal-backdrop';
    statementModal.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); backdrop-filter: blur(4px); display:flex; justify-content:center; align-items:center; z-index:9999;";
    
    statementModal.innerHTML = `
        <div class="modal-content-card" style="background: var(--card-bg, #fff); width:90%; max-width:650px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.2); border: 1px solid var(--border-color); overflow:hidden;">
            <div style="background: var(--primary-gradient, #1e3c72); color:#fff; padding:15px 20px; display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; font-size:16px; font-family:'Cairo'; font-weight:700;"><i class="fa-solid fa-file-invoice"></i> كشف الحساب المالي: ${personName}</h3>
                <span id="close-statement-modal" style="cursor:pointer; font-size:24px; font-weight:bold; line-height:1;">&times;</span>
            </div>
            
            <div style="padding:20px; max-height:400px; overflow-y:auto; color: var(--text-color);">
                <div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap: wrap;">
                    <div style="flex:1; min-width:120px; background: var(--card-bg-nested, #f8f9fa); padding:10px; border-radius:6px; text-align:center; border: 1px solid var(--border-color);">
                        <small style="color: var(--text-muted); display:block;">مشاركات نشطة</small>
                        <strong style="color: var(--primary-color); font-size:14px;">${totalPurchased.toFixed(2)} ج.م</strong>
                    </div>
                    <div style="flex:1; min-width:120px; background: var(--status-paid-bg); padding:10px; border-radius:6px; text-align:center;">
                        <small style="color: var(--status-paid-text); display:block;">سداد نشط</small>
                        <strong style="color: var(--status-paid-text); font-size:14px;">${totalPaid.toFixed(2)} ج.م</strong>
                    </div>
                    <div style="flex:1; min-width:120px; background: var(--card-bg-nested, #f8f9fa); padding:10px; border-radius:6px; text-align:center; border: 1px dashed var(--border-color);">
                        <small style="color: var(--text-muted); display:block;">المحفظة حالياً</small>
                        <strong style="color: var(--primary-color); font-size:14px;">${currentWalletBalance.toFixed(2)} ج.م</strong>
                    </div>
                    <div style="flex:1; min-width:120px; background: var(--status-unpaid-bg); padding:10px; border-radius:6px; text-align:center; border:1px dashed var(--status-unpaid-text);">
                        <small style="color: var(--status-unpaid-text); display:block;">صافي المطالبة</small>
                        <strong style="color: var(--status-unpaid-text); font-size:14px;">${totalRemainingDebt.toFixed(2)} ج.م</strong>
                    </div>
                </div>

                <table style="width:100%; border-collapse:collapse; text-align:right;">
                    <thead>
                        <tr style="background: var(--card-bg-nested); border-bottom:2px solid var(--border-color);">
                            <th style="padding:10px; font-size:12px; color: var(--text-color); width:40%;">الفاتورة والتاريخ</th>
                            <th style="padding:10px; font-size:12px; color: var(--text-color);">نصيبه</th>
                            <th style="padding:10px; font-size:12px; color: var(--text-color);">المسدد</th>
                            <th style="padding:10px; font-size:12px; color: var(--text-color);">المتبقي</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            </div>
            <div style="background: var(--card-bg-nested); padding:12px 20px; text-align:left; border-top: 1px solid var(--border-color);">
                <button id="btn-close-statement-bottom" style="background: var(--text-muted); color:#fff; border:none; padding:8px 16px; border-radius:6px; font-family:'Cairo'; font-weight:600; cursor:pointer;">إغلاق</button>
            </div>
        </div>
    `;

    document.body.appendChild(statementModal);

    const closeModal = () => { statementModal.remove(); };
    document.getElementById('close-statement-modal').addEventListener('click', closeModal);
    document.getElementById('btn-close-statement-bottom').addEventListener('click', closeModal);
    statementModal.addEventListener('click', (e) => { if (e.target === statementModal) closeModal(); });
}

// حفظ شخص جديد
if (personForm) {
    personForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById('person-name');
        const phoneInput = document.getElementById('person-phone');
        
        const name = nameInput ? nameInput.value.trim() : "";
        const phone = phoneInput ? phoneInput.value.trim() : "";

        if (!currentUserId || !name) return;

        if (localPersonsNames.includes(name)) {
            alert(`⚠️ الاسم (${name}) مسجل بالفعل في حساباتك! برجاء استخدام اسم مميز تفادياً للخلط المحاسبي.`);
            return;
        }

        try {
            const personsRef = collection(db, 'users', currentUserId, 'persons');
            await addDoc(personsRef, {
                name,
                phone: phone || "",
                createdAt: new Date().toISOString()
            });

            personForm.reset();
            if (personModal) personModal.style.display = 'none';
            
            await fetchAllBillsCache(); 
            await fetchAllWalletsCache();
            await fetchUserPersons();
        } catch (error) {
            alert("خطأ أثناء حفظ الشخص الجديد: " + error.message);
        }
    });
}

// التحكم في المودال
if (openModalBtn && personModal) openModalBtn.onclick = () => personModal.style.display = 'flex';
if (closeModalSpan && personModal) closeModalSpan.onclick = () => personModal.style.display = 'none';

window.addEventListener('click', (e) => { 
    if (personModal && e.target == personModal) personModal.style.display = 'none'; 
});

// تسجيل الخروج
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm("هل تريد تسجيل الخروج؟")) {
            try {
                await signOut(auth);
                window.location.href = 'index.html';
            } catch (error) {
                alert('حدث خطأ أثناء تسجيل الخروج: ' + error.message);
            }
        }
    });
}