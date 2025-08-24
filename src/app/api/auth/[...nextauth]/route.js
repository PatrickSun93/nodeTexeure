import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import http from 'http';
import { URL } from 'url';

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:6666').trim().replace(/\/$/, '');

const fetchBackend = async (url, options = {}) => {
  const path = `/${url.replace(/^\//, '')}`;
  const requestUrl = `${BACKEND_URL}${path}`;
  
  console.log(`[NextAuth] BACKEND_URL: "${BACKEND_URL}"`);
  console.log(`[NextAuth] path: "${path}"`);
  console.log(`[NextAuth] requestUrl: "${requestUrl}"`);
  console.log(`[NextAuth] Fetching: ${options.method || 'GET'} ${requestUrl}`);

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

const handler = NextAuth({
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        console.log('[NextAuth] Authorize function called with:', credentials);

        if (!credentials?.email || !credentials?.password) {
          console.log('[NextAuth] Missing credentials');
          return null;
        }

        try {
          // Make API call to backend login endpoint using fetchBackend helper
          const response = await fetchBackend('/api/users/login', {
            method: 'POST',
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password
            })
          });

          console.log(`[NextAuth] Backend response status: ${response.status}`);
          
          const data = await response.json();
          console.log('[NextAuth] Backend response data:', data);

          if (data.status == 'SUCCESS') {
            // Extract user data from successful response
            const { userId, email, accessToken, refreshToken } = data.keyValueTable;
            
            console.log('[NextAuth] Login successful, returning user object');
            return {
              id: userId.toString(),
              email: email,
              accessToken: accessToken,
              refreshToken: refreshToken
            };
          } else {
            // Login failed
            console.log('[NextAuth] Login failed:', data.message || 'Unknown error');
            return null;
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
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.accessToken = token.accessToken;
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