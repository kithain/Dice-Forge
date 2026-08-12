export interface WeaponCatalogItem {
  kind: 'weapon'; name: string; description: string; category: string; damage: string; range: string; hands: string; traits: string; price: string;
}

export interface ArmorCatalogItem {
  kind: 'armor'; name: string; description: string; category: string; armorPoints: number; mobility: string; stealth: string; traits: string; price: string;
}

export interface EquipmentCatalog { weapons: WeaponCatalogItem[]; armors: ArmorCatalogItem[] }

export type StoredEquipmentItem = string | Record<string, unknown>;
