
export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export const safeParseNumber = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatCurrency4Decimals = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
};

export const formatPercent = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value / 100);
};

export const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getTodayStr = (): string => {
  return formatDateToYYYYMMDD(new Date());
};

export const createLocalDate = (dateStr: string): Date => {
  if (!dateStr) return new Date();
  const cleanDate = dateStr.split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length !== 3) return new Date(dateStr);
  const [year, month, day] = parts.map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  const date = createLocalDate(dateString);
  return new Intl.DateTimeFormat('pt-BR').format(date);
};

export const parseDate = (dateString: string): Date => {
  return new Date(dateString);
};

export const isWeekend = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6; // 0 = Domingo, 6 = Sábado
};

export const getNextBusinessDay = (date: Date): Date => {
  const d = new Date(date);
  while (isWeekend(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
};

export const addMonths = (date: Date, months: number): Date => {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  const originalDay = d.getDate();
  
  d.setMonth(targetMonth);
  
  if (d.getDate() !== originalDay) {
    d.setDate(0); 
  }
  return d;
};

export const calculateIndexReferenceMonth = (dateStr: string): number => {
  if (!dateStr) return 1;
  const cleanDate = dateStr.split('T')[0];
  const parts = cleanDate.split('-');
  if (parts.length < 2) return 1;
  const month = parseInt(parts[1], 10); // 1-12
  const refMonth = month - 2;
  return refMonth <= 0 ? refMonth + 12 : refMonth;
};
