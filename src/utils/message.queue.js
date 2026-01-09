/**
 * Message Queue System - Handle concurrent messages per user sequentially
 * ✅ Solves: Bot menjawab 1 per 1, tidak bug ketika ada 2 pertanyaan datang berbarengan
 */

class MessageQueue {
  constructor() {
    // Map userId → Queue of pending messages
    this.queues = new Map();
    // Map userId → Processing flag
    this.processing = new Map();
  }

  /**
   * Enqueue message untuk user
   * @param {string} userId - User ID (WhatsApp)
   * @param {Object} message - Message object
   * @param {Function} handler - Async handler untuk proses message
   * @returns {Promise} - Resolves ketika handler selesai dijalankan
   */
  async enqueue(userId, message, handler) {
    console.log(`📬 Enqueueing message for ${userId.substring(0, 12)}...`);
    
    if (!this.queues.has(userId)) {
      this.queues.set(userId, []);
      this.processing.set(userId, false);
    }

    const queue = this.queues.get(userId);
    
    // ✅ Create promise FIRST, before adding to queue
    let resolveFunc, rejectFunc;
    const promise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });
    
    // Tambah message ke queue dengan promise callbacks
    const queueItem = {
      message,
      handler,
      timestamp: Date.now(),
      resolve: resolveFunc,
      reject: rejectFunc
    };
    
    queue.push(queueItem);
    const queueSize = queue.length;
    
    console.log(`📬 Queue for ${userId.substring(0, 12)}... size: ${queueSize}`);

    // Process queue jika belum ada yang processing
    if (!this.processing.get(userId)) {
      this._processQueue(userId);
    }

    // Return promise yang resolve ketika message ini selesai diproses
    return promise;
  }

  /**
   * Process queue satu per satu
   * @private
   */
  async _processQueue(userId) {
    const queue = this.queues.get(userId);
    
    // Tandai sedang process
    this.processing.set(userId, true);

    while (queue && queue.length > 0) {
      const queueItem = queue.shift();
      const { message, handler, resolve, reject, timestamp } = queueItem;
      
      const waitTime = Date.now() - timestamp;
      console.log(`⏳ Processing message ${userId.substring(0, 12)}... (waited ${waitTime}ms, queue remaining: ${queue.length})`);

      try {
        // Jalankan handler
        const result = await handler(message);
        
        console.log(`✅ Message processed successfully for ${userId.substring(0, 12)}... (took ${Date.now() - timestamp}ms)`);
        resolve(result);
      } catch (error) {
        console.error(`❌ Message handler error for ${userId.substring(0, 12)}...`, error.message);
        reject(error);
      }
    }

    // Queue sudah kosong, tandai selesai
    this.processing.set(userId, false);
    console.log(`✅ Queue for ${userId.substring(0, 12)}... is now empty`);
  }

  /**
   * Get queue size untuk user
   * @param {string} userId
   * @returns {number}
   */
  getQueueSize(userId) {
    return this.queues.get(userId)?.length || 0;
  }

  /**
   * Get processing status untuk user
   * @param {string} userId
   * @returns {boolean}
   */
  isProcessing(userId) {
    return this.processing.get(userId) || false;
  }

  /**
   * Clear queue untuk user (cleanup)
   * @param {string} userId
   */
  clearQueue(userId) {
    this.queues.delete(userId);
    this.processing.delete(userId);
    console.log(`🗑️ Queue cleared for ${userId.substring(0, 12)}...`);
  }

  /**
   * Get stats untuk semua users
   * @returns {Object}
   */
  getStats() {
    const stats = {
      totalUsers: this.queues.size,
      activeUsers: Array.from(this.processing.values()).filter(p => p).length,
      userQueues: {}
    };

    for (const [userId, queue] of this.queues) {
      stats.userQueues[userId.substring(0, 12) + '...'] = {
        queueSize: queue.length,
        isProcessing: this.processing.get(userId)
      };
    }

    return stats;
  }
}

// ✅ Singleton instance
const messageQueue = new MessageQueue();

module.exports = {
  messageQueue,
  MessageQueue
};
