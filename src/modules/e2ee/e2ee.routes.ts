import { Router } from 'express';
import { e2eeController } from './e2ee.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import {
  uploadKeyBundleSchema,
  refillPreKeysSchema,
  getPreKeyBundleSchema,
  getPreKeyCountSchema,
  getSafetyNumberSchema,
} from './e2ee.validation.js';

/**
 * End-to-End Encryption (E2EE) Router.
 * 
 * Routes for Signal Protocol X3DH Public Key Distribution and Safety Number Verification.
 * Strictly adheres to body-only parameters (no URL/path params).
 * 
 * Routes:
 * - POST /api/v1/e2ee/keys/upload    - Upload/update client public key bundle (Protected)
 * - POST /api/v1/e2ee/keys/refill    - Refill depleted one-time prekeys pool (Protected)
 * - POST /api/v1/e2ee/keys/bundle    - Fetch recipient prekey bundle & consume OPK (Protected)
 * - POST /api/v1/e2ee/keys/count     - Check count of remaining active OPKs (Protected)
 * - POST /api/v1/e2ee/safety-number  - Derive 60-digit safety number fingerprint (Protected)
 * 
 * @see https://signal.org/docs/specifications/x3dh/
 */
const router = Router();

// All E2EE key management operations require authenticated sessions
router.use(authenticate);

// Upload client public key bundle
router.post(
  '/keys/upload',
  validate(uploadKeyBundleSchema),
  (req, res, next) => e2eeController.uploadKeyBundle(req, res, next)
);

// Refill one-time prekeys pool
router.post(
  '/keys/refill',
  validate(refillPreKeysSchema),
  (req, res, next) => e2eeController.refillPreKeys(req, res, next)
);

// Fetch recipient prekey bundle (consumes 1 OPK atomically)
router.post(
  '/keys/bundle',
  validate(getPreKeyBundleSchema),
  (req, res, next) => e2eeController.getPreKeyBundle(req, res, next)
);

// Query remaining active OPK count
router.post(
  '/keys/count',
  validate(getPreKeyCountSchema),
  (req, res, next) => e2eeController.getPreKeyCount(req, res, next)
);

// Compute 60-digit cryptographic Safety Number
router.post(
  '/safety-number',
  validate(getSafetyNumberSchema),
  (req, res, next) => e2eeController.getSafetyNumber(req, res, next)
);

export default router;
