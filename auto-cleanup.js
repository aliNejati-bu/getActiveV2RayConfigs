#!/usr/bin/env node

/**
 * اسکریپت پاک‌سازی خودکار کانکشن‌های قدیمی
 * این اسکریپت می‌تواند توسط cron یا scheduler اجرا شود
 */

const mongoose = require('mongoose');
const { moveOldConnectionsToTrash, getConnectionStats } = require('./DB/cleanupConnections');

// Database connection settings
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_database_name';

// Cleanup settings
const CLEANUP_CONFIG = {
    days: process.env.CLEANUP_DAYS ? parseInt(process.env.CLEANUP_DAYS) : 2,
    tests: process.env.CLEANUP_TESTS ? parseInt(process.env.CLEANUP_TESTS) : 10,
    dryRun: process.env.CLEANUP_DRY_RUN === 'true'
};

// اتصال به دیتابیس
async function connectToDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log(`[${new Date().toISOString()}] ✅ اتصال به دیتابیس برقرار شد`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ خطا در اتصال به دیتابیس:`, error.message);
        process.exit(1);
    }
}

// بستن اتصال دیتابیس
async function disconnectFromDatabase() {
    try {
        await mongoose.disconnect();
        console.log(`[${new Date().toISOString()}] ✅ اتصال به دیتابیس بسته شد`);
    } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ خطا در بستن اتصال دیتابیس:`, error.message);
    }
}

// اجرای پاک‌سازی خودکار
async function runAutoCleanup() {
    const startTime = new Date();
    
    try {
        console.log(`[${startTime.toISOString()}] 🚀 Starting automatic cleanup...`);
        console.log(`[${startTime.toISOString()}] ⚙️ Settings: ${CLEANUP_CONFIG.days} days, ${CLEANUP_CONFIG.tests} tests, ${CLEANUP_CONFIG.dryRun ? 'test mode' : 'real mode'}`);
        
        // Connect to database
        await connectToDatabase();
        
        // Get statistics before cleanup
        console.log(`[${new Date().toISOString()}] 📊 Getting statistics before cleanup...`);
        const statsBefore = await getConnectionStats();
        
        // Execute cleanup
        console.log(`[${new Date().toISOString()}] 🧹 Executing cleanup...`);
        const cleanupResult = await moveOldConnectionsToTrash();
        
        // Get statistics after cleanup
        console.log(`[${new Date().toISOString()}] 📊 Getting statistics after cleanup...`);
        const statsAfter = await getConnectionStats();
        
        // Calculate changes
        const movedCount = statsAfter.trash - statsBefore.trash;
        const oldCountBefore = statsBefore.old;
        const oldCountAfter = statsAfter.old;
        
        // Final report
        const endTime = new Date();
        const duration = endTime - startTime;
        
        console.log(`\n[${endTime.toISOString()}] 📋 Automatic cleanup report:`);
        console.log(`⏱️  Duration: ${duration}ms`);
        console.log(`📊 Connections moved to trash: ${movedCount}`);
        console.log(`📈 Old connections before: ${oldCountBefore}`);
        console.log(`📉 Old connections after: ${oldCountAfter}`);
        console.log(`✅ Operation completed successfully!`);
        
        // Warning if in test mode
        if (CLEANUP_CONFIG.dryRun) {
            console.log(`⚠️  Note: This operation was performed in test mode and no connections were moved to trash.`);
        }
        
        return {
            success: true,
            movedCount,
            duration,
            statsBefore,
            statsAfter,
            message: cleanupResult.message
        };
        
    } catch (error) {
        const errorTime = new Date();
        console.error(`[${errorTime.toISOString()}] ❌ Error in automatic cleanup:`, error.message);
        
        return {
            success: false,
            error: error.message,
            timestamp: errorTime
        };
    } finally {
        // Close database connection
        await disconnectFromDatabase();
    }
}

// اجرای اصلی
async function main() {
    const result = await runAutoCleanup();
    
    // خروج با کد مناسب
    if (result.success) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

// اگر مستقیماً اجرا شد
if (require.main === module) {
    main();
}

module.exports = { runAutoCleanup, CLEANUP_CONFIG }; 