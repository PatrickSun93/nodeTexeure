const db = require('../utils/database');
const fs = require('fs');
const path = require('path');

async function runShippingMigration() {
  console.log('🚀 Running shipping data migration...\n');

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../../database/migrations/add_shipping_data.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Remove comments and split by semicolons
    const cleanSQL = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
      .join('\n');
    
    const statements = cleanSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`Found ${statements.length} SQL statements to execute...\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const result = await db.executeQuery(statement);
        if (result.success) {
          console.log('✅ Success');
        } else {
          // Check if it's a duplicate entry error (which is okay for this migration)
          if (result.code === 'ER_DUP_ENTRY') {
            console.log('⚠️  Entry already exists, skipping...');
          } else {
            throw new Error(result.error);
          }
        }
      } catch (error) {
        throw error;
      }
    }

    console.log('\n🎉 Shipping data migration completed successfully!');

    // Verify the data was inserted
    const zonesResult = await db.executeQuery('SELECT COUNT(*) as count FROM shipping_zones');
    const ratesResult = await db.executeQuery('SELECT COUNT(*) as count FROM shipping_rates');
    
    console.log(`\n📊 Migration Results:`);
    console.log(`   - Shipping zones: ${zonesResult.data[0].count}`);
    console.log(`   - Shipping rates: ${ratesResult.data[0].count}`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  runShippingMigration()
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = runShippingMigration;