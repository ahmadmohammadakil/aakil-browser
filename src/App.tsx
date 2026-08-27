import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import "./App.css";

type Tab = {
  id: number;
  title: string;
  url: string;
  domain: string;
  icon: string;
  history: string[];
  historyIndex: number;
};

type Toast = {
  title: string;
  message: string;
};

type Theme = "dark" | "light";

const suggestions = [
  { label: "بحث آمن", value: "https://duckduckgo.com" },
  { label: "أخبار التقنية", value: "https://www.theverge.com" },
  { label: "الموسوعة الحرة", value: "https://www.wikipedia.org" },
];

const initialTab: Tab = {
  id: 1,
  title: "صفحة البداية",
  url: "aakil://home",
  domain: "aakil",
  icon: "A",
  history: ["aakil://home"],
  historyIndex: 0,
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "aakil://home";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

function getDomain(url: string) {
  if (url === "aakil://home") return "aakil";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "نتيجة البحث";
  }
}

function getTitle(url: string) {
  if (url === "aakil://home") return "صفحة البداية";
  const domain = getDomain(url);
  return domain.length > 22 ? `${domain.slice(0, 22)}…` : domain;
}

function waitForWebview(view: Webview) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    };
    const timeout = window.setTimeout(() => finish(new Error("WebView creation timed out")), 15000);
    void view.once("tauri://created", () => finish());
    void view.once("tauri://error", (event) => finish(new Error(String(event.payload ?? "WebView creation failed"))));
  });
}

