import {
  generateRegistrationOptions,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { NextRequest, NextResponse } from "next/server";
import {
  findAuthenticatorsByUserId,
  findUserByUsername,
  saveChallenge,
} from "@/lib/db";
import { credentialIdToJSON } from "@/lib/credential-id";
import {
  errorResponse,
  getWebAuthnConfig,
  normalizeUsername,
  readJsonObject,
} from "@/lib/http";
import { getSession, getSessionSecret } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  const username = normalizeUsername(body?.username);
  if (!username) {
    return errorResponse("Enter a username using 3–32 letters, numbers, dots, underscores, or hyphens.", 400);
  }

  if (!getSessionSecret()) {
    return errorResponse("Session server configuration is incomplete.", 500);
  }

  const session = await getSession();
  const user = findUserByUsername(username);

  if (session && session.username !== username) {
    return errorResponse("You can only add a passkey to your signed-in account.", 403);
  }
  if (user && (!session || session.userId !== user.id)) {
    return errorResponse("Username already taken", 409);
  }

  let config: ReturnType<typeof getWebAuthnConfig>;
  try {
    config = getWebAuthnConfig();
  } catch {
    return errorResponse("WebAuthn server configuration is incomplete.", 500);
  }

  const existingAuthenticators = user ? findAuthenticatorsByUserId(user.id) : [];
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: Buffer.from(username, "utf8"),
    userName: username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
    },
    excludeCredentials: existingAuthenticators.map((authenticator) => ({
      id: credentialIdToJSON(authenticator.credential_id),
      transports: authenticator.transports as AuthenticatorTransport[],
    })),
  });

  saveChallenge(username, "registration", options.challenge);
  return NextResponse.json(options);
}
