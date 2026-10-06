import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import { Customer, CustomerStatus } from '../types/models';
import { hashPinSync, verifyPinSync } from '../utils/crypto';
import { storage } from '../utils/storage';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidCustomerEmail(rawEmail: string | undefined | null): boolean {
  if (!rawEmail) return false;
  const clean = rawEmail.trim().toLowerCase();
  return clean.length >= 5 && clean.length <= 150 && EMAIL_REGEX.test(clean);
}

function sanitizeCustomerForFirestore(customer: Customer): Customer {
  const cleanEmail = customer.email ? customer.email.trim().toLowerCase().slice(0, 150) : '';
  return {
    customerId: customer.customerId,
    name: customer.name.slice(0, 120),
    mobile: customer.mobile.slice(0, 15),
    ...(cleanEmail ? { email: cleanEmail } : {}),
    pin: customer.pin.slice(0, 128),
    approvalStatus: customer.approvalStatus || 'APPROVED',
    accountStatus: customer.accountStatus || 'ACTIVE',
    createdAt: customer.createdAt,
  };
}

export async function persistCustomerToFirestore(
  customer: Customer,
  op: OperationType
): Promise<void> {
  const path = `customers/${customer.customerId}`;
  try {
    const clean = sanitizeCustomerForFirestore(customer);
    await setDoc(doc(db, 'customers', customer.customerId), clean);
  } catch (error) {
    handleFirestoreError(error, op, path);
  }
}

async function fetchCustomerByMobileFromFirestore(cleanMobile: string): Promise<Customer | null> {
  try {
    const q = query(
      collection(db, 'customers'),
      where('mobile', '==', cleanMobile),
      where('accountStatus', 'in', ['PENDING', 'APPROVED', 'REJECTED', 'BLOCKED', 'ACTIVE'])
    );
    const snap = await getDocs(q);
    let found: Customer | null = null;
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Customer;
      if (data && data.customerId && data.mobile === cleanMobile) {
        found = {
          ...data,
          approvalStatus: data.approvalStatus || 'APPROVED',
          accountStatus: data.accountStatus || 'ACTIVE',
        };
      }
    });
    return found;
  } catch (error) {
    logFirestoreError(error, OperationType.GET, 'customers');
    return null;
  }
}

