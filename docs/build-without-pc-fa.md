# ساخت و اجرای «رمزو» فقط با گوشی (بدون PC) 📱

دو راه کاملاً عملی دارید — یکی **ساخت در ابر گیت‌هاب** (راحت‌تر، پیشنهاد اول) و یکی **ساخت روی خود گوشی با Termux** (پیشرفته‌تر، ولی مستقل از گیت‌هاب). در هر دو حالت خروجی همان `app-debug.apk` است که فقط روی گوشی **میزبان** نصب می‌شود؛ مهمان‌ها همیشه بدون نصب باقی می‌مانند. 🌐

---

## 🥇 مسیر اول — APK آماده از گیت‌هاب (پیشنهادی، ۱۰ دقیقه، فقط با مرورگر گوشی)

ایده: یک فایل CI آماده کرده‌ایم (`ci/android-build.yml` در همین مخزن). کافی است **یک بار** آن را با موبایل خودتان در گیت‌هاب فعال کنید؛ از آن به بعد گیت‌هاب **با هر تغییر کد، خودش APK می‌سازد** و در بخش Releases می‌گذارد.

### فعال‌سازی (فقط یک‌بار — ۵ قدم با مرورگر گوشی)
1. در مرورگر گوشی به `github.com` بروید و **وارد حسابتان** شوید → مخزن `Sh` را باز کنید → از منوی برنچ بالای صفحه، **`arena/019fb378-sh`** را انتخاب کنید.
2. فایل `ci/android-build.yml` را باز کنید و کل محتوایش را **کپی** کنید.
   - راه ساده: این آدرس را باز کنید تا خام ببینید و Select All/Copy کنید:
     `https://raw.githubusercontent.com/aliam664/Sh/arena/019fb378-sh/ci/android-build.yml`
3. برگردید به صفحهٔ مخزن (همان برنچ) → **Add file** → **Create new file**.
4. در کادر نامِ فایل دقیقاً این را بنویسید: `.github/workflows/android-build.yml`
   و محتوای کپی‌شده را **Paste** کنید → دکمهٔ **Commit changes**.
5. حالا تب **Actions** بالای صفحه را ببینید: یک اجرا شروع شده. وقتی سبز شد (۵–۱۰ دقیقه) تب **Releases** (سمت راست صفحهٔ مخزن) را باز کنید → **nightly** → روی **`app-debug.apk`** بزنید → دانلود و نصب (اجازهٔ «منابع ناشناس» را به مرورگر بدهید).

### از آن به بعد — همیشه آخرین نسخه یک کلیک است
هر وقت من روی پروژه تغییری بدهم، اکشن خودکار دوباره APK تازه می‌سازد و جایگزین `nightly` می‌کند. شما فقط همان صفحهٔ Releases را باز می‌کنید و APK جدید را دانلود می‌کنید. ✨

> 💡 اگر اکشن قرمز شد: آن را باز کنید و متن خطای مرحلهٔ قرمز را برای من بفرستید تا فیکس کنم.

> ℹ️ مخزن خصوصی است: گیت‌هاب ماهانه ۲۰۰۰ دقیقه اکشن رایگان می‌دهد — برای این پروژه کفایت می‌کند.

---

## 🥈 مسیر دوم — ساخت روی خود گوشی با Termux (پیشرفته، ۲۰–۴۰ دقیقه بار اول)

اگر دوست دارید همه‌چیز آفلاینِ گیت‌هاب هم باشد، می‌توانید خود APK را **روی همان گوشی** بسازید.

### ۱) نصب Termux
- ⚠️ نسخهٔ Play Store قدیمی است! از F-Droid نصب کنید: `https://f-droid.org/packages/com.termux/`
- Termux را باز کنید و این دستورات را به‌ترتیب بزنید (کپی/پیست راحت‌تر است):

### ۲) نصب ابزارهای پایه
```bash
pkg update -y && pkg upgrade -y
pkg install -y openjdk-17 git wget unzip nano
termux-setup-storage   # دسترسی به دانلودها — سوالش را Allow کنید
```

### ۳) نصب Gradle 8.7
```bash
wget https://services.gradle.org/distributions/gradle-8.7-bin.zip
unzip -q gradle-8.7-bin.zip -d $HOME
export PATH=$HOME/gradle-8.7/bin:$PATH
gradle --version   # باید 8.7 نشان بدهد
```

### ۴) نصب Android SDK
```bash
mkdir -p $HOME/android-sdk/cmdline-tools
cd $HOME/android-sdk/cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q commandlinetools-linux-11076708_latest.zip
mv cmdline-tools latest
export ANDROID_HOME=$HOME/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
yes | sdkmanager --licenses > /dev/null
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

### ۵) ابزار aapt2 مخصوص گوشی (نکتهٔ کلیدی!)
نسخهٔ رسمی aapt2 برای PC است و روی گوشی کار نمی‌کند، ولی Termux نسخهٔ ARM دارد و با یک خط به Gradle معرفی‌اش می‌کنیم:
```bash
pkg install -y aapt2
# اگر پیدا نکرد: pkg install -y tur-repo && pkg install -y aapt2
```

### ۶) دریافت کد و ساخت
```bash
cd $HOME
git clone -b arena/019fb378-sh https://github.com/aliam664/Sh.git
cd Sh
echo 'android.aapt2FromMavenOverride=/data/data/com.termux/files/usr/bin/aapt2' >> gradle.properties
gradle --no-daemon assembleDebug
```
☕ بار اول ۱۵–۴۰ دقیقه طول می‌کشد (دانلود وابستگی‌ها + ساخت روی گوشی) — گوشی به شارژر باشد و Termux را نبندید.

### ۷) نصب APK روی گوشی
```bash
cp app/build/outputs/apk/debug/app-debug.apk $HOME/storage/shared/Download/ramzo.apk
```
حالا در برنامهٔ «فایل‌ها/Files» گوشی → پوشهٔ Download → روی `ramzo.apk` بزنید → نصب.

### 🩹 مشکلات رایج Termux
| مشکل | راه‌حل |
|---|---|
| `java: not found` برای sdkmanager | `pkg install openjdk-17` و بستن/بازکردن دوبارهٔ Termux |
| OutOfMemory خطای Gradle | با `nano gradle.properties` مقدار `org.gradle.jvmargs` را `-Xmx1280m` کنید، برنامه‌های پس‌زمینه را ببندید |
| خطای aapt2 هنگام ساخت | یعنی خط `android.aapt2FromMavenOverride` درست نیامده — مسیر را با `which aapt2` چک کنید |
| قطع وسط دانلود | دوباره همان دستور آخر — ادامه می‌دهد |

---

## 🎮 بعد از نصب (مشترک دو مسیر)
۱. میزبان هات‌اسپات را روشن می‌کند → رمزو → «میزبانی بازی 👑»
۲. مهمان‌ها به هات‌اسپات وصل می‌شوند → **QR را با دوربین اسکن می‌کنند** → در مرورگر بازی می‌کنند — بدون هیچ نصبی.

> ℹ️ اگر حساب گیت‌هاب‌تان در Arena را دوباره با مجوز کامل وصل کنید، خودم فایل CI را مستقیم برای‌تان فعال می‌کنم و مسیر اول حتی این ۵ قدم اولش هم لازم نمی‌شود.
