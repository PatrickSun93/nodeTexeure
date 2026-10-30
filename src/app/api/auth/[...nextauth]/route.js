import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import http from 'http';
import { URL } from 'url';

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:6666').trim().replace(/\/$/, '');

const fetchBackend = async (url, options = {}) => {
  const path = `/${url.replace(/^\//, '')}`;
  const requestUrl = `${BACKEND_URL}${path}`;
  
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(requestUrl);
      const postData = options.body ? options.body : null;
      
      const requestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: options.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        }
      };

      const req = http.request(requestOptions, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const response = {
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            json: async () => {
              try {
                return JSON.parse(data);
              } catch (e) {
                throw new Error('Invalid JSON response');
              }
            }
          };
          resolve(response);
        });
      });

      req.on('error', (error) => {
        console.error(`[NextAuth] HTTP request failed:`, error);
        reject(error);
      });

      if (postData) {
        req.write(postData);
      }
      
      req.end();
    } catch (error) {
      console.error(`[NextAuth] Request setup failed:`, error);
      reject(error);
    }
  });
};

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// The backend merges the guest cart (keyed by the `sessionId` cookie) into the
// user's cart on login, but this login call is made server-side, so the
// browser's cookies don't come along. Forward that one cookie — and only when
// it has the shape the backend issues (16 random bytes, hex) — so the merge runs.
const GUEST_SESSION_RE = /^[0-9a-f]{32}$/;

const guestSessionCookie = (cookieHeader) => {
  if (typeof cookieHeader !== 'string') return null;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1 || part.slice(0, eq).trim() !== 'sessionId') continue;
    const value = part.slice(eq + 1).trim();
    return GUEST_SESSION_RE.test(value) ? `sessionId=${value}` : null;
  }
  return null;
};

// The backend rate-limits login per client IP. This call comes from the Next
// server, so without the browser's X-Forwarded-For every shopper would share the
// server's one bucket (5 logins / 15 min for the whole shop). Pass the header on
// as the storefront proxy does for /api/*; the backend only believes it when
// TRUST_PROXY says a proxy in front sets it (docs/DEPLOYMENT.md).
const forwardedFor = (headers) => {
  const value = headers?.['x-forwarded-for'];
  return typeof value === 'string' && value ? { 'X-Forwarded-For': value } : {};
};

// Read `exp` from the backend JWT (no verification needed: it's our own token,
// only used to schedule the refresh).
const accessTokenExpiry = (accessToken) => {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
    return payload.exp * 1000;
  } catch {
    return 0;
  }
};

async function refreshAccessToken(token) {
  try {
    const response = await fetchBackend('/api/users/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: token.refreshToken }),
    });
    const data = await response.json();
    if (!response.ok || data.status !== 'SUCCESS') throw new Error(data.message || 'refresh failed');
    const { accessToken } = data.keyValueTable;
    return { ...token, accessToken, accessTokenExpires: accessTokenExpiry(accessToken), error: undefined };
  } catch (error) {
    // Revoked or expired: drop the backend token so API calls 401 and the
    // pages send the user back to sign in, rather than half-working.
    console.warn('[NextAuth] Access token refresh failed:', error.message);
    return { ...token, accessToken: undefined, error: 'RefreshAccessTokenError' };
  }
}

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          console.log('[NextAuth] Missing credentials');
          return null;
        }

        try {
          // Make API call to backend login endpoint using fetchBackend helper
          const guestCookie = guestSessionCookie(req?.headers?.cookie);
          const response = await fetchBackend('/api/users/login', {
            method: 'POST',
            headers: {
              ...forwardedFor(req?.headers),
              ...(guestCookie && { Cookie: guestCookie }),
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password
            })
          });

          console.log(`[NextAuth] Backend response status: ${response.status}`);
          
          const data = await response.json();

          if (data.status == 'SUCCESS') {
            // Extract user data from successful response
            const { userId, email, accessToken, refreshToken, role, isAdmin } = data.keyValueTable;

            console.log('[NextAuth] Login successful, returning user object');
            return {
              id: userId.toString(),
              email: email,
              accessToken: accessToken,
              refreshToken: refreshToken,
              role: role,
              isAdmin: isAdmin
            };
          } else {
            // Login failed - extract error message from response
            const errorMessage = data.message || data.keyValueTable?.error || 'Invalid credentials';
            console.log('[NextAuth] Login failed:', errorMessage);
            throw new Error(errorMessage);
          }
        } catch (error) {
          console.error('[NextAuth] Error during authentication:', error);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpires = accessTokenExpiry(user.accessToken);
        token.role = user.role;
        token.isAdmin = user.isAdmin;
        return token;
      }
      // The backend access token is short-lived (24h) while the NextAuth session
      // lasts 30 days: renew it shortly before it expires.
      if (token.accessToken && Date.now() > (token.accessTokenExpires || 0) - REFRESH_MARGIN_MS) {
        return refreshAccessToken(token);
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.isAdmin = token.isAdmin;
      session.accessToken = token.accessToken;
      if (token.error) session.error = token.error;
      return session;
    }
  },
  pages: {
    signIn: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
});

export { handler as GET, handler as POST };