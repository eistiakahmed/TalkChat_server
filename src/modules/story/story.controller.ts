import { Request, Response, NextFunction } from 'express';
import { storyService } from './story.service.js';
import { sendResponse } from '../../utils/response.util.js';
import { HttpStatus } from '../../constants/httpStatusCodes.js';
import { t } from '../../i18n/i18n.middleware.js';

/**
 * Ephemeral Stories HTTP Controller.
 * 
 * Transport layer handling REST endpoints for 24-hour stories,
 * feed curation, viewer telemetry, and manual deletion.
 * Strictly adheres to body-only parameters (no URL/path params).
 * 
 * @see https://expressjs.com/en/guide/routing.html
 */
export class StoryController {
  /**
   * Post a new 24-hour expiring story.
   * 
   * @route POST /api/v1/stories/create
   */
  async createStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await storyService.createStory(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.CREATED,
        message: t('story.created', req.language),
        data: { story: result },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve active stories feed for contacts and self.
   * 
   * @route POST /api/v1/stories/feed
   */
  async getStoryFeed(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await storyService.getStoryFeed(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('story.feed_fetched', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Mark a story as viewed by the authenticated user.
   * 
   * @route POST /api/v1/stories/view
   */
  async viewStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const viewerId = req.userId!;
      const result = await storyService.viewStory(viewerId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('story.viewed', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Fetch viewer roster for a story (creator only).
   * 
   * @route POST /api/v1/stories/viewers
   */
  async getStoryViewers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await storyService.getStoryViewers(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('story.viewers_fetched', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete an active story before 24h expiration.
   * 
   * @route POST /api/v1/stories/delete
   */
  async deleteStory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await storyService.deleteStory(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('story.deleted', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Fetch caller's own active stories.
   * 
   * @route POST /api/v1/stories/me
   */
  async getMyStories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await storyService.getMyStories(userId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('story.my_stories_fetched', req.language),
        data: { stories: result },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const storyController = new StoryController();
