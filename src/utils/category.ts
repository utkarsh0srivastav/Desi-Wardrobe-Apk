import { PricePolicy, Shop, ShopCategory } from '../types/models';

export type CanonicalShopCategory = 'MEN' | 'WOMEN' | 'BOTH';
export type CustomerCategoryFilter = 'ALL' | 'MEN' | 'WOMEN' | 'BOTH';

/**
 * Customer-safe Shop representation that strips private Shopkeeper contact details
 * (such as Shopkeeper personal mobile number and Shopkeeper personal name).
 */
export type CustomerPublicShop = Omit<Shop, 'mobile' | 'shopkeeperName'>;

export function toCustomerPublicShop(shop: Shop): CustomerPublicShop {
  const { mobile: _mobile, shopkeeperName: _shopkeeperName, ...publicShop } = shop;
  return publicShop;
}

/**
 * Normalizes any legacy or current ShopCategory value into canonical 'MEN' | 'WOMEN' | 'BOTH'.
 */
export function normalizeShopCategory(category?: ShopCategory | string | null): CanonicalShopCategory {
  const raw = (category || '').trim().toUpperCase();
  if (raw === 'MEN' || raw === "MEN'S WEAR" || raw === 'MENS WEAR') {
    return 'MEN';
  }
  if (raw === 'WOMEN' || raw === "WOMEN'S WEAR" || raw === 'WOMENS WEAR') {
    return 'WOMEN';
  }
  return 'BOTH';
}

/**
 * Formats a shop category for display badges across Customer, Shopkeeper, and Admin screens.
 */
export function formatShopCategoryLabel(
  category?: ShopCategory | string | null,
  language: 'English' | 'Hindi' = 'English'
): string {
  const canonical = normalizeShopCategory(category);
  if (language === 'Hindi') {
    if (canonical === 'MEN') return 'पुरुष परिधान (MEN)';
    if (canonical === 'WOMEN') return 'महिला परिधान (WOMEN)';
    return 'पुरुष एवं महिला (BOTH)';
  }
  if (canonical === 'MEN') return "Men's Wear";
  if (canonical === 'WOMEN') return "Women's Wear";
  return 'Men & Women (Both)';
}

/**
 * Checks whether a shop's category matches the selected Customer category filter.
 * - 'ALL' matches all categories
 * - 'MEN' matches 'MEN' and 'BOTH'
 * - 'WOMEN' matches 'WOMEN' and 'BOTH'
 * - 'BOTH' matches 'BOTH'
 */
export function matchesCustomerCategoryFilter(
  shopCategory: ShopCategory | string | undefined,
  filter: CustomerCategoryFilter
): boolean {
  if (filter === 'ALL') return true;
  const canonical = normalizeShopCategory(shopCategory);
  if (filter === 'MEN') {
    return canonical === 'MEN' || canonical === 'BOTH';
  }
  if (filter === 'WOMEN') {
    return canonical === 'WOMEN' || canonical === 'BOTH';
  }
  if (filter === 'BOTH') {
    return canonical === 'BOTH';
  }
  return true;
}

export function formatPricePolicyLabel(
  policy?: PricePolicy | null,
  language: 'English' | 'Hindi' = 'English'
): string {
  const isBargaining =
    policy === 'BARGAINING_AVAILABLE' || policy === 'NEGOTIABLE';
  if (language === 'Hindi') {
    return isBargaining ? 'मोलभाव उपलब्ध (BARGAINING AVAILABLE)' : 'निश्चित मूल्य (FIXED PRICE)';
  }
  return isBargaining ? 'BARGAINING AVAILABLE' : 'FIXED PRICE';
}
