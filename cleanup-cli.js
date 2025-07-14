#!/usr/bin/env node

const mongoose = require('mongoose');
const { moveOldConnectionsToTrash, getConnectionStats, advancedCleanup, restoreFromTrash, permanentlyDeleteFromTrash, debugDatabase, updateOldConnections, testQueries } = require('./DB/cleanupConnections');

// Database connection settings
function getMongoDBUri(databaseName = null) {
    let dbExt = "";
    if (databaseName) {
        dbExt = "-" + databaseName;
    }
    return process.env.MONGODB_URI || `mongodb://localhost:27017/vpns${dbExt}`;
}

// Connect to database
async function connectToDatabase(databaseName = null) {
    try {
        const mongoUri = getMongoDBUri(databaseName);
        await mongoose.connect(mongoUri);
        console.log(`✅ Database connection established: ${mongoUri}`);
    } catch (error) {
        console.error('❌ Error connecting to database:', error.message);
        process.exit(1);
    }
}

// Close database connection
async function disconnectFromDatabase() {
    try {
        await mongoose.disconnect();
        console.log('✅ Database connection closed');
    } catch (error) {
        console.error('❌ Error closing database connection:', error.message);
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
  restore                  Restore connections from trash
  delete-trash             Permanently delete connections from trash
  debug                    Debug database structure and content
  update                   Update old connections to add trash field
  test-queries             Test different queries to find connections

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
  node cleanup-cli.js restore
  node cleanup-cli.js delete-trash
`);
}

// Parse command line arguments
function parseArguments() {
    const args = process.argv.slice(2);
    let command = args[0] || 'cleanup';
    let databaseName = null;
    
    const options = {
        days: 2,
        tests: 10,
        dryRun: false,
        moveConnected: false
    };
    
    // Check if first argument is a database name (not a command)
    if (command && !command.startsWith('-') && !['stats', 'cleanup', 'advanced', 'restore', 'delete-trash', 'debug', 'help'].includes(command)) {
        databaseName = command;
        command = args[1] || 'cleanup';
    }
    
    for (let i = 1; i < args.length; i++) {
        const arg = args[i];
        
        // Skip if this is the command (after database name)
        if (databaseName && i === 1) continue;
        
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
            default:
                // If it's not a flag and not a command, it might be a database name
                if (!arg.startsWith('-') && !['stats', 'cleanup', 'advanced', 'restore', 'delete-trash', 'debug', 'help'].includes(arg)) {
                    databaseName = arg;
                }
                break;
        }
    }
    
    return { command, options, databaseName };
}

// Main execution
async function main() {
    try {
        const { command, options, databaseName } = parseArguments();
        
        console.log('🚀 Starting connection cleanup tool...\n');
        if (databaseName) {
            console.log(`🗄️  Using database: ${databaseName}\n`);
        }
        
        // Connect to database
        await connectToDatabase(databaseName);
        
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
                
            case 'restore':
                console.log('🔄 Restoring connections from trash...\n');
                result = await restoreFromTrash();
                break;
                
            case 'delete-trash':
                console.log('🗑️  Permanently deleting connections from trash...\n');
                result = await permanentlyDeleteFromTrash();
                break;
                
            case 'debug':
                console.log('🔍 Debugging database structure...\n');
                result = await debugDatabase();
                break;
                
            case 'update':
                console.log('🔄 Updating old connections...\n');
                result = await updateOldConnections();
                break;
                
            case 'test-queries':
                console.log('🧪 Testing different queries...\n');
                result = await testQueries();
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