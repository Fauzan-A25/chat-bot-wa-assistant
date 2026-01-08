async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
    for (let i = 0; i <= maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries) throw error;
            const delay = baseDelay * Math.pow(2, i) + Math.random() * 100;
            console.log(`🔄 Retry ${i + 1}/${maxRetries} in ${Math.round(delay)}ms: ${error.message}`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

module.exports = { withRetry };
