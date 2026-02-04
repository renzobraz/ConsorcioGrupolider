
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
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

export const formatDate = (dateString: string): string => {
  if (!dateString) return '-';
  const date = new Date(dateString);
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
