const userLocks = new Map();

async function acquireLock(userId, maxWait = 5000) {
    const lockKey = `lock_${userId}`;
    const start = Date.now();
    
    while (userLocks.has(lockKey) && (Date.now() - start < maxWait)) {
        await new Promise(r => setTimeout(r, 50));
    }
    
    if (userLocks.has(lockKey)) {
        throw new Error('Lock timeout');
    }
    
    userLocks.set(lockKey, Date.now());
    return lockKey;
}

function releaseLock(lockKey) {
    userLocks.delete(lockKey);
}

module.exports = {
    acquireLock,
    releaseLock
};
