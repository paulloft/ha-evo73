import HttpException from './HttpException.js';

export function getIntParam(params: URLSearchParams, name: string): number | null {
  const value = params.get(name);
  if (value === null || value === '') {
    return null;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw HttpException(`Некорректный параметр ${name}`);
  }
  return number;
}
