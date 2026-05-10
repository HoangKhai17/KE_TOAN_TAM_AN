const crypto = require('crypto')

const ALGORITHM  = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH  = 12 // 96 bits recommended for GCM
const TAG_LENGTH = 16 // 128 bits auth tag

function getKey() {
  const hexKey = process.env.CREDENTIAL_ENCRYPTION_KEY
  if (!hexKey || hexKey.length !== 64) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hexKey, 'hex')
}

function encrypt(plaintext) {
  const key = getKey()
  const iv  = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag   = cipher.getAuthTag()

  return {
    ciphertext: Buffer.concat([encrypted, authTag]).toString('base64'),
    iv:         iv.toString('base64'),
  }
}

function decrypt(ciphertextB64, ivB64) {
  const key    = getKey()
  const iv     = Buffer.from(ivB64, 'base64')
  const raw    = Buffer.from(ciphertextB64, 'base64')
  const tag    = raw.slice(-TAG_LENGTH)
  const data   = raw.slice(0, -TAG_LENGTH)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH })
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

module.exports = { encrypt, decrypt }
