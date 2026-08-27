# نتائج البحث في Electron

## المصادر الرسمية

- https://www.electronjs.org/docs/latest/api/web-contents-view
- https://www.electronjs.org/docs/latest/tutorial/security

## النتائج

توضح وثائق Electron أن `WebContentsView` يعمل من العملية الرئيسية، ويُضاف إلى `BaseWindow.contentView`، ثم يُحمّل الموقع عبر `view.webContents.loadURL(...)` ويُضبط موضعه عبر `setBounds`. هذه الآلية تعرض المواقع كـ WebContents أصلية داخل نافذة التطبيق بدل iframe.

توصي وثائق الأمان بعدم تفعيل `nodeIntegration` للمحتوى البعيد، وتفعيل `contextIsolation` وsandbox، واستخدام preload محلي ضيق الصلاحيات. سيطبق AAKIL هذه الإعدادات على الغلاف المحلي، بينما تبقى صفحات المواقع البعيدة معزولة عن Node/Electron APIs.
