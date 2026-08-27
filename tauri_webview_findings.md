# نتائج التحقق من Tauri WebView

## المصادر الرسمية

- https://v2.tauri.app/security/capabilities/
- https://v2.tauri.app/reference/javascript/api/namespacewebview/

## النتائج

توثّق Tauri أن capabilities تحدد الصلاحيات للنوافذ والـ WebViews، ويمكن استهداف WebViews بأنماط glob عبر الحقل `webviews`. كما توضح الوثائق أن `new Webview` يجب استدعاؤه بعد إنشاء النافذة الأصلية، وأنه يجب الاستماع إلى `tauri://created` و`tauri://error`.

واجهة Webview تنشئ WebView جديدًا عبر `new Webview(window, label, { url, x, y, width, height })`، وتوفر `show`, `hide`, `close`, `setFocus`, `setPosition`, `setSize`, و`setAutoResize`. النسخة الحالية تنتظر حدث الإنشاء، لكن ستُضاف capability صريحة للـ WebViews ذات label `tab-*`، كما ستظهر رسالة الخطأ الفعلية للمساعدة في التشخيص.
