export default function HttpException(message, status = 400) {
  return new Error(message, { cause: { status } });
}