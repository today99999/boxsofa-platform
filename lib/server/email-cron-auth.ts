export function isAuthorizedCronRequest(request: Request, secret: string | undefined) {
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}
