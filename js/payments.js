/* js/payments.js */
import { auth, db } from './firebase-config.js';
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// عناصر الواجهة الأساسية
const logoutBtn = document.getElementById('logout-btn');
const selectPersonPay = document.getElementById('select-person-pay');
const personStatusWrapper = document.getElementById('person-status-wrapper');
const personBalanceBox = document.getElementById('person-balance-box');
const paymentForm = document.getElementById('payment-form');
const payAmountInput = document.getElementById('pay-amount');
const paymentsHistoryBody = document.getElementById('payments-history-body');

// العناصر الجديدة للفلترة والربط الذكي
const filterBillMethodSection = document.getElementById('filter-bill-method-section');
const targetBillMethodRadios = document.getElementsByName('target-bill-method');

let currentUserId = null;
let currentRequiredDebt = 0; // إجمالي الديون المطلوبة حالياً من الشخص بناءً على الفلتر النشط
let currentPersonWallet = 0;  // رصيد الشخص الحالي في الـ wallet
let personBillsArray = [];    // قائمة فواتير الشخص المفتوحة والمصنفة بناءً على الفلتر

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        currentUserId = user.uid;
        initPaymentsPage();
    }
});

// 👥 تعبئة أسماء الأشخاص في القائمة المنسدلة
async function loadPersonsOptions() {
    if (!selectPersonPay) return;
    try {
        const personsRef = collection(db, 'users', currentUserId, 'persons');
        const querySnapshot = await getDocs(personsRef);
        selectPersonPay.innerHTML = '<option value="">-- اختر اسم الشخص --</option>';
        querySnapshot.forEach(doc => {
            const p = doc.data();
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            selectPersonPay.appendChild(opt);
        });
    } catch (e) { console.error("خطأ في جلب خيارات الأشخاص: ", e); }
}

// 📥 مراقبة تغيير اسم الشخص المستهدف والبدء بالحساب المالي
if (selectPersonPay) {
    selectPersonPay.addEventListener('change', async (e) => {
        const personName = e.target.value;
        if (!personName) {
            if (filterBillMethodSection) filterBillMethodSection.style.display = 'none';
            if (personStatusWrapper) personStatusWrapper.style.display = 'none';
            if (paymentForm) paymentForm.style.display = 'none';
            return;
        }
        
        // إعادة تعيين راديو الفلترة إلى "الكل" تلقائياً عند تغيير اسم الشخص لراحة المستخدم
        if (targetBillMethodRadios.length > 0) {
            targetBillMethodRadios[0].checked = true;
        }

        if (filterBillMethodSection) filterBillMethodSection.style.display = 'block';
        await calculatePersonFinancialStatus(personName, 'all');
    });
}

// ⚙️ إرفاق مستمع حدث (Event Listener) لراديو فلاتر طرق دفع الفواتير المستهدفة
if (targetBillMethodRadios.length > 0) {
    targetBillMethodRadios.forEach(radio => {
        radio.addEventListener('change', async (e) => {
            const personName = selectPersonPay ? selectPersonPay.value : "";
            if (!personName) return;
            const selectedMethod = e.target.value;
            await calculatePersonFinancialStatus(personName, selectedMethod);
        });
    });
}

