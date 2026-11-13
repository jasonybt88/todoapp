import { generateAuthenticationOptions } from "@simplewebauthn/server";
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
import { getSessionSecret } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await readJsonObject(request);
  const username = normalizeUsername(body?.username);
  if (!username) {
    return errorResponse("Enter a valid username.", 400);
  }

  if (!getSessionSecret()) {
    return errorResponse("Session server configuration is incomplete.", 500);
  }

  const user = findUserByUsername(username);
  const authenticators = user ? findAuthenticatorsByUserId(user.id) : [];
  if (!user || authenticators.length === 0) {
    return errorResponse("No passkey found for that username.", 404);
  }

  let config: ReturnType<typeof getWebAuthnConfig>;
  try {
    config = getWebAuthnConfig();
  } catch {
    return errorResponse("WebAuthn server configuration is incomplete.", 500);
  }

  const options = await generateAuthenticationOptions({
    rpID: config.rpId,
    allowCredentials: authenticators.map((authenticator) => ({
      id: credentialIdToJSON(authenticator.credential_id),
      transports: authenticator.transports,
    })),
    userVerification: "required",
  });

  saveChallenge(username, "authentication", options.challenge);
  return NextResponse.json(options);
}
