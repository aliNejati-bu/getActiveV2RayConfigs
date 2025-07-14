const mongoose = require('mongoose');
const { ConfigModel } = require('./ConfigModel');

/**
 * Move old and failed connections to trash
 * Connections that:
 * - Added more than 2 days ago
 * - Tested more than 10 times
 * - Never connected successfully in history
 */
async function moveOldConnectionsToTrash() {
    try {
        console.log('Starting cleanup of old connections...');
        
        // Date 2 days ago
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        
        // Find connections that meet cleanup criteria
        const connectionsToTrash = await ConfigModel.find({
            createdAt: { $lt: twoDaysAgo }, // More than 2 days ago
            'history.10': { $exists: true }, // More than 10 tests
            trash: { $ne: true }, // Not already in trash
            $expr: {
                $not: {
                    $anyElementTrue: {
                        $map: {
                            input: '$history',
                            as: 'entry',
                            in: '$$entry.status'
                        }
                    }
                }
            }
        });
        
        console.log(`Found ${connectionsToTrash.length} connections to move to trash`);
        
        if (connectionsToTrash.length === 0) {
            console.log('No connections found for cleanup.');
            return { movedCount: 0, message: 'No connections found for cleanup.' };
        }
        
        // Display details of found connections
        connectionsToTrash.forEach((conn, index) => {
            console.log(`${index + 1}. URI: ${conn.uri || 'Unknown'}`);
            console.log(`   Type: ${conn.type}`);
            console.log(`   Created: ${conn.createdAt}`);
            console.log(`   Test count: ${conn.history.length}`);
            console.log(`   Connection status: ${conn.connectionStatus}`);
            console.log('---');
        });
        
        // Move connections to trash
        const updateResult = await ConfigModel.updateMany(
            { _id: { $in: connectionsToTrash.map(conn => conn._id) } },
            { $set: { trash: true, lastModifiedAt: new Date() } }
        );
        
        console.log(`Moved ${updateResult.modifiedCount} connections to trash`);
        
        return {
            movedCount: updateResult.modifiedCount,
            message: `${updateResult.modifiedCount} old and failed connections moved to trash.`
        };
        
    } catch (error) {
        console.error('Error in cleanup process:', error);
        throw error;
    }
}

/**
 * Get connection statistics
 */