function App() {
  const [tabs, setTabs] = useState<Tab[]>([initialTab]);
  const [activeId, setActiveId] = useState(1);
  const [address, setAddress] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isVpnPanelOpen, setIsVpnPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem("aakil-theme") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("aakil-history") || "[]");
    } catch {
      return [];
    }
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const [nativeWebviewFailed, setNativeWebviewFailed] = useState(false);
  const nativeHostRef = useRef<HTMLDivElement>(null);
  const nativeWebviews = useRef<Map<number, Webview>>(new Map());
  const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeId) || tabs[0],
    [activeId, tabs],
  );
  const isHome = activeTab.url === "aakil://home";

  useEffect(() => {
    setAddress(activeTab.url === "aakil://home" ? "" : activeTab.url);
  }, [activeTab.id, activeTab.url]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("aakil-theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("aakil-history", JSON.stringify(history.slice(0, 50)));
  }, [history]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isTauriRuntime || isHome) return;
    let cancelled = false;
    const syncNativeWebview = async () => {
      const host = nativeHostRef.current;
      if (!host) return;
      try {
        const current = nativeWebviews.current.get(activeTab.id);
        for (const [id, view] of nativeWebviews.current) {
          if (id !== activeTab.id) await view.hide();
        }

        const currentUrl = (current as (Webview & { aakilUrl?: string }) | undefined)?.aakilUrl;
        if (current && currentUrl === activeTab.url && !cancelled) {
          await current.show();
          await current.setFocus();
          return;
        }

        if (current) {
          await current.close();
          nativeWebviews.current.delete(activeTab.id);
        }

        const rect = host.getBoundingClientRect();
        const webview = new Webview(getCurrentWebviewWindow(), `tab-${activeTab.id}`, {
          url: activeTab.url,
          x: rect.left,
          y: rect.top,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        });
        (webview as Webview & { aakilUrl?: string }).aakilUrl = activeTab.url;
        nativeWebviews.current.set(activeTab.id, webview);
        await waitForWebview(webview);
        await webview.setAutoResize(false);
        if (!cancelled) {
          await webview.show();
          await webview.setFocus();
          setNativeWebviewFailed(false);
        }
      } catch (error) {
        setNativeWebviewFailed(true);
        const detail = error instanceof Error ? error.message : String(error);
        showToast("تعذر فتح WebView الأصلي", detail ? detail.slice(0, 180) : "تحقق من صلاحيات WebView وWebView2 في Windows.");
      }
    };
    void syncNativeWebview();
    return () => { cancelled = true; };
  }, [activeTab.id, activeTab.url, isHome, isTauriRuntime, reloadNonce]);

  useEffect(() => {
    if (!isTauriRuntime) return;
    const resizeNativeWebview = async () => {
      const host = nativeHostRef.current;
      const view = nativeWebviews.current.get(activeTab.id);
      if (!host || !view || isHome) return;
      const rect = host.getBoundingClientRect();
      try {
        await view.setPosition(new LogicalPosition(rect.left, rect.top));
        await view.setSize(new LogicalSize(Math.max(1, rect.width), Math.max(1, rect.height)));
      } catch {
        // The webview may be closing while a tab is changing.
      }
    };
    window.addEventListener("resize", resizeNativeWebview);
    void resizeNativeWebview();
    return () => window.removeEventListener("resize", resizeNativeWebview);
  }, [activeTab.id, isHome, isTauriRuntime]);

  useEffect(() => () => {
    for (const view of nativeWebviews.current.values()) void view.close();
    nativeWebviews.current.clear();
  }, []);

  const showToast = (title: string, message: string) => {
    setToast({ title, message });
  };

  const navigate = (rawUrl: string) => {
    const url = normalizeUrl(rawUrl);
    const nextHistory = [...activeTab.history.slice(0, activeTab.historyIndex + 1), url];
    const nextTab: Tab = {
      ...activeTab,
      url,
      title: getTitle(url),
      domain: getDomain(url),
      icon: getDomain(url).charAt(0).toUpperCase() || "A",
      history: nextHistory,
      historyIndex: nextHistory.length - 1,
    };
    setTabs((current) => current.map((tab) => (tab.id === activeId ? nextTab : tab)));
    setAddress(url === "aakil://home" ? "" : url);
    if (!isPrivate && url !== "aakil://home") {
      setHistory((current) => [url, ...current.filter((item) => item !== url)].slice(0, 50));
    }
  };

  const moveHistory = (direction: -1 | 1) => {
    const nextIndex = activeTab.historyIndex + direction;
    if (nextIndex < 0 || nextIndex >= activeTab.history.length) return;
    const url = activeTab.history[nextIndex];
    setTabs((current) => current.map((tab) => tab.id === activeId ? { ...tab, url, title: getTitle(url), domain: getDomain(url), icon: getDomain(url).charAt(0).toUpperCase() || "A", historyIndex: nextIndex } : tab));
  };

  const handleAddressSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(address);
  };

  const createTab = (url = "aakil://home") => {
    const id = Math.max(...tabs.map((tab) => tab.id), 0) + 1;
    const tab: Tab = {
      id,
      title: getTitle(url),
      url,
      domain: getDomain(url),
      icon: getDomain(url).charAt(0).toUpperCase() || "A",
      history: [url],
      historyIndex: 0,
    };
    setTabs((current) => [...current, tab]);
    setActiveId(id);
  };

  const closeTab = (id: number) => {
    if (tabs.length === 1) {
      setTabs([{ ...initialTab, id: 1 }]);
      setActiveId(1);
      return;
    }
    const index = tabs.findIndex((tab) => tab.id === id);
    const nextTabs = tabs.filter((tab) => tab.id !== id);
    setTabs(nextTabs);
    if (id === activeId) {
      setActiveId(nextTabs[Math.max(0, index - 1)]?.id || nextTabs[0].id);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("aakil-history");
    showToast("تم تنظيف السجل", "لم يعد سجل التصفح محفوظًا على هذا الجهاز.");
  };

  const openExternal = async () => {
    if (!activeTab.url.startsWith("http")) {
      showToast("لا يوجد رابط خارجي", "افتح صفحة ويب أولًا ثم جرّب مرة أخرى.");
      return;
    }
    try {
      await openUrl(activeTab.url);
    } catch {
      window.open(activeTab.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className={`app-shell ${isSidebarOpen ? "sidebar-open" : "sidebar-closed"}`} dir="rtl">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark">A</div>
          <div>
            <div className="brand-name">AAKIL</div>
            <div className="brand-caption">متصفحك الخاص</div>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setIsSidebarOpen(false)} aria-label="إخفاء القائمة">
            ×
          </button>
        </div>

        <div className="sidebar-section-label">مساحتك</div>
        <nav className="sidebar-nav" aria-label="التنقل الرئيسي">
          <button className="nav-item active" onClick={() => setIsSettingsOpen(false)}>
            <span className="nav-icon">⌂</span>
            <span>صفحة البداية</span>
          </button>
          <button className="nav-item" onClick={() => showToast("التبويبات المفتوحة", `${tabs.length} تبويب نشط في هذه الجلسة.`)}>
            <span className="nav-icon">▣</span>
            <span>التبويبات</span>
            <span className="nav-count">{tabs.length}</span>
          </button>
          <button className="nav-item" onClick={() => showToast("المفضلة", "ستتوفر إدارة المفضلة في النسخة التالية.")}>
            <span className="nav-icon">☆</span>
            <span>المفضلة</span>
          </button>
          <button className="nav-item" onClick={() => showToast("سجل التصفح", `${history.length} زيارة محفوظة محليًا.`)}>
            <span className="nav-icon">◷</span>
            <span>السجل</span>
          </button>
        </nav>

        <div className="sidebar-section-label second-label">الحماية</div>
        <div className="privacy-card">
          <div className="privacy-card-top">
            <span className="shield-icon">✓</span>
            <span>حماية AAKIL</span>
            <span className="live-dot" />
          </div>
          <p>لا نرسل سجل التصفح إلى أي خادم.</p>
          <div className="privacy-line"><span>الوضع الحالي</span><strong>محلي وآمن</strong></div>
        </div>

        <button className={`vpn-card ${isVpnPanelOpen ? "selected" : ""}`} onClick={() => setIsVpnPanelOpen((current) => !current)}>
          <span className="vpn-icon">⌁</span>
          <span className="vpn-card-copy">
            <strong>VPN اختياري</strong>
            <small>غير مفعّل حاليًا</small>
          </span>
          <span className="vpn-arrow">‹</span>
        </button>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={() => setIsSettingsOpen(true)}>
            <span className="nav-icon">⚙</span>
            <span>الإعدادات</span>
          </button>
          <div className="profile-chip">
            <div className="profile-avatar">م</div>
            <div><strong>مساحتي الخاصة</strong><span>دون حساب سحابي</span></div>
            <span className="more-dots">•••</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            {!isSidebarOpen && <button className="icon-button menu-button" onClick={() => setIsSidebarOpen(true)} aria-label="إظهار القائمة">☰</button>}
            <div className="connection-status"><span className="status-dot" /> اتصال محمي</div>
            <span className="status-divider" />
            <span className="status-copy">لا توجد أدوات تتبع نشطة</span>
          </div>
          <div className="topbar-right">
            <button className="topbar-link" onClick={() => setIsPrivate((current) => !current)}>
              <span className={`private-toggle ${isPrivate ? "on" : ""}`} />
              {isPrivate ? "الوضع الخاص مفعّل" : "الوضع الخاص"}
            </button>
            <button className="topbar-link theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}>
              <span className="theme-icon">{theme === "dark" ? "☼" : "☾"}</span>
              {theme === "dark" ? "نهاري" : "ليلي"}
            </button>
            <button className="icon-button" onClick={() => showToast("مساعدة AAKIL", "هذه نسخة أولية من المتصفح مع حماية محلية افتراضية.")} aria-label="المساعدة">?</button>
            <button className="icon-button" onClick={() => setIsSettingsOpen(true)} aria-label="الإعدادات">⚙</button>
          </div>
        </header>

        <section className="browser-chrome">
          <div className="tabs-row">
            <div className="tabs-list">
              {tabs.map((tab) => (
                <button key={tab.id} className={`browser-tab ${tab.id === activeId ? "current" : ""}`} onClick={() => setActiveId(tab.id)}>
                  <span className="tab-favicon">{tab.icon}</span>
                  <span className="tab-title">{tab.title}</span>
                  <span className="tab-close" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>×</span>
                </button>
              ))}
              <button className="new-tab-button" onClick={() => createTab()} aria-label="تبويب جديد">+</button>
            </div>
            <div className="window-actions"><span /> <span /> <span /></div>
          </div>

          <div className="toolbar-row">
            <div className="navigation-controls">
              <button className="tool-button muted" onClick={() => moveHistory(-1)} disabled={activeTab.historyIndex === 0} aria-label="رجوع">‹</button>
              <button className="tool-button muted" onClick={() => moveHistory(1)} disabled={activeTab.historyIndex === activeTab.history.length - 1} aria-label="تقدم">›</button>
              <button className="tool-button" onClick={() => setReloadNonce((current) => current + 1)} aria-label="إعادة تحميل">↻</button>
            </div>
            <form className="address-bar" onSubmit={handleAddressSubmit}>
              <span className="address-lock">⌑</span>
              <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="ابحث أو اكتب عنوان موقع" aria-label="شريط العنوان" />
              <button type="button" className="address-action" onClick={() => setIsPrivate((current) => !current)} aria-label="تبديل الوضع الخاص">◈</button>
            </form>
            <div className="toolbar-actions">
              <button className="tool-button" onClick={openExternal} aria-label="فتح في المتصفح الافتراضي">↗</button>
              <button className={`vpn-mini ${isVpnPanelOpen ? "active" : ""}`} onClick={() => setIsVpnPanelOpen((current) => !current)}><span>⌁</span> VPN</button>
              <button className="tool-button" onClick={() => setIsSettingsOpen(true)} aria-label="قائمة">⋮</button>
            </div>
          </div>
        </section>

        <section className="page-stage">
          {isVpnPanelOpen && (
            <div className="vpn-panel">
              <div className="vpn-panel-icon">⌁</div>
              <div className="vpn-panel-copy"><strong>وحدة VPN اختيارية</strong><span>لم يتم ربط مزوّد أو ملف إعداد بعد. لن يُدّعى وجود اتصال VPN قبل تفعيله فعليًا.</span></div>
              <button className="secondary-button" onClick={() => showToast("الوحدة جاهزة للإضافة", "يمكن لاحقًا استيراد ملف WireGuard أو ربط عميل رسمي.")}>تعرف على طريقة الإضافة</button>
              <button className="panel-dismiss" onClick={() => setIsVpnPanelOpen(false)} aria-label="إغلاق">×</button>
            </div>
          )}

          {isHome ? (
            <div className="home-page">
              <div className="home-hero">
                <div className="hero-orb orb-one" /><div className="hero-orb orb-two" />
                <div className="home-mark">A</div>
                <div className="eyebrow">مساحة تصفح أكثر هدوءًا</div>
                <h1>تصفّح بذكاء.<br /><span>اترك أثرًا أقل.</span></h1>
                <p>AAKIL يحافظ على تركيزك وخصوصيتك، مع تجربة نظيفة مصممة لك وحدك.</p>
                <form className="home-search" onSubmit={handleAddressSubmit}>
                  <span>⌕</span>
                  <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="ابحث في الويب أو اكتب عنوانًا" aria-label="بحث من الصفحة الرئيسية" />
                  <button type="submit">بحث</button>
                </form>
              </div>
              <div className="quick-section">
                <div className="section-heading"><div><span className="section-kicker">ابدأ من هنا</span><h2>وصول سريع</h2></div><button className="text-button" onClick={() => showToast("التخصيص", "ستتمكن من إضافة اختصاراتك في إصدار قادم.")}>تخصيص <span>←</span></button></div>
                <div className="quick-grid">
                  {suggestions.map((item, index) => <button key={item.label} className="quick-card" onClick={() => navigate(item.value)}><span className={`quick-icon icon-${index}`}>{index === 0 ? "D" : index === 1 ? "T" : "W"}</span><span><strong>{item.label}</strong><small>{getDomain(item.value)}</small></span><span className="card-arrow">←</span></button>)}
                  <button className="quick-card add-card" onClick={() => showToast("اختصار جديد", "يمكن تخصيص اختصاراتك قريبًا.")}><span className="add-icon">+</span><span><strong>إضافة اختصار</strong><small>موقعك المفضل</small></span></button>
                </div>
              </div>
              <div className="home-footer"><span><span className="footer-shield">✓</span> خصوصيتك أولًا</span><span>الإصدار 0.1.2</span></div>
            </div>
          ) : (
            <div className="remote-page">
              <div className="remote-page-header"><div className="site-badge">{activeTab.icon}</div><div><strong>{activeTab.domain}</strong><span>{isTauriRuntime && !nativeWebviewFailed ? "WebView أصلي داخل AAKIL" : "معاينة ويب"}</span></div><button className="secondary-button" onClick={openExternal}>فتح خارجيًا ↗</button></div>
              {isTauriRuntime && !nativeWebviewFailed ? (
                <div className="native-webview-host" ref={nativeHostRef} aria-label="مساحة صفحة الويب" />
              ) : nativeWebviewFailed ? (
                <div className="native-error"><div className="native-error-icon">!</div><h2>تعذر إنشاء مساحة التصفح</h2><p>لم يكتمل تشغيل WebView الأصلي. يمكنك فتح الموقع خارجيًا، أو تحديث AAKIL إلى النسخة التي تتضمن صلاحيات WebView.</p><button className="secondary-button" onClick={openExternal}>فتح الموقع خارجيًا ↗</button></div>
              ) : (
                <iframe key={`${activeTab.id}-${activeTab.url}-${reloadNonce}`} title={activeTab.title} src={activeTab.url} referrerPolicy="no-referrer" />
              )}
              <div className="remote-note">تُستخدم مساحة WebView الأصلية على Windows لتجنب رفض المواقع داخل iframe. زر «فتح خارجيًا» يبقى متاحًا دائمًا.</div>
            </div>
          )}
        </section>
      </main>

      {isSettingsOpen && (
        <div className="modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <section className="settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header"><div><span className="section-kicker">AAKIL</span><h2>الإعدادات</h2></div><button className="panel-dismiss" onClick={() => setIsSettingsOpen(false)}>×</button></div>
            <div className="settings-list">
              <div className="setting-row"><div><strong>الوضع الخاص</strong><span>لا تحفظ الزيارات الجديدة في السجل المحلي.</span></div><button className={`switch ${isPrivate ? "enabled" : ""}`} onClick={() => setIsPrivate((current) => !current)}><span /></button></div>
              <div className="setting-row"><div><strong>مظهر AAKIL</strong><span>اختر بين الوضع النهاري والوضع الليلي.</span></div><button className="theme-choice" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}><span>{theme === "dark" ? "☾" : "☼"}</span>{theme === "dark" ? "ليلي" : "نهاري"}</button></div>
              <div className="setting-row"><div><strong>حالة VPN</strong><span>الوحدة الاختيارية غير مرتبطة حاليًا.</span></div><span className="setting-status">غير مفعّل</span></div>
              <div className="setting-row"><div><strong>بيانات التصفح</strong><span>يمسح السجل المحفوظ على هذا الجهاز فقط.</span></div><button className="danger-button" onClick={clearHistory}>مسح السجل</button></div>
            </div>
            <div className="modal-footer"><span>AAKIL مصمم ليبقى محليًا.</span><button className="secondary-button" onClick={() => setIsSettingsOpen(false)}>تم</button></div>
          </section>
        </div>
      )}

      {toast && <div className="toast"><div className="toast-check">✓</div><div><strong>{toast.title}</strong><span>{toast.message}</span></div><button onClick={() => setToast(null)}>×</button></div>}
    </div>
  );
}

export default App;
