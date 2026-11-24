/** Keep post-login navigation on this instance, including WHATWG URL edge cases. */
export function safeNext(value: string | undefined): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }
  return value;
}
