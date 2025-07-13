#!/usr/bin/env node

const mongoose = require('mongoose');
const { moveOldConnectionsToTrash, getConnectionStats, advancedCleanup } = require('./DB/cleanupConnections');

// تنظیمات اتصال به دیتابیس
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/your_database_name';

// اتصال به دیتابیس
async function connectToDatabase() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ اتصال به دیتابیس برقرار شد');
    } catch (error) {
        console.error('❌ خطا در اتصال به دیتابیس:', error.message);
        process.exit(1);
    }
}

// بستن اتصال دیتابیس
async function disconnectFromDatabase() {
    try {
        await mongoose.disconnect();
        console.log('✅ اتصال به دیتابیس بسته شد');
    } catch (error) {
        console.error('❌ خطا در بستن اتصال دیتابیس:', error.message);
    }
}

// Display help
function showHelp() {
    console.log(`
🔧 Connection Cleanup Tool

Usage:
  node cleanup-cli.js <command> [options]

Commands:
  stats                    Show connection statistics
  cleanup                  Move old connections to trash (default)
  advanced                 Advanced cleanup with more options

Options:
  --days <number>         Number of days old (default: 2)
  --tests <number>        Maximum number of tests (default: 10)
  --dry-run               Test mode (doesn't move to trash)
  --move-connected        Also move connected connections
  --help                  Show this help

Examples:
  node cleanup-cli.js stats
  node cleanup-cli.js cleanup
  node cleanup-cli.js advanced --days 3 --tests 5 --dry-run
  node cleanup-cli.js advanced --move-connected
`);
}

// پردازش آرگومان‌های خط فرمان
function parseArguments() {
    const args = process.argv.slice(2);
    const command = args[0] || 'cleanup';
    
    const options = {
        days: 2,
        tests: 10,
        dryRun: false,
        moveConnected: false
    };
    
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--days':
                options.days = parseInt(args[++i]) || 2;
                break;
            case '--tests':
                options.tests = parseInt(args[++i]) || 10;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--move-connected':
                options.moveConnected = true;
                break;
            case '--help':
            case '-h':
                showHelp();
                process.exit(0);
                break;
        }
    }
    
    return { command, options };
}

// اجرای اصلی
async function main() {
    try {
        const { command, options } = parseArguments();
        
        console.log('🚀 Starting connection cleanup tool...\n');
        
        // Connect to database
        await connectToDatabase();
        
        let result;
        
        switch (command) {
            case 'stats':
                console.log('📊 Getting connection statistics...\n');
                result = await getConnectionStats();
                break;
                
            case 'cleanup':
                console.log('🧹 Moving old connections to trash...\n');
                result = await moveOldConnectionsToTrash();
                break;
                
            case 'advanced':
                console.log('🔧 Advanced cleanup...\n');
                console.log(`Settings: ${options.days} days old, ${options.tests} tests, ${options.dryRun ? 'test mode' : 'real mode'}`);
                if (options.moveConnected) {
                    console.log('⚠️  Warning: Connected connections will also be moved to trash!');
                }
                console.log('');
                result = await advancedCleanup(options);
                break;
                
            default:
                console.error(`❌ Invalid command: ${command}`);
                showHelp();
                process.exit(1);
        }
        
        console.log('\n✅ Operation completed successfully!');
        console.log(`📝 Result: ${result.message}`);
        
    } catch (error) {
        console.error('\n❌ Error during operation:', error.message);
        process.exit(1);
    } finally {
        // Close database connection
        await disconnectFromDatabase();
    }
}

// اجرای برنامه
if (require.main === module) {
    main();
}

module.exports = { main, parseArguments }; 