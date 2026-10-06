import { storage } from '../utils/storage';

/**
 * Notification Service — DESI WARDROBE
 *
 * Prepared as a modular service so Firebase Cloud Messaging (FCM) can be
 * connected in Version 2 without changing UI components.
 */

export const notificationService = {
  areNotificationsEnabled: (): boolean => {
    return storage.getSettings().notificationsEnabled;
  },

  setNotificationsEnabled: (enabled: boolean): void => {
    const current = storage.getSettings();
    storage.saveSettings({
      ...current,
      notificationsEnabled: enabled,
    });
  },
};
