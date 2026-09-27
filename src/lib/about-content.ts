import {
  BellRing,
  Building2,
  ClipboardList,
  FileSignature,
  FileSpreadsheet,
  FileText,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Smartphone,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Lang } from "@/lib/i18n";

// Long-form marketing copy for the public /about page. Kept apart from the
// UI dictionary in i18n.tsx because it's prose, not interface chrome.
export type Localized = Record<Lang, string>;

export interface AboutFeature {
  icon: LucideIcon;
  title: Localized;
  intro: Localized;
  points: Localized[];
}

export const ABOUT_HERO = {
  badge: {
    ar: "منصة عربية لإدارة مناديب التشغيل اللوجستي",
    en: "An Arabic-first platform for managing logistics riders",
  },
  title: {
    ar: "كل ما تحتاجه شركتك لإدارة مناديبها في مكان واحد",
    en: "Everything your company needs to manage its riders, in one place",
  },
  desc: {
    ar: "نظام مندوبي منصة متكاملة لشركات التشغيل اللوجستي: ترفع تقارير الأداء والرواتب الشهرية، وتتابع مستندات المناديب وخطاباتهم، وتصل إلى كل مندوب مباشرة على هاتفه، من دون أوراق ولا ملفات متفرقة ولا رسائل ضائعة.",
    en: "My Riders is an all-in-one platform for logistics operators: upload monthly performance and salary reports, track rider documents and letters, and reach every rider directly on their phone — no paperwork, scattered files or lost messages.",
  },
  primaryCta: { ar: "دخول الإدارة", en: "Admin login" },
  secondaryCta: { ar: "استعلام مندوب", en: "Rider lookup" },
};

export const ABOUT_HIGHLIGHTS: { icon: LucideIcon; label: Localized }[] = [
  {
    icon: FileSpreadsheet,
    label: { ar: "تقرير الشهر من ملف واحد", en: "A month's report from a single file" },
  },
  {
    icon: Users,
    label: { ar: "مطابقة تلقائية للمناديب", en: "Riders matched automatically" },
  },
  {
    icon: BellRing,
    label: { ar: "إشعارات على هاتف المندوب", en: "Notifications on the rider's phone" },
  },
  {
    icon: Smartphone,
    label: { ar: "يعمل كتطبيق على الجوال", en: "Works like an app on mobile" },
  },
];

export const ABOUT_PROBLEM = {
  title: { ar: "لماذا مندوبي؟", en: "Why My Riders?" },
  intro: {
    ar: "إدارة عشرات أو مئات المناديب بالطرق التقليدية تستهلك وقتًا كبيرًا وتترك مجالًا للأخطاء. هذه هي المشكلات التي وُجد النظام لحلّها:",
    en: "Managing dozens or hundreds of riders the traditional way eats time and invites mistakes. These are the problems the system was built to solve:",
  },
  pains: [
    {
      problem: {
        ar: "ملفات Excel تُرسل عبر الرسائل ويتعذّر تتبّعها",
        en: "Excel sheets passed around in chat and impossible to track",
      },
      solution: {
        ar: "تقرير كل شهر محفوظ ومرتّب، ويصل لكل مندوب بياناته فقط",
        en: "Each month's report is stored and organised, and every rider sees only their own data",
      },
    },
    {
      problem: {
        ar: "المندوب يسأل عن تفاصيل راتبه وأدائه باستمرار",
        en: "Riders constantly asking about their pay and performance",
      },
      solution: {
        ar: "يدخل برقم إقامته ويرى كل شيء بنفسه في أي وقت",
        en: "They enter their Iqama number and see everything themselves, any time",
      },
    },
    {
      problem: {
        ar: "مستندات تنتهي دون أن ينتبه أحد",
        en: "Documents expiring without anyone noticing",
      },
      solution: {
        ar: "تنبيهات واضحة قبل الانتهاء وبعده، وشارات على القائمة الجانبية",
        en: "Clear alerts before and after expiry, with badges right in the sidebar",
      },
    },
    {
      problem: {
        ar: "خطابات تُكتب وتُطبع وتُسلَّم يدويًا",
        en: "Letters written, printed and handed over by hand",
      },
      solution: {
        ar: "خطاب رسمي بالشعار والختم والتوقيع يصل إلى صفحة المندوب فورًا",
        en: "An official letter with logo, stamp and signature lands on the rider's page instantly",
      },
    },
  ] satisfies { problem: Localized; solution: Localized }[],
};

