/* js/auth.js */
import { auth } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// عناصر الواجهة
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submit-btn');
const authTitle = document.getElementById('auth-title');
const toggleLink = document.getElementById('toggle-link');
const toggleText = document.getElementById('toggle-text');
const errorDiv = document.getElementById('error-message');

let isLoginMode = true;

// 🛡️ فحص حالة المستخدم الحالية (Route Guard)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // إذا كان مسجل دخول بالفعل، توجه فوراً إلى لوحة التحكم
        window.location.href = 'dashboard.html';
    }
});

// التبديل بين وضع تسجيل الدخول وإنشاء حساب جديد
toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    errorDiv.style.display = 'none';
    
    if (isLoginMode) {
        authTitle.textContent = 'تسجيل الدخول';
        submitBtn.textContent = 'دخول';
        toggleText.innerHTML = 'ليس لديك حساب؟ <a href="#" id="toggle-link">إنشاء حساب جديد</a>';
    } else {
        authTitle.textContent = 'إنشاء حساب جديد';
        submitBtn.textContent = 'تسجيل الحساب';
        toggleText.innerHTML = 'لديك حساب بالفعل؟ <a href="#" id="toggle-link">تسجيل الدخول</a>';
    }
    
    // إعادة ربط الحدث للرابط الجديد بعد تغيير الهيكل
    document.getElementById('toggle-link').addEventListener('click', arguments.callee);
});

// إرسال النموذج (Submit Form)
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    errorDiv.style.display = 'none';
    submitBtn.disabled = true;
    submitBtn.textContent = isLoginMode ? 'جاري الدخول...' : 'جاري التسجيل...';

    try {
        if (isLoginMode) {
            // تسجيل دخول
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = 'dashboard.html';
        } else {
            // إنشاء حساب
            await createUserWithEmailAndPassword(auth, email, password);
            window.location.href = 'dashboard.html';
        }
    } catch (error) {
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = isLoginMode ? 'دخول' : 'تسجيل الحساب';
        
        // تخصيص رسائل الخطأ لتكون مفهومة بالعربية
        switch (error.code) {
            case 'auth/user-not-found':
                errorDiv.textContent = 'هذا الحساب غير مسجل لدينا.';
                break;
            case 'auth/wrong-password':
                errorDiv.textContent = 'كلمة المرور غير صحيحة.';
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
            default:
                errorDiv.textContent = 'حدث خطأ ما: ' + error.message;
        }
    }
});