async function getConnectionStats() {
    try {
        // Get all connections first to debug
        const allConnections = await ConfigModel.countDocuments({});
        console.log(`DEBUG: All connections in database: ${allConnections}`);
        
        // Test different queries to debug
        const totalConnections = await ConfigModel.countDocuments({ trash: { $ne: true } });
        console.log(`DEBUG: Connections with trash not true: ${totalConnections}`);
        
        const totalConnectionsExact = await ConfigModel.countDocuments({ trash: false });
        console.log(`DEBUG: Connections with trash: false (exact): ${totalConnectionsExact}`);
        
        const connectedConnections = await ConfigModel.countDocuments({ connectionStatus: true, trash: { $ne: true } });
        const failedConnections = await ConfigModel.countDocuments({ connectionStatus: false, trash: { $ne: true } });
        const trashConnections = await ConfigModel.countDocuments({ trash: true });
        
        // Old connections (more than 2 days)
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        console.log(`DEBUG: Two days ago: ${twoDaysAgo}`);
        
        const oldConnections = await ConfigModel.countDocuments({
            createdAt: { $lt: twoDaysAgo },
            trash: { $ne: true }
        });
        console.log(`DEBUG: Old connections with trash not true: ${oldConnections}`);
        
        const oldConnectionsExact = await ConfigModel.countDocuments({
            createdAt: { $lt: twoDaysAgo },
            trash: false
        });
        console.log(`DEBUG: Old connections with trash: false (exact): ${oldConnectionsExact}`);
        
        // Test without trash filter
        const oldConnectionsNoTrash = await ConfigModel.countDocuments({
            createdAt: { $lt: twoDaysAgo }
        });
        console.log(`DEBUG: Old connections without trash filter: ${oldConnectionsNoTrash}`);
        
        // Test with specific date comparison
        const sampleDate = new Date('2024-01-01');
        const oldConnectionsSample = await ConfigModel.countDocuments({
            createdAt: { $lt: sampleDate }
        });
        console.log(`DEBUG: Connections older than 2024-01-01: ${oldConnectionsSample}`);
        
        // Connections with more than 10 tests
        const overTestedConnections = await ConfigModel.countDocuments({
            $expr: { $gte: [{ $size: '$history' }, 10] },
            trash: { $ne: true }
        });
        console.log(`DEBUG: Over-tested connections with trash not true: ${overTestedConnections}`);
        
        const overTestedConnectionsExact = await ConfigModel.countDocuments({
            $expr: { $gte: [{ $size: '$history' }, 10] },
            trash: false
        });
        console.log(`DEBUG: Over-tested connections with trash: false (exact): ${overTestedConnectionsExact}`);
        
        console.log('=== Connection Statistics ===');
        console.log(`All connections in database: ${allConnections}`);
        console.log(`Total connections (not in trash): ${totalConnections}`);
        console.log(`Connected connections: ${connectedConnections}`);
        console.log(`Failed connections: ${failedConnections}`);
        console.log(`Connections in trash: ${trashConnections}`);
        console.log(`Old connections (>2 days): ${oldConnections}`);
        console.log(`Over-tested connections (>10 tests): ${overTestedConnections}`);
        
        // Show sample connections for debugging
        if (allConnections > 0) {
            const sampleConnections = await ConfigModel.find({}).limit(3);
            console.log('\n=== Sample Connections ===');
            sampleConnections.forEach((conn, index) => {
                console.log(`${index + 1}. ID: ${conn._id}`);
                console.log(`   URI: ${conn.uri ? conn.uri.substring(0, 50) + '...' : 'No URI'}`);
                console.log(`   Type: ${conn.type}`);
                console.log(`   Trash: ${conn.trash} (type: ${typeof conn.trash})`);
                console.log(`   Connection Status: ${conn.connectionStatus} (type: ${typeof conn.connectionStatus})`);
                console.log(`   History Count: ${conn.history ? conn.history.length : 0}`);
                console.log(`   Created: ${conn.createdAt}`);
                console.log(`   Created (ISO): ${conn.createdAt.toISOString()}`);
                console.log(`   Is older than 2 days: ${conn.createdAt < twoDaysAgo}`);
                console.log('---');
            });
        }
        
        // Show date range info
        const oldestConnection = await ConfigModel.findOne({}, { createdAt: 1 }).sort({ createdAt: 1 });
        const newestConnection = await ConfigModel.findOne({}, { createdAt: 1 }).sort({ createdAt: -1 });
        
        if (oldestConnection && newestConnection) {
            console.log('\n=== Date Range Info ===');
            console.log(`Oldest connection: ${oldestConnection.createdAt}`);
            console.log(`Newest connection: ${newestConnection.createdAt}`);
            console.log(`Date range: ${newestConnection.createdAt - oldestConnection.createdAt} ms`);
            console.log(`Days range: ${(newestConnection.createdAt - oldestConnection.createdAt) / (1000 * 60 * 60 * 24)} days`);
        }
        
        return {
            total: totalConnections,
            connected: connectedConnections,
            failed: failedConnections,
            trash: trashConnections,
            old: oldConnections,
            overTested: overTestedConnections,
            message: `Statistics retrieved: ${totalConnections} total, ${connectedConnections} connected, ${failedConnections} failed, ${trashConnections} in trash`
        };
        
    } catch (error) {
        console.error('Error getting statistics:', error);
        throw error;
    }
}

/**
 * Advanced cleanup with more filters
 */