export const ABOUT_AUDIENCE = {
  title: { ar: "لمن صُمّم النظام؟", en: "Who is it for?" },
  items: [
    {
      icon: Building2,
      title: { ar: "شركات التشغيل اللوجستي", en: "Logistics operators" },
      desc: {
        ar: "الشركات التي تشغّل فرقًا من مناديب التوصيل وتحتاج إلى تنظيم تقاريرهم ومستنداتهم ومراسلاتهم في نظام واحد موثوق.",
        en: "Companies running fleets of delivery riders that need their reports, documents and correspondence organised in one dependable system.",
      },
    },
    {
      icon: ClipboardList,
      title: { ar: "مشرفو العمليات والموارد البشرية", en: "Operations and HR teams" },
      desc: {
        ar: "الفرق التي تتابع الأداء والمناطق والمستندات يوميًا، وتحتاج إلى صلاحيات تناسب دور كل موظف.",
        en: "Teams that follow performance, areas and documents every day and need permissions that fit each employee's role.",
      },
    },
    {
      icon: Users,
      title: { ar: "المناديب أنفسهم", en: "The riders themselves" },
      desc: {
        ar: "يطّلع المندوب على تقاريره وخطاباته وإشعاراته من هاتفه، من دون إنشاء حساب ولا تحميل برامج معقّدة.",
        en: "Riders see their reports, letters and notices from their phone — no account to create and no complicated software to install.",
      },
    },
  ],
};

export const ABOUT_FEATURES_TITLE = {
  title: { ar: "مميزات النظام بالتفصيل", en: "Features in detail" },
  desc: {
    ar: "كل ما يحتاجه فريقك اليومي، مقسّمًا إلى وحدات واضحة تعمل معًا.",
    en: "Everything your team needs day to day, split into clear modules that work together.",
  },
};

