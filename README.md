=== پروژه بازی Bluff چندنفره آنلاین ===
معماری: Frontend HTML5/CSS3/JS ES6+ بدون فریمورک سنگین + PWA. Backend: Firebase Auth Anonymous + Firestore + Realtime onSnapshot.
صفحات: index, login, lobby, room, game, profile. ساختار پوشه‌ها: css/, js/, manifest.json, service-worker.js.
اتصال: فقط firebaseConfig در js/firebase-config.js وارد شود. سپس Firebase Auth و Firestore فعال شوند.
نحوه بازی آنلاین: کاربر ورود ناشناس می‌کند، نام انتخاب می‌کند، Lobby می‌سازد یا با کد ۶ کاراکتری وارد Room می‌شود. بازی با همگام‌سازی لحظه‌ای اجرا می‌شود.
وضعیت فعلی: اسکلت اولیه موجود است؛ برای اجرا کامل نیاز به database.js، game-engine.js و rules امنیتی است.
تکمیل پروژه = امکان بازی واقعی آنلاین.
