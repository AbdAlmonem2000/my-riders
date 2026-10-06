import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "ar" | "en";

const STORAGE_KEY = "app-lang";

// UI chrome only — uploaded report data (column names/values) is never
// translated, since it's arbitrary company-provided content.
const dict = {
  "common.viewModeCards": { ar: "عرض بطاقات", en: "Card view" },
  "common.viewModeTable": { ar: "عرض جدول", en: "Table view" },
  "photo.zoomTooltip": { ar: "اضغط لتكبير الصورة", en: "Click to enlarge photo" },
  "photo.rotateLeftButton": { ar: "تدوير لليسار", en: "Rotate left" },
  "photo.rotateRightButton": { ar: "تدوير لليمين", en: "Rotate right" },
  "photo.rotateFailed": { ar: "تعذّر حفظ اتجاه الصورة", en: "Couldn't save the photo's rotation" },
  "photo.downloadTooltip": { ar: "تنزيل الصورة", en: "Download photo" },
  "photo.downloadOpenedNewTab": {
    ar: "الصورة اتفتحت في تبويب جديد — اضغط بزر الماوس الأيمن عليها واختر «حفظ الصورة باسم»",
    en: 'Opened the photo in a new tab — right-click it and choose "Save image as"',
  },

  "index.headerTitle": { ar: "نظام مندوبي", en: "My Riders System" },
  "index.adminLogin": { ar: "دخول الإدارة", en: "Admin Login" },
  "index.about": { ar: "عن النظام", en: "About" },
  "index.lookup": { ar: "استعلام مندوب", en: "Rider lookup" },
  "index.liveBadge": { ar: "نظام مباشر ومحدث شهرياً", en: "Live system, updated monthly" },
  "index.heroTitle": {
    ar: "تقارير المناديب من نظام مندوبي",
    en: "Rider Reports From My Riders System",
  },
  "index.heroDesc": {
    ar: "أدخل رقم الإقامة أو ID الخاص بك لعرض تقاريرك الشهرية من الأداء والرواتب.",
    en: "Enter your Iqama or ID number to view your monthly performance and salary reports.",
  },
  "index.searchPlaceholder": { ar: "رقم الإقامة أو ID", en: "Iqama or ID number" },
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

  "rider.notFoundTitle": { ar: "لم يتم العثور على المندوب", en: "Rider not found" },
  "rider.notFoundDesc": {
    ar: "لا توجد بيانات مسجلة برقم الإقامة أو ID:",
    en: "No data found for Iqama or ID number:",
  },
  "rider.blockedTitle": { ar: "تم إيقاف الاستعلام", en: "Lookup disabled" },
  "rider.blockedDesc": {
    ar: "تم إيقاف استعلامك عن التقارير من قبل شركتك. للاستفسار، تواصل مع الشركة مباشرة.",
    en: "Your access to reports has been disabled by your company. Please contact the company directly.",
  },
  "rider.passwordGateTitle": {
    ar: "تقاريرك محمية بكلمة مرور",
    en: "Your reports are password-protected",
  },
  "rider.passwordGateDesc": {
    ar: "أدخل كلمة المرور الخاصة بك لعرض تقاريرك.",
    en: "Enter your password to view your reports.",
  },
  "rider.passwordLabel": { ar: "كلمة المرور", en: "Password" },
  "rider.unlockButton": { ar: "دخول", en: "Unlock" },
  "rider.wrongPassword": { ar: "كلمة المرور غير صحيحة", en: "Wrong password" },
  "rider.setPasswordButton": { ar: "اعمل كلمة مرور لحسابك", en: "Set a password" },
  "rider.setPasswordToastTitle": { ar: "احمِ بياناتك", en: "Protect your data" },
  "rider.setPasswordToastDesc": {
    ar: "لم تُنشئ كلمة مرور لحسابك بعد. أنشئها الآن حتى لا يطّلع على تقاريرك أي شخص يعرف رقم إقامتك.",
    en: "You haven't set a password yet. Create one now so no one who knows your Iqama number can see your reports.",
  },
  "rider.changePasswordButton": { ar: "غيّر كلمة المرور", en: "Change password" },
  "rider.passwordDialogDesc": {
    ar: "هتُطلب منك كل مرة تدخل تشوف تقاريرك على هذا الجهاز.",
    en: "You'll be asked for it each time you view your reports on a device.",
  },
  "rider.currentPasswordLabel": { ar: "كلمة المرور الحالية", en: "Current password" },
  "rider.newPasswordLabel": { ar: "كلمة المرور الجديدة", en: "New password" },
  "rider.confirmPasswordLabel": { ar: "تأكيد كلمة المرور", en: "Confirm password" },
  "rider.passwordTooShort": {
    ar: "كلمة المرور يجب أن تكون 4 أحرف على الأقل",
    en: "Password must be at least 4 characters",
  },
  "rider.passwordMismatch": { ar: "كلمتا المرور غير متطابقتين", en: "Passwords do not match" },
  "rider.passwordSaved": { ar: "تم حفظ كلمة المرور", en: "Password saved" },
  "rider.passwordSave": { ar: "حفظ", en: "Save" },
  "rider.multipleResultsTitle": { ar: "تم العثور على أكثر من نتيجة", en: "Multiple results found" },
  "rider.multipleResultsDesc": {
    ar: "هذا الرقم مسجل لدى أكثر من شركة. اختر شركتك للمتابعة:",
    en: "This number is registered with more than one company. Choose your company to continue:",
  },
  "rider.riderLabel": { ar: "المندوب", en: "Rider" },
  "rider.iqamaLabel": { ar: "رقم الإقامة أو ID", en: "Iqama or ID Number" },
  "rider.areaLabel": { ar: "المنطقة", en: "Area" },
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
  "rider.combinedFileLabel": { ar: "{count} تقارير مجمعة", en: "{count} combined reports" },
  "rider.allMonthData": { ar: "جميع بيانات الشهر", en: "All monthly data" },
  "rider.metricTotal": { ar: "إجمالي الطلبات", en: "Total Orders" },
  "rider.metricHours": { ar: "ساعات العمل", en: "Work Hours" },
  "rider.metricSalary": { ar: "صافي الراتب", en: "Net Salary" },
  "rider.noteTitle": { ar: "ملحوظة من الشركة", en: "Note from the company" },
  "rider.riderInfo": { ar: "بيانات المندوب", en: "Rider details" },
  "rider.notificationsTitle": { ar: "الإشعارات", en: "Notifications" },
  "rider.notificationsEmpty": { ar: "لا يوجد إشعارات", en: "No notifications" },
  "rider.warningsTitle": { ar: "الإنذارات", en: "Warnings" },
  "rider.warningsEmpty": { ar: "لا يوجد إنذارات", en: "No warnings" },

  "admin.unauthorizedTitle": { ar: "غير مصرح", en: "Not authorized" },
  "admin.unauthorizedDesc": {
    ar: "حسابك لا يملك صلاحيات الإدارة أو غير مرتبط بشركة.",
    en: "Your account doesn't have admin permissions or isn't linked to a company.",
  },
  "admin.noPermissionsTitle": { ar: "لا توجد صلاحيات ممنوحة", en: "No permissions granted" },
  "admin.noPermissionsDesc": {
    ar: "حسابك ليس له أي صلاحية على صفحات النظام حتى الآن. تواصل مع مدير الشركة.",
    en: "Your account has no permission on any page yet. Contact your company admin.",
  },
  "admin.suspendedTitle": { ar: "الحساب موقوف مؤقتًا", en: "Account temporarily suspended" },
  "admin.suspendedDesc": {
    ar: "تم إيقاف وصول شركتك مؤقتًا من قبل الإدارة. تواصل معهم لإعادة التفعيل.",
    en: "Your company's access has been temporarily suspended by the administration. Contact them to re-activate it.",
  },
  "admin.signOutButton": { ar: "تسجيل الخروج", en: "Sign out" },
  "admin.headerTitle": { ar: "لوحة إدارة التقارير", en: "Report Management Dashboard" },
  "admin.headerSubtitleDefault": {
    ar: "إدارة تقارير المناديب الشهرية",
    en: "Monthly rider report management",
  },
  "admin.logout": { ar: "خروج", en: "Logout" },
  "admin.navOverview": { ar: "نظرة عامة", en: "Overview" },
  "admin.navRiders": { ar: "بيانات المناديب", en: "Riders" },
  "admin.navReports": { ar: "التقارير", en: "Reports" },
  "admin.navDocuments": { ar: "المستندات", en: "Documents" },
  "admin.navOperatingCards": { ar: "كروت التشغيل", en: "Operating cards" },
  "admin.navExpiryAlerts": { ar: "تنبيهات انتهاء المستندات", en: "Expiry alerts" },
  "admin.navNotifications": { ar: "الإشعارات والإنذارات", en: "Notifications & Warnings" },
  "admin.navCompanyProfile": { ar: "بيانات الشركة", en: "Company profile" },
  "admin.goToPage": { ar: "الذهاب", en: "Go" },
  "admin.hideSidebar": { ar: "إخفاء القائمة الجانبية", en: "Hide sidebar" },
  "admin.showSidebar": { ar: "إظهار القائمة الجانبية", en: "Show sidebar" },
  "admin.dashboardTitle": { ar: "أداء المناديب", en: "Rider performance" },
  "admin.dashboardDesc": {
    ar: "تحليل تلقائي لأداء المناديب بناءً على التقارير المرفوعة",
    en: "Automatic rider-performance analysis based on uploaded reports",
  },
  "admin.dashboardNoReports": {
    ar: "ارفع أول تقرير عشان تقدر تشوف أداء المناديب",
    en: "Upload your first report to see rider performance",
  },
  "admin.dashboardNoMetric": {
    ar: "مقدرش أكتشف عمود أداء واضح (زي عدد الطلبات) في تقرير الشهر ده",
    en: "Couldn't detect a clear performance column (like order count) in this month's report",
  },
  "admin.dashboardMetricCaption": { ar: "المؤشر المستخدم:", en: "Metric used:" },
  "admin.dashboardComparedTo": { ar: "بالمقارنة بـ", en: "Compared to" },
  "admin.dashboardRangeFrom": { ar: "من", en: "From" },
  "admin.dashboardRangeTo": { ar: "إلى", en: "To" },
  "admin.dashboardMetricColumnLabel": {
    ar: "مقارنة الأداء حسب عمود",
    en: "Compare performance by column",
  },
  "admin.dashboardMetricColumnAuto": { ar: "تلقائي (أفضل تخمين)", en: "Automatic (best guess)" },
  "admin.dashboardMetricColumnCount": { ar: "{count} أعمدة", en: "{count} columns" },
  "admin.dashboardMetricColumnClear": { ar: "إلغاء الفلتر", en: "Clear filter" },
  "admin.dashboardAllRidersTitle": { ar: "كل المناديب", en: "All riders" },
  "admin.dashboardStatusChartTitle": { ar: "توزيع الأداء", en: "Performance breakdown" },
  "admin.dashboardStatusDonutTitle": { ar: "نسبة الأداء", en: "Performance share" },
  "admin.dashboardDailyTrendTitle": { ar: "الأداء اليومي", en: "Daily trend" },
  "admin.dashboardBreakdownColumnLabel": { ar: "العمود", en: "Column" },
  "admin.dashboardBreakdownDonutTitle": { ar: "توزيع القيم", en: "Value distribution" },
  "admin.dashboardBreakdownBarTitle": { ar: "أعلى المناديب", en: "Top riders" },
  "admin.dashboardBreakdownOtherLabel": { ar: "أخرى", en: "Other" },
  "admin.dashboardBreakdownNotNumeric": {
    ar: "العمود ده مش أرقام — مفيش إجمالي يتحسب لكل مندوب",
    en: "This column isn't numeric — no per-rider total to show",
  },
  "admin.dashboardExportExcelButton": { ar: "تنزيل Excel", en: "Download Excel" },
  "admin.dashboardExportEmpty": {
    ar: "لا توجد بيانات لتنزيلها في النطاق المحدد",
    en: "No data to download for the selected range",
  },
  "admin.dashboardRiderSearchPlaceholder": {
    ar: "دوّر باسم المندوب",
    en: "Search by rider name",
  },
  "admin.dashboardNoPrevious": {
    ar: "لا يوجد شهر سابق للمقارنة — ده أول تقرير",
    en: "No previous month to compare with — this is the first report",
  },
  "admin.dashboardTopPerformers": { ar: "الأعلى أداءً هذا الشهر", en: "Top performers this month" },
  "admin.dashboardImproved": { ar: "الأكثر تحسّنًا", en: "Most improved" },
  "admin.dashboardDeclined": { ar: "الأكثر تراجعًا", en: "Most declined" },
  "admin.dashboardNoImproved": {
    ar: "مفيش تحسّن ملحوظ الشهر ده",
    en: "No notable improvement this month",
  },
  "admin.dashboardNoDeclined": {
    ar: "مفيش تراجع ملحوظ الشهر ده",
    en: "No notable decline this month",
  },
  "admin.dashboardSameCount": { ar: "ثابت", en: "Unchanged" },
  "admin.dashboardNewCount": { ar: "جديد", en: "New" },
  "admin.dashboardRidersCountLabel": { ar: "عدد المناديب", en: "Riders" },
  "admin.dashboardSearchTitle": { ar: "بحث عن مندوب", en: "Search a rider" },
  "admin.dashboardSearchDesc": {
    ar: "دوّر برقم الإقامة أو الـ ID عشان تشوف كل تقاريره الشهرية وتطوّر أدائه",
    en: "Search by Iqama or ID to see all their monthly reports and performance trend",
  },
  "admin.dashboardSearchPlaceholder": { ar: "رقم الإقامة أو ID", en: "Iqama or ID number" },
  "admin.dashboardSearchButton": { ar: "بحث", en: "Search" },
  "admin.dashboardSearchClear": { ar: "مسح", en: "Clear" },
  "admin.dashboardSearchNotFound": {
    ar: "لم يتم العثور على مندوب بهذا الرقم",
    en: "No rider found with this number",
  },
  "admin.dashboardSearchNoReports": {
    ar: "لا توجد تقارير لهذا المندوب",
    en: "No reports for this rider",
  },
  "admin.dashboardDetailsButton": { ar: "التفاصيل", en: "Details" },
  "admin.dashboardRiderTrendTitle": {
    ar: "مقارنة الأداء شهريًا",
    en: "Monthly performance comparison",
  },
  "admin.dashboardMetricValue": { ar: "القيمة", en: "Value" },
  "admin.dashboardChangeColumn": { ar: "التغيّر", en: "Change" },
  "admin.dashboardDownloadPdf": { ar: "تنزيل PDF", en: "Download PDF" },
  "admin.notificationsTitle": { ar: "الإشعارات", en: "Notifications" },
  "admin.notificationsEmpty": { ar: "لا توجد إشعارات حتى الآن", en: "No notifications yet" },
  "admin.expiryAlertsTitle": {
    ar: "تنبيهات انتهاء المستندات",
    en: "Document expiry alerts",
  },
  "admin.expiryAlertsSubtitle": {
    ar: "المستندات اللي هتنتهي خلال",
    en: "Documents expiring within",
  },
  "admin.expiryAlertsEmpty": {
    ar: "لا توجد مستندات قريبة من الانتهاء",
    en: "No documents nearing expiry",
  },
  "admin.expiryAlertsViewAll": { ar: "عرض كل التنبيهات", en: "View all alerts" },
  "admin.statReportsCount": { ar: "عدد التقارير", en: "Number of Reports" },
  "admin.statTotalRiders": { ar: "إجمالي المناديب", en: "Total Riders" },
  "admin.statLastReport": { ar: "آخر تقرير", en: "Last Report" },
  "admin.rosterCardTitle": {
    ar: "بيانات المناديب (الشيت الأساسي)",
    en: "Rider Directory (master sheet)",
  },
  "admin.rosterCardDesc": {
    ar: "ارفع شيت فيه رقم الإقامة و/أو الـ ID، الاسم، صورة المندوب (كرابط)، وأي بيانات إضافية. النظام يربط كل ده بالمندوب، وبعدها أي تقرير شهري يكفيه رقم واحد فقط (إقامة أو ID) والنظام يعرف الباقي.",
    en: "Upload a sheet with the Iqama and/or ID number, name, rider photo (as a link) and any extra data. The system links it all to each rider, so later a monthly report only needs one number (Iqama or ID) and the system knows the rest.",
  },
  "admin.rosterFileLabel": { ar: "شيت بيانات المناديب", en: "Rider data sheet" },
  "admin.rosterUploadButton": { ar: "تحديث بيانات المناديب", en: "Update rider directory" },
  "admin.rosterUploadingButton": { ar: "جاري التحديث...", en: "Updating..." },
  "admin.registeredRidersTitle": { ar: "المناديب المسجّلون", en: "Registered riders" },
  "admin.noRidersYet": { ar: "لا يوجد مناديب مسجّلون بعد", en: "No riders registered yet" },
  "admin.riderSearchPlaceholder": {
    ar: "بحث بالاسم أو رقم الإقامة أو ID",
    en: "Search by name, Iqama or ID",
  },
  "admin.filterAllAreas": { ar: "كل المناطق", en: "All areas" },
  "admin.filterAreasCount": { ar: "{count} مناطق محددة", en: "{count} areas selected" },
  "admin.filterByUserPlaceholder": { ar: "فلتر بمستخدم", en: "Filter by user" },
  "admin.filterByUserNone": { ar: "بدون فلتر مستخدم", en: "No user filter" },
  "admin.riderSearchNoResults": {
    ar: "لا يوجد مندوب مطابق للبحث",
    en: "No rider matches the search",
  },
  "admin.statRegisteredRiders": { ar: "مناديب مسجّلون", en: "Registered riders" },
  "admin.tablePhoto": { ar: "الصورة", en: "Photo" },
  "admin.tableName": { ar: "الاسم", en: "Name" },
  "admin.tableRider": { ar: "المندوب", en: "Rider" },
  "admin.tableIqama": { ar: "رقم الإقامة", en: "Iqama" },
  "admin.tableIdNumber": { ar: "الـ ID", en: "ID" },
  "admin.tableStatus": { ar: "الحالة", en: "Status" },
  "admin.riderBlockedLabel": { ar: "ممنوع من الاستعلام", en: "Blocked from lookup" },
  "admin.riderBlockButton": { ar: "منع", en: "Block" },
  "admin.riderUnblockButton": { ar: "سماح", en: "Allow" },
  "admin.deleteRiderTooltip": { ar: "حذف المندوب", en: "Delete rider" },
  "admin.deleteRiderTitle": { ar: "حذف المندوب؟", en: "Delete rider?" },
  "admin.deleteRiderCheckingReports": {
    ar: "جارٍ التحقق من تقارير المندوب…",
    en: "Checking the rider's reports…",
  },
  "admin.deleteRiderNoReports": {
    ar: "لا يوجد تقارير مرتبطة بهذا المندوب. هذا الإجراء نهائي ولا يمكن التراجع عنه.",
    en: "No reports are linked to this rider. This action is permanent and cannot be undone.",
  },
  "admin.deleteRiderHasReports": {
    ar: "هذا المندوب موجود في {count} تقرير. هل تريد حذفه من هذه التقارير أيضًا، أم تحذفه وتُبقي تقاريره القديمة كما هي؟",
    en: "This rider appears in {count} report(s). Delete them from those reports too, or delete the rider and keep the old reports as they are?",
  },
  "admin.deleteRiderKeepReportsButton": {
    ar: "حذف المندوب والإبقاء على تقاريره",
    en: "Delete rider, keep reports",
  },
  "admin.deleteRiderWithReportsButton": {
    ar: "حذف المندوب وتقاريره نهائيًا",
    en: "Delete rider and reports",
  },
  "admin.toastRiderDeleted": { ar: "تم حذف المندوب", en: "Rider deleted" },
  "admin.toastRiderDeleteFailed": { ar: "فشل حذف المندوب", en: "Failed to delete rider" },
  "admin.selectRiderLabel": { ar: "تحديد هذا المندوب", en: "Select this rider" },
  "admin.selectAllRidersLabel": { ar: "تحديد الكل", en: "Select all" },
  "admin.selectedCount": { ar: "{count} محدد", en: "{count} selected" },
  "admin.clearSelectionButton": { ar: "إلغاء التحديد", en: "Clear selection" },
  "admin.bulkBlockButton": { ar: "منع المحددين", en: "Block selected" },
  "admin.bulkBlockConfirmTitle": { ar: "منع المناديب المحددين؟", en: "Block selected riders?" },
  "admin.bulkBlockConfirmDesc": {
    ar: "هيتم منع {count} مندوب من تسجيل الدخول واستعراض تقاريرهم. تقدر تسمحلهم تاني في أي وقت.",
    en: "{count} rider(s) will be blocked from logging in and viewing their reports. You can allow them again anytime.",
  },
  "admin.toastBulkBlocked": { ar: "تم منع {count} مندوب", en: "Blocked {count} rider(s)" },
  "admin.toastBulkBlockFailed": {
    ar: "فشل منع المناديب المحددين",
    en: "Failed to block the selected riders",
  },
  "admin.blockAllButton": { ar: "منع الكل", en: "Block all" },
  "admin.blockAllConfirmTitle": { ar: "منع كل المناديب؟", en: "Block every rider?" },
  "admin.blockAllConfirmDesc": {
    ar: "هيتم منع كل المناديب المسجلين ({count}) من تسجيل الدخول واستعراض تقاريرهم. تقدر تسمحلهم تاني في أي وقت.",
    en: "All {count} registered rider(s) will be blocked from logging in and viewing their reports. You can allow them again anytime.",
  },
  "admin.bulkDeleteTooltip": { ar: "حذف المحددين", en: "Delete selected" },
  "admin.bulkDeleteTitle": { ar: "حذف {count} مندوب؟", en: "Delete {count} rider(s)?" },
  "admin.bulkDeleteCheckingReports": {
    ar: "جارٍ التحقق من تقارير المناديب المحددين…",
    en: "Checking the selected riders' reports…",
  },
  "admin.bulkDeleteNoReports": {
    ar: "لا يوجد تقارير مرتبطة بأي منهم. هذا الإجراء نهائي ولا يمكن التراجع عنه.",
    en: "No reports are linked to any of them. This action is permanent and cannot be undone.",
  },
  "admin.bulkDeleteHasReports": {
    ar: "المناديب المحددين موجودين في {count} تقرير إجمالاً. هل تريد حذفهم من هذه التقارير أيضًا، أم تحذفهم وتُبقي تقاريرهم القديمة كما هي؟",
    en: "The selected riders appear in {count} report(s) in total. Delete them from those reports too, or delete the riders and keep the old reports as they are?",
  },
  "admin.bulkDeleteKeepReportsButton": {
    ar: "حذف المناديب والإبقاء على تقاريرهم",
    en: "Delete riders, keep reports",
  },
  "admin.bulkDeleteWithReportsButton": {
    ar: "حذف المناديب وتقاريرهم نهائيًا",
    en: "Delete riders and reports",
  },
  "admin.toastBulkDeleted": { ar: "تم حذف {count} مندوب", en: "Deleted {count} rider(s)" },
  "admin.toastBulkDeleteFailed": {
    ar: "فشل حذف المناديب المحددين",
    en: "Failed to delete the selected riders",
  },
  "admin.riderPasswordButton": { ar: "كلمة المرور", en: "Password" },
  "admin.riderPasswordTitle": { ar: "كلمة مرور المندوب", en: "Rider password" },
  "admin.riderPasswordDesc": {
    ar: "لو عملت كلمة مرور، المندوب هيطلبها مع رقم الإقامة/الـ ID عشان يشوف تقاريره. سيبها فاضية عشان تشيلها.",
    en: "If set, the rider must enter it with their Iqama/ID to view reports. Leave empty to remove it.",
  },
  "admin.riderPasswordPlaceholder": {
    ar: "كلمة مرور جديدة (أو فاضي لإزالتها)",
    en: "New password (or empty to remove)",
  },
  "admin.riderHasPassword": { ar: "بكلمة مرور", en: "Password set" },
  "admin.toastRiderPasswordSet": { ar: "تم تعيين كلمة المرور", en: "Password set" },
  "admin.toastRiderPasswordCleared": { ar: "تم إزالة كلمة المرور", en: "Password removed" },
  "admin.toastRiderPasswordFailed": {
    ar: "فشل تحديث كلمة المرور",
    en: "Failed to update password",
  },
  "admin.addRiderButton": { ar: "إضافة مندوب", en: "Add rider" },
  "admin.addRiderTitle": { ar: "إضافة مندوب جديد", en: "Add a new rider" },
  "admin.editRiderTitle": { ar: "تعديل بيانات المندوب", en: "Edit rider" },
  "admin.editRiderTooltip": { ar: "تعديل", en: "Edit" },
  "admin.riderFormDesc": {
    ar: "أدخل رقم الإقامة أو الـ ID على الأقل. لو المندوب ده ظهر بعدين في تقرير شهري بنفس الرقم، هيترابط تلقائيًا معاه.",
    en: "Enter at least the Iqama or ID number. If this rider later appears in a monthly report with the same number, it links automatically.",
  },
  "admin.riderNameLabel": { ar: "الاسم", en: "Name" },
  "admin.riderPhotoLabel": { ar: "رابط الصورة", en: "Photo link" },
  "admin.uploadPhotoButton": { ar: "ارفع صورة من جهازك", en: "Upload photo from your device" },
  "admin.toastPhotoUploadFailed": { ar: "فشل رفع الصورة", en: "Failed to upload the photo" },
  "admin.riderAreaLabel": { ar: "المنطقة", en: "Area" },
  "admin.riderExtraLabel": { ar: "بيانات إضافية", en: "Extra data" },
  "admin.riderExtraKeyPlaceholder": { ar: "اسم الحقل", en: "Field name" },
  "admin.riderExtraValuePlaceholder": { ar: "القيمة", en: "Value" },
  "admin.riderFormNeedIdentifier": {
    ar: "لازم رقم إقامة أو ID على الأقل",
    en: "Iqama or ID is required",
  },
  "admin.toastRiderAdded": { ar: "تم إضافة المندوب", en: "Rider added" },
  "admin.toastRiderUpdated": { ar: "تم تحديث بيانات المندوب", en: "Rider updated" },
  "admin.toastRiderSaveFailed": {
    ar: "فشل حفظ بيانات المندوب",
    en: "Failed to save rider",
  },
  "admin.toastRiderBlocked": {
    ar: "تم منع المندوب من الاستعلام عن تقاريره",
    en: "Rider blocked from viewing their reports",
  },
  "admin.toastRiderUnblocked": {
    ar: "تم السماح للمندوب بالاستعلام عن تقاريره",
    en: "Rider allowed to view their reports again",
  },
  "admin.toastRiderBlockFailed": {
    ar: "فشل تحديث حالة المندوب",
    en: "Failed to update rider status",
  },
  "admin.toastRosterFailed": {
    ar: "فشل تحديث بيانات المناديب",
    en: "Failed to update rider directory",
  },
  "admin.rosterDownloadButton": { ar: "تنزيل الشيت", en: "Download sheet" },
  "admin.exportExcelButton": { ar: "تنزيل Excel", en: "Download Excel" },
  "admin.exportSelectedButton": { ar: "تنزيل المحددين", en: "Download selected" },
  "admin.rosterDeleteButton": { ar: "حذف بيانات المناديب", en: "Delete directory" },
  "admin.rosterDeleteTitle": { ar: "حذف بيانات المناديب؟", en: "Delete rider directory?" },
  "admin.rosterDeleteDesc": {
    ar: "هيتم حذف الشيت المحفوظ وكل مندوب مسجّل لسه مالوش أي تقرير شهري. المناديب اللي عندهم تقارير مش هيتأثروا. لا يمكن التراجع.",
    en: "The saved sheet and every registered rider that has no monthly report yet will be deleted. Riders that already have reports are not affected. This cannot be undone.",
  },
  "admin.toastRosterDeleteFailed": {
    ar: "فشل حذف بيانات المناديب",
    en: "Failed to delete rider directory",
  },
  "admin.uploadCardTitle": { ar: "رفع تقرير جديد", en: "Upload New Report" },
  "admin.uploadCardDesc": {
    ar: "اختر تاريخ اليوم ثم ارفع ملف Excel",
    en: "Choose the day then upload the Excel file",
  },
  "admin.reportDateLabel": { ar: "تاريخ التقرير", en: "Report date" },
  "admin.monthLabel": { ar: "الشهر", en: "Month" },
  "admin.yearLabel": { ar: "السنة", en: "Year" },
  "admin.excelFileLabel": { ar: "ملف Excel أو CSV", en: "Excel or CSV file" },
  "admin.replaceCheckbox": {
    ar: "استبدال إذا كان يوجد تقرير لنفس اليوم",
    en: "Replace if a report already exists for this day",
  },
  "admin.uploadModeLabel": { ar: "طريقة الرفع", en: "Upload mode" },
  "admin.modeNew": { ar: "تقرير يوم جديد", en: "New day's report" },
  "admin.modeReplace": { ar: "استبدال تقرير اليوم", en: "Replace the day's report" },
  "admin.modeMerge": {
    ar: "دمج شيت إضافي مع تقرير اليوم",
    en: "Merge an extra sheet into the day's report",
  },
  "admin.modeNewHint": {
    ar: "لو فيه تقرير لليوم ده بالفعل هيطلع خطأ.",
    en: "Fails if a report for this day already exists.",
  },
  "admin.modeReplaceHint": {
    ar: "هيمسح تقرير اليوم الموجود وكل بياناته ويبدأ من جديد.",
    en: "Deletes the existing day's report and its data, then starts fresh.",
  },
  "admin.modeMergeHint": {
    ar: "هيضيف أعمدة الشيت ده لكل مندوب في تقرير اليوم الموجود (يُطابَق بالإقامة أو الـ ID). مناسب لرفع شيت المسافات وشيت التقييم كل واحد لوحده.",
    en: "Adds this sheet's columns onto each rider in the existing day's report (matched by Iqama or ID). Good for uploading a distances sheet and a ratings sheet separately.",
  },
  "admin.toastInvalidDate": { ar: "تاريخ غير صحيح", en: "Invalid date" },
  "admin.noteLabel": {
    ar: "ملحوظة عامة لليوم (اختياري)",
    en: "General note for the day (optional)",
  },
  "admin.notePlaceholder": {
    ar: "مثال: سيتم صرف الرواتب يوم 5 بدلاً من يوم 1 هذا الشهر",
    en: "e.g. Salaries will be paid on the 5th instead of the 1st this month",
  },
  "admin.uploadingButton": { ar: "جاري الرفع...", en: "Uploading..." },
  "admin.uploadButton": { ar: "رفع التقرير", en: "Upload Report" },
  "admin.uploadedReportsTitle": { ar: "التقارير المرفوعة", en: "Uploaded Reports" },
  "admin.noReportsYet": {
    ar: "لا توجد تقارير بعد. ارفع أول تقرير أعلاه.",
    en: "No reports yet. Upload your first report above.",
  },
  "admin.tableMonth": { ar: "التاريخ", en: "Date" },
  "admin.tableYear": { ar: "السنة", en: "Year" },
  "admin.tableFileName": { ar: "اسم الملف", en: "File Name" },
  "admin.tableRiderCount": { ar: "عدد المناديب", en: "Rider Count" },
  "admin.tableUploadDate": { ar: "تاريخ الرفع", en: "Upload Date" },
  "admin.tableActions": { ar: "إجراءات", en: "Actions" },
  "admin.downloadTooltip": { ar: "تنزيل الملف الأصلي", en: "Download original file" },
  "admin.toastDownloadFailed": { ar: "تعذر تنزيل الملف", en: "Couldn't download the file" },
  "admin.editNoteTooltip": { ar: "ملحوظة الشهر", en: "Month note" },
  "admin.editNoteTitle": { ar: "ملحوظة تقرير الشهر", en: "Report note for the month" },
  "admin.editNoteDesc": {
    ar: "تظهر هذه الملحوظة لكل مندوب يفتح تقريره لهذا الشهر.",
    en: "This note is shown to every rider who opens their report for this month.",
  },
  "admin.save": { ar: "حفظ", en: "Save" },
  "admin.saving": { ar: "جاري الحفظ...", en: "Saving..." },
  "admin.toastNoteSaved": { ar: "تم حفظ الملحوظة", en: "Note saved" },
  "admin.toastNoteSaveFailed": { ar: "فشل حفظ الملحوظة", en: "Failed to save note" },
  "admin.deleteReportTitle": { ar: "حذف التقرير؟", en: "Delete report?" },
  "admin.hideReportTooltip": {
    ar: "حجب هذا التقرير عن المناديب",
    en: "Hide this report from riders",
  },
  "admin.showReportTooltip": {
    ar: "إظهار هذا التقرير للمناديب",
    en: "Show this report to riders",
  },
  "admin.reportHiddenBadge": { ar: "محجوب عن المناديب", en: "Hidden from riders" },
  "admin.toastReportHidden": { ar: "تم حجب التقرير عن المناديب", en: "Report hidden from riders" },
  "admin.toastReportShown": { ar: "تم إظهار التقرير للمناديب", en: "Report shown to riders" },
  "admin.toastReportHideFailed": {
    ar: "فشل تغيير حالة إخفاء التقرير",
    en: "Failed to change the report's visibility",
  },
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
  "admin.selectAllInMonth": { ar: "تحديد الكل", en: "Select all" },
  "admin.daysCountLabel": { ar: "يوم", en: "days" },
  "admin.deleteMonthButton": { ar: "حذف الكل", en: "Delete all" },
  "admin.deleteMonthConfirmTitle": {
    ar: "حذف كل تقارير الشهر؟",
    en: "Delete all reports for this month?",
  },
  "admin.deleteMonthConfirmDesc": {
    ar: "سيتم حذف جميع تقارير هذا الشهر وجميع بيانات المناديب المرتبطة بها. لا يمكن التراجع.",
    en: "All reports for this month and their associated rider data will be deleted. This cannot be undone.",
  },
  "admin.toastBulkDeleteSuccess": { ar: "تم حذف التقارير المحددة", en: "Selected reports deleted" },
  "admin.selectedCountLabel": { ar: "محدد", en: "selected" },
  "admin.deleteSelectedButton": { ar: "حذف المحدد", en: "Delete selected" },
  "admin.deleteSelectedConfirmTitle": {
    ar: "حذف التقارير المحددة؟",
    en: "Delete selected reports?",
  },
  "admin.deleteSelectedConfirmDesc": {
    ar: "سيتم حذف جميع التقارير المحددة وجميع بيانات المناديب المرتبطة بها. لا يمكن التراجع.",
    en: "All selected reports and their associated rider data will be deleted. This cannot be undone.",
  },
  "admin.sheetsWord": { ar: "شيت", en: "sheets" },
  "admin.sheetsTitle": { ar: "شيتات هذا الشهر", en: "Sheets in this month" },
  "admin.sheetsDesc": {
    ar: "كل شيت اترفع للشهر ده. تقدر تنزّل أو تحذف أي واحد.",
    en: "Every sheet uploaded for this month. Download or delete any one.",
  },
  "admin.sheetsEmpty": { ar: "لا توجد شيتات مسجّلة", en: "No sheets recorded" },
  "admin.sheetDeleteTitle": { ar: "حذف الشيت؟", en: "Delete sheet?" },
  "admin.sheetDeleteDesc": {
    ar: "هيتم شيل الأعمدة اللي جت من الشيت ده من تقرير الشهر. باقي الشيتات مش هتتأثر.",
    en: "The columns this sheet added will be removed from the month's report. Other sheets are unaffected.",
  },
  "admin.sheetDeleteLastDesc": {
    ar: "ده آخر شيت في الشهر — حذفه هيحذف تقرير الشهر كله.",
    en: "This is the month's last sheet — deleting it removes the whole month's report.",
  },
  "admin.toastSheetDeleted": { ar: "تم حذف الشيت", en: "Sheet deleted" },
  "admin.toastSheetDeletedWithReport": {
    ar: "تم حذف الشيت وتقرير الشهر",
    en: "Sheet and the month's report deleted",
  },

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
  "superAdmin.tableStatus": { ar: "الحالة", en: "Status" },
  "superAdmin.statusActive": { ar: "نشطة", en: "Active" },
  "superAdmin.statusSuspended": { ar: "موقوفة", en: "Suspended" },
  "superAdmin.suspendTooltip": { ar: "إيقاف الشركة", en: "Suspend company" },
  "superAdmin.activateTooltip": { ar: "إعادة تفعيل الشركة", en: "Re-activate company" },
  "superAdmin.suspendCompanyTitle": { ar: "إيقاف الشركة؟", en: "Suspend company?" },
  "superAdmin.suspendConfirmButton": { ar: "إيقاف", en: "Suspend" },
  "superAdmin.toastCompanySuspended": { ar: "تم إيقاف الشركة", en: "Company suspended" },
  "superAdmin.toastCompanyActivated": { ar: "تم تفعيل الشركة", en: "Company re-activated" },
  "superAdmin.tableCreatedDate": { ar: "تاريخ الإنشاء", en: "Created Date" },
  "superAdmin.tableActions": { ar: "إجراءات", en: "Actions" },
  "superAdmin.deleteCompanyTitle": { ar: "حذف الشركة؟", en: "Delete company?" },
  "superAdmin.deleteCompanyBlockedTooltip": {
    ar: "احذف حسابات الشركة أولاً من صفحة الحسابات لتتمكن من حذفها",
    en: "Delete the company's accounts from the Accounts page first to be able to delete it",
  },
  "superAdmin.confirmYourPasswordLabel": {
    ar: "أدخل كلمة مرور حسابك للتأكيد",
    en: "Enter your account password to confirm",
  },
  "superAdmin.announcementsCardTitle": {
    ar: "إرسال إشعار لكل الشركات",
    en: "Send announcement to all companies",
  },
  "superAdmin.announcementsCardDesc": {
    ar: "هيوصل لكل حسابات الشركات فورًا، ويظهر عندهم كإشعار جديد في لوحة الإدارة بتاعتهم.",
    en: "Reaches every company account right away, and shows up for them as a new notification in their dashboard.",
  },
  "superAdmin.announcementTitleLabel": { ar: "العنوان", en: "Title" },
  "superAdmin.announcementTitlePlaceholder": {
    ar: "مثال: تحديث جديد على النظام",
    en: "e.g. New system update",
  },
  "superAdmin.announcementBodyLabel": { ar: "الرسالة", en: "Message" },
  "superAdmin.announcementBodyPlaceholder": {
    ar: "اكتب اللي عايز كل الشركات تعرفه...",
    en: "Write what you want every company to know...",
  },
  "superAdmin.sendButton": { ar: "إرسال للجميع", en: "Send to everyone" },
  "superAdmin.sending": { ar: "جاري الإرسال...", en: "Sending..." },
  "superAdmin.toastAnnouncementSent": {
    ar: "تم إرسال الإشعار لكل الشركات",
    en: "Announcement sent to all companies",
  },
  "superAdmin.announcementsHistoryTitle": { ar: "الإشعارات المُرسلة", en: "Sent announcements" },
  "superAdmin.noAnnouncementsYet": { ar: "لسه ماعملتش أي إشعار", en: "No announcements sent yet" },
  "superAdmin.deleteAnnouncementTitle": { ar: "حذف الإشعار؟", en: "Delete announcement?" },
  "superAdmin.deleteAnnouncementDesc": {
    ar: "هيختفي فورًا من لوحات كل الشركات. لا يمكن التراجع.",
    en: "It will disappear from every company's dashboard immediately. This cannot be undone.",
  },
  "superAdmin.toastAnnouncementDeleted": { ar: "تم حذف الإشعار", en: "Announcement deleted" },
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
  "superAdmin.tableName": { ar: "الاسم", en: "Name" },
  "superAdmin.tableEmail": { ar: "البريد", en: "Email" },
  "superAdmin.tableLastLogin": { ar: "آخر دخول", en: "Last Login" },
  "superAdmin.neverLoggedIn": { ar: "لم يدخل بعد", en: "Never logged in" },
  "superAdmin.superAdminBadge": { ar: "سوبر أدمن", en: "Super Admin" },
  "superAdmin.superAdminsGroupTitle": { ar: "حسابات السوبر أدمن", en: "Super admin accounts" },
  "superAdmin.staffBadge": { ar: "مستخدم", en: "Staff" },
  "superAdmin.companyAdminBadge": { ar: "مدير الشركة", en: "Company admin" },
  "superAdmin.deleteAccountTitle": { ar: "حذف الحساب؟", en: "Delete account?" },
  "superAdmin.changeLogoTitle": { ar: "تغيير الشعار", en: "Change logo" },
  "superAdmin.changeNameTitle": { ar: "تعديل اسم الشركة", en: "Edit company name" },
  "superAdmin.newCompanyNameLabel": { ar: "اسم الشركة", en: "Company name" },
  "superAdmin.logoDialogDesc": {
    ar: "يظهر بجانب اسم الشركة عند بحث المندوب برقم الإقامة أو ID",
    en: "Shown next to the company name when a rider searches by Iqama or ID number",
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
  "superAdmin.toastNameUpdated": { ar: "تم تحديث اسم الشركة", en: "Company name updated" },
  "superAdmin.companyPlanTooltip": { ar: "صلاحيات الباقة", en: "Plan permissions" },
  "superAdmin.companyPlanDesc": {
    ar: "حدد الصفحات اللي مفتوحة لهذه الشركة ولأي مستخدم تنشئه — أي صفحة تقفلها هنا تُقفل تلقائيًا حتى لو منحها مدير الشركة لأحد موظفيه.",
    en: "Set which pages are open to this company and to any user it creates — closing a page here closes it even if the company's own admin grants it to a staff member.",
  },
  "superAdmin.toastPlanUpdated": { ar: "تم تحديث باقة الشركة", en: "Company plan updated" },
  "superAdmin.notificationsAccessLabel": {
    ar: "صفحة الإشعارات والإنذارات",
    en: "Notifications & Warnings page",
  },
  "superAdmin.usersAccessLabel": { ar: "صفحة المستخدمين", en: "Users page" },
  "superAdmin.companyProfileAccessLabel": {
    ar: "صفحة بيانات الشركة",
    en: "Company profile page",
  },
  "superAdmin.toastPlanUpdateFailed": {
    ar: "فشل تحديث باقة الشركة",
    en: "Failed to update the company plan",
  },
  "superAdmin.companyNoteTitle": { ar: "ملاحظة عن الشركة", en: "Company note" },
  "superAdmin.companyNoteDesc": {
    ar: "ملاحظة داخلية تظهر لك أنت فقط في هذه اللوحة، ولا يراها حساب الشركة.",
    en: "Internal note, visible only to you on this dashboard — the company account never sees it.",
  },
  "superAdmin.companyNotePlaceholder": {
    ar: "اكتب ملاحظتك عن هذه الشركة...",
    en: "Write your note about this company...",
  },
  "superAdmin.toastNoteUpdated": { ar: "تم حفظ الملاحظة", en: "Note saved" },
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

  "documents.pageTitle": { ar: "الوثائق", en: "Documents" },
  "documents.pageDesc": {
    ar: "مستندات كل مندوب الثمانية، لكل منها تاريخ انتهاء مستقل، وتُحسب حالته تلقائيًا.",
    en: "Each rider's eight documents, each with its own expiry date and an automatically computed status.",
  },
  "documents.viewOnlyNote": {
    ar: "صلاحيتك هنا عرض وتنزيل المستندات فقط.",
    en: "Your permission here is view & download only.",
  },
  "documents.searchPlaceholder": {
    ar: "ابحث بالاسم أو رقم الإقامة أو الـ ID أو رقم كرت التشغيل...",
    en: "Search by name, Iqama, ID, or operating card number...",
  },
  "documents.iqamaLabel": { ar: "إقامة", en: "Iqama" },
  "documents.tableRider": { ar: "المندوب", en: "Rider" },
  "documents.tableArea": { ar: "المنطقة", en: "Area" },
  "documents.tableStatus": { ar: "حالة المستندات", en: "Documents status" },
  "documents.tableActions": { ar: "إجراءات", en: "Actions" },
  "documents.manageButton": { ar: "إدارة المستندات", en: "Manage documents" },
  "documents.noRiders": { ar: "لا يوجد مناديب مسجّلون بعد", en: "No riders registered yet" },
  "documents.searchNoResults": { ar: "لا يوجد نتائج مطابقة", en: "No matching results" },
  "documents.filterAll": { ar: "كل الحالات", en: "All statuses" },

  "documents.type.iqama_photo": { ar: "صورة الإقامة", en: "Iqama photo" },
  "documents.type.driving_license": { ar: "رخصة القيادة", en: "Driving license" },
  "documents.type.driver_card": { ar: "بطاقة السائق", en: "Driver card" },
  "documents.type.operating_card": { ar: "كرت التشغيل", en: "Operating card" },
  "documents.type.operating_card_extra": {
    ar: "كرت تشغيل إضافي",
    en: "Additional operating card",
  },
  "documents.type.operating_card_extra_form": {
    ar: "استمارة كرت التشغيل الإضافي",
    en: "Additional operating card form",
  },
  "documents.type.vehicle_registration": { ar: "استمارة السيارة", en: "Vehicle registration" },
  "documents.type.health_certificate": { ar: "الشهادة الصحية", en: "Health certificate" },
  "documents.type.personal_photo": { ar: "الصورة الشخصية", en: "Personal photo" },
  "documents.type.ajeer_contract": { ar: "عقد اجير تشارك", en: "Ajeer contract" },

  "documents.statusOk": { ar: "سليم", en: "Valid" },
  "documents.statusWarning": { ar: "قرّب ينتهي", en: "Expiring soon" },
  "documents.statusExpired": { ar: "منتهي", en: "Expired" },
  "documents.statusMissing": { ar: "لم يُرفع", en: "Not uploaded" },
  "documents.missingAnyTypeOption": { ar: "أي نوع", en: "Any type" },
  "documents.daysLeftSuffix": { ar: "يوم متبقي", en: "days left" },

  "documents.dialogDesc": {
    ar: "ارفع أو حدّث أي مستند من الثمانية. رفع ملف جديد لنفس النوع يستبدل القديم.",
    en: "Upload or update any of the eight documents. Uploading a new file for the same type replaces the old one.",
  },
  "documents.uploadButton": { ar: "رفع", en: "Upload" },
  "documents.replaceButton": { ar: "تحديث", en: "Replace" },
  "documents.cancelButton": { ar: "إلغاء", en: "Cancel" },
  "documents.editDateTooltip": { ar: "تعديل تاريخ الانتهاء", en: "Edit expiry date" },
  "documents.viewButton": { ar: "عرض", en: "View" },
  "documents.downloadButton": { ar: "تنزيل", en: "Download" },
  "documents.deleteButton": { ar: "حذف", en: "Delete" },
  "documents.deleteConfirmTitle": { ar: "حذف المستند؟", en: "Delete document?" },
  "documents.deleteConfirmDesc": {
    ar: "هيتم حذف الملف المرفوع لهذا المستند نهائيًا. لا يمكن التراجع.",
    en: "The uploaded file for this document will be permanently deleted. This cannot be undone.",
  },
  "documents.expiryDateLabel": { ar: "تاريخ الانتهاء", en: "Expiry date" },
  "documents.cardNumberLabel": { ar: "رقم كرت التشغيل", en: "Operating card number" },
  "documents.cardNumberPlaceholder": { ar: "مثال: 38-00000000", en: "e.g. 38-00000000" },
  "documents.linkedCardLabel": { ar: "مرتبطة بكرت التشغيل رقم", en: "Linked to operating card #" },
  "documents.linkedCardMissing": {
    ar: "لازم رفع كرت التشغيل للمندوب أولاً",
    en: "Upload the rider's operating card first",
  },
  "documents.addCustomButton": { ar: "إضافة مستند آخر", en: "Add another document" },
  "documents.customSectionTitle": { ar: "مستندات إضافية", en: "Additional documents" },
  "documents.customLabelLabel": { ar: "اسم المستند", en: "Document name" },
  "documents.customLabelPlaceholder": {
    ar: "مثال: تصريح دخول ميناء",
    en: "e.g. Port entry permit",
  },
  "documents.customCardHint": {
    ar: "لو سمّيته بـ«كرت تشغيل...» (مثلاً «كرت تشغيل لجاهز») هيتطبّق عليه تلقائيًا نفس شرط كروت التشغيل: 3 مناديب بالحد الأقصى لكل رقم كرت، وكلهم في نفس المنطقة.",
    en: 'If you name it starting with "كرت تشغيل" (e.g. "كرت تشغيل لجاهز"), the same operating-card rule applies automatically: max 3 riders per card number, all in the same area.',
  },
  "documents.customNeedsExpiryLabel": {
    ar: "هل لهذا المستند تاريخ انتهاء؟",
    en: "Does this document have an expiry date?",
  },
  "documents.cardCapacitySuffix": {
    ar: "من 3 مناديب على هذا الكرت",
    en: "of 3 riders on this card",
  },
  "documents.plateNumberLabel": { ar: "رقم اللوحة", en: "Plate number" },
  "documents.plateNumberOptionalLabel": {
    ar: "رقم اللوحة (اختياري)",
    en: "Plate number (optional)",
  },
  "documents.cardPendingFile": {
    ar: "تم تحديد رقم الكرت — بانتظار رفع الملف",
    en: "Card number assigned — file not uploaded yet",
  },
  "documents.fileLabel": { ar: "الملف (JPG أو PNG أو PDF)", en: "File (JPG, PNG, or PDF)" },
  "documents.uploadedAtLabel": { ar: "تاريخ الرفع", en: "Uploaded" },
  "documents.notUploadedYet": { ar: "لم يُرفع بعد", en: "Not uploaded yet" },

  "documents.toastInvalidExtension": {
    ar: "الملف يجب أن يكون JPG أو PNG أو PDF فقط",
    en: "The file must be JPG, PNG, or PDF only",
  },
  "documents.toastExpiryRequired": { ar: "أدخل تاريخ الانتهاء", en: "Enter the expiry date" },
  "documents.toastInvalidDate": {
    ar: "التاريخ غير صحيح — تأكد إنك كتبت السنة كاملة (مثال: 2027 مش 27)",
    en: "Invalid date — make sure you typed the full year (e.g. 2027, not 27)",
  },
  "documents.toastFileRequired": { ar: "اختر ملفًا", en: "Choose a file" },
  "documents.toastCardNumberRequired": {
    ar: "أدخل رقم كرت التشغيل",
    en: "Enter the operating card number",
  },
  "documents.toastCardNumberInvalid": {
    ar: "رقم كرت التشغيل لازم يكون بالشكل 38-00000000 بالظبط (رقمين، شرطة، ثم 8 أرقام)",
    en: "The operating card number must be exactly like 38-00000000 (two digits, a dash, then 8 digits)",
  },
  "documents.toastLabelRequired": { ar: "اكتب اسم المستند", en: "Enter a name for the document" },
  "documents.toastUploadSuccess": { ar: "تم رفع المستند", en: "Document uploaded" },
  "documents.toastUploadFailed": { ar: "فشل رفع المستند", en: "Failed to upload document" },
  "documents.toastExpiryUpdateSuccess": {
    ar: "تم تحديث تاريخ الانتهاء",
    en: "Expiry date updated",
  },
  "documents.toastExpiryUpdateFailed": {
    ar: "فشل تحديث تاريخ الانتهاء",
    en: "Failed to update expiry date",
  },
  "documents.toastDeleteSuccess": { ar: "تم حذف المستند", en: "Document deleted" },
  "documents.toastDeleteFailed": { ar: "فشل حذف المستند", en: "Failed to delete document" },
  "documents.toastDownloadFailed": {
    ar: "تعذر تنزيل المستند",
    en: "Couldn't download the document",
  },

  "documents.expiringBadgeTooltip": {
    ar: "مستندات قرّبت تنتهي أو انتهت",
    en: "Documents expiring soon or expired",
  },

  "operatingCards.pageTitle": { ar: "كروت التشغيل", en: "Operating cards" },
  "operatingCards.pageDesc": {
    ar: "كل كروت التشغيل المرفوعة، ومين المناديب المرتبطين بكل كرت",
    en: "Every uploaded operating card, and which riders are linked to it",
  },
  "operatingCards.listTitle": { ar: "الكروت", en: "Cards" },
  "operatingCards.listDesc": { ar: "عدد الكروت", en: "Number of cards" },
  "operatingCards.searchPlaceholder": {
    ar: "ابحث برقم كرت التشغيل أو رقم الإقامة أو رقم اللوحة",
    en: "Search by card number, Iqama number, or plate number",
  },
  "operatingCards.empty": {
    ar: "لا توجد كروت تشغيل مطابقة",
    en: "No matching operating cards",
  },
  "operatingCards.tableCardNumber": { ar: "رقم الكرت", en: "Card number" },
  "operatingCards.tableType": { ar: "النوع", en: "Type" },
  "operatingCards.tableCount": { ar: "عدد المرتبطين", en: "Linked riders" },
  "operatingCards.tableRiders": { ar: "المناديب المرتبطين", en: "Linked riders" },
  "operatingCards.tableStatus": { ar: "الحالة", en: "Status" },
  "operatingCards.exportButton": { ar: "تصدير إلى Excel", en: "Export to Excel" },
  "operatingCards.deleteConfirmTitle": { ar: "حذف كرت التشغيل؟", en: "Delete operating card?" },
  "operatingCards.deleteConfirmDesc": {
    ar: "هيتحذف ملف الكرت المرفوع، وهيتشال رقم الكرت من كل المناديب المرتبطين بيه. مينفعش يترجع.",
    en: "The uploaded card file will be deleted, and the card number removed from every rider linked to it. This cannot be undone.",
  },
  "operatingCards.toastDeleteSuccess": { ar: "تم حذف كرت التشغيل", en: "Operating card deleted" },
  "operatingCards.toastDeleteFailed": {
    ar: "فشل حذف كرت التشغيل",
    en: "Failed to delete the operating card",
  },
  "operatingCards.bulkUploadButton": {
    ar: "رفع شيت كروت التشغيل",
    en: "Upload operating cards sheet",
  },
  "operatingCards.bulkUploadTitle": {
    ar: "رفع شيت كروت التشغيل",
    en: "Upload operating cards sheet",
  },
  "operatingCards.bulkUploadDesc": {
    ar: "ملف فيه رقم كرت التشغيل ورقم إقامة المندوب، وممكن كمان رقم اللوحة وتاريخ الانتهاء — هيتحط لكل مندوب في صفحة المستندات بتاعته. الملف نفسه (بي دي إف أو صورة) بيترفع بعدين مرة واحدة من هنا لكل كرت.",
    en: "A file with the operating card number and the rider's Iqama number, plus optionally the plate number and expiry date — assigned to each rider's documents page. The actual file (PDF or photo) is uploaded afterward, once per card, from here.",
  },
  "operatingCards.bulkFileLabel": {
    ar: "الملف (Excel أو CSV)",
    en: "File (Excel or CSV)",
  },
  "operatingCards.toastNoIqamaColumn": {
    ar: "الملف لازم يحتوي على عمود رقم الإقامة",
    en: "The file must have an Iqama number column",
  },
  "operatingCards.toastNoCardColumn": {
    ar: "الملف لازم يحتوي على عمود رقم كرت التشغيل",
    en: "The file must have an operating card number column",
  },
  "operatingCards.toastBulkSuccess": {
    ar: "تم تعيين {count} كرت تشغيل بنجاح",
    en: "{count} operating cards assigned successfully",
  },
  "operatingCards.editGroupButton": { ar: "تعديل الكرت", en: "Edit card" },
  "operatingCards.editGroupDesc": {
    ar: "التعديل هنا بيتطبق على كل المناديب المرتبطين بنفس رقم الكرت",
    en: "Changes here apply to every rider linked to this card number",
  },
  "operatingCards.editFormButton": { ar: "تعديل الاستمارة", en: "Edit the form" },
  "operatingCards.editFormDesc": {
    ar: "رفع استمارة كرت التشغيل الإضافي بيتطبق على كل المناديب المرتبطين بنفس رقم الكرت",
    en: "Uploading the additional operating card form applies to every rider linked to this card number",
  },
  "operatingCards.toastFormSaveSuccess": { ar: "تم حفظ الاستمارة", en: "Form saved" },
  "operatingCards.toastFormSaveFailed": { ar: "فشل حفظ الاستمارة", en: "Failed to save the form" },
  "operatingCards.currentFileLabel": { ar: "الملف الحالي", en: "Current file" },
  "operatingCards.toastGroupSaveSuccess": { ar: "تم حفظ بيانات الكرت", en: "Card details saved" },
  "expiryAlerts.pageTitle": { ar: "تنبيهات انتهاء المستندات", en: "Document expiry alerts" },
  "expiryAlerts.pageDesc": {
    ar: "كل المستندات اللي ليها تاريخ انتهاء في مكان واحد — قدر تشوف اللي انتهى أو قرب ينتهي وبتاع مين بالظبط",
    en: "Every document that carries an expiry date, in one place — see what's expired or expiring soon and exactly whose it is",
  },
  "expiryAlerts.listTitle": { ar: "المستندات", en: "Documents" },
  "expiryAlerts.listDesc": { ar: "عدد المستندات", en: "Number of documents" },
  "expiryAlerts.searchPlaceholder": {
    ar: "دوّر بالاسم أو رقم الإقامة أو الـ ID",
    en: "Search by name, Iqama, or ID number",
  },
  "expiryAlerts.tableDocType": { ar: "نوع المستند", en: "Document type" },
  "expiryAlerts.empty": { ar: "لا توجد نتائج مطابقة", en: "No matching results" },
  "expiryAlerts.filterAllTypes": { ar: "كل الأنواع", en: "All types" },
  "expiryAlerts.filterTypesCount": { ar: "{count} أنواع", en: "{count} types" },
  "expiryAlerts.renewButton": { ar: "تجديد", en: "Renew" },
  "expiryAlerts.renewDocDesc": {
    ar: "ارفع الملف الجديد (اختياري) واكتب تاريخ الانتهاء الجديد — هيتحدّث عند المندوب في صفحة المستندات فورًا",
    en: "Upload the new file (optional) and set the new expiry date — it updates for this rider on the Documents page immediately",
  },
  "expiryAlerts.renewCardDesc": {
    ar: "ده كرت تشغيل مشترك — التجديد هنا هيتحدّث لكل المناديب المرتبطين بنفس رقم الكرت، مش بس المندوب ده",
    en: "This is a shared operating card — renewing it here updates every rider linked to the same card number, not just this one",
  },
  "expiryAlerts.toastRenewSuccess": { ar: "تم تجديد المستند", en: "Document renewed" },
  "expiryAlerts.toastRenewFailed": { ar: "فشل تجديد المستند", en: "Failed to renew document" },

  "operatingCards.toastGroupSaveFailed": {
    ar: "فشل حفظ بيانات الكرت",
    en: "Failed to save card details",
  },
  "operatingCards.removeRiderButton": { ar: "شيل المندوب من الكرت", en: "Remove rider from card" },
  "operatingCards.removeRiderConfirmTitle": {
    ar: "شيل المندوب من الكرت؟",
    en: "Remove rider from this card?",
  },
  "operatingCards.removeRiderConfirmDesc": {
    ar: "هيترفع ربط المندوب ده بالكرت وهيرجع المستند عنده فاضي — من غير ما يتأثر باقي المناديب على نفس الكرت",
    en: "This rider will be unlinked from the card and their document will go back to missing — the rest of the riders on this card are unaffected",
  },
  "operatingCards.toastRemoveRiderSuccess": {
    ar: "تم شيل المندوب من الكرت",
    en: "Rider removed from card",
  },
  "operatingCards.toastRemoveRiderFailed": {
    ar: "فشل شيل المندوب من الكرت",
    en: "Failed to remove rider from card",
  },
  "operatingCards.addRiderButton": { ar: "إضافة مندوب", en: "Add rider" },
  "operatingCards.addRiderDialogTitle": { ar: "إضافة مندوب للكرت", en: "Add rider to card" },
  "operatingCards.addRiderDialogDesc": {
    ar: "اختر مندوب من نفس منطقة الكرت وميكنش عنده كرت تشغيل من نفس النوع — هيورث نفس الملف وتاريخ الانتهاء ورقم اللوحة الموجودين على الكرت",
    en: "Pick a rider from the card's own area who doesn't already have a card of this type — they'll inherit the card's existing file, expiry date, and plate number",
  },
  "operatingCards.addRiderSearchPlaceholder": {
    ar: "دوّر بالاسم أو رقم الإقامة",
    en: "Search by name or Iqama number",
  },
  "operatingCards.addRiderEmpty": {
    ar: "مفيش مناديب متاحين في نفس المنطقة",
    en: "No available riders in this area",
  },
  "operatingCards.addRiderAction": { ar: "إضافة", en: "Add" },
  "operatingCards.toastAddRiderSuccess": {
    ar: "تم إضافة المندوب للكرت",
    en: "Rider added to card",
  },
  "operatingCards.toastAddRiderFailed": {
    ar: "فشل إضافة المندوب للكرت",
    en: "Failed to add rider to card",
  },

  "notifications.pageTitle": {
    ar: "إرسال إشعار أو إنذار للمناديب",
    en: "Send rider notifications & warnings",
  },
  "notifications.pageDesc": {
    ar: "ابعت إشعار أو إنذار لكل المناديب أو لمندوب واحد بس، وهيظهر له في صفحة الاستعلام بتاعته",
    en: "Send a notification or a warning to every rider or just one — it shows up on their lookup page",
  },
  "notifications.kindNotificationButton": { ar: "إشعار", en: "Notification" },
  "notifications.kindWarningButton": { ar: "إنذار", en: "Warning" },
  "notifications.kindNotificationBadge": { ar: "إشعار", en: "Notification" },
  "notifications.kindWarningBadge": { ar: "إنذار", en: "Warning" },
  "notifications.tableKind": { ar: "النوع", en: "Type" },
  "notifications.toastSendWarningSuccess": { ar: "تم إرسال الإنذار", en: "Warning sent" },
  "notifications.targetAllButton": { ar: "كل المناديب", en: "All riders" },
  "notifications.targetSpecificButton": { ar: "مندوب محدد", en: "Specific rider" },
  "notifications.targetRiderLabel": { ar: "اختر المندوب", en: "Choose the rider" },
  "notifications.searchRiderPlaceholder": {
    ar: "دوّر بالاسم أو رقم الإقامة أو الـ ID",
    en: "Search by name, Iqama, or ID",
  },
  "notifications.searchNoResults": { ar: "لا يوجد نتائج", en: "No results" },
  "notifications.titleLabel": { ar: "العنوان", en: "Title" },
  "notifications.titlePlaceholder": { ar: "مثال: تنبيه مهم", en: "e.g. Important notice" },
  "notifications.bodyLabel": { ar: "نص الرسالة", en: "Message" },
  "notifications.bodyPlaceholder": { ar: "اكتب رسالتك هنا...", en: "Write your message here..." },
  "notifications.sendButton": { ar: "إرسال", en: "Send" },
  "notifications.toastSelectRider": { ar: "اختر مندوب أولاً", en: "Choose a rider first" },
  "notifications.toastSendSuccess": { ar: "تم إرسال الإشعار", en: "Notification sent" },
  "notifications.toastSendFailed": { ar: "فشل إرسال الإشعار", en: "Failed to send notification" },
  "notifications.sentSectionTitle": { ar: "الإشعارات المرسلة", en: "Sent notifications" },
  "notifications.sentEmpty": { ar: "لسه مفيش إشعارات مرسلة", en: "No notifications sent yet" },
  "notifications.sentSearchPlaceholder": {
    ar: "ابحث بالعنوان أو المحتوى أو اسم المندوب",
    en: "Search by title, content, or rider name",
  },
  "notifications.sentSearchNoResults": {
    ar: "لا توجد إشعارات مطابقة للبحث",
    en: "No notifications match your search",
  },
  "notifications.tableTitle": { ar: "العنوان", en: "Title" },
  "notifications.tableTarget": { ar: "المستلم", en: "Recipient" },
  "notifications.tableDate": { ar: "التاريخ", en: "Date" },
  "notifications.tableRead": { ar: "القراءة", en: "Read" },
  "notifications.targetAllBadge": { ar: "كل المناديب", en: "All riders" },
  "notifications.deleteConfirmTitle": { ar: "حذف الإشعار؟", en: "Delete notification?" },
  "notifications.deleteConfirmDesc": {
    ar: "هيتشال من صفحة المندوب فورًا ومش هترجع تقدر تسترجعه.",
    en: "It disappears from the rider's page immediately and can't be undone.",
  },
  "notifications.toastDeleteSuccess": { ar: "تم حذف الإشعار", en: "Notification deleted" },
  "notifications.toastDeleteFailed": {
    ar: "فشل حذف الإشعار",
    en: "Failed to delete notification",
  },

  "companyProfile.pageTitle": { ar: "بيانات الشركة", en: "Company profile" },
  "companyProfile.pageDesc": {
    ar: "بيانات الدخول، الشعار، الختم، والمستندات الرسمية للشركة",
    en: "Login credentials, logo, stamp, and official company documents",
  },
  "companyProfile.accountTitle": { ar: "بيانات الحساب", en: "Account details" },
  "companyProfile.nameTitle": { ar: "اسم الشركة", en: "Company name" },
  "companyProfile.currentNameLabel": { ar: "الاسم الحالي", en: "Current name" },
  "companyProfile.newNamePlaceholder": { ar: "اسم الشركة الجديد", en: "New company name" },
  "companyProfile.toastNameFailed": { ar: "فشل تغيير الاسم", en: "Failed to change name" },
  "companyProfile.expiryNotifyDaysTitle": {
    ar: "مدة تنبيه انتهاء المستندات (افتراضي الشركة)",
    en: "Document expiry alert lead time (company default)",
  },
  "companyProfile.expiryNotifyDaysDesc": {
    ar: "عدد الأيام قبل انتهاء أي مستند يبدأ فيها تنبيه جرس المستندات — لأي مستخدم في الشركة لم يحدد مدة خاصة بيه",
    en: "How many days before a document expires the documents alert bell starts warning — for anyone in the company who hasn't set their own",
  },
  "companyProfile.expiryNotifyDaysPersonalDesc": {
    ar: "تقدر تحدد مدة مختلفة لنفسك بس، من غير ما تغيّر افتراضي الشركة",
    en: "Set a different lead time just for yourself, without changing the company default",
  },
  "companyProfile.toastExpiryNotifyDaysInvalid": {
    ar: "عدد الأيام لازم يكون بين 1 و 365",
    en: "Days must be between 1 and 365",
  },
  "companyProfile.toastExpiryNotifyDaysFailed": {
    ar: "فشل تحديث مدة التنبيه",
    en: "Failed to update the alert lead time",
  },
  "companyProfile.emailTitle": { ar: "البريد الإلكتروني", en: "Email" },
  "companyProfile.currentEmailLabel": { ar: "البريد الحالي", en: "Current email" },
  "companyProfile.newEmailPlaceholder": { ar: "البريد الإلكتروني الجديد", en: "New email" },
  "companyProfile.emailChangeNote": {
    ar: "ممكن يوصلك بريد تأكيد على العنوان الجديد قبل ما يتفعّل",
    en: "A confirmation email may be sent to the new address before it takes effect",
  },
  "companyProfile.toastEmailChangeSent": {
    ar: "تم إرسال طلب تغيير البريد",
    en: "Email change requested",
  },
  "companyProfile.toastEmailFailed": { ar: "فشل تغيير البريد", en: "Failed to change email" },
  "companyProfile.passwordTitle": { ar: "كلمة المرور", en: "Password" },
  "companyProfile.passwordDesc": {
    ar: "غيّر كلمة مرور دخولك لحساب الشركة",
    en: "Change the password you use to sign in to your company account",
  },
  "companyProfile.newPasswordPlaceholder": { ar: "كلمة المرور الجديدة", en: "New password" },
  "companyProfile.confirmPasswordPlaceholder": {
    ar: "تأكيد كلمة المرور",
    en: "Confirm password",
  },
  "companyProfile.toastPasswordTooShort": {
    ar: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
    en: "Password must be at least 6 characters",
  },
  "companyProfile.toastPasswordMismatch": {
    ar: "كلمتا المرور غير متطابقتين",
    en: "Passwords don't match",
  },
  "companyProfile.toastPasswordChanged": { ar: "تم تغيير كلمة المرور", en: "Password changed" },
  "companyProfile.toastPasswordFailed": {
    ar: "فشل تغيير كلمة المرور",
    en: "Failed to change password",
  },
  "companyProfile.registrationTitle": {
    ar: "الرقم الموحد والسجل التجاري",
    en: "Unified number & commercial registration",
  },
  "companyProfile.registrationDesc": {
    ar: "لو موجودين، هيظهروا في الخطابات الرسمية جنب اسم الشركة",
    en: "If present, they'll show up on official letters next to the company name",
  },
  "companyProfile.unifiedNumberLabel": { ar: "الرقم الموحد", en: "Unified number" },
  "companyProfile.commercialRegistrationLabel": {
    ar: "رقم السجل التجاري",
    en: "Commercial registration",
  },
  "companyProfile.toastUnifiedNumberInvalid": {
    ar: "الرقم الموحد لازم يكون 10 أرقام ويبدأ بـ 7",
    en: "The unified number must be 10 digits starting with 7",
  },
  "companyProfile.toastCommercialRegistrationInvalid": {
    ar: "رقم السجل التجاري لازم يكون 10 أرقام ويبدأ بـ 10",
    en: "The commercial registration must be 10 digits starting with 10",
  },
  "companyProfile.toastRegistrationFailed": {
    ar: "فشل حفظ البيانات",
    en: "Failed to save the details",
  },
  "companyProfile.assetsTitle": { ar: "الشعار والختم والتوقيع", en: "Logo, stamp & signature" },
  "companyProfile.logoTitle": { ar: "الشعار", en: "Logo" },
  "companyProfile.stampTitle": { ar: "الختم", en: "Stamp" },
  "companyProfile.signatureTitle": { ar: "التوقيع", en: "Signature" },
  "companyProfile.toastAssetFailed": { ar: "فشل رفع الصورة", en: "Failed to upload image" },
  "companyProfile.documentsTitle": { ar: "المستندات الرسمية", en: "Official documents" },
  "companyProfile.documentsDesc": {
    ar: "السجل التجاري، الشهادة الضريبية، أو أي مستند رسمي آخر — بتاريخ انتهاء لكل واحد",
    en: "Commercial register, tax certificate, or any other official document — each with its own expiry date",
  },
  "companyProfile.documentLabelLabel": { ar: "اسم المستند", en: "Document name" },
  "companyProfile.documentLabelPlaceholder": {
    ar: "مثال: السجل التجاري",
    en: "e.g. Commercial register",
  },
  "companyProfile.addDocumentButton": { ar: "إضافة مستند", en: "Add document" },
  "companyProfile.toastLabelRequired": { ar: "اكتب اسم المستند", en: "Enter a document name" },
  "companyProfile.expiringBadgeTooltip": {
    ar: "مستندات الشركة قرّبت تنتهي أو انتهت",
    en: "Company documents expiring soon or expired",
  },

  "admin.navLetters": { ar: "خطابات رسمية", en: "Official letters" },
  "admin.navUsers": { ar: "المستخدمين", en: "Users" },
  "admin.navAccount": { ar: "حسابي", en: "My account" },

  "account.pageTitle": { ar: "حسابي", en: "My account" },
  "account.pageDesc": {
    ar: "بيانات حسابك وصلاحياتك على صفحات النظام، ويمكنك من هنا تغيير كلمة المرور.",
    en: "Your account details and permissions across the system's pages — and you can change your password here.",
  },
  "account.emailLabel": { ar: "البريد الإلكتروني", en: "Email" },
  "account.nameLabel": { ar: "الاسم", en: "Name" },
  "account.namePlaceholder": { ar: "اسمك", en: "Your name" },
  "account.toastNameRequired": { ar: "الاسم مطلوب", en: "Name is required" },
  "account.toastNameSaved": { ar: "تم حفظ الاسم", en: "Name saved" },
  "account.expiryNotifyDaysLabel": {
    ar: "مدة تنبيه انتهاء المستندات",
    en: "Document expiry alert lead time",
  },
  "account.expiryNotifyDaysDesc": {
    ar: "عدد الأيام قبل انتهاء أي مستند تحب يبدأ فيها جرس التنبيهات يعرّفك — سيبها فاضية لاستخدام افتراضي الشركة",
    en: "How many days before a document expires you want the alert bell to start warning you — leave blank to use the company default",
  },
  "account.expiryNotifyDaysCompanyDefault": { ar: "افتراضي الشركة", en: "Company default" },
  "account.expiryNotifyDaysResetButton": {
    ar: "استخدام افتراضي الشركة",
    en: "Use company default",
  },
  "account.toastExpiryNotifyDaysInvalid": {
    ar: "عدد الأيام لازم يكون بين 1 و 365",
    en: "Days must be between 1 and 365",
  },
  "account.toastExpiryNotifyDaysFailed": {
    ar: "فشل تحديث مدة التنبيه",
    en: "Failed to update the alert lead time",
  },
  "account.toastNameFailed": { ar: "فشل حفظ الاسم", en: "Failed to save name" },
  "account.permissionsLabel": { ar: "صلاحياتك", en: "Your permissions" },
  "account.noPermissions": {
    ar: "لا توجد صلاحيات ممنوحة لحسابك حتى الآن. تواصل مع مدير الشركة.",
    en: "No permissions have been granted to your account yet. Contact your company admin.",
  },
  "account.adminFullAccess": {
    ar: "أنت مدير الشركة، ولديك صلاحية كاملة على كل الصفحات.",
    en: "You are the company admin, with full access to every page.",
  },

  "users.pageTitle": { ar: "المستخدمين", en: "Users" },
  "users.pageDesc": {
    ar: "أنشئ حسابات مقيّدة لموظفيك، وحدد الصفحات التي يمكنهم الوصول إليها، وصلاحياتهم فيها، والمناطق التي يمكنهم الاطلاع عليها.",
    en: "Create restricted accounts for your staff, and set which pages they can access, their permissions on each, and which areas they can see.",
  },
  "users.createButton": { ar: "إضافة مستخدم", en: "Add user" },
  "users.nameLabel": { ar: "الاسم", en: "Name" },
  "users.namePlaceholder": { ar: "اسم المستخدم", en: "User's name" },
  "users.emailLabel": { ar: "البريد الإلكتروني", en: "Email" },
  "users.passwordLabel": { ar: "كلمة المرور", en: "Password" },
  "users.passwordPlaceholder": { ar: "6 أحرف على الأقل", en: "At least 6 characters" },
  "users.grantAllButton": { ar: "منح كل الصلاحيات", en: "Grant all permissions" },
  "users.overviewAccessLabel": { ar: "صفحة النظرة العامة", en: "Overview page" },
  "users.notificationsAccessLabel": {
    ar: "صفحة الإشعارات والإنذارات",
    en: "Notifications & Warnings page",
  },
  "users.ridersAccessLabel": { ar: "صلاحية صفحة المناديب", en: "Riders page permission" },
  "users.ridersAccessFullLabel": {
    ar: "عرض وتعديل البيانات وكلمة المرور",
    en: "View, edit data & reset password",
  },
  "users.ridersDeleteAccessLabel": {
    ar: "يقدر يحذف المناديب",
    en: "Can delete riders",
  },
  "users.ridersBlockAccessLabel": {
    ar: "يقدر يمنع/يسمح للمناديب",
    en: "Can block/unblock riders",
  },
  "users.reportsAccessLabel": { ar: "صلاحية صفحة التقارير", en: "Reports page permission" },
  "users.reportsAccessFullLabel": { ar: "رفع التقارير وإدارتها", en: "Upload & manage reports" },
  "users.documentsAccessLabel": {
    ar: "صلاحية صفحة المستندات",
    en: "Documents page permission",
  },
  "users.documentsAccessFull": { ar: "رفع وتعديل", en: "Upload & edit" },
  "users.documentsAccessViewOnly": { ar: "عرض وتنزيل فقط", en: "View & download only" },
  "users.operatingCardsAccessLabel": {
    ar: "يقدر يفتح صفحة كروت التشغيل",
    en: "Can open the Operating Cards page",
  },
  "users.operatingCardsUploadAccessLabel": {
    ar: "يقدر يرفع شيت إكسل لكروت التشغيل",
    en: "Can upload an operating cards Excel sheet",
  },
  "users.operatingCardsExportAccessLabel": {
    ar: "يقدر يصدّر كروت التشغيل إلى إكسل",
    en: "Can export operating cards to Excel",
  },
  "users.operatingCardsDeleteAccessLabel": {
    ar: "يقدر يحذف كرت التشغيل",
    en: "Can delete an operating card",
  },
  "users.expiryAlertsAccessLabel": {
    ar: "يقدر يفتح صفحة تنبيهات انتهاء المستندات",
    en: "Can open the Expiry Alerts page",
  },
  "users.lettersAccessLabel": {
    ar: "صلاحية صفحة الخطابات الرسمية",
    en: "Official letters page permission",
  },
  "users.lettersAccessFullLabel": { ar: "إنشاء الخطابات وإرسالها", en: "Create & send letters" },
  "users.accessNoneLabel": { ar: "بدون صلاحية", en: "No access" },
  "users.accessViewLabel": { ar: "عرض فقط", en: "View only" },
  "users.areasLabel": { ar: "المناطق المسموح بها", en: "Allowed areas" },
  "users.areasAllToggle": { ar: "كل المناطق", en: "All areas" },
  "users.areasNoneAvailable": {
    ar: "لا توجد مناطق مسجَّلة على المناديب حتى الآن",
    en: "No areas recorded on riders yet",
  },
  "users.tableName": { ar: "الاسم", en: "Name" },
  "users.tableEmail": { ar: "البريد الإلكتروني", en: "Email" },
  "users.tablePages": { ar: "الصفحات والصلاحيات", en: "Pages & permissions" },
  "users.tableAreas": { ar: "المناطق", en: "Areas" },
  "users.tableLastSignIn": { ar: "آخر دخول", en: "Last sign-in" },
  "users.tableActions": { ar: "إجراءات", en: "Actions" },
  "users.neverSignedIn": { ar: "لم يسجّل الدخول بعد", en: "Never signed in" },
  "users.allAreasBadge": { ar: "كل المناطق", en: "All areas" },
  "users.editPermissionsTooltip": { ar: "تعديل الصلاحيات", en: "Edit permissions" },
  "users.deleteTooltip": { ar: "حذف المستخدم", en: "Delete user" },
  "users.deleteConfirmTitle": { ar: "حذف المستخدم؟", en: "Delete this user?" },
  "users.deleteConfirmDesc": {
    ar: "سيُحذف الحساب نهائيًا، ولن يتمكن صاحبه من تسجيل الدخول مرة أخرى.",
    en: "The account will be permanently deleted and won't be able to sign in again.",
  },
  "users.emptyState": {
    ar: "لم تُنشئ أي مستخدم لشركتك حتى الآن",
    en: "You haven't created any users for your company yet",
  },
  "users.newEmailLabel": { ar: "البريد الإلكتروني الجديد", en: "New email" },
  "users.newPasswordLabel": { ar: "كلمة المرور الجديدة", en: "New password" },
  "users.toastCreateSuccess": { ar: "تم إنشاء المستخدم", en: "User created" },
  "users.toastCreateFailed": { ar: "فشل إنشاء المستخدم", en: "Failed to create user" },
  "users.toastPermissionsUpdateSuccess": {
    ar: "تم تحديث الصلاحيات",
    en: "Permissions updated",
  },
  "users.toastPermissionsUpdateFailed": {
    ar: "فشل تحديث الصلاحيات",
    en: "Failed to update permissions",
  },
  "users.toastNameUpdateSuccess": { ar: "تم تحديث الاسم", en: "Name updated" },
  "users.toastNameUpdateFailed": { ar: "فشل تحديث الاسم", en: "Failed to update name" },
  "users.toastEmailUpdateSuccess": { ar: "تم تحديث البريد الإلكتروني", en: "Email updated" },
  "users.toastEmailUpdateFailed": {
    ar: "فشل تحديث البريد الإلكتروني",
    en: "Failed to update email",
  },
  "users.toastPasswordUpdateSuccess": { ar: "تم تحديث كلمة المرور", en: "Password updated" },
  "users.toastPasswordUpdateFailed": {
    ar: "فشل تحديث كلمة المرور",
    en: "Failed to update password",
  },
  "users.toastDeleteSuccess": { ar: "تم حذف المستخدم", en: "User deleted" },
  "users.toastDeleteFailed": { ar: "فشل حذف المستخدم", en: "Failed to delete user" },

  "letters.pageTitle": { ar: "خطابات رسمية", en: "Official letters" },
  "letters.pageDesc": {
    ar: "اكتب أي خطاب، اربطه بمندوب لو حبيت، راجعه واحفظه، وبعدين اختار تبعته أو تطبعه أو تنزّله PDF",
    en: "Write any letter, optionally link it to a rider, review and save it, then choose to send it, print it, or download it as PDF",
  },
  "letters.riderLabel": { ar: "المندوب (اختياري)", en: "Rider (optional)" },
  "letters.titleLabel": { ar: "عنوان الخطاب", en: "Letter title" },
  "letters.titlePlaceholder": { ar: "مثال: خطاب تعريف", en: "e.g. Introduction letter" },
  "letters.insertFieldsLabel": { ar: "إدراج بيانات المندوب", en: "Insert rider data" },
  "letters.fieldName": { ar: "الاسم", en: "Name" },
  "letters.fieldIqama": { ar: "رقم الإقامة", en: "Iqama number" },
  "letters.fieldId": { ar: "رقم الـ ID", en: "ID number" },
  "letters.bodyLabel": { ar: "نص الخطاب", en: "Letter body" },
  "letters.bodyPlaceholder": { ar: "اكتب نص الخطاب هنا...", en: "Write the letter here..." },
  "letters.dateLabel": { ar: "تاريخ الخطاب", en: "Letter date" },
  "letters.includeStampLabel": { ar: "إظهار ختم الشركة", en: "Show company stamp" },
  "letters.includeSignatureLabel": { ar: "إظهار التوقيع", en: "Show signature" },
  "letters.previewTitle": { ar: "المعاينة", en: "Preview" },
  "letters.newLetterButton": { ar: "خطاب جديد", en: "New letter" },
  "letters.saveButton": { ar: "حفظ", en: "Save" },
  "letters.toastSaveSuccess": { ar: "تم حفظ الخطاب", en: "Letter saved" },
  "letters.toastSaveFailed": { ar: "فشل حفظ الخطاب", en: "Failed to save the letter" },
  "letters.printButton": { ar: "طباعة", en: "Print" },
  "letters.downloadPdfButton": { ar: "تنزيل PDF", en: "Download PDF" },
  "letters.sendButton": { ar: "إرسال للمندوب", en: "Send to rider" },
  "letters.sendRequiresRiderHint": {
    ar: "اختار مندوب الأول عشان تقدر تبعتله الخطاب",
    en: "Choose a rider first to send the letter to them",
  },
  "letters.toastSendSuccess": { ar: "تم إرسال الخطاب للمندوب", en: "Letter sent to the rider" },
  "letters.toastSendFailed": { ar: "فشل إرسال الخطاب", en: "Failed to send the letter" },
  "letters.toastSelectRider": { ar: "اختر مندوب أولاً", en: "Choose a rider first" },
  "letters.toastTitleRequired": { ar: "اكتب عنوان الخطاب", en: "Enter the letter title" },
  "letters.toastBodyRequired": { ar: "اكتب نص الخطاب", en: "Enter the letter body" },
  "letters.toastInvalidDate": { ar: "التاريخ غير صحيح", en: "Invalid date" },
  "letters.savedSectionTitle": { ar: "الخطابات المحفوظة", en: "Saved letters" },
  "letters.savedEmpty": { ar: "لسه مفيش خطابات محفوظة", en: "No letters saved yet" },
  "letters.savedSearchPlaceholder": {
    ar: "ابحث بالعنوان أو المحتوى أو اسم المندوب",
    en: "Search by title, content, or rider name",
  },
  "letters.savedSearchNoResults": {
    ar: "لا توجد خطابات مطابقة للبحث",
    en: "No letters match your search",
  },
  "letters.tableTitle": { ar: "العنوان", en: "Title" },
  "letters.tableRider": { ar: "المندوب", en: "Rider" },
  "letters.tableDate": { ar: "التاريخ", en: "Date" },
  "letters.tableStatus": { ar: "الحالة", en: "Status" },
  "letters.noRiderBadge": { ar: "بدون مندوب", en: "No rider" },
  "letters.sentBadge": { ar: "تم الإرسال", en: "Sent" },
  "letters.notSentBadge": { ar: "لم يُرسل بعد", en: "Not sent" },
  "letters.viewButton": { ar: "عرض", en: "View" },
  "letters.editButton": { ar: "تعديل", en: "Edit" },
  "letters.toastUpdateSuccess": { ar: "تم تحديث الخطاب", en: "Letter updated" },
  "letters.deleteConfirmTitle": { ar: "حذف الخطاب؟", en: "Delete letter?" },
  "letters.deleteConfirmDesc": {
    ar: "هيتشال من صفحة المندوب فورًا (لو كان مرسل) ومش هترجع تقدر تسترجعه.",
    en: "It disappears from the rider's page immediately (if it was sent) and can't be undone.",
  },
  "letters.toastDeleteSuccess": { ar: "تم حذف الخطاب", en: "Letter deleted" },
  "letters.toastDeleteFailed": { ar: "فشل حذف الخطاب", en: "Failed to delete letter" },
  "letters.stampLabel": { ar: "الختم", en: "Stamp" },
  "letters.crLabel": { ar: "س.ت", en: "C.R." },
  "letters.unifiedNumberLabel": { ar: "الرقم الموحد", en: "Unified No." },
  "letters.signatureLabel": { ar: "التوقيع", en: "Signature" },

  "rider.lettersTitle": { ar: "الخطابات الرسمية", en: "Official letters" },
  "rider.lettersEmpty": { ar: "لا يوجد خطابات", en: "No letters" },

  "menu.greeting": { ar: "مرحبًا،", en: "Hello," },
  "menu.tooltip": { ar: "الحساب واللغة والخروج", en: "Account, language and sign out" },
  "menu.language": { ar: "اللغة", en: "Language" },
  "theme.toggleTooltip": { ar: "الوضع الداكن / الفاتح", en: "Dark / light mode" },
  "theme.switchToDark": { ar: "التبديل للوضع الداكن", en: "Switch to dark mode" },
  "theme.switchToLight": { ar: "التبديل للوضع الفاتح", en: "Switch to light mode" },
  "nav.loading": { ar: "جارٍ التحميل…", en: "Loading…" },
  "nav.menu": { ar: "القائمة", en: "Menu" },

  "push.bannerTitle": { ar: "فعّل إشعارات الهاتف", en: "Turn on phone notifications" },
  "push.bannerDesc": {
    ar: "لتصلك التقارير والإشعارات والخطابات الجديدة على هاتفك، حتى لو كان التطبيق مغلقًا.",
    en: "Get new reports, notices and letters on your phone, even when the app is closed.",
  },
  "push.enableButton": { ar: "تفعيل الإشعارات", en: "Enable notifications" },
  "push.dismiss": { ar: "لاحقًا", en: "Not now" },
  "push.iosInstallHint": {
    ar: "لتفعيل الإشعارات على الآيفون، ثبّت التطبيق على الشاشة الرئيسية أولًا ثم افتحه من هناك.",
    en: "To get notifications on iPhone, add the app to your Home Screen first, then open it from there.",
  },
  "push.menuEnable": { ar: "تفعيل إشعارات الهاتف", en: "Enable phone notifications" },
  "push.menuDisable": { ar: "إيقاف إشعارات الهاتف", en: "Turn off phone notifications" },
  "push.toastEnabled": { ar: "تم تفعيل إشعارات الهاتف", en: "Phone notifications enabled" },
  "push.toastDisabled": { ar: "تم إيقاف إشعارات الهاتف", en: "Phone notifications turned off" },
  "push.toastDenied": {
    ar: "لم يُسمح بالإشعارات. يمكنك السماح بها من إعدادات المتصفح.",
    en: "Notifications weren't allowed. You can allow them in your browser settings.",
  },
  "push.toastFailed": { ar: "تعذّر تفعيل الإشعارات", en: "Couldn't set up notifications" },

  "superAdmin.navCompanies": { ar: "الشركات", en: "Companies" },
  "superAdmin.navAccounts": { ar: "الحسابات", en: "Accounts" },
  "superAdmin.navAnnouncements": { ar: "الإشعارات", en: "Announcements" },
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