export const ABOUT_FEATURES: AboutFeature[] = [
  {
    icon: FileSpreadsheet,
    title: { ar: "تقارير الأداء والرواتب الشهرية", en: "Monthly performance and salary reports" },
    intro: {
      ar: "ارفع ملف الشهر وسيتولى النظام الباقي، ومهما كان شكل الأعمدة في ملفك.",
      en: "Upload the month's file and the system does the rest, whatever your columns look like.",
    },
    points: [
      {
        ar: "دعم ملفات Excel وCSV، مع التعرّف التلقائي على أعمدة رقم الإقامة والهوية والاسم",
        en: "Excel and CSV support, with automatic detection of the Iqama, ID and name columns",
      },
      {
        ar: "مطابقة كل صف بالمندوب الصحيح عبر رقم الإقامة أو الهوية، من دون تكرار للمناديب",
        en: "Every row is matched to the right rider by Iqama or ID number, without creating duplicates",
      },
      {
        ar: "دمج عدة ملفات في تقرير الشهر نفسه، كملف للمسافات وآخر للتقييمات",
        en: "Merge several files into the same month's report, such as a distances sheet and a ratings sheet",
      },
      {
        ar: "جمع الصفوف المتكررة للمندوب الواحد تلقائيًا، مع خيار استبدال التقرير بالكامل",
        en: "A rider's repeated rows are combined automatically, with the option to replace the whole report",
      },
      {
        ar: "الاحتفاظ بكل ملف على حدة لتنزيله أو حذفه لاحقًا، وإضافة ملاحظة على كل تقرير",
        en: "Every file is kept separately so it can be downloaded or deleted later, and each report can carry a note",
      },
    ],
  },
  {
    icon: LayoutDashboard,
    title: { ar: "لوحة النظرة العامة والتحليلات", en: "Overview dashboard and analytics" },
    intro: {
      ar: "صورة سريعة عن أداء الشركة بالكامل، ثم تفاصيل أي مندوب بضغطة واحدة.",
      en: "A quick picture of the whole company's performance, then any rider's details in one click.",
    },
    points: [
      {
        ar: "رسوم بيانية لأفضل المناديب أداءً وتوزيع حالات الأداء لكل شهر",
        en: "Charts of the top performers and the spread of performance statuses for each month",
      },
      {
        ar: "البحث عن مندوب وعرض تطوّر أدائه شهرًا بشهر في منحنى متصل",
        en: "Search for a rider and see their performance evolve month by month on a continuous curve",
      },
      {
        ar: "مقارنة أداء المندوب بين الأشهر لمعرفة الاتجاه، صعودًا أو هبوطًا",
        en: "Compare a rider across months to spot whether they're trending up or down",
      },
      {
        ar: "تصدير تفاصيل المندوب الشهرية بصيغة PDF على ورق الشركة الرسمي",
        en: "Export a rider's monthly details as a PDF on the company's official letterhead",
      },
    ],
  },
  {
    icon: Users,
    title: { ar: "إدارة المناديب", en: "Rider management" },
    intro: {
      ar: "قاعدة بيانات مرتبة لكل مندوب في شركتك، سهلة التحديث والبحث.",
      en: "A tidy database of every rider in your company, easy to update and search.",
    },
    points: [
      {
        ar: "رفع قائمة المناديب دفعة واحدة، وتعديل بياناتهم وصورهم ومناطقهم لاحقًا",
        en: "Upload your roster in one go, then edit riders' details, photos and areas later",
      },
      {
        ar: "إيقاف مندوب مؤقتًا عن الاستعلام وإعادته عند الحاجة",
        en: "Temporarily block a rider from lookups and restore them when needed",
      },
      {
        ar: "تعيين كلمة مرور للمندوب أو إعادة ضبطها إذا نسيها",
        en: "Set a rider's password or reset it if they forget it",
      },
      {
        ar: "بيانات إضافية مرنة يمكن إرفاقها بكل مندوب وتظهر في صفحته",
        en: "Flexible extra fields you can attach to each rider, shown on their page",
      },
    ],
  },
  {
    icon: FileText,
    title: { ar: "المستندات وتتبّع الانتهاء", en: "Documents and expiry tracking" },
    intro: {
      ar: "ملف كامل لكل مندوب، مع تنبيهات تمنع تعطّل العمل بسبب مستند منتهٍ.",
      en: "A complete file for every rider, with alerts that stop expired paperwork from disrupting work.",
    },
    points: [
      {
        ar: "حفظ صورة الإقامة ورخصة القيادة وبطاقة السائق وبطاقة التشغيل واستمارة المركبة والشهادة الصحية والصورة الشخصية",
        en: "Store the Iqama photo, driving licence, driver card, operating card, vehicle registration, health certificate and personal photo",
      },
      {
        ar: "بطاقة تشغيل إضافية بالقاعدة نفسها: حتى ثلاثة مناديب على البطاقة الواحدة وفي المنطقة ذاتها",
        en: "An extra operating card under the same rule: up to three riders per card, all in the same area",
      },
      {
        ar: "إضافة مستندات مخصّصة بأسماء من اختيارك لأي مندوب",
        en: "Add custom documents with names of your choosing to any rider",
      },
      {
        ar: "حالة واضحة لكل مستند (ساري، قارب على الانتهاء، منتهٍ) وشارة تنبيه على القائمة الجانبية",
        en: "A clear status for each document (valid, expiring soon, expired) and an alert badge in the sidebar",
      },
      {
        ar: "التحكم فيمن يرفع ويعدّل ومن يكتفي بالاطلاع والتنزيل",
        en: "Control who can upload and edit and who can only view and download",
      },
    ],
  },
  {
    icon: FileSignature,
    title: { ar: "الخطابات الرسمية", en: "Official letters" },
    intro: {
      ar: "اكتب الخطاب مرة واحدة، وأرسله للمندوب أو اطبعه بشكل رسمي جاهز.",
      en: "Write a letter once, then send it to the rider or print it in a ready, official layout.",
    },
    points: [
      {
        ar: "خطاب على ورق الشركة بالشعار وبيانات السجل التجاري والرقم الموحد",
        en: "Letters on company letterhead with the logo, commercial register and unified number",
      },
      {
        ar: "إدراج الختم والتوقيع بخيار يمكن تفعيله أو إيقافه لكل خطاب",
        en: "Add the stamp and signature, switchable on or off for each letter",
      },
      {
        ar: "تحديد تاريخ الخطاب، وحفظه كمسودة ثم إرساله متى شئت",
        en: "Choose the letter's date, save it as a draft and send it whenever you like",
      },
      {
        ar: "ظهور الخطاب المرسل في صفحة المندوب فورًا، وإمكانية طباعته أو حفظه PDF بلا ترويسة المتصفح",
        en: "A sent letter appears on the rider's page at once, and can be printed or saved as PDF without browser headers",
      },
    ],
  },
  {
    icon: Megaphone,
    title: { ar: "الإشعارات والإنذارات", en: "Notices and warnings" },
    intro: {
      ar: "قناة مباشرة بين الشركة ومناديبها، بدل مجموعات المراسلة المزدحمة.",
      en: "A direct channel between the company and its riders, instead of crowded chat groups.",
    },
    points: [
      {
        ar: "إرسال إشعار أو إنذار لمندوب محدّد أو لجميع مناديب الشركة دفعة واحدة",
        en: "Send a notice or a warning to one rider or to every rider in the company at once",
      },
      {
        ar: "تمييز الإنذارات عن الإشعارات العادية بصريًا",
        en: "Warnings are visually distinct from ordinary notices",
      },
      {
        ar: "معرفة عدد من قرأ الإشعار من بين المستهدفين",
        en: "See how many of the intended riders have read a notice",
      },
      {
        ar: "جرس في صفحة المندوب يعرض عدد غير المقروء برقم أحمر",
        en: "A bell on the rider's page shows the unread count as a red number",
      },
    ],
  },
  {
    icon: BellRing,
    title: { ar: "إشعارات الهاتف", en: "Phone notifications" },
    intro: {
      ar: "لا ينتظر المندوب حتى يفتح النظام؛ الخبر يصل إليه حيثما كان.",
      en: "Riders don't have to open the system to find out — the news reaches them wherever they are.",
    },
    points: [
      {
        ar: "تنبيه على الهاتف عند رفع تقرير جديد أو إرسال إشعار أو إنذار أو خطاب، حتى والتطبيق مغلق",
        en: "A phone alert when a new report, notice, warning or letter is sent, even when the app is closed",
      },
      {
        ar: "رقم على أيقونة التطبيق يبيّن عدد الإشعارات التي لم يطّلع عليها المندوب",
        en: "A number on the app icon showing how many alerts the rider hasn't seen yet",
      },
      {
        ar: "الضغط على الإشعار يفتح الصفحة المعنيّة مباشرة، كالتقرير أو الخطاب",
        en: "Tapping the alert opens the relevant page directly, such as the report or the letter",
      },
      {
        ar: "التفعيل اختياري ويتحكم فيه المندوب نفسه من قائمته",
        en: "It's optional, and each rider turns it on or off from their own menu",
      },
    ],
  },
  {
    icon: Landmark,
    title: { ar: "ملف الشركة والمستندات الرسمية", en: "Company profile and official documents" },
    intro: {
      ar: "هوية شركتك في مكان واحد، تُستخدم تلقائيًا في الخطابات والتقارير المطبوعة.",
      en: "Your company's identity in one place, used automatically in printed letters and reports.",
    },
    points: [
      {
        ar: "الشعار والاسم وأرقام السجل التجاري والرقم الموحد",
        en: "Logo, name, commercial register and unified numbers",
      },
      {
        ar: "الختم والتوقيع الرسميان لاستخدامهما في الخطابات",
        en: "The official stamp and signature for use in letters",
      },
      {
        ar: "حفظ مستندات الشركة كالسجل التجاري والشهادة الضريبية مع تنبيه قبل انتهاء صلاحيتها",
        en: "Keep company documents such as the commercial register and tax certificate, with a warning before they expire",
      },
    ],
  },
  {
    icon: UserCog,
    title: { ar: "المستخدمون والصلاحيات", en: "Users and permissions" },
    intro: {
      ar: "أضف فريقك، وحدّد بدقة ما يراه كل عضو وما يستطيع فعله.",
      en: "Add your team and decide precisely what each member can see and do.",
    },
    points: [
      {
        ar: "إضافة أعضاء فريقك والتحكم في بريدهم وكلمة مرورهم",
        en: "Add your team members and manage their email and password",
      },
      {
        ar: "صلاحيات مستقلة لكل صفحة: النظرة العامة والمناديب والتقارير والمستندات والخطابات",
        en: "Separate permissions for each page: overview, riders, reports, documents and letters",
      },
      {
        ar: "مستويات متدرجة: بلا وصول، أو عرض فقط، أو تعديل كامل",
        en: "Graduated levels: no access, view only, or full editing",
      },
      {
        ar: "حصر المستخدم في مناطق محددة فلا يرى إلا مناديبها ومستنداتها",
        en: "Limit a user to certain areas so they only see those areas' riders and documents",
      },
      {
        ar: "صفحة «حسابي» ليرى كل مستخدم صلاحياته ويغيّر كلمة مروره بنفسه",
        en: "A “My account” page where each user sees their permissions and changes their own password",
      },
    ],
  },
  {
    icon: Smartphone,
    title: { ar: "صفحة المندوب المستقلة", en: "A self-service rider page" },
    intro: {
      ar: "تجربة بسيطة وسريعة صُمّمت للهاتف أولًا.",
      en: "A simple, fast experience designed for the phone first.",
    },
    points: [
      {
        ar: "بحث برقم الإقامة أو الهوية بلا حساب ولا تسجيل",
        en: "Look up by Iqama or ID number — no account, no sign-up",
      },
      {
        ar: "كلمة مرور اختيارية يضعها المندوب لحماية بياناته",
        en: "An optional password the rider sets to protect their data",
      },
      {
        ar: "قائمة بأشهر التقارير المتاحة وتفاصيل كل شهر، مع إبراز أهم المؤشرات",
        en: "A list of available months and each month's details, with the key metrics highlighted",
      },
      {
        ar: "عرض الخطابات الرسمية وطباعتها، وقراءة الإشعارات والإنذارات",
        en: "View and print official letters, and read notices and warnings",
      },
    ],
  },
];

