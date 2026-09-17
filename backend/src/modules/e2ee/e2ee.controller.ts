import { Request, Response, NextFunction } from 'express';
import { e2eeService } from './e2ee.service.js';
import { sendResponse } from '../../utils/response.util.js';
import { HttpStatus } from '../../constants/httpStatusCodes.js';
import { t } from '../../i18n/i18n.middleware.js';

/**
 * End-to-End Encryption (E2EE) Controller.
 * 
 * Transport layer handling cryptographic public key uploads, prekey bundle queries,
 * and safety number generation requests.
 * 
 * Strictly adheres to body-only parameter paradigm (zero path parameters).
 * 
 * @see https://signal.org/docs/specifications/x3dh/
 */
export class E2EEController {
  /**
   * Upload or update an E2EE public key bundle for the authenticated device.
   * 
   * @route POST /api/v1/e2ee/keys/upload
   * @body { registrationId, identityKey, signedPreKeyId, signedPreKey, signedPreKeySignature, oneTimePreKeys, deviceId? }
   */
  async uploadKeyBundle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await e2eeService.uploadKeyBundle(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.CREATED,
        message: t('e2ee.keys_uploaded', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Refill one-time prekeys pool when remaining count is low.
   * 
   * @route POST /api/v1/e2ee/keys/refill
   * @body { oneTimePreKeys, deviceId? }
   */
  async refillPreKeys(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await e2eeService.refillOneTimePreKeys(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('e2ee.keys_refilled', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve recipient PreKey Bundle to initiate an X3DH encrypted session.
   * 
   * @route POST /api/v1/e2ee/keys/bundle
   * @body { recipientId: string, deviceId?: number }
   */
  async getPreKeyBundle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await e2eeService.getPreKeyBundle(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('e2ee.bundle_fetched', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check remaining count of unconsumed One-Time PreKeys.
   * 
   * @route POST /api/v1/e2ee/keys/count
   * @body { deviceId?: number }
   */
  async getPreKeyCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const deviceId = req.body.deviceId ?? 1;
      const result = await e2eeService.getRemainingPreKeyCount(userId, deviceId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('e2ee.count_fetched', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Compute 60-digit cryptographic Safety Number with a target peer.
   * 
   * @route POST /api/v1/e2ee/safety-number
   * @body { targetUserId: string }
   */
  async getSafetyNumber(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await e2eeService.generateSafetyNumber(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('e2ee.safety_number_generated', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const e2eeController = new E2EEController();
