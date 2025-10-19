const DatabaseUtil = require('../utils/database');
const fs = require('fs');
const path = require('path');

async function runSecurityAuditMigration() {
  try {
    console.log('Starting security audit migration...');
    
    const migrationPath = path.join(__dirname, '../../database/migrations/add_security_audit_columns.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split by semicolon and filter out empty statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute`);
    console.log('Statements:', statements.map((s, i) => `${i + 1}: ${s.substring(0, 100)}...`));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\n[${i + 1}/${statements.length}] Executing: ${statement.substring(0, 80)}...`);
      
      const result = await DatabaseUtil.executeQuery(statement);
      
      if (!result.success) {
        // Check if error is about column already existing (safe to ignore)
        if (result.error && result.error.includes('Duplicate column name')) {
          console.log('⚠️  Column already exists, skipping...');
          continue;
        }
        
        console.error('❌ Migration error:', result.error);
        throw new Error(`Migration failed at statement ${i + 1}: ${result.error}`);
      } else {
        console.log('✅ Statement executed successfully');
      }
    }
    
    console.log('\n🎉 Security audit migration completed successfully!');
    
    // Test the new structure
    console.log('\nTesting new audit_logs structure...');
    const testResult = await DatabaseUtil.executeQuery(
      'DESCRIBE audit_logs'
    );
    
    if (testResult.success) {
      console.log('✅ Audit logs table structure:');
      testResult.data.forEach(column => {
        console.log(`  - ${column.Field}: ${column.Type}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run the migration
runSecurityAuditMigration();