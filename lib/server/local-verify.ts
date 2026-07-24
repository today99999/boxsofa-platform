type LocalVerifyEnvironment = {
  BOXSOFA_LOCAL_VERIFY?: string;
  BOXSOFA_LOCAL_VERIFY_NONCE?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
};

export function localVerifyNonce(environment: LocalVerifyEnvironment = process.env as unknown as LocalVerifyEnvironment) {
  const nonce = environment.BOXSOFA_LOCAL_VERIFY_NONCE?.trim();
  if (
    environment.BOXSOFA_LOCAL_VERIFY !== "1"
    || !nonce
    || environment.VERCEL
    || environment.VERCEL_ENV
  ) return null;
  return nonce;
}
