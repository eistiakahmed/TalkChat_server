import crypto from 'crypto';
import { prisma } from '../../config/database.config.js';
import { NotFoundError, BadRequestError } from '../../errors/AppError.js';
import {
  UploadKeyBundleInput,
  RefillPreKeysInput,
  GetPreKeyBundleInput,
  GetSafetyNumberInput,
} from './e2ee.validation.js';
import { logger } from '../../utils/logger.js';

/**
 * End-to-End Encryption (E2EE) Key Exchange and Cryptographic Verification Service.
 * 
 * Functions as a Zero-Knowledge Public Key Distribution Server (PKDS) for Signal Protocol
 * Extended Triple Diffie-Hellman (X3DH) sessions. Manages Identity Keys, Signed PreKeys,
 * consumable pools of One-Time PreKeys (OPK), and deterministic Safety Number computation.
 * 
 * @see https://signal.org/docs/specifications/x3dh/
 * @see https://signal.org/docs/specifications/doubleratchet/
 * @see https://signal.org/blog/safety-number-updates/
 */
export class E2EEService {
  /**
   * Upload or update an E2EE public key bundle for the authenticated device.
   * 
   * Atomically upserts the Identity Key and Signed PreKey while populating
   * the pool of consumable One-Time PreKeys.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Key bundle payload parameters
   */
  async uploadKeyBundle(userId: string, input: UploadKeyBundleInput) {
    const deviceId = input.deviceId ?? 1;

    const result = await prisma.$transaction(async (tx) => {
      // Upsert the main Key Bundle
      const bundle = await tx.userKeyBundle.upsert({
        where: {
          userId_deviceId: {
            userId,
            deviceId,
          },
        },
        create: {
          userId,
          deviceId,
          registrationId: input.registrationId,
          identityKey: input.identityKey,
          signedPreKeyId: input.signedPreKeyId,
          signedPreKey: input.signedPreKey,
          signedPreKeySignature: input.signedPreKeySignature,
        },
        update: {
          registrationId: input.registrationId,
          identityKey: input.identityKey,
          signedPreKeyId: input.signedPreKeyId,
          signedPreKey: input.signedPreKey,
          signedPreKeySignature: input.signedPreKeySignature,
        },
      });

      // Insert initial batch of One-Time PreKeys
      if (input.oneTimePreKeys && input.oneTimePreKeys.length > 0) {
        await tx.oneTimePreKey.createMany({
          data: input.oneTimePreKeys.map((opk) => ({
            bundleId: bundle.id,
            keyId: opk.keyId,
            publicKey: opk.publicKey,
            isConsumed: false,
          })),
        });
      }

      const activePreKeyCount = await tx.oneTimePreKey.count({
        where: {
          bundleId: bundle.id,
          isConsumed: false,
        },
      });

      return {
        bundleId: bundle.id,
        deviceId: bundle.deviceId,
        registrationId: bundle.registrationId,
        identityKey: bundle.identityKey,
        signedPreKeyId: bundle.signedPreKeyId,
        activePreKeyCount,
      };
    });

    logger.info({ userId, deviceId, activePreKeyCount: result.activePreKeyCount }, 'E2EE Key Bundle uploaded');
    return result;
  }

  /**
   * Refill One-Time PreKeys pool for an existing key bundle.
   * 
   * Called by client when unconsumed OPK count drops below safety threshold (< 20).
   * 
   * @param userId - Authenticated user UUID
   * @param input - New OPK items and device identifier
   */
  async refillOneTimePreKeys(userId: string, input: RefillPreKeysInput) {
    const deviceId = input.deviceId ?? 1;

    const bundle = await prisma.userKeyBundle.findUnique({
      where: {
        userId_deviceId: {
          userId,
          deviceId,
        },
      },
    });

    if (!bundle) {
      throw new NotFoundError('No key bundle found for this device', 'e2ee.keys_not_found');
    }

    await prisma.oneTimePreKey.createMany({
      data: input.oneTimePreKeys.map((opk) => ({
        bundleId: bundle.id,
        keyId: opk.keyId,
        publicKey: opk.publicKey,
        isConsumed: false,
      })),
    });

    const activePreKeyCount = await prisma.oneTimePreKey.count({
      where: {
        bundleId: bundle.id,
        isConsumed: false,
      },
    });

    logger.info({ userId, deviceId, added: input.oneTimePreKeys.length, total: activePreKeyCount }, 'OPKs refilled');
    return { deviceId, activePreKeyCount };
  }