async function advancedCleanup(options = {}) {
    const {
        daysOld = 2,
        maxTests = 10,
        dryRun = false,
        moveConnected = false
    } = options;
    
    try {
        console.log(`Starting advanced cleanup (${dryRun ? 'test mode' : 'real mode'})...`);
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        
        // Build query based on parameters
        const query = {
            createdAt: { $lt: cutoffDate },
            trash: { $ne: true }, // Not already in trash
            $expr: { $gte: [{ $size: '$history' }, maxTests] }
        };
        
        // If moveConnected = false, only move failed connections
        if (!moveConnected) {
            query.$expr = {
                $and: [
                    { $gte: [{ $size: '$history' }, maxTests] },
                    {
                        $not: {
                            $anyElementTrue: {
                                $map: {
                                    input: '$history',
                                    as: 'entry',
                                    in: '$$entry.status'
                                }
                            }
                        }
                    }
                ]
            };
        }
        
        // Debug: Show query details
        console.log(`DEBUG: Cutoff date: ${cutoffDate}`);
        console.log(`DEBUG: Max tests: ${maxTests}`);
        console.log(`DEBUG: Move connected: ${moveConnected}`);
        console.log(`DEBUG: Query:`, JSON.stringify(query, null, 2));
        
        // Test individual parts of the query
        const oldConnections = await ConfigModel.countDocuments({ createdAt: { $lt: cutoffDate } });
        console.log(`DEBUG: Connections older than ${cutoffDate}: ${oldConnections}`);
        
        const notInTrash = await ConfigModel.countDocuments({ trash: { $ne: true } });
        console.log(`DEBUG: Connections not in trash: ${notInTrash}`);
        
        const overTested = await ConfigModel.countDocuments({
            $expr: { $gte: [{ $size: '$history' }, maxTests] }
        });
        console.log(`DEBUG: Connections with >= ${maxTests} tests: ${overTested}`);
        
        const connectionsToTrash = await ConfigModel.find(query);
        
        console.log(`Found ${connectionsToTrash.length} connections to move to trash`);
        
        if (dryRun) {
            console.log('Test mode - no connections will be moved to trash.');
            return {
                foundCount: connectionsToTrash.length,
                message: 'Test mode - no connections were moved to trash.'
            };
        }
        
        if (connectionsToTrash.length === 0) {
            return { movedCount: 0, message: 'No connections found for cleanup.' };
        }
        
        const updateResult = await ConfigModel.updateMany(
            { _id: { $in: connectionsToTrash.map(conn => conn._id) } },
            { $set: { trash: true, lastModifiedAt: new Date() } }
        );
        
        return {
            movedCount: updateResult.modifiedCount,
            message: `${updateResult.modifiedCount} connections moved to trash.`
        };
        
    } catch (error) {
        console.error('Error in advanced cleanup:', error);
        throw error;
    }
}

/**
 * Restore connections from trash
 */
async function restoreFromTrash(connectionIds = null) {
    try {
        console.log('Starting restoration from trash...');
        
        const query = { trash: true };
        if (connectionIds && connectionIds.length > 0) {
            query._id = { $in: connectionIds };
        }
        
        const connectionsToRestore = await ConfigModel.find(query);
        
        console.log(`Found ${connectionsToRestore.length} connections to restore from trash`);
        
        if (connectionsToRestore.length === 0) {
            console.log('No connections found in trash.');
            return { restoredCount: 0, message: 'No connections found in trash.' };
        }
        
        // Display details of connections to restore
        connectionsToRestore.forEach((conn, index) => {
            console.log(`${index + 1}. URI: ${conn.uri || 'Unknown'}`);
            console.log(`   Type: ${conn.type}`);
            console.log(`   Created: ${conn.createdAt}`);
            console.log(`   Test count: ${conn.history.length}`);
            console.log('---');
        });
        
        // Restore connections from trash
        const updateResult = await ConfigModel.updateMany(
            { _id: { $in: connectionsToRestore.map(conn => conn._id) } },
            { $set: { trash: false, lastModifiedAt: new Date() } }
        );
        
        console.log(`Restored ${updateResult.modifiedCount} connections from trash`);
        
        return {
            restoredCount: updateResult.modifiedCount,
            message: `${updateResult.modifiedCount} connections restored from trash.`
        };
        
    } catch (error) {
        console.error('Error in restoration process:', error);
        throw error;
    }
}

/**
 * Permanently delete connections from trash
 */
