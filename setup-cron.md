# راهنمای تنظیم Cron Job برای پاک‌سازی خودکار

## تنظیم Cron Job در Linux/Mac

### 1. باز کردن Crontab
```bash
crontab -e
```

### 2. اضافه کردن Job های مختلف

#### پاک‌سازی روزانه (ساعت 2 صبح)
```bash
# Default database
0 2 * * * cd /path/to/your/project && node auto-cleanup.js >> /var/log/cleanup.log 2>&1

# Production database
0 2 * * * cd /path/to/your/project && node auto-cleanup.js production >> /var/log/cleanup-prod.log 2>&1

# Staging database
0 2 * * * cd /path/to/your/project && node auto-cleanup.js staging >> /var/log/cleanup-staging.log 2>&1
```

#### پاک‌سازی هفتگی (یکشنبه ساعت 3 صبح)
```bash
# Default database
0 3 * * 0 cd /path/to/your/project && node auto-cleanup.js >> /var/log/cleanup-weekly.log 2>&1

# Production database
0 3 * * 0 cd /path/to/your/project && node auto-cleanup.js production >> /var/log/cleanup-weekly-prod.log 2>&1
```

#### پاک‌سازی ماهانه (اول هر ماه ساعت 4 صبح)
```bash
# Default database
0 4 1 * * cd /path/to/your/project && node auto-cleanup.js >> /var/log/cleanup-monthly.log 2>&1

# Production database
0 4 1 * * cd /path/to/your/project && node auto-cleanup.js production >> /var/log/cleanup-monthly-prod.log 2>&1
```

### 3. تنظیم متغیرهای محیطی در Crontab
```bash
# در ابتدای فایل crontab اضافه کنید:
MONGODB_URI=mongodb://localhost:27017/vpns
CLEANUP_DAYS=2
CLEANUP_TESTS=10
CLEANUP_DRY_RUN=false

# سپس job ها را اضافه کنید:
# Default database
0 2 * * * cd /path/to/your/project && node auto-cleanup.js >> /var/log/cleanup.log 2>&1

# Production database
0 3 * * * cd /path/to/your/project && node auto-cleanup.js production >> /var/log/cleanup-prod.log 2>&1

# Staging database
0 4 * * * cd /path/to/your/project && node auto-cleanup.js staging >> /var/log/cleanup-staging.log 2>&1
```

## تنظیم Task Scheduler در Windows

### 1. باز کردن Task Scheduler
- Start → Run → `taskschd.msc`

### 2. ایجاد Task جدید
1. **General Tab:**
   - Name: `Connection Cleanup`
   - Description: `Automatic cleanup of old connections`
   - Run whether user is logged on or not: ✅
   - Run with highest privileges: ✅

2. **Triggers Tab:**
   - New Trigger → Daily
   - Start: `2:00:00 AM`
   - Enabled: ✅

3. **Actions Tab:**
   - New Action → Start a program
   - Program/script: `node`
   - Add arguments: `auto-cleanup.js`
   - Start in: `C:\path\to\your\project`

4. **Conditions Tab:**
   - Start the task only if the computer is on AC power: ❌
   - Stop if the computer switches to battery power: ❌

5. **Settings Tab:**
   - Allow task to be run on demand: ✅
   - Run task as soon as possible after a scheduled start is missed: ✅

## استفاده از npm scripts

### اضافه کردن به package.json
```json
{
  "scripts": {
    "cleanup:cron": "node auto-cleanup.js",
    "cleanup:test": "CLEANUP_DRY_RUN=true node auto-cleanup.js"
  }
}
```

### اجرا در Cron
```bash
# Default database
0 2 * * * cd /path/to/your/project && npm run cleanup:auto >> /var/log/cleanup.log 2>&1

# Production database
0 2 * * * cd /path/to/your/project && npm run cleanup:prod:auto >> /var/log/cleanup-prod.log 2>&1

# Staging database
0 2 * * * cd /path/to/your/project && node auto-cleanup.js staging >> /var/log/cleanup-staging.log 2>&1
```

## مانیتورینگ و لاگ‌گیری

### 1. تنظیم لاگ‌گیری
```bash
# لاگ کامل با timestamp
0 2 * * * cd /path/to/your/project && node auto-cleanup.js 2>&1 | logger -t "connection-cleanup"

# لاگ به فایل با rotation
0 2 * * * cd /path/to/your/project && node auto-cleanup.js >> /var/log/cleanup/$(date +\%Y\%m\%d).log 2>&1
```

