import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import FacebookProvider from 'next-auth/providers/facebook';

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
          const requestUrl = `${BACKEND_URL}/api/users/login`;
          console.log(requestUrl)
          const res = await fetch(requestUrl, { 
            method: 'POST',
            body: JSON.stringify(credentials),
            headers: { 'Content-Type': 'application/json' }
          });

          const data = await res.json();

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

export { handler as GET, handler as POST };