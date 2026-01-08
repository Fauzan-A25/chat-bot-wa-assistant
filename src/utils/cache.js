class TTLMap extends Map {
    constructor(ttl = 3600000) {
        super();
        this.ttl = ttl;
    }
    
    set(key, value) {
        super.set(key, { value, expiry: Date.now() + this.ttl });
        if (this.size > 100) this._cleanup();
    }
    
    get(key) {
        const item = super.get(key);
        if (!item || Date.now() > item.expiry) {
            this.delete(key);
            return undefined;
        }
        return item.value;
    }
    
    _cleanup() {
        for (const [key, item] of this.entries()) {
            if (Date.now() > item.expiry) this.delete(key);
        }
    }
}

module.exports = { TTLMap };
