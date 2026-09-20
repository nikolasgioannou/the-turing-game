export function simulatorKey(production: boolean, key: string | undefined): string | null {
  return production ? null : key?.trim() || null;
}

export function simulatorAuthorized(request: Request, key: string | null): boolean {
  return !!key && request.headers.get('x-sim-key') === key;
}
