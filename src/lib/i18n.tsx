import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const STORAGE_KEY = "app-lang";

// UI chrome only — uploaded report data (column names/values) is never
// translated, since it's arbitrary company-provided content.
const dict = {
  "index.headerTitle": { ar: "نظام مندوبي", en: "My Riders System" },
  "index.adminLogin": { ar: "دخول الإدارة", en: "Admin Login" },
  "index.liveBadge": { ar: "نظام مباشر ومحدث شهرياً", en: "Live system, updated monthly" },
  "index.heroTitle": { ar: "تقارير المناديب من نظام مندوبي", en: "Rider Reports From My Riders System" },
  "index.heroDesc": {
    ar: "أدخل رقم الإقامة الخاص بك لعرض تقاريرك الشهرية من الأداء والرواتب.",
    en: "Enter your Iqama number or ID to view your monthly performance and salary reports.",
  },
  "index.searchPlaceholder": { ar: "ادخل رقم الإقامة ", en: "Iqama number" },
  "index.searchButton": { ar: "استعلام", en: "Search" },
  "index.featureMonthlyTitle": { ar: "شهري", en: "Monthly" },
  "index.featureMonthlyDesc": { ar: "تقارير محدثة كل شهر", en: "Reports updated every month" },
  "index.featureFullTitle": { ar: "شامل", en: "Complete" },
  "index.featureFullDesc": {
    ar: "أداء + راتب + خصومات",
    en: "Performance + salary + deductions",
  },
  "index.featureSecureTitle": { ar: "آمن", en: "Secure" },
  "index.featureSecureDesc": { ar: "بيانات محمية ومشفرة", en: "Protected and encrypted data" },
  "index.QulityTitle": { ar: "الفئة", en: "Assessment" },
  "index.QulityDesc": { ar: "الاستعلام عن فئة هنقر", en: "Lookup reports for quality assessment" },

  "auth.title": { ar: "لوحة الإدارة", en: "Admin Panel" },
  "auth.descSignin": {
    ar: "سجل الدخول للوصول إلى إدارة التقارير",
    en: "Sign in to access report management",
  },
  "auth.descForgot": {
    ar: "أدخل بريدك لإعادة تعيين كلمة المرور",
    en: "Enter your email to reset your password",
  },
  "auth.emailLabel": { ar: "البريد الإلكتروني", en: "Email" },
  "auth.passwordLabel": { ar: "كلمة المرور", en: "Password" },
  "auth.showPassword": { ar: "إظهار كلمة المرور", en: "Show password" },
  "auth.hidePassword": { ar: "إخفاء كلمة المرور", en: "Hide password" },
  "auth.signInButton": { ar: "دخول", en: "Sign in" },
  "auth.forgotPassword": { ar: "نسيت كلمة المرور؟", en: "Forgot password?" },
  "auth.sendResetButton": { ar: "إرسال رابط الاستعادة", en: "Send reset link" },
  "auth.backToSignin": { ar: "العودة لتسجيل الدخول", en: "Back to sign in" },
  "auth.backToLookup": { ar: "العودة إلى صفحة الاستعلام", en: "Back to lookup page" },
  "auth.toastSignInSuccess": { ar: "تم تسجيل الدخول", en: "Signed in successfully" },
  "auth.toastResetSent": {
    ar: "إذا كان البريد مسجلاً، ستصلك رسالة لإعادة تعيين كلمة المرور",
    en: "If the email is registered, you'll receive a password reset message",
  },

  "resetPassword.title": { ar: "إعادة تعيين كلمة المرور", en: "Reset Password" },
  "resetPassword.desc": { ar: "أدخل كلمة المرور الجديدة", en: "Enter your new password" },
  "resetPassword.invalidLink": {
    ar: "رابط غير صالح أو منتهي. اطلب رابطاً جديداً من صفحة تسجيل الدخول.",
    en: "Invalid or expired link. Request a new one from the sign-in page.",
  },
  "resetPassword.back": { ar: "العودة", en: "Back" },
  "resetPassword.newPasswordLabel": { ar: "كلمة المرور الجديدة", en: "New password" },
  "resetPassword.confirmPasswordLabel": { ar: "تأكيد كلمة المرور", en: "Confirm password" },
  "resetPassword.updateButton": { ar: "تحديث كلمة المرور", en: "Update password" },
  "resetPassword.toastTooShort": {
    ar: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
    en: "Password must be at least 6 characters",
  },
  "resetPassword.toastMismatch": {
    ar: "كلمتا المرور غير متطابقتين",
    en: "Passwords do not match",
  },
  "resetPassword.toastUpdated": { ar: "تم تحديث كلمة المرور", en: "Password updated" },

  "rider.back": { ar: "العودة", en: "Back" },
  "rider.notFoundTitle": { ar: "لم يتم العثور على المندوب", en: "Rider not found" },
  "rider.notFoundDesc": {
    ar: "لا توجد بيانات مسجلة برقم الإقامة:",
    en: "No data found for Iqama number:",
  },
  "rider.multipleResultsTitle": { ar: "تم العثور على أكثر من نتيجة", en: "Multiple results found" },
  "rider.multipleResultsDesc": {
    ar: "رقم الإقامة هذا مسجل لدى أكثر من شركة. اختر شركتك للمتابعة:",
    en: "This Iqama number is registered with more than one company. Choose your company to continue:",
  },
  "rider.riderLabel": { ar: "المندوب", en: "Rider" },
  "rider.iqamaLabel": { ar: "رقم الإقامة", en: "Iqama Number" },
  "rider.changeCompany": { ar: "تغيير الشركة", en: "Change company" },
  "rider.companyLabel": { ar: "الشركة", en: "Company" },
  "rider.monthsAvailable": { ar: "الأشهر المتاحة", en: "Available Months" },
  "rider.noReports": { ar: "لا توجد تقارير", en: "No reports" },
  "rider.openBadge": { ar: "مفتوح", en: "Open" },
  "rider.chooseMonthTitle": {
    ar: "اختر شهراً لعرض التقرير",
    en: "Choose a month to view the report",
  },
  "rider.chooseMonthDesc": {
    ar: "اضغط على أحد الأشهر في القائمة الجانبية.",
    en: "Click a month in the sidebar.",
  },
  "rider.reportLabel": { ar: "تقرير", en: "Report" },
  "rider.allMonthData": { ar: "جميع بيانات الشهر", en: "All monthly data" },
  "rider.metricTotal": { ar: "إجمالي الطلبات", en: "Total Orders" },
  "rider.metricHours": { ar: "ساعات العمل", en: "Work Hours" },
  "rider.metricSalary": { ar: "صافي الراتب", en: "Net Salary" },

  "admin.unauthorizedTitle": { ar: "غير مصرح", en: "Not authorized" },
  "admin.unauthorizedDesc": {
    ar: "حسابك لا يملك صلاحيات الإدارة أو غير مرتبط بشركة.",
    en: "Your account doesn't have admin permissions or isn't linked to a company.",
  },
  "admin.signOutButton": { ar: "تسجيل الخروج", en: "Sign out" },
  "admin.headerTitle": { ar: "لوحة إدارة التقارير", en: "Report Management Dashboard" },
  "admin.headerSubtitleDefault": {
    ar: "إدارة تقارير المناديب الشهرية",
    en: "Monthly rider report management",
  },
  "admin.logout": { ar: "خروج", en: "Logout" },
  "admin.statReportsCount": { ar: "عدد التقارير", en: "Number of Reports" },
  "admin.statTotalRiders": { ar: "إجمالي المناديب", en: "Total Riders" },
  "admin.statLastReport": { ar: "آخر تقرير", en: "Last Report" },
  "admin.uploadCardTitle": { ar: "رفع تقرير جديد", en: "Upload New Report" },
  "admin.uploadCardDesc": {
    ar: "اختر الشهر والسنة ثم ارفع ملف Excel",
    en: "Choose month and year then upload the Excel file",
  },
  "admin.monthLabel": { ar: "الشهر", en: "Month" },
  "admin.yearLabel": { ar: "السنة", en: "Year" },
  "admin.excelFileLabel": { ar: "ملف Excel", en: "Excel File" },
  "admin.replaceCheckbox": {
    ar: "استبدال إذا كان يوجد تقرير لنفس الشهر",
    en: "Replace if a report already exists for this month",
  },
  "admin.uploadingButton": { ar: "جاري الرفع...", en: "Uploading..." },
  "admin.uploadButton": { ar: "رفع التقرير", en: "Upload Report" },
  "admin.uploadedReportsTitle": { ar: "التقارير المرفوعة", en: "Uploaded Reports" },
  "admin.noReportsYet": {
    ar: "لا توجد تقارير بعد. ارفع أول تقرير أعلاه.",
    en: "No reports yet. Upload your first report above.",
  },
  "admin.tableMonth": { ar: "الشهر", en: "Month" },
  "admin.tableYear": { ar: "السنة", en: "Year" },
  "admin.tableFileName": { ar: "اسم الملف", en: "File Name" },
  "admin.tableRiderCount": { ar: "عدد المناديب", en: "Rider Count" },
  "admin.tableUploadDate": { ar: "تاريخ الرفع", en: "Upload Date" },
  "admin.tableActions": { ar: "إجراءات", en: "Actions" },
  "admin.deleteReportTitle": { ar: "حذف التقرير؟", en: "Delete report?" },
  "admin.cancel": { ar: "إلغاء", en: "Cancel" },
  "admin.delete": { ar: "حذف", en: "Delete" },
  "admin.toastSelectFile": { ar: "اختر ملف Excel", en: "Choose an Excel file" },
  "admin.toastNoIqamaColumn": {
    ar: "لم يتم العثور على عمود رقم الإقامة في الملف. تأكد من وجود عمود مثل: رقم الإقامة / Iqama / ID",
    en: "No Iqama number column found in the file. Make sure a column like Iqama / ID exists.",
  },
  "admin.toastEmptyFile": { ar: "الملف فارغ", en: "The file is empty" },
  "admin.toastUploadFailed": { ar: "فشل الرفع", en: "Upload failed" },
  "admin.toastDeleteSuccess": { ar: "تم حذف التقرير", en: "Report deleted" },
  "admin.toastDeleteFailed": { ar: "فشل الحذف", en: "Delete failed" },

  "superAdmin.unauthorizedDesc": {
    ar: "هذه الصفحة مخصصة للسوبر أدمن فقط.",
    en: "This page is for super admins only.",
  },
  "superAdmin.companyDashboardButton": { ar: "لوحة الشركة", en: "Company Dashboard" },
  "superAdmin.headerTitle": { ar: "لوحة السوبر أدمن", en: "Super Admin Dashboard" },
  "superAdmin.headerSubtitle": {
    ar: "إدارة الشركات وحسابات الدخول",
    en: "Manage companies and login accounts",
  },
  "superAdmin.companiesCardTitle": { ar: "الشركات", en: "Companies" },
  "superAdmin.companiesCardDesc": {
    ar: "كل شركة لها حساب مستقل وبياناتها معزولة",
    en: "Each company has an independent account with isolated data",
  },
  "superAdmin.newCompanyPlaceholder": { ar: "اسم الشركة الجديدة", en: "New company name" },
  "superAdmin.logoFieldTitle": { ar: "شعار الشركة (اختياري)", en: "Company logo (optional)" },
  "superAdmin.addButton": { ar: "إضافة", en: "Add" },
  "superAdmin.tableLogo": { ar: "الشعار", en: "Logo" },
  "superAdmin.tableCompany": { ar: "الشركة", en: "Company" },
  "superAdmin.tableCreatedDate": { ar: "تاريخ الإنشاء", en: "Created Date" },
  "superAdmin.tableActions": { ar: "إجراءات", en: "Actions" },
  "superAdmin.deleteCompanyTitle": { ar: "حذف الشركة؟", en: "Delete company?" },
  "superAdmin.accountsCardTitle": { ar: "الحسابات", en: "Accounts" },
  "superAdmin.accountsCardDesc": {
    ar: "إنشاء حسابات دخول لكل شركة",
    en: "Create login accounts for each company",
  },
  "superAdmin.emailLabel": { ar: "البريد الإلكتروني", en: "Email" },
  "superAdmin.passwordLabel": { ar: "كلمة المرور", en: "Password" },
  "superAdmin.companyLabel": { ar: "الشركة", en: "Company" },
  "superAdmin.chooseCompanyPlaceholder": { ar: "اختر شركة", en: "Choose a company" },
  "superAdmin.createAccountButton": { ar: "إنشاء حساب", en: "Create Account" },
  "superAdmin.tableEmail": { ar: "البريد", en: "Email" },
  "superAdmin.tableLastLogin": { ar: "آخر دخول", en: "Last Login" },
  "superAdmin.neverLoggedIn": { ar: "لم يدخل بعد", en: "Never logged in" },
  "superAdmin.superAdminBadge": { ar: "سوبر أدمن", en: "Super Admin" },
  "superAdmin.deleteAccountTitle": { ar: "حذف الحساب؟", en: "Delete account?" },
  "superAdmin.changeLogoTitle": { ar: "تغيير الشعار", en: "Change logo" },
  "superAdmin.logoDialogDesc": {
    ar: "يظهر بجانب اسم الشركة عند بحث المندوب برقم الإقامة",
    en: "Shown next to the company name when a rider searches by Iqama number",
  },
  "superAdmin.changePasswordTitle": { ar: "تغيير كلمة المرور", en: "Change password" },
  "superAdmin.changePasswordDesc": {
    ar: "أدخل كلمة المرور الجديدة (6 أحرف على الأقل)",
    en: "Enter the new password (at least 6 characters)",
  },
  "superAdmin.newPasswordPlaceholder": { ar: "كلمة المرور الجديدة", en: "New password" },
  "superAdmin.changeEmailTitle": { ar: "تغيير البريد", en: "Change email" },
  "superAdmin.changeEmailDialogTitle": {
    ar: "تغيير البريد الإلكتروني",
    en: "Change Email Address",
  },
  "superAdmin.save": { ar: "حفظ", en: "Save" },
  "superAdmin.toastCompanyCreated": { ar: "تم إنشاء الشركة", en: "Company created" },
  "superAdmin.toastCompanyDeleted": { ar: "تم حذف الشركة", en: "Company deleted" },
  "superAdmin.toastAccountCreated": { ar: "تم إنشاء الحساب", en: "Account created" },
  "superAdmin.toastAccountDeleted": { ar: "تم حذف الحساب", en: "Account deleted" },
  "superAdmin.toastChooseCompany": { ar: "اختر شركة", en: "Choose a company" },
  "superAdmin.toastEmailUpdated": { ar: "تم تحديث البريد", en: "Email updated" },
  "superAdmin.toastPasswordUpdated": { ar: "تم تحديث كلمة المرور", en: "Password updated" },
  "superAdmin.toastLogoUpdated": { ar: "تم تحديث الشعار", en: "Logo updated" },
  "superAdmin.toastChooseLogo": { ar: "اختر صورة الشعار", en: "Choose a logo image" },
  "superAdmin.toastMinPassword": { ar: "6 أحرف على الأقل", en: "At least 6 characters" },

  "install.button": { ar: "تثبيت التطبيق", en: "Install App" },
  "install.iosTitle": { ar: "تثبيت التطبيق على آيفون", en: "Install the app on iPhone" },
  "install.iosStep1": {
    ar: "1. اضغط على زر المشاركة",
    en: "1. Tap the Share button",
  },
  "install.iosStep2": {
    ar: '2. اختر "إضافة إلى الشاشة الرئيسية"',
    en: '2. Choose "Add to Home Screen"',
  },
  "install.iosStep3": { ar: "3. اضغط إضافة", en: "3. Tap Add" },
  "install.iosClose": { ar: "حسناً", en: "Got it" },
  "install.toastSuccess": { ar: "تم تثبيت التطبيق بنجاح", en: "App installed successfully" },

  "root.notFoundTitle": { ar: "الصفحة غير موجودة", en: "Page Not Found" },
  "root.notFoundDesc": {
    ar: "الصفحة التي تبحث عنها غير موجودة.",
    en: "The page you're looking for doesn't exist.",
  },
  "root.backHome": { ar: "العودة للرئيسية", en: "Back to Home" },
  "root.errorTitle": { ar: "حدث خطأ ما", en: "Something went wrong" },
  "root.retryButton": { ar: "إعادة المحاولة", en: "Try again" },
  "root.homeButton": { ar: "الرئيسية", en: "Home" },
} satisfies Record<string, { ar: string; en: string }>;

export type TranslationKey = keyof typeof dict;

interface LanguageContextValue {
  lang: Lang;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("ar");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "ar" || stored === "en") setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const t = (key: TranslationKey) => dict[key][lang];

  return (
    <LanguageContext.Provider value={{ lang, dir: lang === "ar" ? "rtl" : "ltr", setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}

export function localeFor(lang: Lang) {
  return lang === "ar" ? "ar-SA" : "en-US";
}
