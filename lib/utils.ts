import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// "1 project", "2 projects". Pass an explicit plural for irregular words.
export function pluralize(count: number, singular: string, plural = singular + "s") {
  return `${count} ${count === 1 ? singular : plural}`
}
