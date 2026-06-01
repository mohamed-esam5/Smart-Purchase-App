/* js/bills.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الواجهة
const logoutBtn = document.getElementById('logout-btn');
const openModalBtn = document.getElementById('open-modal-btn');
const closeModalSpan = document.querySelector('.close-modal');
const billModal = document.getElementById('bill-modal');
const billForm = document.getElementById('bill-form');
const billsTableBody = document.getElementById('bills-table-body');
const personsCheckboxList = document.getElementById('persons-checkbox-list');
const sortBillsSelect = document.getElementById('sort-bills'); 

let currentUserId = null;
let cachedActiveBills = []; 

// 🛡️ فحص الحماية والأمان (Route Guard)
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        currentUserId = user.uid;
        fetchUserBills(); 
        loadPersonsWithAmountInputs(); 
        initEvents(); 
    }
});

// ⏳ خوارزمية ذكية لحساب تاريخ الاستحقاق بناءً على طريقة الدفع
function calculateDueDate(purchaseDateString, method) {
    if (method !== 'Credit Card') {
        return "دفع فوري ⚡";
    }
    const purchaseDate = new Date(purchaseDateString);
    const year = purchaseDate.getFullYear();
    const month = purchaseDate.getMonth(); 
    const dueDate = new Date(year, month + 1, 25);
    return dueDate.toISOString().split('T')[0];
}

// 👥 جلب الأشخاص وتوليد خانات اختيار ومبالغ ديناميكية متوافقة مع معايير الـ Accessibility
async function loadPersonsWithAmountInputs() {
    if (!currentUserId) return;
    try {
        const personsRef = collection(db, 'users', currentUserId, 'persons');
        const querySnapshot = await getDocs(personsRef);
        
        personsCheckboxList.innerHTML = '';
        let hasPersons = false;

        querySnapshot.forEach((doc) => {
            const person = doc.data();
            const personSanitizedId = person.name.replace(/\s+/g, '-');
            
            const rowDiv = document.createElement('div');
            rowDiv.style.display = 'flex';
            rowDiv.style.alignItems = 'center';
            rowDiv.style.justifyContent = 'space-between';
            rowDiv.style.marginBottom = '10px';
            rowDiv.style.gap = '15px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'bill-persons';
            checkbox.value = person.name;
            checkbox.id = `auth-cb-${personSanitizedId}`; 
            checkbox.style.width = '18px';
            checkbox.style.height = '18px';
            checkbox.style.cursor = 'pointer';

            const label = document.createElement('label');
            label.setAttribute('for', `auth-cb-${personSanitizedId}`); 
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.cursor = 'pointer';
            label.style.fontSize = '14px';
            label.style.fontWeight = '600';
            label.style.flex = '1';
            label.style.color = 'var(--text-color, #333)';

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(person.name));

            const amountInput = document.createElement('input');
            amountInput.type = 'number';
            amountInput.step = '0.01';
            amountInput.inputMode = 'decimal';
            amountInput.id = `auth-amount-${personSanitizedId}`; 
            amountInput.name = `amount-${personSanitizedId}`;    
            amountInput.placeholder = 'المبلغ الخاص به';
            amountInput.disabled = true;
            amountInput.style.width = '130px';
            amountInput.style.padding = '6px';
            amountInput.style.borderRadius = '4px';
            amountInput.style.textAlign = 'center';
            amountInput.className = 'person-amount-input';
            amountInput.dataset.personName = person.name;
            amountInput.setAttribute('aria-label', `المبلغ الخاص بـ ${person.name}`); 

            checkbox.addEventListener('change', (e) => {
                amountInput.disabled = !e.target.checked;
                if (!e.target.checked) {
                    amountInput.value = '';
                } else {
                    amountInput.focus();
                }
            });

            rowDiv.appendChild(label);
            rowDiv.appendChild(amountInput);
            personsCheckboxList.appendChild(rowDiv);
            hasPersons = true;
        });

        if (!hasPersons) {
            personsCheckboxList.innerHTML = '<span style="color: var(--status-unpaid-text, #c92a2a); font-size: 13px; font-weight: 600;">⚠️ لا يوجد أشخاص مسجلين. اذهب لصفحة الأشخاص أولاً!</span>';
        }
    } catch (error) {
        console.error("خطأ في تحميل عناصر الأشخاص: ", error);
    }
}

// 📥 جلب وعرض الفواتير من Firebase
async function fetchUserBills() {
    if (!currentUserId) return;
    
    try {
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        const querySnapshot = await getDocs(billsRef);
        
        cachedActiveBills = [];
        
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.archived) {
                cachedActiveBills.push({ id: doc.id, ...data });
            }
        });

        renderAndSortBills();

    } catch (error) {
        console.error("خطأ في جلب الفواتير: ", error);
        billsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#d9534f;">حدث خطأ أثناء تحميل جدول الفواتير.</td></tr>`;
    }
}

// 🔀 دالة الفرز والترتيب المحدثة - تم حل مشكلة طرق الدفع نهائياً ودعم الكلمات العربية والإنجليزية
function renderAndSortBills() {
    if (!billsTableBody) return;
    
    if (cachedActiveBills.length === 0) {
        billsTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--text-muted, #999); padding: 20px;">لا يوجد فواتير نشطة حالياً. أضف فاتورة جديدة!</td></tr>`;
        return;
    }

    const sortType = sortBillsSelect ? sortBillsSelect.value : 'date-desc';

    // تنفيذ عمليات الفرز بدقة عالية
    if (sortType === 'date-desc') {
        cachedActiveBills.sort((a, b) => new Date(b.purchaseDate || 0).getTime() - new Date(a.purchaseDate || 0).getTime());
    } else if (sortType === 'date-asc') {
        cachedActiveBills.sort((a, b) => new Date(a.purchaseDate || 0).getTime() - new Date(b.purchaseDate || 0).getTime());
    } else if (sortType === 'amount-desc') {
        cachedActiveBills.sort((a, b) => parseFloat(b.amount || 0) - parseFloat(a.amount || 0));
    } else if (sortType === 'amount-asc') {
        cachedActiveBills.sort((a, b) => parseFloat(a.amount || 0) - parseFloat(b.amount || 0));
    } else if (sortType === 'status-unpaid') {
        cachedActiveBills.sort((a, b) => {
            if (a.status === 'غير مدفوع' && b.status === 'مدفوع') return -1;
            if (a.status === 'مدفوع' && b.status === 'غير مدفوع') return 1;
            return 0;
        });
    } else if (sortType === 'method-credit') {
        cachedActiveBills.sort((a, b) => {
            const isACredit = (a.paymentMethod === 'Credit Card');
            const isBCredit = (b.paymentMethod === 'Credit Card');
            if (isACredit && !isBCredit) return -1;
            if (!isACredit && isBCredit) return 1;
            return 0;
        });
    } else if (sortType === 'method-cash') {
        cachedActiveBills.sort((a, b) => {
            // فحص الكلمة سواء كانت مخزنة بالإنجليزي أو العربي Cash أو كاش
            const isACash = (a.paymentMethod === 'Cash' || a.paymentMethod === 'كاش');
            const isBCash = (b.paymentMethod === 'Cash' || b.paymentMethod === 'كاش');
            if (isACash && !isBCash) return -1;
            if (!isACash && isBCash) return 1;
            return 0;
        });
    } else if (sortType === 'method-instapay') {
        cachedActiveBills.sort((a, b) => {
            const isAInsta = (a.paymentMethod === 'InstaPay');
            const isBInsta = (b.paymentMethod === 'InstaPay');
            if (isAInsta && !isBInsta) return -1;
            if (!isAInsta && isBInsta) return 1;
            return 0;
        });
    }

    billsTableBody.innerHTML = '';

    cachedActiveBills.forEach(bill => {
        const row = document.createElement('tr');
        
        const statusBadge = bill.status === 'مدفوع' 
            ? `<span class="badge paid">مدفوع بالكامل</span>` 
            : `<span class="badge unpaid">تحت السداد</span>`;
            
        const statusActionText = bill.status === 'مدفوع' ? 'تبديل لغير مدفوع' : 'تعديل كمدفوع';

        let personsDetailsHtml = 'غير محدد';
        if (bill.breakdown && typeof bill.breakdown === 'object') {
            personsDetailsHtml = Object.entries(bill.breakdown).map(([name, totalShare]) => {
                let paidSoFar = (bill.partiallyPaid && bill.partiallyPaid[name]) ? bill.partiallyPaid[name] : 0;
                let remaining = totalShare - paidSoFar;
                
                let personStatusClass = remaining <= 0 
                    ? 'background: var(--status-paid-bg, #e6fcf5); color: var(--status-paid-text, #0ca678); border: 1px solid var(--status-paid-text, #0ca678);'
                    : 'background: var(--status-unpaid-bg, #fff5f5); color: var(--status-unpaid-text, #c92a2a); border: 1px solid var(--status-unpaid-border, #ffa8a8);';
                
                return `
                    <div style="margin-bottom: 6px; padding: 4px 8px; border-radius: 4px; ${personStatusClass} font-size:12px; font-weight:600;">
                        👤 ${name}: <span>(متبقي: ${remaining.toFixed(2)} / أصل: ${totalShare.toFixed(2)}) ج.م</span>
                    </div>
                `;
            }).join('');
        }

        // تحديد الأيقونة والنص البرمجي للعرض في الجدول
        let methodIcon = '💵';
        let displayMethod = bill.paymentMethod || 'Cash';
        
        if (bill.paymentMethod === 'Credit Card') {
            methodIcon = '💳';
            displayMethod = 'Credit Card';
        } else if (bill.paymentMethod === 'InstaPay') {
            methodIcon = '📱';
            displayMethod = 'InstaPay';
        } else if (bill.paymentMethod === 'Cash' || bill.paymentMethod === 'كاش') {
            methodIcon = '💵';
            displayMethod = 'Cash';
        }

        row.innerHTML = `
            <td><strong>${bill.title}</strong><br><small style="color: var(--text-muted, #666); font-weight:600;">${methodIcon} ${displayMethod}</small></td>
            <td>${personsDetailsHtml}</td>
            <td style="font-weight:700; color: var(--text-heading, #1e3c72);">${parseFloat(bill.amount).toFixed(2)} ج.م</td>
            <td>${bill.purchaseDate}</td>
            <td><i class="fa-regular fa-calendar-check"></i> ${bill.dueDate}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-action-status" data-id="${bill.id}" data-status="${bill.status}">${statusActionText}</button>
                <button class="btn-action-archive" data-id="${bill.id}" data-status="${bill.status}" title="أرشفة الفاتورة" style="background: #e67e22; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; margin-left: 4px;"><i class="fa-solid fa-box-archive"></i></button>
                <button class="btn-action-delete" data-id="${bill.id}"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        billsTableBody.appendChild(row);
    });

    addButtonListeners();
}

// 💾 حفظ الفاتورة مع التوزيع اليدوي للمبالغ
billForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = document.getElementById('bill-title').value.trim();
    const totalAmount = parseFloat(document.getElementById('bill-amount').value);
    const purchaseDate = document.getElementById('purchase-date').value;
    const paymentMethod = document.getElementById('bill-payment-method').value;
    
    const checkedBoxes = document.querySelectorAll('input[name="bill-persons"]:checked');
    
    if (checkedBoxes.length === 0) {
        alert("⚠️ برجاء اختيار شخص واحد على الأقل وتحديد مبلغه!");
        return;
    }

    let breakdown = {};
    let partiallyPaid = {}; 
    let sumOfInputs = 0;
    let isValidInputs = true;

    checkedBoxes.forEach(cb => {
        const pName = cb.value;
        const inputField = document.querySelector(`.person-amount-input[data-person-name="${pName}"]`);
        const pAmount = parseFloat(inputField.value);

        if (isNaN(pAmount) || pAmount <= 0) {
            isValidInputs = false;
        } else {
            breakdown[pName] = pAmount;
            partiallyPaid[pName] = 0; 
            sumOfInputs += pAmount;
        }
    });

    if (!isValidInputs) {
        alert("⚠️ برجاء كتابة مبالغ صحيحية أكبر من الصفر لكل شخص قمت باختياره!");
        return;
    }

    if (Math.abs(sumOfInputs - totalAmount) > 0.02) {
        alert(`⚠️ خطأ في توزيع الحساب!\nمجموع مبالغ الأشخاص هو (${sumOfInputs.toFixed(2)} ج.م) بينما إجمالي الفاتورة المكتوب فوق هو (${totalAmount.toFixed(2)} ج.م).\nيجب أن يتطابق المجموعان تماماً.`);
        return;
    }

    const dueDate = calculateDueDate(purchaseDate, paymentMethod);

    try {
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        await addDoc(billsRef, {
            title,
            amount: totalAmount,
            purchaseDate,
            dueDate,
            paymentMethod, 
            breakdown,     
            partiallyPaid, 
            status: 'غير مدفوع',
            archived: false,
            createdAt: new Date().toISOString()
        });

        billForm.reset();
        billModal.style.display = 'none';
        fetchUserBills();
    } catch (error) {
        alert("خطأ أثناء حفظ الفاتورة: " + error.message);
    }
});

// 🔄 وظائف التعديل والحذف والأرشفة الآمنة
function addButtonListeners() {
    document.querySelectorAll('.btn-action-status').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const currentStatus = e.currentTarget.getAttribute('data-status');
            const newStatus = currentStatus === 'مدفوع' ? 'غير مدفوع' : 'مدفوع';
            
            try {
                const billDocRef = doc(db, 'users', currentUserId, 'bills', id);
                await updateDoc(billDocRef, { status: newStatus });
                fetchUserBills();
            } catch (error) {
                console.error("خطأ في تحديث الحالة: ", error);
            }
        });
    });

    document.querySelectorAll('.btn-action-archive').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const status = e.currentTarget.getAttribute('data-status');

            if (status !== 'مدفوع') {
                alert("⚠️ لا يمكن أرشفة هذه الفاتورة حالياً!\nالفاتورة حالتها (تحت السداد) ولم تقفل بالكامل. يرجى تسوية حسابات الأشخاص المسجلين بها أولاً قبل إرسالها للأرشيف.");
                return;
            }

            if (confirm("هل تريد نقل هذه الفاتورة إلى الأرشيف لحفظها على المدى الطويل؟")) {
                try {
                    const billDocRef = doc(db, 'users', currentUserId, 'bills', id);
                    await updateDoc(billDocRef, { archived: true });
                    alert("✅ تم نقل الفاتورة بنجاح إلى منظومة الأرشيف.");
                    fetchUserBills();
                } catch (error) {
                    alert("خطأ أثناء الأرشفة: " + error.message);
                }
            }
        });
    });

    document.querySelectorAll('.btn-action-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (confirm("هل أنت متأكد من حذف هذه الفاتورة نهائياً؟")) {
                try {
                    const billDocRef = doc(db, 'users', currentUserId, 'bills', id);
                    await deleteDoc(billDocRef);
                    fetchUserBills();
                } catch (error) {
                    alert("خطأ أثناء الحذف: " + error.message);
                }
            }
        });
    });
}

// 🕹️ تهيئة وتجميع كافة مستمعي الأحداث والفرز الآمن لايف
function initEvents() {
    if (sortBillsSelect) {
        sortBillsSelect.removeEventListener('change', renderAndSortBills); 
        sortBillsSelect.addEventListener('change', renderAndSortBills);
    }

    if (openModalBtn) {
        openModalBtn.onclick = () => {
            loadPersonsWithAmountInputs(); 
            billModal.style.display = 'flex';
        };
    }
    if (closeModalSpan) {
        closeModalSpan.onclick = () => billModal.style.display = 'none';
    }
    window.onclick = (e) => { 
        if (e.target == billModal) billModal.style.display = 'none'; 
    };

    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            if (confirm("هل تريد تسجيل الخروج؟")) {
                try {
                    await signOut(auth);
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error("خطأ أثناء تسجيل الخروج: ", error);
                }
            }
        };
    }
}