export const ABOUT_STEPS = {
  title: { ar: "كيف يعمل النظام؟", en: "How it works" },
  items: [
    {
      title: { ar: "أضف مناديبك", en: "Add your riders" },
      desc: {
        ar: "ارفع قائمة المناديب مرة واحدة، أو دع النظام ينشئهم تلقائيًا من أول تقرير.",
        en: "Upload your roster once, or let the system create riders automatically from the first report.",
      },
    },
    {
      title: { ar: "ارفع تقرير الشهر", en: "Upload the month's report" },
      desc: {
        ar: "اختر الشهر والملف، وسيُطابق النظام كل صف بمندوبه ويحفظ التقرير مرتبًا.",
        en: "Pick the month and the file, and the system matches each row to its rider and stores the report neatly.",
      },
    },
    {
      title: { ar: "يصل إلى المندوب", en: "It reaches the rider" },
      desc: {
        ar: "يستعلم المندوب برقمه ويرى تقريره، ويصله تنبيه على هاتفه إن فعّل الإشعارات.",
        en: "The rider looks up their number to see their report, and gets a phone alert if notifications are on.",
      },
    },
    {
      title: { ar: "تابع وأدِر", en: "Follow up and manage" },
      desc: {
        ar: "راقب الأداء في لوحة النظرة العامة، وتابع المستندات، وأرسل الخطابات والإنذارات عند الحاجة.",
        en: "Watch performance on the overview dashboard, follow documents, and send letters and warnings as needed.",
      },
    },
  ],
};

