import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatLocalTime = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const parseServerDate = (dateStr: string) => {
  // Fix for iOS/Safari: "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ss"
  // This ensures consistent local time parsing across all devices.
  if (typeof dateStr === 'string' && dateStr.includes(' ') && !dateStr.includes('T')) {
    return new Date(dateStr.replace(' ', 'T'));
  }
  return new Date(dateStr);
};
