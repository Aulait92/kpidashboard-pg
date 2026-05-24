export const PRODUCTS = ["Wechsel", "Neugeschäft", "Kinderwunsch"] as const;
export type Product = (typeof PRODUCTS)[number];