export const customerService = {
  /**
   * Returns the list of registered customers for the authorized Admin Dashboard.
   * Sorted by registration timestamp (createdAt) so S.No. 1, 2, 3... is deterministic.
   */
  getAllCustomers: (): Customer[] => {
    const activeAdmin = storage.getActiveAdminSession();
    if (!activeAdmin || !activeAdmin.pinVerified) {
      return [];
    }
    const list = [...storage.getCustomers()].filter(
      (c) => Boolean(c && c.customerId && c.name && c.mobile && c.createdAt)
    );
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return list;
  },

  getCurrentCustomer: (): Customer | null => {
    const activeId = storage.getActiveCustomerId();
    if (!activeId) return null;
    const customers = storage.getCustomers();
    const found = customers.find((c) => c.customerId === activeId) || null;
    if (found && (found.accountStatus === 'BLOCKED' || found.accountStatus === 'REJECTED')) {
      return null;
    }
    return found;
  },

  findCustomerByMobile: (rawMobile: string): Customer | undefined => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    return storage.getCustomers().find((c) => c.mobile === cleanMobile);
  },

  checkMobile: (rawMobile: string): { mobile: string; isReturningCustomer: boolean } => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    const existing = storage.getCustomers().find((c) => c.mobile === cleanMobile);
    return {
      mobile: cleanMobile,
      isReturningCustomer: Boolean(existing),
    };
  },

  /**
   * Subscribes ONLY to the currently authenticated customer's own profile document.
   * Never exposes or downloads other customers' records.
   */
  subscribeToCurrentCustomer: (
    customerId: string | null | undefined,
    onUpdate: (customer: Customer | null) => void
  ): (() => void) => {
    if (!customerId || !customerId.trim()) {
      onUpdate(null);
      return () => {};
    }
    const cleanId = customerId.trim();
    const docRef = doc(db, 'customers', cleanId);
    return onSnapshot(
      docRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          if (storage.getActiveCustomerId() === cleanId) {
            storage.setActiveCustomerId(null);
          }
          onUpdate(null);
          return;
        }
        const data = docSnap.data() as Customer;
        if (data.accountStatus === 'BLOCKED' || data.accountStatus === 'REJECTED') {
          if (storage.getActiveCustomerId() === cleanId) {
            storage.setActiveCustomerId(null);
          }
          onUpdate(null);
          return;
        }
        const normalized: Customer = {
          ...data,
          approvalStatus: data.approvalStatus || 'APPROVED',
          accountStatus: data.accountStatus || 'ACTIVE',
        };
        const existing = storage.getCustomers().filter((c) => c.customerId !== cleanId);
        storage.saveCustomers([normalized, ...existing]);
        onUpdate(normalized);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, `customers/${cleanId}`);
      }
    );
  },

  /**
   * Admin-only real-time listener for the Customer Register.
   * Strictly verifies active Admin session before subscribing to the customers collection.
   */
  subscribeToCustomers: (onUpdate: (customers: Customer[]) => void): (() => void) => {
    const activeAdmin = storage.getActiveAdminSession();
    if (!activeAdmin || !activeAdmin.pinVerified) {
      onUpdate([]);
      return () => {};
    }

    const customersQuery = query(
      collection(db, 'customers'),
      where('accountStatus', 'in', ['PENDING', 'APPROVED', 'REJECTED', 'BLOCKED', 'ACTIVE'])
    );
    return onSnapshot(
      customersQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const remoteCustomers: Customer[] = [];
        const remoteIds = new Set<string>();

        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Customer;
          if (data && data.customerId && data.mobile && data.name && data.createdAt) {
            const normalized: Customer = {
              ...data,
              approvalStatus: data.approvalStatus || 'APPROVED',
              accountStatus: data.accountStatus || 'ACTIVE',
            };
            remoteCustomers.push(normalized);
            remoteIds.add(normalized.customerId);
          }
        });

        remoteCustomers.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        storage.saveCustomers(remoteCustomers);
        const activeId = storage.getActiveCustomerId();
        if (activeId && !remoteIds.has(activeId) && !snapshot.metadata.fromCache) {
          storage.setActiveCustomerId(null);
        }
        onUpdate(remoteCustomers);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'customers');
      }
    );
  },

  /**
   * Registers a customer account in Firestore with an authoritative registration timestamp.
   */
  registerCustomerAsync: async (params: {
    name: string;
    mobile: string;
    email: string;
    pin: string;
    confirmPin: string;
  }): Promise<Customer> => {
    const cleanName = params.name.trim();
    const cleanMobile = params.mobile.replace(/\D/g, '');
    const cleanEmail = (params.email || '').trim().toLowerCase();
    const cleanPin = params.pin.trim();
    const cleanConfirmPin = params.confirmPin.trim();

    if (!cleanName) {
      throw new Error('Please enter your Full Name.');
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Mobile Number.');
    }
    if (!cleanEmail) {
      throw new Error('Please enter your Email ID.');
    }
    if (!isValidCustomerEmail(cleanEmail)) {
      throw new Error('Please enter a valid Email ID (e.g., name@example.com).');
    }
    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error('PIN must be a 4-digit number.');
    }
    if (cleanPin !== cleanConfirmPin) {
      throw new Error('Create PIN and Confirm PIN do not match.');
    }

    const hashedPin = hashPinSync(cleanPin, cleanMobile);

    // Check Firestore for an existing customer with this mobile number
    const remoteExisting = await fetchCustomerByMobileFromFirestore(cleanMobile);
    const localCustomers = storage.getCustomers();
    const existing = remoteExisting || localCustomers.find((c) => c.mobile === cleanMobile);

    if (existing) {
      if (existing.accountStatus === 'BLOCKED') {
        throw new Error('This customer account has been blocked by Admin.');
      }
      if (existing.accountStatus === 'REJECTED') {
        throw new Error('This customer account was rejected by Admin.');
      }
      throw new Error(
        'An account with this mobile number already exists. Please select Returning Customer to login with your PIN.'
      );
    }

    const registrationTimestamp = new Date().toISOString();
    const newCustomer: Customer = {
      customerId: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      mobile: cleanMobile,
      email: cleanEmail,
      pin: hashedPin,
      approvalStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      createdAt: registrationTimestamp,
    };

    const otherCustomers = localCustomers.filter((c) => c.customerId !== newCustomer.customerId);
    storage.saveCustomers([newCustomer, ...otherCustomers]);
    storage.setActiveCustomerId(newCustomer.customerId);
    await persistCustomerToFirestore(newCustomer, OperationType.CREATE);
    return newCustomer;
  },

  /**
   * Synchronous wrapper for legacy callers.
   */
  registerCustomer: (params: {
    name: string;
    mobile: string;
    email: string;
    pin: string;
    confirmPin: string;
  }): Customer => {
    const cleanName = params.name.trim();
    const cleanMobile = params.mobile.replace(/\D/g, '');
    const cleanEmail = (params.email || '').trim().toLowerCase();
    const cleanPin = params.pin.trim();
    const cleanConfirmPin = params.confirmPin.trim();

    if (!cleanName) {
      throw new Error('Please enter your Full Name.');
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Mobile Number.');
    }
    if (!cleanEmail) {
      throw new Error('Please enter your Email ID.');
    }
    if (!isValidCustomerEmail(cleanEmail)) {
      throw new Error('Please enter a valid Email ID (e.g., name@example.com).');
    }
    if (!/^\d{4}$/.test(cleanPin)) {
      throw new Error('PIN must be a 4-digit number.');
    }
    if (cleanPin !== cleanConfirmPin) {
      throw new Error('Create PIN and Confirm PIN do not match.');
    }

    const hashedPin = hashPinSync(cleanPin, cleanMobile);
    const customers = storage.getCustomers();
    const existing = customers.find((c) => c.mobile === cleanMobile);

    if (existing) {
      if (existing.accountStatus === 'BLOCKED') {
        throw new Error('This customer account has been blocked by Admin.');
      }
      if (existing.accountStatus === 'REJECTED') {
        throw new Error('This customer account was rejected by Admin.');
      }
      throw new Error(
        'An account with this mobile number already exists. Please select Returning Customer to login with your PIN.'
      );
    }

    const newCustomer: Customer = {
      customerId: `cust-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      mobile: cleanMobile,
      email: cleanEmail,
      pin: hashedPin,
      approvalStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    storage.saveCustomers([newCustomer, ...customers]);
    storage.setActiveCustomerId(newCustomer.customerId);
    void persistCustomerToFirestore(newCustomer, OperationType.CREATE);
    return newCustomer;
  },

  /**
   * Authenticates a returning Customer by querying only their mobile record in Firestore and verifying their 4-digit PIN.
   */
  loginCustomerAsync: async (rawMobile: string, pin: string): Promise<Customer> => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Mobile Number.');
    }

    const remoteCustomer = await fetchCustomerByMobileFromFirestore(cleanMobile);
    const localCustomers = storage.getCustomers();
    const customer = remoteCustomer || localCustomers.find((c) => c.mobile === cleanMobile);

    if (!customer) {
      throw new Error(
        'No customer account found with this number. Please select First-Time Customer.'
      );
    }

    if (customer.accountStatus === 'BLOCKED') {
      throw new Error('Your customer account has been blocked by Admin.');
    }
    if (customer.accountStatus === 'REJECTED') {
      throw new Error('Your customer account was rejected by Admin.');
    }

    if (!verifyPinSync(pin, customer.pin, cleanMobile)) {
      throw new Error('Incorrect PIN. Please enter your 4-digit PIN.');
    }

    // Clear any previous customer's bookings before activating the new customer session
    storage.saveBookings([]);
    const others = localCustomers.filter((c) => c.customerId !== customer.customerId);
    storage.saveCustomers([customer, ...others]);
    storage.setActiveCustomerId(customer.customerId);
    return customer;
  },

  loginCustomer: (rawMobile: string, pin: string): Customer => {
    const cleanMobile = rawMobile.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Mobile Number.');
    }
    const customers = storage.getCustomers();
    const index = customers.findIndex((c) => c.mobile === cleanMobile);

    if (index === -1) {
      throw new Error(
        'No customer account found with this number. Please select First-Time Customer.'
      );
    }

    const customer = customers[index];
    if (customer.accountStatus === 'BLOCKED') {
      throw new Error('Your customer account has been blocked by Admin.');
    }
    if (customer.accountStatus === 'REJECTED') {
      throw new Error('Your customer account was rejected by Admin.');
    }

    if (!verifyPinSync(pin, customer.pin, cleanMobile)) {
      throw new Error('Incorrect PIN. Please enter your 4-digit PIN.');
    }

    storage.saveBookings([]);
    storage.setActiveCustomerId(customer.customerId);
    return customer;
  },

  updateCustomerStatusByAdmin: async (
    customerId: string,
    nextStatus: CustomerStatus
  ): Promise<Customer> => {
    const activeAdmin = storage.getActiveAdminSession();
    if (!activeAdmin || !activeAdmin.pinVerified) {
      throw new Error('Access denied. Only the authorized Admin can update customer status.');
    }

    const customers = storage.getCustomers();
    const idx = customers.findIndex((c) => c.customerId === customerId);
    if (idx === -1) {
      throw new Error('Customer not found.');
    }

    const updated: Customer = {
      ...customers[idx],
      approvalStatus:
        nextStatus === 'APPROVED' || nextStatus === 'ACTIVE'
          ? 'APPROVED'
          : nextStatus === 'REJECTED'
            ? 'REJECTED'
            : customers[idx].approvalStatus,
      accountStatus: nextStatus,
    };

    customers[idx] = updated;
    storage.saveCustomers(customers);
    await persistCustomerToFirestore(updated, OperationType.UPDATE);
    return updated;
  },

  /**
   * Logs out the Customer and immediately clears cached customer orders and session state
   * so no private order details remain visible after logout.
   */
  logoutCustomer: (): void => {
    storage.setActiveCustomerId(null);
    const activeAdmin = storage.getActiveAdminSession();
    const activeShopkeeper = storage.getActiveShopkeeperId();
    if (!activeAdmin && !activeShopkeeper) {
      storage.saveBookings([]);
      storage.saveCustomers([]);
    }
  },
};