export const ABOUT_SECURITY = {
  title: { ar: "أمان وخصوصية بلا تنازلات", en: "Security and privacy, uncompromised" },
  desc: {
    ar: "بيانات المناديب والرواتب حساسة، ولذلك بُني النظام على حماية واضحة في كل طبقة.",
    en: "Rider and salary data is sensitive, so the system is built with clear protection at every layer.",
  },
  items: [
    {
      title: { ar: "بيانات شركتك لفريقك فقط", en: "Your data stays with your team" },
      desc: {
        ar: "لا يصل إلى بيانات المناديب والتقارير إلا المستخدمون الذين تمنحهم شركتك صلاحية الدخول.",
        en: "Only the users your company grants access to can reach rider and report data.",
      },
    },
    {
      title: { ar: "كلمات مرور مشفّرة", en: "Encrypted passwords" },
      desc: {
        ar: "تُخزَّن كلمات المرور مشفّرة بحيث لا تُقرأ ولا تُعرض لأي أحد.",
        en: "Passwords are stored hashed, so they can't be read or shown to anyone.",
      },
    },
    {
      title: { ar: "صلاحيات على مستوى قاعدة البيانات", en: "Permissions enforced in the database" },
      desc: {
        ar: "قيود الوصول تُطبَّق في قاعدة البيانات نفسها، لا في الواجهة وحدها.",
        en: "Access rules are enforced in the database itself, not only in the interface.",
      },
    },
    {
      title: { ar: "ملفات محفوظة بشكل خاص", en: "Privately stored files" },
      desc: {
        ar: "المستندات والتقارير المرفوعة لا يصل إليها إلا المصرّح لهم.",
        en: "Uploaded documents and reports are reachable only by authorised people.",
      },
    },
  ] satisfies { title: Localized; desc: Localized }[],
};

