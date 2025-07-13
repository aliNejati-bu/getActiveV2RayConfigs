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
            trash: false, // Not already in trash
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
        const totalConnections = await ConfigModel.countDocuments({ trash: false });
        const connectedConnections = await ConfigModel.countDocuments({ connectionStatus: true, trash: false });
        const failedConnections = await ConfigModel.countDocuments({ connectionStatus: false, trash: false });
        const trashConnections = await ConfigModel.countDocuments({ trash: true });
        
        // Old connections (more than 2 days)
        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const oldConnections = await ConfigModel.countDocuments({
            createdAt: { $lt: twoDaysAgo },
            trash: false
        });
        
        // Connections with more than 10 tests
        const overTestedConnections = await ConfigModel.countDocuments({
            $expr: { $gte: [{ $size: '$history' }, 10] },
            trash: false
        });
        
        console.log('=== Connection Statistics ===');
        console.log(`Total connections: ${totalConnections}`);
        console.log(`Connected connections: ${connectedConnections}`);
        console.log(`Failed connections: ${failedConnections}`);
        console.log(`Connections in trash: ${trashConnections}`);
        console.log(`Old connections (>2 days): ${oldConnections}`);
        console.log(`Over-tested connections (>10 tests): ${overTestedConnections}`);
        
        return {
            total: totalConnections,
            connected: connectedConnections,
            failed: failedConnections,
            trash: trashConnections,
            old: oldConnections,
            overTested: overTestedConnections
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
            trash: false, // Not already in trash
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

module.exports = {
    moveOldConnectionsToTrash,
    getConnectionStats,
    advancedCleanup
}; 