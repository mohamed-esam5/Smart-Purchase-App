/* js/firebase-config.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// مفاتيح المنظومة لربط الواجهات بقواعد البيانات السحابية (Firebase SDK)
const firebaseConfig = {
  apiKey: "AIzaSyBejns29qlOMSeeS5gFWvIiofUibEx6H3A",
  authDomain: "smart-purchase-app.firebaseapp.com",
  projectId: "smart-purchase-app",
  storageBucket: "smart-purchase-app.firebasestorage.app",
  messagingSenderId: "106709053535",
  appId: "1:106709053535:web:407bc73786bbfecb2cabea",
  measurementId: "G-R8VNPGH0XJ"
};

// تهيئة تطبيق الـ Firebase مع معالجة الأخطاء لضمان استقرار الاتصال السحابي
let app;
try {
    app = initializeApp(firebaseConfig);
} catch (error) {
    console.error("خطأ حرج أثناء تهيئة اتصال Firebase: ", error);
}

// تصدير وحدات المصادقة وقواعد البيانات السحابية بشكل مركزي لباقي ملفات الجافا سكريبت
export const auth = getAuth(app);
export const db = getFirestore(app);