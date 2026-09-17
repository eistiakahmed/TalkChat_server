import { apiClient } from './api.client';
import type { ApiResponse } from '../types/auth.types';
import type { ParticipantUser } from '../types/chat.types';

export interface SearchUsersResult {
  users: ParticipantUser[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
}

/**
 * User Directory and Contact API Service.
 * 
 * Provides methods for user searching, contact rosters, and profile lookups.
 */
export const userService = {
  /**
   * Search users by username, email, or full name.
   */
  async searchUsers(query: string, page = 1, limit = 20): Promise<ParticipantUser[]> {
    if (!query.trim()) return [];

    const encodedQuery = encodeURIComponent(query.trim());
    const response = await apiClient.get<ApiResponse<SearchUsersResult | ParticipantUser[]>>(
      `/users/search?q=${encodedQuery}&page=${page}&limit=${limit}`
    );

    if (!response.data) return [];

    if (Array.isArray(response.data)) {
      return response.data;
    }

    return (response.data as SearchUsersResult).users || [];
  },

  /**
   * Fetch authenticated user's accepted contacts.
   */
  async getContacts(): Promise<ParticipantUser[]> {
    const response = await apiClient.get<ApiResponse<{ contacts: Array<{ contact: ParticipantUser }> | ParticipantUser[] }>>(
      '/users/contacts'
    );

    if (!response.data) return [];

    if (Array.isArray(response.data)) {
      return response.data;
    }

    if (Array.isArray(response.data.contacts)) {
      return response.data.contacts.map((c: any) => c.contact || c);
    }

    return [];
  },
};