export const ABOUT_ANYWHERE = {
  title: { ar: "يعمل في أي مكان وبأي لغة", en: "Works anywhere, in any language" },
  points: [
    {
      ar: "تصميم متجاوب يناسب الجوال والحاسوب",
      en: "Responsive design for phones and desktops",
    },
    {
      ar: "يُثبَّت على الشاشة الرئيسية كأنه تطبيق، من دون متجر تطبيقات",
      en: "Installs to the home screen like an app, with no app store",
    },
    {
      ar: "واجهة كاملة بالعربية والإنجليزية مع اتجاه الكتابة الصحيح لكل لغة",
      en: "A full Arabic and English interface with the correct writing direction for each",
    },
    {
      ar: "طباعة وحفظ PDF للخطابات والتقارير بتنسيق رسمي",
      en: "Print or save PDF for letters and reports in a formal layout",
    },
  ] satisfies Localized[],
};

export const ABOUT_FAQ = {
  title: { ar: "أسئلة شائعة", en: "Frequently asked questions" },
  items: [
    {
      q: { ar: "هل يحتاج المندوب إلى حساب؟", en: "Does a rider need an account?" },
      a: {
        ar: "لا. يكفي أن يكتب رقم إقامته أو هويته في صفحة الاستعلام. ويمكنه اختياريًا وضع كلمة مرور لحماية بياناته.",
        en: "No. They just type their Iqama or ID number on the lookup page, and can optionally set a password to protect their data.",
      },
    },
    {
      q: { ar: "ما صيغ ملفات التقارير المدعومة؟", en: "Which report file formats are supported?" },
      a: {
        ar: "ملفات Excel وCSV بأي أعمدة. يتعرّف النظام على عمود رقم الإقامة أو الهوية والاسم، ويحفظ باقي الأعمدة كما هي.",
        en: "Excel and CSV files with any columns. The system finds the Iqama or ID and name columns and keeps the rest as they are.",
      },
    },
    {
      q: {
        ar: "هل أستطيع رفع أكثر من ملف للشهر الواحد؟",
        en: "Can I upload more than one file for the same month?",
      },
      a: {
        ar: "نعم. يمكنك دمج ملفات متعددة في تقرير الشهر نفسه، وسيُضاف كل ملف إلى صف كل مندوب. ويمكنك لاحقًا حذف أي ملف منها على حدة.",
        en: "Yes. You can merge several files into the same month's report, each adding to a rider's row, and later delete any single file.",
      },
    },
    {
      q: { ar: "هل بيانات شركتي محمية؟", en: "Is my company's data protected?" },
      a: {
        ar: "نعم. لا يصل إلى بياناتك إلا من تمنحهم شركتك صلاحية الدخول، وكلمات المرور مشفّرة، والمستندات والتقارير محفوظة بشكل خاص.",
        en: "Yes. Only people your company grants access to can reach your data, passwords are stored hashed, and documents and reports are kept private.",
      },
    },
    {
      q: {
        ar: "هل يمكن لأكثر من موظف استخدام النظام؟",
        en: "Can more than one employee use the system?",
      },
      a: {
        ar: "نعم. تضيف أعضاء فريقك وتحدد لكل منهم الصفحات المتاحة له ومستوى الصلاحية والمناطق التي يراها.",
        en: "Yes. You add your team members and set each one's pages, permission level and visible areas.",
      },
    },
    {
      q: { ar: "هل يعمل على الهاتف؟", en: "Does it work on a phone?" },
      a: {
        ar: "نعم. النظام مصمّم للجوال أولًا، ويمكن تثبيته على الشاشة الرئيسية ليعمل كتطبيق، مع دعم إشعارات الهاتف.",
        en: "Yes. It's designed mobile-first and can be added to the home screen to work like an app, with phone notification support.",
      },
    },
    {
      q: { ar: "كيف تبدأ شركتي باستخدام النظام؟", en: "How does my company get started?" },
      a: {
        ar: "تسجّل الدخول إلى لوحة شركتك، وترفع قائمة المناديب وأول تقرير شهري، ثم تضيف فريقك وتضبط صلاحياتهم.",
        en: "Sign in to your company dashboard, upload your roster and first monthly report, then add your team and set their permissions.",
      },
    },
  ] satisfies { q: Localized; a: Localized }[],
};

export const ABOUT_CTA = {
  title: { ar: "جاهز لتنظيم عمل مناديبك؟", en: "Ready to organise your riders' work?" },
  desc: {
    ar: "سجّل الدخول إلى لوحة شركتك وابدأ برفع أول تقرير، أو جرّب صفحة المندوب لترى ما يراه مناديبك.",
    en: "Sign in to your company dashboard and upload your first report, or try the rider page to see what your riders see.",
  },
};