async function permanentlyDeleteFromTrash(connectionIds = null) {
    try {
        console.log('Starting permanent deletion from trash...');
        
        const query = { trash: true };
        if (connectionIds && connectionIds.length > 0) {
            query._id = { $in: connectionIds };
        }
        
        const connectionsToDelete = await ConfigModel.find(query);
        
        console.log(`Found ${connectionsToDelete.length} connections to permanently delete`);
        
        if (connectionsToDelete.length === 0) {
            console.log('No connections found in trash.');
            return { deletedCount: 0, message: 'No connections found in trash.' };
        }
        
        // Display details of connections to delete
        connectionsToDelete.forEach((conn, index) => {
            console.log(`${index + 1}. URI: ${conn.uri || 'Unknown'}`);
            console.log(`   Type: ${conn.type}`);
            console.log(`   Created: ${conn.createdAt}`);
            console.log(`   Test count: ${conn.history.length}`);
            console.log('---');
        });
        
        // Permanently delete connections
        const deleteResult = await ConfigModel.deleteMany({
            _id: { $in: connectionsToDelete.map(conn => conn._id) }
        });
        
        console.log(`Permanently deleted ${deleteResult.deletedCount} connections from trash`);
        
        return {
            deletedCount: deleteResult.deletedCount,
            message: `${deleteResult.deletedCount} connections permanently deleted from trash.`
        };
        
    } catch (error) {
        console.error('Error in permanent deletion process:', error);
        throw error;
    }
}

/**
 * Debug database structure and content
 */
async function debugDatabase() {
    try {
        console.log('🔍 Debugging database structure...');
        
        // Get collection info
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`Collections in database: ${collections.map(c => c.name).join(', ')}`);
        
        // Get total documents
        const totalDocs = await ConfigModel.countDocuments({});
        console.log(`Total documents in Config collection: ${totalDocs}`);
        
        // Check for documents without trash field
        const docsWithoutTrash = await ConfigModel.countDocuments({ trash: { $exists: false } });
        console.log(`Documents without trash field: ${docsWithoutTrash}`);
        
        if (totalDocs > 0) {
            // Get sample document
            const sampleDoc = await ConfigModel.findOne({});
            console.log('\n=== Sample Document Structure ===');
            console.log('Keys:', Object.keys(sampleDoc.toObject()));
            
            // Check if trash field exists
            if (sampleDoc.trash === undefined) {
                console.log('⚠️  WARNING: Sample document does not have trash field!');
                console.log('This means old connections need to be updated with trash field.');
            }
            
            console.log('Sample document:', JSON.stringify(sampleDoc.toObject(), null, 2));
        }
        
        return {
            collections: collections.map(c => c.name),
            totalDocs,
            docsWithoutTrash,
            message: `Database debug completed. Found ${totalDocs} documents, ${docsWithoutTrash} without trash field.`
        };
        
    } catch (error) {
        console.error('Error debugging database:', error);
        throw error;
    }
}

/**
 * Update old connections to add trash field
 */
async function updateOldConnections() {
    try {
        console.log('🔄 Updating old connections to add trash field...');
        
        // Find documents without trash field
        const docsWithoutTrash = await ConfigModel.countDocuments({ trash: { $exists: false } });
        console.log(`Found ${docsWithoutTrash} documents without trash field`);
        
        // Find documents with non-boolean trash field
        const docsWithNonBooleanTrash = await ConfigModel.countDocuments({
            trash: { $exists: true, $ne: true, $ne: false }
        });
        console.log(`Found ${docsWithNonBooleanTrash} documents with non-boolean trash field`);
        
        if (docsWithoutTrash === 0 && docsWithNonBooleanTrash === 0) {
            console.log('All documents already have proper trash field.');
            return {
                updatedCount: 0,
                message: 'All documents already have proper trash field.'
            };
        }
        
        let totalUpdated = 0;
        
        // Update documents without trash field
        if (docsWithoutTrash > 0) {
            const updateResult1 = await ConfigModel.updateMany(
                { trash: { $exists: false } },
                { $set: { trash: false, lastModifiedAt: new Date() } }
            );
            console.log(`Updated ${updateResult1.modifiedCount} documents without trash field`);
            totalUpdated += updateResult1.modifiedCount;
        }
        
        // Update documents with non-boolean trash field
        if (docsWithNonBooleanTrash > 0) {
            const updateResult2 = await ConfigModel.updateMany(
                { trash: { $exists: true, $ne: true, $ne: false } },
                { $set: { trash: false, lastModifiedAt: new Date() } }
            );
            console.log(`Updated ${updateResult2.modifiedCount} documents with non-boolean trash field`);
            totalUpdated += updateResult2.modifiedCount;
        }
        
        return {
            updatedCount: totalUpdated,
            message: `${totalUpdated} documents updated with proper trash field.`
        };
        
    } catch (error) {
        console.error('Error updating old connections:', error);
        throw error;
    }
}

