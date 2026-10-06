import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { appConfig, PlatformConfig } from '../config/appConfig';
import { auth, db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import { AdminAccount, AdminDevice, AdminDeviceStatus } from '../types/models';
import {
  generateSecureRandomToken,
  hashPinSync,
  verifyPinSync,
} from '../utils/crypto';
import {
  ActiveAdminSession,
  LocalDeviceCredential,
  storage,
} from '../utils/storage';

/**
 * Admin Service — DESI WARDROBE
 *
 * Implements the Device-Trusted Admin Login Architecture:
 * 1. First-Time Admin Login on a New Device:
 *    - Sign in with Google (Admin) -> strictly verified against backend ADMIN_EMAIL
 *    - Create Admin PIN (or verify existing Admin PIN on a second device)
 *    - Register device in Firestore (`adminDevices/{deviceId}`) with cryptographic credentialHash & status = "TRUSTED"
 * 2. Returning Login on the Same Trusted Device:
 *    - Does NOT ask for Google Sign-In again
 *    - Directly opens Admin PIN screen
 *    - Verifies hashed Admin PIN + verifies device credentialHash & status === "TRUSTED"
 *    - Updates `lastUsedAt` and opens Admin Dashboard
 * 3. Trusted Device Management:
 *    - View, revoke, or restore trusted devices from Admin Dashboard
 */

const PRIMARY_ADMIN_DOC_ID = 'admin_primary';
const PLATFORM_SETTINGS_DOC_ID = 'platform_config';

export const UNAUTHORIZED_ADMIN_MESSAGE =
  'Access denied. This Google account is not authorized for Desi Wardrobe Admin.';

function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Trusted Admin Device';
  const ua = navigator.userAgent || '';
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let os = 'Device';
  if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`.slice(0, 120);
}

function computeDeviceCredentialHash(deviceId: string, deviceToken: string): string {
  return hashPinSync(deviceToken, deviceId);
}

function getOrCreateLocalDeviceCredential(): LocalDeviceCredential {
  const existing = storage.getDeviceCredential();
  if (existing && existing.deviceId && existing.deviceToken) {
    return existing;
  }
  const newCred: LocalDeviceCredential = {
    deviceId: `DEV-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    deviceToken: generateSecureRandomToken(24),
    deviceLabel: detectDeviceLabel(),
    createdAt: new Date().toISOString(),
  };
  storage.saveDeviceCredential(newCred);
  return newCred;
}

function sanitizeAdminForFirestore(admin: AdminAccount): AdminAccount {
  const clean: AdminAccount = {
    adminUid: admin.adminUid,
    authorizedEmail: admin.authorizedEmail.slice(0, 150),
    pinConfigured: Boolean(admin.pinConfigured),
    createdAt: admin.createdAt,
  };
  if (admin.pinHash) {
    clean.pinHash = admin.pinHash.slice(0, 128);
  }
  if (admin.updatedAt) {
    clean.updatedAt = admin.updatedAt;
  }
  return clean;
}

function sanitizeAdminDeviceForFirestore(device: AdminDevice): AdminDevice {
  return {
    deviceId: device.deviceId.slice(0, 128),
    adminUid: device.adminUid.slice(0, 128),
    deviceLabel: (device.deviceLabel || 'Trusted Admin Device').slice(0, 120),
    credentialHash: device.credentialHash.slice(0, 128),
    status: device.status,
    createdAt: device.createdAt.slice(0, 64),
    lastUsedAt: device.lastUsedAt.slice(0, 64),
  };
}

