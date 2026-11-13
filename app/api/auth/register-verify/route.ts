import {
  verifyRegistrationResponse,
  type AuthenticatorTransport,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import {
  addAuthenticator,
  consumeChallenge,
  createUserWithAuthenticator,
  findAuthenticatorByCredentialId,
  findUserByUsername,
  isUniqueConstraintError,
} from "@/lib/db";
import { credentialIdToJSON } from "@/lib/credential-id";
import {
  errorResponse,
  getWebAuthnConfig,
  normalizeUsername,
  readJsonObject,
} from "@/lib/http";
import { createSession, getSession, getSessionSecret } from "@/lib/auth";

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
    return errorResponse("Invalid passkey registration response.", 400);
  }

  if (!getSessionSecret()) {
    return errorResponse("Session server configuration is incomplete.", 500);
  }

  const session = await getSession();
  const existingUser = findUserByUsername(username);
  if (
    (existingUser && (!session || session.userId !== existingUser.id)) ||
    (!existingUser && session)
  ) {
    return errorResponse("Username already taken", 409);
  }

  let config: ReturnType<typeof getWebAuthnConfig>;
  try {
    config = getWebAuthnConfig();
  } catch {
    return errorResponse("WebAuthn server configuration is incomplete.", 500);
  }

  const expectedChallenge = consumeChallenge(username, "registration");
  if (!expectedChallenge) {
    return errorResponse("Registration challenge is missing or expired. Try again.", 400);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    });
  } catch {
    return errorResponse("Passkey registration could not be verified.", 401);
  }

  if (!verification.verified) {
    return errorResponse("Passkey registration could not be verified.", 401);
  }

  const credential = verification.registrationInfo.credential;
  const credentialId = credentialIdToJSON(credential.id);
  if (findAuthenticatorByCredentialId(credentialId)) {
    return errorResponse("This passkey is already registered.", 409);
  }

  const transports =
    (response as RegistrationResponseJSON).response.transports ?? [];

  try {
    const user = existingUser
      ? existingUser
      : createUserWithAuthenticator(
          username,
          credentialId,
          credential.publicKey,
          credential.counter ?? 0,
          transports as AuthenticatorTransport[],
        );

    if (existingUser) {
      addAuthenticator(
        existingUser.id,
        credentialId,
        credential.publicKey,
        credential.counter ?? 0,
        transports as AuthenticatorTransport[],
      );
    }

    await createSession(user);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return errorResponse("Username or passkey is already registered.", 409);
    }
    throw error;
  }

  return NextResponse.json({ success: true });
}
