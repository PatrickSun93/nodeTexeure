/**
 * SSL/TLS Configuration Utility
 * Provides secure HTTPS configuration for PCI compliance
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('./logger');

class SSLConfig {
  constructor() {
    this.sslOptions = null;
    this.isProduction = process.env.NODE_ENV === 'production';
    this.sslEnabled = process.env.SSL_ENABLED === 'true';
  }

  /**
   * Load SSL certificates from files
   * @returns {Object|null} SSL options for HTTPS server
   */
  loadSSLCertificates() {
    try {
      if (!this.sslEnabled) {
        logger.info('SSL disabled in configuration');
        return null;
      }

      const certPath = process.env.SSL_CERT_PATH;
      const keyPath = process.env.SSL_KEY_PATH;
      const caPath = process.env.SSL_CA_PATH; // Optional CA bundle

      if (!certPath || !keyPath) {
        logger.warn('SSL certificate paths not configured', {
          certPath: certPath ? 'configured' : 'missing',
          keyPath: keyPath ? 'configured' : 'missing'
        });
        return null;
      }

      // Check if certificate files exist
      if (!fs.existsSync(certPath)) {
        throw new Error(`SSL certificate file not found: ${certPath}`);
      }

      if (!fs.existsSync(keyPath)) {
        throw new Error(`SSL private key file not found: ${keyPath}`);
      }

      // Load certificate files
      const cert = fs.readFileSync(certPath, 'utf8');
      const key = fs.readFileSync(keyPath, 'utf8');
      
      this.sslOptions = {
        cert,
        key,
        // Security configurations
        secureProtocol: 'TLSv1_2_method', // Minimum TLS 1.2
        ciphers: this.getSecureCipherSuite(),
        honorCipherOrder: true,
        secureOptions: this.getSecureOptions()
      };

      // Add CA bundle if provided
      if (caPath && fs.existsSync(caPath)) {
        this.sslOptions.ca = fs.readFileSync(caPath, 'utf8');
        logger.info('SSL CA bundle loaded');
      }

      logger.info('SSL certificates loaded successfully', {
        certPath: this.maskPath(certPath),
        keyPath: this.maskPath(keyPath),
        caPath: caPath ? this.maskPath(caPath) : 'not configured'
      });

      return this.sslOptions;
    } catch (error) {
      logger.error('Failed to load SSL certificates', { error: error.message });
      
      if (this.isProduction) {
        throw error; // Fail hard in production
      }
      
      return null; // Allow fallback to HTTP in development
    }
  }

  /**
   * Get secure cipher suite for PCI compliance
   * @returns {string} Cipher suite string
   */
  getSecureCipherSuite() {
    // PCI DSS compliant cipher suites (TLS 1.2+)
    return [
      'ECDHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES128-GCM-SHA256',
      'ECDHE-RSA-AES256-SHA384',
      'ECDHE-RSA-AES128-SHA256',
      'ECDHE-RSA-AES256-SHA',
      'ECDHE-RSA-AES128-SHA',
      'DHE-RSA-AES256-GCM-SHA384',
      'DHE-RSA-AES128-GCM-SHA256',
      'DHE-RSA-AES256-SHA256',
      'DHE-RSA-AES128-SHA256',
      'DHE-RSA-AES256-SHA',
      'DHE-RSA-AES128-SHA',
      'AES256-GCM-SHA384',
      'AES128-GCM-SHA256',
      'AES256-SHA256',
      'AES128-SHA256',
      'AES256-SHA',
      'AES128-SHA'
    ].join(':');
  }

  /**
   * Get secure SSL options
   * @returns {number} SSL options bitmask
   */
  getSecureOptions() {
    const constants = require('constants');
    
    return (
      constants.SSL_OP_NO_SSLv2 |
      constants.SSL_OP_NO_SSLv3 |
      constants.SSL_OP_NO_TLSv1 |
      constants.SSL_OP_NO_TLSv1_1 |
      constants.SSL_OP_CIPHER_SERVER_PREFERENCE |
      constants.SSL_OP_NO_COMPRESSION
    );
  }

  /**
   * Create HTTPS server with secure configuration
   * @param {Object} app - Express application
   * @param {number} port - Port to listen on
   * @returns {Object} HTTPS server instance
   */
  createSecureServer(app, port = 443) {
    const sslOptions = this.loadSSLCertificates();
    
    if (!sslOptions) {
      throw new Error('SSL certificates not available for secure server');
    }

    const server = https.createServer(sslOptions, app);
    
    // Configure server security settings
    server.on('secureConnection', (tlsSocket) => {
      logger.info('Secure connection established', {
        protocol: tlsSocket.getProtocol(),
        cipher: tlsSocket.getCipher(),
        authorized: tlsSocket.authorized,
        peerCertificate: tlsSocket.getPeerCertificate() ? 'present' : 'none'
      });
    });

    server.on('tlsClientError', (err, tlsSocket) => {
      logger.warn('TLS client error', {
        error: err.message,
        code: err.code,
        address: tlsSocket?.remoteAddress
      });
    });

    return server;
  }

  /**
   * Generate self-signed certificate for development
   * @param {string} certDir - Directory to save certificates
   * @returns {Object} Generated certificate paths
   */
  generateSelfSignedCert(certDir = './ssl') {
    try {
      const { execSync } = require('child_process');
      
      // Create SSL directory if it doesn't exist
      if (!fs.existsSync(certDir)) {
        fs.mkdirSync(certDir, { recursive: true });
      }

      const keyPath = path.join(certDir, 'server.key');
      const certPath = path.join(certDir, 'server.crt');

      // Generate private key
      execSync(`openssl genrsa -out ${keyPath} 2048`, { stdio: 'pipe' });
      
      // Generate self-signed certificate
      const opensslCmd = [
        'openssl req -new -x509',
        `-key ${keyPath}`,
        `-out ${certPath}`,
        '-days 365',
        '-subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"'
      ].join(' ');
      
      execSync(opensslCmd, { stdio: 'pipe' });

      logger.info('Self-signed SSL certificate generated', {
        keyPath: this.maskPath(keyPath),
        certPath: this.maskPath(certPath),
        validDays: 365
      });

      return { keyPath, certPath };
    } catch (error) {
      logger.error('Failed to generate self-signed certificate', { 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Validate SSL certificate
   * @param {string} certPath - Path to certificate file
   * @returns {Object} Certificate validation result
   */
  validateCertificate(certPath) {
    try {
      if (!fs.existsSync(certPath)) {
        return { valid: false, error: 'Certificate file not found' };
      }

      const cert = fs.readFileSync(certPath, 'utf8');
      const { execSync } = require('child_process');
      
      // Use OpenSSL to validate certificate
      const result = execSync(`echo "${cert}" | openssl x509 -noout -text`, { 
        encoding: 'utf8',
        stdio: 'pipe'
      });

      // Extract certificate information
      const notBefore = result.match(/Not Before: (.+)/)?.[1];
      const notAfter = result.match(/Not After : (.+)/)?.[1];
      const subject = result.match(/Subject: (.+)/)?.[1];
      const issuer = result.match(/Issuer: (.+)/)?.[1];

      const expiryDate = new Date(notAfter);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

      return {
        valid: true,
        subject,
        issuer,
        notBefore,
        notAfter,
        daysUntilExpiry,
        isExpired: expiryDate < now,
        isSelfSigned: subject === issuer
      };
    } catch (error) {
      return { 
        valid: false, 
        error: error.message 
      };
    }
  }

  /**
   * Get SSL configuration recommendations
   * @returns {Object} Configuration recommendations
   */
  getSSLRecommendations() {
    return {
      production: {
        minTlsVersion: '1.2',
        recommendedTlsVersion: '1.3',
        certificateType: 'CA-signed certificate (not self-signed)',
        keySize: 'Minimum 2048-bit RSA or 256-bit ECC',
        certificateAuthority: 'Trusted CA (Let\'s Encrypt, DigiCert, etc.)',
        renewalPeriod: '90 days or less',
        hsts: 'Enable HTTP Strict Transport Security',
        ocspStapling: 'Enable OCSP stapling for better performance'
      },
      development: {
        certificateType: 'Self-signed certificate acceptable',
        keySize: '2048-bit RSA minimum',
        validity: '365 days maximum',
        commonName: 'localhost or development domain'
      },
      pciCompliance: {
        tlsVersion: 'TLS 1.2 minimum (TLS 1.3 recommended)',
        cipherSuites: 'Strong cipher suites only',
        keyManagement: 'Secure key storage and rotation',
        certificateValidation: 'Regular certificate validation and renewal',
        vulnerabilityScanning: 'Regular SSL/TLS vulnerability scanning'
      }
    };
  }

  /**
   * Mask sensitive path information for logging
   * @param {string} filePath - File path to mask
   * @returns {string} Masked path
   */
  maskPath(filePath) {
    if (!filePath) return 'undefined';
    
    const parts = filePath.split('/');
    if (parts.length <= 2) return filePath;
    
    return `${parts[0]}/.../${parts[parts.length - 1]}`;
  }

  /**
   * Check if SSL is properly configured
   * @returns {Object} SSL configuration status
   */
  getSSLStatus() {
    return {
      enabled: this.sslEnabled,
      certificatesLoaded: this.sslOptions !== null,
      environment: this.isProduction ? 'production' : 'development',
      tlsVersion: this.sslOptions ? 'TLS 1.2+' : 'N/A',
      cipherSuite: this.sslOptions ? 'PCI compliant' : 'N/A'
    };
  }
}

// Export singleton instance
module.exports = new SSLConfig();