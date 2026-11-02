import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and resolves Tailwind conflicts (the shadcn/Blok helper). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