/**
 * Test different queries to find connections
 */
async function testQueries() {
    try {
        console.log('🧪 Testing different queries...');
        
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        
        console.log(`\n=== Query Tests ===`);
        
        // Test 1: All connections
        const allConnections = await ConfigModel.countDocuments({});
        console.log(`1. All connections: ${allConnections}`);
        
        // Test 2: Old connections
        const oldConnections = await ConfigModel.countDocuments({
            createdAt: { $lt: twoDaysAgo }
        });
        console.log(`2. Old connections (>2 days): ${oldConnections}`);
        
        // Test 3: Over-tested connections
        const overTested = await ConfigModel.countDocuments({
            $expr: { $gte: [{ $size: '$history' }, 10] }
        });
        console.log(`3. Over-tested connections (>=10 tests): ${overTested}`);
        
        // Test 4: Failed connections (never connected)
        const failedConnections = await ConfigModel.countDocuments({
            $expr: {
                $not: {
                    $anyElementTrue: {
                        $map: {
                            input: '$history',
                            as: 'entry',
                            in: '$$entry.status'
                        }
                    }
                }
            }
        });
        console.log(`4. Failed connections (never connected): ${failedConnections}`);
        
        // Test 5: Not in trash
        const notInTrash = await ConfigModel.countDocuments({
            trash: { $ne: true }
        });
        console.log(`5. Not in trash: ${notInTrash}`);
        
        // Test 6: Combined query (old + over-tested + failed + not in trash)
        const combinedQuery = {
            createdAt: { $lt: twoDaysAgo },
            $expr: { $gte: [{ $size: '$history' }, 10] },
            trash: { $ne: true },
            $expr: {
                $not: {
                    $anyElementTrue: {
                        $map: {
                            input: '$history',
                            as: 'entry',
                            in: '$$entry.status'
                        }
                    }
                }
            }
        };
        
        // Note: This query has duplicate $expr, so let's fix it
        const fixedQuery = {
            createdAt: { $lt: twoDaysAgo },
            trash: { $ne: true },
            $expr: {
                $and: [
                    { $gte: [{ $size: '$history' }, 10] },
                    {
                        $not: {
                            $anyElementTrue: {
                                $map: {
                                    input: '$history',
                                    as: 'entry',
                                    in: '$$entry.status'
                                }
                            }
                        }
                    }
                ]
            }
        };
        
        const combinedResult = await ConfigModel.countDocuments(fixedQuery);
        console.log(`6. Combined query result: ${combinedResult}`);
        
        // Test 7: Sample results
        if (combinedResult > 0) {
            const sampleResults = await ConfigModel.find(fixedQuery).limit(3);
            console.log(`\n=== Sample Results ===`);
            sampleResults.forEach((conn, index) => {
                console.log(`${index + 1}. ID: ${conn._id}`);
                console.log(`   Created: ${conn.createdAt}`);
                console.log(`   History count: ${conn.history.length}`);
                console.log(`   Trash: ${conn.trash}`);
                console.log(`   URI: ${conn.uri ? conn.uri.substring(0, 50) + '...' : 'No URI'}`);
                console.log('---');
            });
        }
        
        return {
            allConnections,
            oldConnections,
            overTested,
            failedConnections,
            notInTrash,
            combinedResult,
            message: `Query tests completed. Found ${combinedResult} connections matching all criteria.`
        };
        
    } catch (error) {
        console.error('Error testing queries:', error);
        throw error;
    }
}

module.exports = {
    moveOldConnectionsToTrash,
    getConnectionStats,
    advancedCleanup,
    restoreFromTrash,
    permanentlyDeleteFromTrash,
    debugDatabase,
    updateOldConnections,
    testQueries
}; 