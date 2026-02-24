import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// ASN.1 / DER helpers for PKCS#1 → PKCS#8 conversion
// ---------------------------------------------------------------------------

function buildTlv(tag: number, value: Uint8Array): Uint8Array {
	const len = value.length;
	let lengthBytes: Uint8Array;
	if (len < 128) {
		lengthBytes = new Uint8Array([len]);
	} else if (len < 256) {
		lengthBytes = new Uint8Array([0x81, len]);
	} else {
		lengthBytes = new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
	}
	const result = new Uint8Array(1 + lengthBytes.length + len);
	result[0] = tag;
	result.set(lengthBytes, 1);
	result.set(value, 1 + lengthBytes.length);
	return result;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((s, a) => s + a.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	for (const a of arrays) {
		out.set(a, offset);
		offset += a.length;
	}
	return out;
}

/**
 * Wrap a PKCS#1 RSA private key DER in a PKCS#8 envelope so that
 * Web Crypto's importKey('pkcs8') can consume it.
 */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
	// AlgorithmIdentifier: SEQUENCE { OID rsaEncryption, NULL }
	const algorithmIdentifier = new Uint8Array([
		0x30, 0x0d,
		0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
		0x05, 0x00
	]);
	const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
	const privateKeyOctet = buildTlv(0x04, pkcs1);       // OCTET STRING
	const inner = concatBytes(version, algorithmIdentifier, privateKeyOctet);
	return buildTlv(0x30, inner);                         // outer SEQUENCE
}

// ---------------------------------------------------------------------------
// JWT helpers (RS256 via Web Crypto — Cloudflare Workers compatible)
// ---------------------------------------------------------------------------

function b64url(data: Uint8Array): string {
	return btoa(Array.from(data, (b) => String.fromCharCode(b)).join(''))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}

/** Import a PEM private key (PKCS#1 or PKCS#8) for RS256 signing. */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
	// Cloudflare secrets may store newlines as literal '\n'
	const normalized = pem.replace(/\\n/g, '\n').trim();

	const isPkcs1 = normalized.includes('BEGIN RSA PRIVATE KEY');

	const b64 = normalized
		.replace(/-----BEGIN [A-Z ]+-----/g, '')
		.replace(/-----END [A-Z ]+-----/g, '')
		.replace(/\s/g, '');

	const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	const pkcs8Der = isPkcs1 ? pkcs1ToPkcs8(der) : der;

	return crypto.subtle.importKey(
		'pkcs8',
		pkcs8Der.buffer as ArrayBuffer,
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign']
	);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Generate a signed GitHub App JWT (valid for 10 minutes). */
export async function generateAppJWT(appId: string, privateKeyPem: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
	const payload = b64url(
		new TextEncoder().encode(
			JSON.stringify({
				iat: now - 60, // 60 s leeway for clock skew
				exp: now + 600, // 10 minutes
				iss: appId
			})
		)
	);

	const signingInput = `${header}.${payload}`;
	const key = await importPrivateKey(privateKeyPem);
	const rawSig = await crypto.subtle.sign(
		'RSASSA-PKCS1-v1_5',
		key,
		new TextEncoder().encode(signingInput)
	);

	return `${signingInput}.${b64url(new Uint8Array(rawSig))}`;
}

export interface InstallationTokenResult {
	token: string;
	permissions: Record<string, string>;
}

/**
 * Exchange a GitHub App JWT for a short-lived installation access token.
 *
 * When `permissions` are provided, the token is scoped to exactly those
 * permissions. If the GitHub App hasn't been granted those permissions,
 * GitHub returns 422 with a descriptive error instead of silently
 * issuing a weaker token that later fails with 403.
 */
export async function getInstallationToken(
	appId: string,
	privateKeyPem: string,
	installationId: number,
	options?: {
		permissions?: Record<string, string>;
		repositories?: string[];
	}
): Promise<InstallationTokenResult> {
	const jwt = await generateAppJWT(appId, privateKeyPem);

	const body: Record<string, unknown> = {};
	if (options?.permissions) body.permissions = options.permissions;
	if (options?.repositories) body.repositories = options.repositories;

	const res = await fetch(
		`https://api.github.com/app/installations/${installationId}/access_tokens`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
				'User-Agent': 'workflow-metrics'
			},
			body: JSON.stringify(body)
		}
	);

	if (!res.ok) {
		const err = (await res.json().catch(() => ({}))) as { message?: string };
		const status = res.status;
		const msg = err.message ?? 'Unknown error';

		if (status === 422 && msg.toLowerCase().includes('permission')) {
			throw new Error(
				`GitHub App is missing required permissions (${status}): ${msg}. ` +
					'Go to github.com → Settings → Developer settings → GitHub Apps → your app → Permissions & events, ' +
					'and ensure Contents is set to "Read & Write" and Pull requests is set to "Read & Write".'
			);
		}
		if (status === 404) {
			throw new Error(
				`GitHub App installation not found (${status}): ${msg}. ` +
					'The app may have been uninstalled. Go to Settings → Sync installations or reinstall the app.'
			);
		}
		throw new Error(`Failed to get GitHub App installation token (${status}): ${msg}`);
	}

	const data = (await res.json()) as {
		token: string;
		permissions: Record<string, string>;
		repository_selection?: string;
	};

	return { token: data.token, permissions: data.permissions ?? {} };
}

/** Fetch installation metadata (account login + type) via the App JWT. */
export async function fetchInstallationDetails(
	appId: string,
	privateKeyPem: string,
	installationId: number
): Promise<{ accountLogin: string; accountType: string }> {
	const jwt = await generateAppJWT(appId, privateKeyPem);

	const res = await fetch(`https://api.github.com/app/installations/${installationId}`, {
		headers: {
			Authorization: `Bearer ${jwt}`,
			Accept: 'application/vnd.github.v3+json',
			'User-Agent': 'workflow-metrics'
		}
	});

	if (!res.ok) {
		const err = (await res.json().catch(() => ({}))) as { message?: string };
		throw new Error(
			`Failed to fetch installation details (${res.status}): ${err.message ?? 'Unknown error'}`
		);
	}

	const data = (await res.json()) as { account: { login: string; type: string } };
	return { accountLogin: data.account.login, accountType: data.account.type };
}

/** Look up the GitHub App installation ID for a given repository owner (user or org). */
export async function getInstallationForOwner(
	supabase: SupabaseClient,
	userId: string,
	owner: string
): Promise<number | null> {
	const { data } = await supabase
		.from('github_app_installations')
		.select('installation_id')
		.eq('user_id', userId)
		.ilike('account_login', owner) // case-insensitive match
		.single();

	return data?.installation_id ?? null;
}
