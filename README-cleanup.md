# Connection Cleanup Tool

This tool is designed for automatic cleanup of old and failed connections from the database.

## Features

- 🔍 **Smart Cleanup**: Moves connections to trash that meet the following criteria:
  - Added more than 2 days ago
  - Tested more than 10 times
  - Never connected successfully in history

- 📊 **Statistics Display**: Shows complete connection statistics
- ⚙️ **Configurable Settings**: Various parameters can be adjusted
- 🧪 **Test Mode**: Ability to test without actual cleanup
- 🗑️ **Trash System**: Connections are moved to trash instead of being deleted

## Installation and Setup

1. Make sure MongoDB is installed and running
2. Set the `MONGODB_URI` environment variable (or modify the code)
3. Install dependencies:
   ```bash
   npm install mongoose
   ```

## Usage

### Show connection statistics
```bash
# Default database
node cleanup-cli.js stats

# Specific database
node cleanup-cli.js production stats
```

### Simple cleanup (default)
```bash
# Default database
node cleanup-cli.js cleanup

# Specific database
node cleanup-cli.js production cleanup
```

### Advanced cleanup
```bash
# Cleanup with custom settings
node cleanup-cli.js advanced --days 3 --tests 5

# Test mode (doesn't move to trash)
node cleanup-cli.js advanced --days 2 --tests 10 --dry-run

# Also move connected connections
node cleanup-cli.js advanced --move-connected

# With specific database
node cleanup-cli.js production advanced --days 3 --tests 5
```

### Show help
```bash
node cleanup-cli.js --help
```

## پارامترهای قابل تنظیم

| پارامتر | توضیح | پیش‌فرض |
|---------|-------|---------|
| `--days` | تعداد روزهای قدیمی | 2 |
| `--tests` | حداکثر تعداد تست | 10 |
| `--dry-run` | حالت تست (پاک نمی‌کند) | false |
| `--delete-connected` | کانکشن‌های متصل را هم پاک کن | false |

## مثال‌های کاربردی

### پاک‌سازی روزانه
```bash
# پاک‌سازی کانکشن‌های قدیمی‌تر از 1 روز
node cleanup-cli.js advanced --days 1 --tests 5
```

### پاک‌سازی هفتگی
```bash
# پاک‌سازی کانکشن‌های قدیمی‌تر از 7 روز
node cleanup-cli.js advanced --days 7 --tests 15
```

### بررسی قبل از پاک‌سازی
```bash
# ابتدا آمار را ببینید
node cleanup-cli.js stats

# سپس در حالت تست اجرا کنید
node cleanup-cli.js advanced --dry-run

# اگر نتیجه مناسب بود، واقعی اجرا کنید
node cleanup-cli.js advanced
```

## استفاده در کد

```javascript
const { cleanupOldConnections, getConnectionStats, advancedCleanup } = require('./DB/cleanupConnections');

// پاک‌سازی ساده
const result = await cleanupOldConnections();
console.log(result.message);

// نمایش آمار
const stats = await getConnectionStats();
console.log(`کل کانکشن‌ها: ${stats.total}`);

// پاک‌سازی پیشرفته
const advancedResult = await advancedCleanup({
    days: 3,
    tests: 8,
    dryRun: true,
    deleteConnected: false
});
```

## خروجی نمونه

```
🚀 شروع ابزار پاک‌سازی کانکشن‌ها...

✅ اتصال به دیتابیس برقرار شد

📊 دریافت آمار کانکشن‌ها...

=== آمار کانکشن‌ها ===
کل کانکشن‌ها: 1250
کانکشن‌های متصل: 45
کانکشن‌های ناموفق: 1205
کانکشن‌های قدیمی (>2 روز): 890
کانکشن‌های با >10 تست: 234

✅ عملیات با موفقیت انجام شد!
📝 نتیجه: آمار کانکشن‌ها نمایش داده شد

✅ اتصال به دیتابیس بسته شد
```

## نکات مهم

1. **پیشنهاد می‌شود ابتدا در حالت `--dry-run` تست کنید**
2. **کانکشن‌های متصل به طور پیش‌فرض پاک نمی‌شوند**
3. **عملیات پاک‌سازی غیرقابل بازگشت است**
4. **قبل از اجرا از دیتابیس backup بگیرید**

## Database Configuration

### Database Naming Convention

The tool uses the same database naming convention as your main application:

- **Default database**: `vpns`
- **Specific database**: `vpns-{operator_name}`

For example:
- `vpns` (default)
- `vpns-production`
- `vpns-staging`
- `vpns-test`

### Environment Variables

Set the `MONGODB_URI` environment variable:
```bash
export MONGODB_URI="mongodb://localhost:27017/vpns"
```

Or modify the database connection in the code:
```javascript
const MONGODB_URI = 'mongodb://localhost:27017/vpns';
```

### Database Operators

You can specify different database operators by passing the operator name as the first argument:

```bash
# Default database (vpns)
node cleanup-cli.js stats

# Production database (vpns-production)
node cleanup-cli.js production stats

# Staging database (vpns-staging)
node cleanup-cli.js staging cleanup

# Test database (vpns-test)
node cleanup-cli.js test advanced --days 1 --tests 5
```

### Common Database Operators

The tool supports the same database operators as your main application:

| Operator | Database Name | Description |
|----------|---------------|-------------|
| (none) | `vpns` | Default database |
| `production` | `vpns-production` | Production environment |
| `staging` | `vpns-staging` | Staging environment |
| `test` | `vpns-test` | Test environment |
| `dev` | `vpns-dev` | Development environment |

### Database Naming Pattern

The database naming follows this pattern:
```
vpns-{operator_name}
```

Where:
- `vpns` is the base database name
- `{operator_name}` is the operator suffix (optional)

Examples:
- `vpns` (default, no suffix)
- `vpns-production` (production suffix)
- `vpns-staging` (staging suffix)
- `vpns-test` (test suffix) 