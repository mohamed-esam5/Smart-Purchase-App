/* js/auth.js */
import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    sendPasswordResetEmail, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// عناصر الواجهة
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const authTitle = document.getElementById('auth-title');
const toggleText = document.getElementById('toggle-text');
const errorDiv = document.getElementById('error-message');

let isLoginMode = true;

// 🛡️ فحص حالة المستخدم الحالية (Route Guard)
onAuthStateChanged(auth, (user) => {
    if (user) {
        window.location.href = 'dashboard.html';
    }
});

// دالة تبديل وضع الواجهة بين تسجيل الدخول والإنشاء
function toggleAuthMode(e) {
    if (e) e.preventDefault();
    
    isLoginMode = !isLoginMode;
    errorDiv.style.display = 'none';
    
    // جلب رابط نسيت كلمة المرور للتحكم في ظهوره
    const forgotLink = document.getElementById('forgot-password-link');
    
    if (isLoginMode) {
        authTitle.textContent = 'تسجيل الدخول';
        submitBtn.textContent = 'دخول';
        toggleText.innerHTML = 'ليس لديك حساب؟ <a href="#" id="toggle-link">إنشاء حساب جديد</a>';
        if (forgotLink) forgotLink.style.display = 'inline-block';
    } else {
        authTitle.textContent = 'إنشاء حساب جديد';
        submitBtn.textContent = 'تسجيل الحساب';
        toggleText.innerHTML = 'لديك حساب بالفعل؟ <a href="#" id="toggle-link">تسجيل الدخول</a>';
        if (forgotLink) forgotLink.style.display = 'none';
    }
    
    // 🔄 إعادة ربط الحدث فوراً للعنصر الجديد المحقون في الـ DOM منعاً لتراكم الأحداث أو موتها
    const newToggleLink = document.getElementById('toggle-link');
    if (newToggleLink) {
        newToggleLink.addEventListener('click', toggleAuthMode);
    }
}

// 🆕 دالة معالجة نسيان كلمة المرور وإرسال البريد الإلكتروني
async function handleForgotPassword(e) {
    e.preventDefault();
    const email = emailInput.value.trim();
    
    errorDiv.style.display = 'none';
    
    // التحقق من إدخال البريد الإلكتروني أولاً
    if (!email) {
        errorDiv.style.display = 'block';
        errorDiv.style.background = 'var(--status-unpaid-bg, #fff5f5)';
        errorDiv.style.color = 'var(--status-unpaid-text, #c92a2a)';
        errorDiv.textContent = 'برجاء كتابة بريدك الإلكتروني في الخانة المخصصة أولاً لإرسال رابط التعيين.';
        emailInput.focus();
        return;
    }
    
    try {
        // إرسال طلب إعادة التعيين للسيرفر
        await sendPasswordResetEmail(auth, email);
        
        // إظهار رسالة نجاح خضراء للمستخدم بداخل الـ errorDiv لتوفير المساحة
        errorDiv.style.display = 'block';
        errorDiv.style.background = 'var(--status-paid-bg, #e6fcf5)';
        errorDiv.style.color = 'var(--status-paid-text, #0ca678)';
        errorDiv.style.borderColor = 'var(--status-paid-text, #0ca678)';
        errorDiv.textContent = '🚀 تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني بنجاح! تفقد صندوق الوارد أو الـ Spam.';
    } catch (error) {
        errorDiv.style.display = 'block';
        errorDiv.style.background = 'var(--status-unpaid-bg, #fff5f5)';
        errorDiv.style.color = 'var(--status-unpaid-text, #c92a2a)';
        errorDiv.style.borderColor = '';
        
        console.error("Reset Password Error:", error.code);
        
        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/invalid-email':
                errorDiv.textContent = 'هذا البريد الإلكتروني غير مسجل لدينا أو صيغته خاطئة.';
                break;
            case 'auth/too-many-requests':
                errorDiv.textContent = 'تم حظر العمليات مؤقتاً لكثرة الطلبات. حاول مجدداً لاحقاً.';
                break;
            default:
                errorDiv.textContent = 'حدث خطأ أثناء إرسال البريد: ' + error.message;
        }
    }
}

// ربط الأحداث عند تحميل الصفحة بالكامل
document.addEventListener('DOMContentLoaded', () => {
    const initialToggleLink = document.getElementById('toggle-link');
    if (initialToggleLink) {
        initialToggleLink.addEventListener('click', toggleAuthMode);
    }
    
    // 🆕 ربط الحدث الخاص برابط "نسيت كلمة المرور"
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', handleForgotPassword);
    }
});

// إرسال النموذج (Submit Form)
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // إعادة تعيين ستايل الأخطاء الافتراضي
    errorDiv.style.background = '';
    errorDiv.style.color = '';
    errorDiv.style.borderColor = '';
    errorDiv.style.display = 'none';
    
    submitBtn.disabled = true;
    submitBtn.textContent = isLoginMode ? 'جاري الدخول...' : 'جاري التسجيل...';

    try {
        if (isLoginMode) {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = 'dashboard.html';
        } else {
            await createUserWithEmailAndPassword(auth, email, password);
            window.location.href = 'dashboard.html';
        }
    } catch (error) {
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? 'دخول' : 'تسجيل الحساب';
        
        console.error("Firebase Auth Error Code:", error.code);
        
        switch (error.code) {
            case 'auth/invalid-credential':
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                errorDiv.textContent = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
                break;
            case 'auth/invalid-email':
                errorDiv.textContent = 'صيغة البريد الإلكتروني غير صحيحة.';
                break;
            case 'auth/weak-password':
                errorDiv.textContent = 'كلمة المرور يجب ألا تقل عن 6 أحرف.';
                break;
            case 'auth/email-already-in-use':
                errorDiv.textContent = 'هذا البريد الإلكتروني مستخدم بالفعل.';
                break;
            case 'auth/too-many-requests':
                errorDiv.textContent = 'تم حظر المحاولات مؤقتاً لكثرة الطلبات الخاطئة. حاول لاحقاً.';
                break;
            default:
                errorDiv.textContent = 'حدث خطأ أثناء المصادقة: ' + error.message;
        }
    }
});