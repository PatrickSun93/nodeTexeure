const DatabaseUtil = require('../utils/database');

async function addSecurityColumns() {
  try {
    console.log('Adding security monitoring columns to audit_logs table...');
    
    // First, check if columns already exist
    const checkResult = await DatabaseUtil.executeQuery('DESCRIBE audit_logs');
    if (!checkResult.success) {
      throw new Error('Failed to check table structure');
    }
    
    const existingColumns = checkResult.data.map(col => col.Field);
    console.log('Existing columns:', existingColumns);
    
    // Add columns one by one
    const columnsToAdd = [
      {
        name: 'operation_type',
        definition: 'operation_type VARCHAR(100) NULL COMMENT \'Security operation type (USER_LOGIN, SECURITY_VIOLATION, etc.)\''
      },
      {
        name: 'audit_details',
        definition: 'audit_details JSON NULL COMMENT \'Complete audit event details including request/response data\''
      },
      {
        name: 'severity',
        definition: 'severity VARCHAR(20) NULL COMMENT \'Security event severity (LOW, MEDIUM, HIGH, CRITICAL)\''
      },
      {
        name: 'ip_address',
        definition: 'ip_address VARCHAR(45) NULL COMMENT \'IP address for quick filtering\''
      },
      {
        name: 'user_agent',
        definition: 'user_agent TEXT NULL COMMENT \'User agent string for device tracking\''
      }
    ];
    
    for (const column of columnsToAdd) {
      if (!existingColumns.includes(column.name)) {
        console.log(`Adding column: ${column.name}`);
        const result = await DatabaseUtil.executeQuery(
          `ALTER TABLE audit_logs ADD COLUMN ${column.definition}`
        );
        
        if (result.success) {
          console.log(`✅ Added column: ${column.name}`);
        } else {
          console.error(`❌ Failed to add column ${column.name}:`, result.error);
        }
      } else {
        console.log(`⚠️  Column ${column.name} already exists, skipping...`);
      }
    }
    
    // Now add indexes
    const indexesToAdd = [
      'CREATE INDEX idx_operation_type ON audit_logs(operation_type)',
      'CREATE INDEX idx_severity ON audit_logs(severity)',
      'CREATE INDEX idx_ip_address ON audit_logs(ip_address)',
      'CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC)'
    ];
    
    for (const indexSQL of indexesToAdd) {
      console.log(`Adding index: ${indexSQL.substring(0, 50)}...`);
      const result = await DatabaseUtil.executeQuery(indexSQL);
      
      if (result.success) {
        console.log('✅ Index added successfully');
      } else if (result.error && result.error.includes('Duplicate key name')) {
        console.log('⚠️  Index already exists, skipping...');
      } else {
        console.error('❌ Failed to add index:', result.error);
      }
    }
    
    console.log('\n🎉 Security columns and indexes added successfully!');
    
    // Test the new structure
    const finalResult = await DatabaseUtil.executeQuery('DESCRIBE audit_logs');
    if (finalResult.success) {
      console.log('\n✅ Final audit_logs table structure:');
      finalResult.data.forEach(column => {
        console.log(`  - ${column.Field}: ${column.Type}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to add security columns:', error.message);
    process.exit(1);
  }
}

addSecurityColumns();