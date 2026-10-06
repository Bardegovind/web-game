const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
// Ensure the key is 32 bytes for aes-256-cbc
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY 
    ? Buffer.from(process.env.TOKEN_ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)) 
    : crypto.scryptSync('default_fallback_secret', 'salt', 32); 

const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('Decryption failed:', error);
        return null;
    }
}

module.exports = { encrypt, decrypt };
