/* js/theme.js */

document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    
    // 1. فحص المود الحالي عند تحميل الصفحة لتحديث شكل الأيقونة (شمس أو قمر)
    // التعديل الآمن: نتحقق من الـ localStorage أولاً أو كلاس الـ documentElement لضمان مزامنة فورية
    const savedTheme = localStorage.getItem('theme');
    const isDarkAtStart = savedTheme === 'dark' || document.documentElement.classList.contains('dark-mode');
    
    // التأكيد على تطبيق الكلاس في الـ html منعاً لأي اختلاف
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
    }
    
    updateIcon(isDarkAtStart);

    // 2. الاستماع لحدث الضغط على زرار التبديل
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            // التبديل على مستوى الـ html لتتماشى مع السكريبت اللي في الـ <head>
            document.documentElement.classList.toggle('dark-mode');
            
            const isDark = document.documentElement.classList.contains('dark-mode');
            
            // حفظ الاختيار في المتصفح فوراً
            if (isDark) {
                localStorage.setItem('theme', 'dark');
            } else {
                localStorage.setItem('theme', 'light');
            }
            
            // تغيير شكل الأيقونة لايف
            updateIcon(isDark);
        });
    }

    // دالة مساعدة لتغيير شكل الأيقونة (من قمر لشمس والعكس) مع حماية الـ Elements
    function updateIcon(isDark) {
        if (!themeToggleBtn) return;
        const icon = themeToggleBtn.querySelector('i');
        if (icon) {
            if (isDark) {
                icon.className = 'fa-solid fa-sun'; // أيقونة الشمس للعودة للوضع الفاتح
            } else {
                icon.className = 'fa-solid fa-moon'; // أيقونة القمر للذهاب للوضع الداكن
            }
        }
    }
});