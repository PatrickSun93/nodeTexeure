import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';
import http from 'node:http';
import https from 'node:https';

// Robust backend URL resolution with sanitization and safe fallback
const resolveBackendUrl = () => {
  const raw = (process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:6666').trim();
  try {
    // Will throw if invalid (e.g., bad port or malformed)
    const u = new URL(raw);
    // Use origin only (protocol + host + optional port), no path/query
    const origin = `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}`;
    return origin.endsWith('/') ? origin.slice(0, -1) : origin;
  } catch (e) {
    console.error('Invalid BACKEND URL from env; falling back to http://localhost:6666', e);
    return 'http://localhost:6666';
  }
};

const BACKEND_URL = resolveBackendUrl();

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        try {
          console.log(BACKEND_URL);
          console.log(credentials);
          const requestUrl = `/api/users/login`;
          console.log(requestUrl)
          const res = await fetchBackend(requestUrl, { 
            method: 'POST',
            body: JSON.stringify(credentials),
            headers: { 'Content-Type': 'application/json' }
          });

          const data = await res.json();
          console.log(data)
          if (res.ok && data.status === 'SUCCESS') {
            return {
              id: data.keyValueTable.userId,
              email: data.keyValueTable.email,
              accessToken: data.keyValueTable.accessToken,
              refreshToken: data.keyValueTable.refreshToken
            };
          }
          return null;
        } catch (error) {
          console.error('Authorization error:', error);
          return null;
        }
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }),
    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET
    })
  ],
  session: {
    strategy: 'jwt'
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        token.accessTokenExpiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      }

      // If token not expired, return it
      if (Date.now() < token.accessTokenExpiry) {
        return token;
      }

      // Refresh token
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: token.refreshToken }),
        });

        const data = await res.json();

        if (res.ok && data.status === 'SUCCESS') {
          token.accessToken = data.keyValueTable.accessToken;
          token.accessTokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
          return token;
        }

        return { ...token, error: 'RefreshAccessTokenError' };
      } catch (error) {
        console.error('Error refreshing access token', error);
        return { ...token, error: 'RefreshAccessTokenError' };
      }
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.email = token.email;
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    }
  },
  pages: {
    signIn: '/login'
  },
  secret: process.env.NEXTAUTH_SECRET
});

// helper function to make fetch requests to the backend
const fetchBackend = async (url, options = {}) => {
  const base = new URL(BACKEND_URL);
  const isHttps = base.protocol === 'https:';
  const transport = isHttps ? https : http;

  // Avoid IPv6 localhost resolution issues
  const hostname = base.hostname === 'localhost' ? '127.0.0.1' : base.hostname;
  const port = base.port ? parseInt(base.port, 10) : (isHttps ? 443 : 80);
  const path = url.startsWith('/') ? url : `/${url}`;

  const headers = { ...(options.headers || {}) };

  const requestOptions = {
    hostname,
    port,
    path,
    method: options.method || 'GET',
    headers
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const text = buffer.toString('utf8');

        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          url: `${base.origin}${path}`,
          json: async () => JSON.parse(text || 'null'),
          text: async () => text
        });
      });
    });

    req.on('error', (err) => reject(err));

    // Write request body if provided
    if (options.body) {
      const hasContentType =
        headers['content-type'] || headers['Content-Type'];

      if (typeof options.body === 'string') {
        if (!hasContentType) {
          req.setHeader('Content-Type', 'application/json');
        }
        req.write(options.body);
      } else {
        if (!hasContentType) {
          req.setHeader('Content-Type', 'application/json');
        }
        req.write(JSON.stringify(options.body));
      }
    }

    req.end();
  });
};

export { handler as GET, handler as POST };