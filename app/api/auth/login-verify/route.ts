import {
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import {
  consumeChallenge,
  findAuthenticatorByCredentialId,
  findUserById,
  findUserByUsername,
  updateAuthenticatorCounter,
} from "@/lib/db";
import {
  credentialIdToJSON,
  normalizeCredentialId,
} from "@/lib/credential-id";
import { hasValidCounterProgression } from "@/lib/counter";
import {
  errorResponse,
  getWebAuthnConfig,
  normalizeUsername,
  readJsonObject,
} from "@/lib/http";
import { createSession, getSessionSecret } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  const username = normalizeUsername(body?.username);
  const response = body?.response;
  if (
    !username ||
    typeof response !== "object" ||
    response === null ||
    Array.isArray(response)
  ) {
    return errorResponse("Invalid passkey login response.", 400);
  }

  if (!getSessionSecret()) {
    return errorResponse("Session server configuration is incomplete.", 500);
  }

  const responseJson = response as AuthenticationResponseJSON;
  const credentialId = normalizeCredentialId(responseJson.id);
  if (!credentialId) {
    return errorResponse("Authenticator not recognized.", 401);
  }

  const authenticator = findAuthenticatorByCredentialId(credentialId);
  const user = findUserByUsername(username);
  if (!authenticator || !user || authenticator.user_id !== user.id) {
    return errorResponse("Authenticator not recognized.", 401);
  }

  let config: ReturnType<typeof getWebAuthnConfig>;
  try {
    config = getWebAuthnConfig();
  } catch {
    return errorResponse("WebAuthn server configuration is incomplete.", 500);
  }

  const expectedChallenge = consumeChallenge(username, "authentication");
  if (!expectedChallenge) {
    return errorResponse("Login challenge is missing or expired. Try again.", 401);
  }

  const currentCounter = authenticator.counter ?? 0;
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: responseJson,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      credential: {
        id: credentialIdToJSON(authenticator.credential_id),
        publicKey: Uint8Array.from(authenticator.credential_public_key),
        counter: currentCounter,
        transports: authenticator.transports,
      },
      requireUserVerification: true,
    });
  } catch {
    return errorResponse("Passkey login could not be verified.", 401);
  }

  const newCounter = verification.authenticationInfo?.newCounter ?? 0;
  if (
    !verification.verified ||
    !hasValidCounterProgression(authenticator.counter, newCounter)
  ) {
    return errorResponse("Passkey login could not be verified.", 401);
  }

  updateAuthenticatorCounter(authenticator.id, newCounter ?? 0);
  const sessionUser = findUserById(authenticator.user_id);
  if (!sessionUser) {
    return errorResponse("Authenticator not recognized.", 401);
  }

  await createSession(sessionUser);
  return NextResponse.json({ success: true });
}