async function persistAdminToFirestore(
  admin: AdminAccount,
  op: OperationType
): Promise<void> {
  const path = `admins/${admin.adminUid}`;
  try {
    const clean = sanitizeAdminForFirestore(admin);
    await setDoc(doc(db, 'admins', admin.adminUid), clean);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

async function persistAdminDeviceToFirestore(
  device: AdminDevice,
  op: OperationType
): Promise<void> {
  const path = `adminDevices/${device.deviceId}`;
  try {
    const clean = sanitizeAdminDeviceForFirestore(device);
    await setDoc(doc(db, 'adminDevices', device.deviceId), clean);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

export const adminService = {
  isAuthorizedEmail: (email: string | null | undefined): boolean => {
    if (!email) return false;
    return email.trim().toLowerCase() === appConfig.getAdminEmail();
  },

  getAdminRecord: (): AdminAccount | null => {
    const admins = storage.getAdmins();
    const configuredEmail = appConfig.getAdminEmail();
    return (
      admins.find((a) => a.authorizedEmail.toLowerCase() === configuredEmail) ||
      admins.find((a) => a.adminUid === PRIMARY_ADMIN_DOC_ID) ||
      null
    );
  },

  getCurrentDeviceId: (): string | null => {
    const cred = storage.getDeviceCredential();
    return cred?.deviceId || null;
  },

  getCurrentDeviceLabel: (): string => {
    const cred = storage.getDeviceCredential();
    return cred?.deviceLabel || detectDeviceLabel();
  },

  getAdminDevices: (): AdminDevice[] => {
    return storage.getAdminDevices();
  },

  /**
   * Returns the AdminDevice record if and only if the current browser/device
   * has a valid local cryptographic credential matching a TRUSTED AdminDevice record.
   */
  getTrustedDeviceRecordForCurrentDevice: (): AdminDevice | null => {
    const cred = storage.getDeviceCredential();
    if (!cred || !cred.deviceId || !cred.deviceToken) {
      return null;
    }
    const expectedHash = computeDeviceCredentialHash(cred.deviceId, cred.deviceToken);
    const devices = storage.getAdminDevices();
    const match = devices.find((d) => d.deviceId === cred.deviceId);
    if (!match) return null;
    if (match.status !== 'TRUSTED') return null;
    if (match.credentialHash !== expectedHash) return null;
    return match;
  },

  /**
   * Checks whether this device is already registered as a TRUSTED ADMIN DEVICE
   * and an Admin PIN has been configured.
   */
  isCurrentDeviceTrusted: (): boolean => {
    const adminRecord = adminService.getAdminRecord();
    if (!adminRecord || !adminRecord.pinConfigured || !adminRecord.pinHash) {
      return false;
    }
    const trustedDevice = adminService.getTrustedDeviceRecordForCurrentDevice();
    return trustedDevice !== null;
  },

  /**
   * Registers the current device as a TRUSTED ADMIN DEVICE in local storage and Firestore.
   */
  registerCurrentDeviceAsTrusted: async (adminUid: string): Promise<AdminDevice> => {
    const cred = getOrCreateLocalDeviceCredential();
    const credentialHash = computeDeviceCredentialHash(cred.deviceId, cred.deviceToken);
    const now = new Date().toISOString();
    const existingDevices = storage.getAdminDevices();
    const existing = existingDevices.find((d) => d.deviceId === cred.deviceId);

    const deviceRecord: AdminDevice = {
      deviceId: cred.deviceId,
      adminUid: adminUid || PRIMARY_ADMIN_DOC_ID,
      deviceLabel: existing?.deviceLabel || cred.deviceLabel,
      credentialHash,
      status: 'TRUSTED',
      createdAt: existing?.createdAt || cred.createdAt || now,
      lastUsedAt: now,
    };

    const updatedDevices = [
      deviceRecord,
      ...existingDevices.filter((d) => d.deviceId !== cred.deviceId),
    ];
    storage.saveAdminDevices(updatedDevices);
    await persistAdminDeviceToFirestore(deviceRecord, OperationType.WRITE);
    return deviceRecord;
  },

  getActiveAdminSession: (): ActiveAdminSession | null => {
    const session = storage.getActiveAdminSession();
    if (!session || !session.pinVerified || !session.deviceId) {
      return null;
    }
    // Verify that the session's device has not been revoked
    const devices = storage.getAdminDevices();
    const deviceRecord = devices.find((d) => d.deviceId === session.deviceId);
    if (deviceRecord && deviceRecord.status !== 'TRUSTED') {
      storage.setActiveAdminSession(null);
      return null;
    }
    return session;
  },

  subscribeToAdminAndSettings: (onUpdate: () => void): (() => void) => {
    const adminsQuery = query(
      collection(db, 'admins'),
      where('pinConfigured', 'in', [true, false])
    );
    const unsubAdmins = onSnapshot(
      adminsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remoteAdmins: AdminAccount[] = [];
        const remoteIds = new Set<string>();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as AdminAccount;
          if (data && data.adminUid) {
            remoteAdmins.push(data);
            remoteIds.add(data.adminUid);
          }
        });
        const localAdmins = storage.getAdmins();
        if (!snapshot.metadata.fromCache) {
          for (const localA of localAdmins) {
            if (!remoteIds.has(localA.adminUid)) {
              void persistAdminToFirestore(localA, OperationType.WRITE);
              remoteAdmins.push(localA);
              remoteIds.add(localA.adminUid);
            }
          }
        }
        if (remoteAdmins.length > 0) {
          storage.saveAdmins(remoteAdmins);
        }
        onUpdate();
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'admins');
      }
    );

    const devicesQuery = query(
      collection(db, 'adminDevices'),
      where('status', 'in', ['TRUSTED', 'PENDING_APPROVAL', 'REVOKED'])
    );
    const unsubDevices = onSnapshot(
      devicesQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remoteDevices: AdminDevice[] = [];
        const remoteIds = new Set<string>();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as AdminDevice;
          if (data && data.deviceId) {
            remoteDevices.push(data);
            remoteIds.add(data.deviceId);
          }
        });

        const localDevices = storage.getAdminDevices();
        if (!snapshot.metadata.fromCache) {
          for (const localD of localDevices) {
            if (!remoteIds.has(localD.deviceId)) {
              void persistAdminDeviceToFirestore(localD, OperationType.WRITE);
              remoteDevices.push(localD);
              remoteIds.add(localD.deviceId);
            }
          }
        } else {
          for (const localD of localDevices) {
            if (!remoteIds.has(localD.deviceId)) {
              remoteDevices.push(localD);
              remoteIds.add(localD.deviceId);
            }
          }
        }

        remoteDevices.sort(
          (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime()
        );
        storage.saveAdminDevices(remoteDevices);

        // If the active session's device was revoked, terminate the active session immediately
        const activeSession = storage.getActiveAdminSession();
        if (activeSession) {
          const matched = remoteDevices.find((d) => d.deviceId === activeSession.deviceId);
          if (matched && matched.status !== 'TRUSTED') {
            storage.setActiveAdminSession(null);
          }
        }

        onUpdate();
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'adminDevices');
      }
    );

    const settingsQuery = query(
      collection(db, 'settings'),
      where('MIN_BOOKING_AMOUNT_PER_UNIT', '>=', 1)
    );
    const unsubSettings = onSnapshot(
      settingsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        snapshot.forEach((docSnap) => {
          if (docSnap.id === PLATFORM_SETTINGS_DOC_ID) {
            const data = docSnap.data() as PlatformConfig;
            if (data && data.ADMIN_UPI_ID) {
              appConfig.setLocalConfig(data);
            }
          }
        });
        onUpdate();
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'settings');
      }
    );

    return () => {
      unsubAdmins();
      unsubDevices();
      unsubSettings();
    };
  },

  /**
   * Step 1 of First-Time / New-Device Admin Login:
   * Sign in with Google via Firebase Authentication and strictly verify that
   * the Google account email matches ADMIN_EMAIL.
   * Never exposes ADMIN_EMAIL in the UI or error messages.
   */
  signInWithGoogleForAdmin: async (): Promise<{
    uid: string;
    email: string;
    hasPinConfigured: boolean;
  }> => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    const result = await signInWithPopup(auth, provider);
    const userEmail = result.user.email?.trim().toLowerCase() || '';
    const allowedEmail = appConfig.getAdminEmail();

    if (!result.user.emailVerified || userEmail !== allowedEmail) {
      await signOut(auth);
      throw new Error(UNAUTHORIZED_ADMIN_MESSAGE);
    }

    const existing = adminService.getAdminRecord();
    const hasPinConfigured = Boolean(existing && existing.pinConfigured && existing.pinHash);

    return {
      uid: PRIMARY_ADMIN_DOC_ID,
      email: userEmail,
      hasPinConfigured,
    };
  },

  /**
   * First-Time Admin Setup on a New Device:
   * - Requires active Google authentication matching ADMIN_EMAIL
   * - Creates encrypted Admin PIN
   * - Registers this device as a TRUSTED ADMIN DEVICE in Firestore
   * - Opens Admin Dashboard
   */
  createAdminPin: async (params: {
    uid: string;
    email: string;
    pin: string;
    confirmPin: string;
  }): Promise<ActiveAdminSession> => {
    const authedEmail = auth.currentUser?.email?.trim().toLowerCase() || '';
    const cleanEmail = params.email.trim().toLowerCase();

    if (
      !auth.currentUser ||
      !auth.currentUser.emailVerified ||
      authedEmail !== cleanEmail ||
      !adminService.isAuthorizedEmail(cleanEmail)
    ) {
      throw new Error(UNAUTHORIZED_ADMIN_MESSAGE);
    }

    const cleanPin = params.pin.trim();
    const cleanConfirm = params.confirmPin.trim();
    if (!/^\d{4,6}$/.test(cleanPin)) {
      throw new Error('Admin PIN must be 4 to 6 digits.');
    }
    if (cleanPin !== cleanConfirm) {
      throw new Error('Admin PIN and Confirm PIN do not match.');
    }

    const pinHash = hashPinSync(cleanPin, appConfig.getAdminEmail());
    const now = new Date().toISOString();
    const existingAdmin = adminService.getAdminRecord();

    const adminAccount: AdminAccount = {
      adminUid: PRIMARY_ADMIN_DOC_ID,
      authorizedEmail: cleanEmail,
      pinConfigured: true,
      pinHash,
      createdAt: existingAdmin?.createdAt || now,
      updatedAt: now,
    };

    const admins = storage
      .getAdmins()
      .filter((a) => a.adminUid !== PRIMARY_ADMIN_DOC_ID && a.authorizedEmail !== cleanEmail);
    storage.saveAdmins([adminAccount, ...admins]);
    await persistAdminToFirestore(adminAccount, OperationType.WRITE);

    // Register this device as a TRUSTED ADMIN DEVICE
    const trustedDevice = await adminService.registerCurrentDeviceAsTrusted(
      PRIMARY_ADMIN_DOC_ID
    );

    const session: ActiveAdminSession = {
      adminUid: PRIMARY_ADMIN_DOC_ID,
      deviceId: trustedDevice.deviceId,
      pinVerified: true,
      authenticatedAt: now,
    };
    storage.setActiveAdminSession(session);
    return session;
  },

  /**
   * Authorizing a New Device when Admin PIN is already configured:
   * - Requires active Google authentication matching ADMIN_EMAIL
   * - Verifies entered Admin PIN against stored hashed PIN
   * - Registers this device as a TRUSTED ADMIN DEVICE
   */
  authorizeNewDeviceWithPin: async (params: {
    email: string;
    pin: string;
  }): Promise<ActiveAdminSession> => {
    const authedEmail = auth.currentUser?.email?.trim().toLowerCase() || '';
    const cleanEmail = params.email.trim().toLowerCase();

    if (
      !auth.currentUser ||
      !auth.currentUser.emailVerified ||
      authedEmail !== cleanEmail ||
      !adminService.isAuthorizedEmail(cleanEmail)
    ) {
      throw new Error(UNAUTHORIZED_ADMIN_MESSAGE);
    }

    const record = adminService.getAdminRecord();
    if (!record || !record.pinConfigured || !record.pinHash) {
      throw new Error('Admin PIN has not been configured yet. Please create your Admin PIN.');
    }

    const cleanPin = params.pin.trim();
    const isValid =
      verifyPinSync(cleanPin, record.pinHash, appConfig.getAdminEmail()) ||
      verifyPinSync(cleanPin, record.pinHash, record.authorizedEmail);

    if (!isValid) {
      throw new Error('Incorrect Admin PIN.');
    }

    const trustedDevice = await adminService.registerCurrentDeviceAsTrusted(record.adminUid);
    const now = new Date().toISOString();

    const session: ActiveAdminSession = {
      adminUid: record.adminUid,
      deviceId: trustedDevice.deviceId,
      pinVerified: true,
      authenticatedAt: now,
    };
    storage.setActiveAdminSession(session);
    return session;
  },

  /**
   * Returning Login on the Same Trusted Device:
   * - Does NOT require Google Sign-In
   * - Verifies that the current device is a valid TRUSTED ADMIN DEVICE
   * - Verifies the entered Admin PIN against the stored hashed Admin PIN
   * - Updates `lastUsedAt` on the trusted device record
   */
  loginOnTrustedDeviceWithPin: async (pin: string): Promise<ActiveAdminSession> => {
    const trustedDevice = adminService.getTrustedDeviceRecordForCurrentDevice();
    if (!trustedDevice || trustedDevice.status !== 'TRUSTED') {
      throw new Error(
        'This device is not registered as a trusted Admin device. Please sign in with Google first.'
      );
    }

    const record = adminService.getAdminRecord();
    if (!record || !record.pinConfigured || !record.pinHash) {
      throw new Error('Admin PIN is not configured. Please sign in with Google to set up your PIN.');
    }

    const cleanPin = pin.trim();
    const isValid =
      verifyPinSync(cleanPin, record.pinHash, appConfig.getAdminEmail()) ||
      verifyPinSync(cleanPin, record.pinHash, record.authorizedEmail);

    if (!isValid) {
      throw new Error('Incorrect Admin PIN.');
    }

    const now = new Date().toISOString();
    const updatedDevice: AdminDevice = {
      ...trustedDevice,
      lastUsedAt: now,
    };

    const existingDevices = storage.getAdminDevices();
    storage.saveAdminDevices([
      updatedDevice,
      ...existingDevices.filter((d) => d.deviceId !== updatedDevice.deviceId),
    ]);
    void persistAdminDeviceToFirestore(updatedDevice, OperationType.UPDATE);

    const session: ActiveAdminSession = {
      adminUid: record.adminUid,
      deviceId: updatedDevice.deviceId,
      pinVerified: true,
      authenticatedAt: now,
    };
    storage.setActiveAdminSession(session);
    return session;
  },

  /**
   * Updates the status of a registered Admin Device (e.g., TRUSTED or REVOKED).
   */
  updateAdminDeviceStatus: async (
    deviceId: string,
    status: AdminDeviceStatus
  ): Promise<AdminDevice> => {
    const devices = storage.getAdminDevices();
    const idx = devices.findIndex((d) => d.deviceId === deviceId);
    if (idx === -1) {
      throw new Error('Device record not found.');
    }

    const updated: AdminDevice = {
      ...devices[idx],
      status,
      lastUsedAt: new Date().toISOString(),
    };
    devices[idx] = updated;
    storage.saveAdminDevices(devices);
    await persistAdminDeviceToFirestore(updated, OperationType.UPDATE);

    // If the Admin revoked the currently active device, clear the active session
    const activeSession = storage.getActiveAdminSession();
    if (activeSession && activeSession.deviceId === deviceId && status !== 'TRUSTED') {
      storage.setActiveAdminSession(null);
    }

    return updated;
  },

  /**
   * Updates centralized platform configuration in Firestore & local config.
   */
  savePlatformConfig: async (next: PlatformConfig): Promise<PlatformConfig> => {
    const cleanConfig: PlatformConfig = {
      ADMIN_EMAIL: next.ADMIN_EMAIL.trim().toLowerCase(),
      ADMIN_UPI_ID: next.ADMIN_UPI_ID.trim(),
      MIN_BOOKING_AMOUNT_PER_UNIT: Math.max(1, Math.round(next.MIN_BOOKING_AMOUNT_PER_UNIT)),
      SHOP_RADIUS_KM: Math.max(1, Math.round(next.SHOP_RADIUS_KM)),
      PICKUP_HOURS: Math.max(1, Math.round(next.PICKUP_HOURS)),
      updatedAt: new Date().toISOString(),
    };

    const updated = appConfig.setLocalConfig(cleanConfig);
    const path = `settings/${PLATFORM_SETTINGS_DOC_ID}`;
    try {
      await setDoc(doc(db, 'settings', PLATFORM_SETTINGS_DOC_ID), cleanConfig);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
    return updated;
  },

  /**
   * Logs out Admin and clears active Admin session while preserving trusted device registration
   * so returning logins on the same trusted device only require the Admin PIN.
   */
  logoutAdmin: async (): Promise<void> => {
    storage.setActiveAdminSession(null);
  },
};
