import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names, and lets the later Tailwind class win when two conflict. */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}
