export { cn } from "cn";

export type WithoutChildren<T> = T extends { children?: unknown }
  ? Omit<T, "children">
  : T;
export type WithElementRef<T, U = HTMLElement> = T & {
  ref?: U | null;
};