### 2. بررسی لاگ‌ها
```bash
# مشاهده لاگ‌های امروز
tail -f /var/log/cleanup.log

# جستجو در لاگ‌ها
grep "کانکشن‌های پاک شده" /var/log/cleanup.log

# آمار لاگ‌ها
grep "عملیات با موفقیت" /var/log/cleanup.log | wc -l
```

### 3. تنظیم Logrotate
```bash
# فایل /etc/logrotate.d/cleanup
/var/log/cleanup.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 root root
}
```

## تست و اعتبارسنجی

### 1. تست دستی
```bash
# تست در حالت dry-run
npm run cleanup:test

# تست واقعی
npm run cleanup:cron
```

### 2. بررسی وضعیت Cron
```bash
# مشاهده cron jobs فعال
crontab -l

# بررسی لاگ‌های cron
tail -f /var/log/cron
```

### 3. تست زمان‌بندی
```bash
# اجرای فوری برای تست
* * * * * cd /path/to/your/project && node auto-cleanup.js >> /var/log/cleanup-test.log 2>&1
```

## نکات مهم

1. **مسیر کامل**: همیشه از مسیر کامل استفاده کنید
2. **متغیرهای محیطی**: در crontab تنظیم کنید
3. **لاگ‌گیری**: همیشه لاگ بگیرید
4. **تست**: ابتدا در حالت dry-run تست کنید
5. **Backup**: قبل از تنظیم cron از دیتابیس backup بگیرید

## Database Operators

The cleanup tool supports multiple database operators, just like your main application:

### Supported Operators

| Operator | Database Name | Usage |
|----------|---------------|-------|
| (none) | `vpns` | `node auto-cleanup.js` |
| `production` | `vpns-production` | `node auto-cleanup.js production` |
| `staging` | `vpns-staging` | `node auto-cleanup.js staging` |
| `test` | `vpns-test` | `node auto-cleanup.js test` |
| `dev` | `vpns-dev` | `node auto-cleanup.js dev` |

### Cron Examples for Different Operators

```bash
# Default database (vpns)
0 2 * * * cd /path/to/project && node auto-cleanup.js >> /var/log/cleanup.log 2>&1

# Production database (vpns-production)
0 2 * * * cd /path/to/project && node auto-cleanup.js production >> /var/log/cleanup-prod.log 2>&1

# Staging database (vpns-staging)
0 2 * * * cd /path/to/project && node auto-cleanup.js staging >> /var/log/cleanup-staging.log 2>&1

# Test database (vpns-test)
0 2 * * * cd /path/to/project && node auto-cleanup.js test >> /var/log/cleanup-test.log 2>&1
```

### Database Naming Convention

The tool follows the same naming convention as your main application:
- Base name: `vpns`
- With operator: `vpns-{operator_name}`

This ensures consistency across your entire application stack.

## مثال کامل Crontab
```bash
# تنظیمات محیطی
MONGODB_URI=mongodb://localhost:27017/vpns
CLEANUP_DAYS=2
CLEANUP_TESTS=10
CLEANUP_DRY_RUN=false

# پاک‌سازی روزانه - دیتابیس پیش‌فرض
0 2 * * * cd /home/user/projects/io && node auto-cleanup.js >> /var/log/cleanup.log 2>&1

# پاک‌سازی روزانه - دیتابیس production
0 2 * * * cd /home/user/projects/io && node auto-cleanup.js production >> /var/log/cleanup-prod.log 2>&1

# پاک‌سازی روزانه - دیتابیس staging
0 2 * * * cd /home/user/projects/io && node auto-cleanup.js staging >> /var/log/cleanup-staging.log 2>&1

# پاک‌سازی هفتگی (یکشنبه) - دیتابیس پیش‌فرض
0 3 * * 0 cd /home/user/projects/io && node auto-cleanup.js >> /var/log/cleanup-weekly.log 2>&1

# پاک‌سازی هفتگی (یکشنبه) - دیتابیس production
0 3 * * 0 cd /home/user/projects/io && node auto-cleanup.js production >> /var/log/cleanup-weekly-prod.log 2>&1

# تست هفتگی (شنبه) - دیتابیس پیش‌فرض
0 1 * * 6 cd /home/user/projects/io && CLEANUP_DRY_RUN=true node auto-cleanup.js >> /var/log/cleanup-test.log 2>&1

# تست هفتگی (شنبه) - دیتابیس production
0 1 * * 6 cd /home/user/projects/io && CLEANUP_DRY_RUN=true node auto-cleanup.js production >> /var/log/cleanup-test-prod.log 2>&1
``` 