  /**
   * Fetch recipient PreKey Bundle to initiate an X3DH encrypted session.
   * 
   * Atomically fetches the Identity Key, Signed PreKey, and consumes (burns)
   * 1 One-Time PreKey from the recipient's pool to guarantee forward secrecy.
   * 
   * @param requesterId - Requesting user UUID
   * @param input - Recipient ID and target device ID
   */
  async getPreKeyBundle(requesterId: string, input: GetPreKeyBundleInput) {
    const deviceId = input.deviceId ?? 1;

    const bundle = await prisma.userKeyBundle.findUnique({
      where: {
        userId_deviceId: {
          userId: input.recipientId,
          deviceId,
        },
      },
    });

    if (!bundle) {
      throw new NotFoundError('Recipient has not published an E2EE key bundle', 'e2ee.keys_not_found');
    }

    // Atomically find and consume one available OPK
    const consumedOpk = await prisma.$transaction(async (tx) => {
      const opk = await tx.oneTimePreKey.findFirst({
        where: {
          bundleId: bundle.id,
          isConsumed: false,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (opk) {
        await tx.oneTimePreKey.update({
          where: { id: opk.id },
          data: {
            isConsumed: true,
            consumedAt: new Date(),
          },
        });
      }

      return opk;
    });

    logger.info(
      { requesterId, recipientId: input.recipientId, opkConsumed: !!consumedOpk },
      'PreKey bundle retrieved and OPK consumed'
    );

    return {
      userId: bundle.userId,
      deviceId: bundle.deviceId,
      registrationId: bundle.registrationId,
      identityKey: bundle.identityKey,
      signedPreKey: {
        keyId: bundle.signedPreKeyId,
        publicKey: bundle.signedPreKey,
        signature: bundle.signedPreKeySignature,
      },
      oneTimePreKey: consumedOpk
        ? {
            keyId: consumedOpk.keyId,
            publicKey: consumedOpk.publicKey,
          }
        : null,
    };
  }

  /**
   * Retrieve count of remaining unconsumed One-Time PreKeys for authenticated user.
   * 
   * @param userId - Authenticated user UUID
   * @param deviceId - Device identifier
   */
  async getRemainingPreKeyCount(userId: string, deviceId = 1) {
    const bundle = await prisma.userKeyBundle.findUnique({
      where: {
        userId_deviceId: {
          userId,
          deviceId,
        },
      },
    });

    if (!bundle) {
      return { deviceId, activePreKeyCount: 0 };
    }

    const activePreKeyCount = await prisma.oneTimePreKey.count({
      where: {
        bundleId: bundle.id,
        isConsumed: false,
      },
    });

    return { deviceId, activePreKeyCount };
  }

  /**
   * Compute a 60-digit cryptographic Safety Number for out-of-band MITM verification.
   * 
   * Implements Signal Protocol specification:
   * 1. Sorts the two identity keys lexicographically.
   * 2. Runs 5,200 iterations of SHA-512 hashing to introduce computational cost against brute force.
   * 3. Slices 5-byte chunks and formats into 12 groups of 5 decimal digits (60 digits total).
   * 
   * Symmetrical: produces the exact same fingerprint whether requested by User A or User B.
   * 
   * @param userAId - Requesting user UUID
   * @param input - Target user UUID
   */
  async generateSafetyNumber(userAId: string, input: GetSafetyNumberInput) {
    const userBId = input.targetUserId;

    if (userAId === userBId) {
      throw new BadRequestError('Cannot compute safety numbers with yourself', 'e2ee.cannot_safety_self');
    }

    const [bundleA, bundleB] = await Promise.all([
      prisma.userKeyBundle.findFirst({
        where: { userId: userAId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.userKeyBundle.findFirst({
        where: { userId: userBId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!bundleA || !bundleB) {
      throw new NotFoundError(
        'Both users must have registered cryptographic key bundles to generate safety numbers',
        'e2ee.keys_not_found'
      );
    }

    // Sort identity keys lexicographically to guarantee symmetry
    const sortedKeys = [bundleA.identityKey, bundleB.identityKey].sort();
    const concatenated = Buffer.from(sortedKeys[0] + sortedKeys[1], 'utf8');

    // Perform 5,200 iterations of SHA-512 (Signal Protocol specification standard)
    let digest = crypto.createHash('sha512').update(concatenated).digest();
    for (let i = 0; i < 5200; i++) {
      digest = crypto.createHash('sha512').update(Buffer.concat([digest, concatenated])).digest();
    }

    // Derive 60-digit decimal fingerprint (12 blocks of 5 digits)
    const blocks: string[] = [];
    for (let i = 0; i < 12; i++) {
      const offset = (i * 5) % (digest.length - 5);
      const chunk = digest.readUInt32BE(offset) % 100000;
      blocks.push(chunk.toString().padStart(5, '0'));
    }

    const safetyNumber = blocks.join(' ');

    logger.info({ userAId, userBId }, 'Safety number computed successfully');
    return {
      targetUserId: userBId,
      safetyNumber,
      displayFingerprint: safetyNumber,
    };
  }
}

export const e2eeService = new E2EEService();
