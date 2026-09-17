import bcrypt from 'bcryptjs';

/**
 * Password Hashing and Verification Utility.
 * 
 * Implements salted cryptographic password hashing using bcrypt with a work factor of 12.
 * Adheres to OWASP Password Storage guidelines to protect credentials against rainbow table
 * and brute-force dictionary attacks.
 * 
 * @see https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 * @see https://github.com/dcodeIO/bcrypt.js
 */

const SALT_ROUNDS = 12;

/**
 * Hash a plain text password using bcrypt with salt rounds = 12.
 * 
 * @param password - Plain text password from user input
 * @returns Promise resolving to the hashed password string
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(password, salt);
};

/**
 * Verify a plain text password against a stored bcrypt hash.
 * 
 * @param password - Plain text password from login attempt
 * @param hash - Stored hash from database
 * @returns Promise resolving to true if password matches, false otherwise
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
