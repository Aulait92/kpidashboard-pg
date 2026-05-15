export const PRODUCTS = ["Wechsel", "Neugeschäft"] as const;
export type Product = (typeof PRODUCTS)[number];