// 🧮 حساب ديون وفائض الشخص بالكامل وتجميعها ذكياً حسب الفلتر المختار
async function calculatePersonFinancialStatus(personName, filterMethod) {
    try {
        // 1. قراءة الفائض/العجز المحفوظ في محفظة الشخص بـ Firestore
        let walletBalance = 0;
        const walletDocRef = doc(db, 'users', currentUserId, 'wallets', personName);
        const walletSnap = await getDoc(walletDocRef);
        if (walletSnap.exists()) {
            walletBalance = parseFloat(walletSnap.data().balance) || 0;
        }
        currentPersonWallet = walletBalance;

        // 2. جلب كل الفواتير "غير المدفوعة" التي يشترك فيها الشخص
        const billsRef = collection(db, 'users', currentUserId, 'bills');
        const querySnapshot = await getDocs(billsRef);
        
        currentRequiredDebt = 0;
        personBillsArray = [];

        querySnapshot.forEach(docSnap => {
            const bill = docSnap.data();
            
            // شروط التحقق الأساسية (نشطة، غير مؤرشفة، والشخص مسجل بها مسبقاً)
            if (bill.status !== 'مدفوع' && !bill.archived && bill.breakdown && bill.breakdown[personName]) {
                
                // فحص الفلترة المختارة (الكل، أو فلترة معينة تدعم الإنجليزية والعربية معاً)
                let isMatch = false;
                if (filterMethod === 'all') {
                    isMatch = true;
                } else if (filterMethod === 'Credit Card' && bill.paymentMethod === 'Credit Card') {
                    isMatch = true;
                } else if (filterMethod === 'Cash' && (bill.paymentMethod === 'Cash' || bill.paymentMethod === 'كاش')) {
                    isMatch = true;
                } else if (filterMethod === 'InstaPay' && bill.paymentMethod === 'InstaPay') {
                    isMatch = true;
                }

                if (isMatch) {
                    let paidPart = (bill.partiallyPaid && bill.partiallyPaid[personName]) ? bill.partiallyPaid[personName] : 0;
                    let netDebt = bill.breakdown[personName] - paidPart;
                    
                    // تقريب الكسور لمنع فروقات جافا سكريبت العشرية
                    netDebt = Math.round(netDebt * 100) / 100;
                    
                    if (netDebt > 0) {
                        currentRequiredDebt += netDebt;
                        personBillsArray.push({ id: docSnap.id, netDebt: netDebt, originalShare: bill.breakdown[personName], ...bill });
                    }
                }
            }
        });

        // 🌟 ترتيب تصاعدي من الأقدم تماماً للأحدث تماماً لضمان عدالة التوزيع التاريخي FIFO للفلاتر النشطة
        personBillsArray.sort((a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime());

        // حساب القيمة الصافية النهائية المعروضة (الديون ناقص الفائض القديم إن وجد)
        let finalStatusAmount = currentRequiredDebt - walletBalance;
        finalStatusAmount = Math.round(finalStatusAmount * 100) / 100;

        if (payAmountInput) payAmountInput.step = "0.01";

        if (personStatusWrapper) personStatusWrapper.style.display = 'block';
        if (paymentForm) paymentForm.style.display = 'block';

        if (!personBalanceBox) return;

        // صياغة النص الإيضاحي لطبيعة التصفية الحالية في صندوق التنبيهات الملون
        let methodText = "كافة الفواتير المعلقة";
        if (filterMethod === 'Credit Card') methodText = "فواتير الـ Credit Card المعلقة";
        if (filterMethod === 'Cash') methodText = "فواتير الكاش المعلقة";
        if (filterMethod === 'InstaPay') methodText = "فواتير الـ InstaPay المعلقة";

        if (finalStatusAmount > 0) {
            personBalanceBox.className = "status-box status-debt";
            personBalanceBox.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> مطلوب من ${personName} عن (${methodText}): ${finalStatusAmount.toFixed(2)} ج.م`;
            if (payAmountInput) payAmountInput.value = finalStatusAmount.toFixed(2); 
        } else if (finalStatusAmount < 0) {
            personBalanceBox.className = "status-box status-credit";
            personBalanceBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${personName} له رصيد دائن عام (فائض بالمحفظة): ${Math.abs(finalStatusAmount).toFixed(2)} ج.م`;
            if (payAmountInput) payAmountInput.value = "";
        } else {
            personBalanceBox.className = "status-box status-zero";
            personBalanceBox.innerHTML = `<i class="fa-solid fa-scale-balanced"></i> لا يوجد مبالغ مستحقة على ${personName} بخصوص (${methodText})`;
            if (payAmountInput) payAmountInput.value = "";
        }

    } catch (e) { console.error("خطأ في احتساب مركز الفرد المالي: ", e); }
}

// 💾 معالجة زر الإرسال للحالات المحاسبية المختلفة
if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const submitBtn = paymentForm.querySelector('button[type="submit"]');
        const personName = selectPersonPay ? selectPersonPay.value : "";
        const amountPaid = payAmountInput ? parseFloat(payAmountInput.value) : 0;
        const checkedMethod = document.querySelector('input[name="pay-method"]:checked');
        const payMethod = checkedMethod ? checkedMethod.value : "كاش";

        // معرفة الفلتر النشط أثناء السداد لتضمينه في نص البيان الإحصائي بالتاريخ
        let activeFilterRadio = document.querySelector('input[name="target-bill-method"]:checked');
        let activeFilterValue = activeFilterRadio ? activeFilterRadio.value : "all";

        if (!personName || isNaN(amountPaid) || amountPaid <= 0) {
            alert("⚠️ برجاء إدخال مبلغ صحيح وبشكل قانوني!");
            return;
        }

        // 🛡️ تأمين جدار الحماية ضد الضغط المتكرر السريع (Double Submission Guard)
        if (submitBtn) submitBtn.disabled = true;

        try {
            // القوة الشرائية الإجمالية للسداد = الكاش الحالي المستلم + رصيد المحفظة القديم الفائض
            let remainingCash = parseFloat((amountPaid + currentPersonWallet).toFixed(2));
            let typeOfPayment = "";

            // تطبيق خوارزمية التوزيع التاريخي الأقدم فالأحدث بناءً على المصفوفة المفلترة المضمونة (FIFO)
            for (let bill of personBillsArray) {
                if (remainingCash <= 0) break;

                const billDocRef = doc(db, 'users', currentUserId, 'bills', bill.id);
                let currentPaidRecord = (bill.partiallyPaid && bill.partiallyPaid[personName]) ? bill.partiallyPaid[personName] : 0;

                if (remainingCash >= bill.netDebt) {
                    remainingCash = parseFloat((remainingCash - bill.netDebt).toFixed(2));
                    
                    let newPartiallyPaid = bill.partiallyPaid || {};
                    newPartiallyPaid[personName] = bill.originalShare;

                    // التحقق: هل كل أطراف الفاتورة سددوا لغلق الفاتورة بالكامل في السيستم؟
                    let isWholeBillPaid = true;
                    Object.entries(bill.breakdown).forEach(([name, share]) => {
                        if (name !== personName) {
                            let otherPaid = (bill.partiallyPaid && bill.partiallyPaid[name]) ? bill.partiallyPaid[name] : 0;
                            if (otherPaid < share) isWholeBillPaid = false;
                        }
                    });

                    await updateDoc(billDocRef, {
                        partiallyPaid: newPartiallyPaid,
                        status: isWholeBillPaid ? 'مدفوع' : 'غير مدفوع'
                    });

                } else {
                    let newPartiallyPaid = bill.partiallyPaid || {};
                    newPartiallyPaid[personName] = parseFloat((currentPaidRecord + remainingCash).toFixed(2));
                    remainingCash = 0;

                    await updateDoc(billDocRef, { partiallyPaid: newPartiallyPaid });
                }
            }

            // معالجة الفائض أو العجز المتبقي في الـ Wallet الأساسية للشخص
            const walletDocRef = doc(db, 'users', currentUserId, 'wallets', personName);
            let newWalletBalance = 0;

            const totalPower = amountPaid + currentPersonWallet;
            
            // صياغة تفاصيل نوع التسوية ونوع الفواتير المصفاة لحفظها في السجلات التاريخية
            let filterLogText = "حساب عام";
            if (activeFilterValue === 'Credit Card') filterLogText = "فواتير Credit";
            if (activeFilterValue === 'Cash') filterLogText = "فواتير كاش";
            if (activeFilterValue === 'InstaPay') filterLogText = "فواتير InstaPay";

            if (Math.abs(totalPower - currentRequiredDebt) < 0.01) {
                typeOfPayment = `تسوية كاملة مخصصة لـ (${filterLogText})`;
                newWalletBalance = 0;
            } else if (totalPower < currentRequiredDebt) {
                typeOfPayment = `تسوية جزئية مخصصة لـ (${filterLogText})`;
                newWalletBalance = 0; 
            } else {
                typeOfPayment = `تسوية فائضة عن (${filterLogText}) - تم ترحيل فائض للمحفظة`;
                newWalletBalance = remainingCash; 
            }

            await setDoc(walletDocRef, { balance: newWalletBalance }, { merge: true });

            // إضافة حركة المقبوضات في جدول المقبوضات التاريخي
            const paymentsRef = collection(db, 'users', currentUserId, 'payments');
            await addDoc(paymentsRef, {
                personName,
                amount: amountPaid,
                method: payMethod,
                type: typeOfPayment,
                date: new Date().toISOString().split('T')[0],
                createdAt: new Date().toISOString()
            });

            alert(`✅ تم حفظ السداد بنجاح كـ (${payMethod}) وتوزيعه على ${filterLogText} وفق الترتيب التاريخي.`);
            
            paymentForm.reset();
            if (filterBillMethodSection) filterBillMethodSection.style.display = 'none';
            if (personStatusWrapper) personStatusWrapper.style.display = 'none';
            if (paymentForm) paymentForm.style.display = 'none';
            if (selectPersonPay) selectPersonPay.value = "";
            
            await fetchPaymentsHistory();

        } catch (error) {
            console.error(error);
            alert("حدث خطأ أثناء معالجة عملية السداد: " + error.message);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// 📥 جلب وعرض سجل المقبوضات بالكامل لجميع الأشخاص متوافق مع المظهرين
async function fetchPaymentsHistory() {
    if (!currentUserId || !paymentsHistoryBody) return;
    try {
        const paymentsRef = collection(db, 'users', currentUserId, 'payments');
        const querySnapshot = await getDocs(paymentsRef);
        paymentsHistoryBody.innerHTML = '';
        
        let pList = [];
        querySnapshot.forEach(doc => pList.push(doc.data()));
        
        if (pList.length === 0) {
            paymentsHistoryBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted, #999); padding:20px;">لا يوجد عمليات سداد مسجلة حتى الآن.</td></tr>`;
            return;
        }

        // ترتيب الحركات التنازلية حسب تاريخ الإيداع الأحدث أولاً
        pList.sort((a, b) => new Date(b.createdAt || b.date).getTime() - new Date(a.createdAt || a.date).getTime());

        pList.forEach(p => {
            const row = document.createElement('tr');
            
            let methodBadge = '';
            if (p.method === 'InstaPay') {
                methodBadge = `<span class="badge payment-instapay"><i class="fa-solid fa-mobile-screen-button"></i> InstaPay</span>`;
            } else if (p.method === 'Credit Card') {
                methodBadge = `<span class="badge payment-credit"><i class="fa-solid fa-credit-card"></i> Credit Card</span>`;
            } else {
                methodBadge = `<span class="badge payment-cash"><i class="fa-solid fa-money-bill-wave"></i> كاش</span>`;
            }

            row.innerHTML = `
                <td>${p.date}</td>
                <td><strong>${p.personName}</strong></td>
                <td style="font-weight:700; color: var(--status-paid-text, #2b8a3e);">+${parseFloat(p.amount).toFixed(2)} ج.م</td>
                <td>${methodBadge}</td>
                <td><span style="font-size:12px; color: var(--text-muted, #666);">${p.type}</span></td>
            `;
            paymentsHistoryBody.appendChild(row);
        });

    } catch (e) { console.error("خطأ في تحميل سجل السداد الحركي: ", e); }
}

async function initPaymentsPage() {
    await loadPersonsOptions();
    await fetchPaymentsHistory();
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        if (confirm("هل تريد تسجيل الخروج والعودة لصفحة الدخول؟")) {
            await signOut(auth);
            window.location.href = 'index.html';
        }
    });
}