-- =====================================================
-- Tax Rates Migration - Initial Data
-- =====================================================
-- This migration adds initial tax rates for common locations
-- Tax rates are stored as decimals (e.g., 0.08 for 8%)
-- =====================================================

-- Insert common US state tax rates
INSERT INTO tax_rates (id, location_json, tax_name, tax_rate, is_active) VALUES
-- California
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'CA'), 'California State Tax', 0.0725, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'CA', 'city', 'Los Angeles'), 'Los Angeles City Tax', 0.0100, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'CA', 'city', 'San Francisco'), 'San Francisco City Tax', 0.0125, true),

-- New York
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'NY'), 'New York State Tax', 0.0800, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'NY', 'city', 'New York'), 'New York City Tax', 0.0450, true),

-- Texas (no state income tax, but has sales tax)
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'TX'), 'Texas State Tax', 0.0625, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'TX', 'city', 'Houston'), 'Houston City Tax', 0.0100, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'TX', 'city', 'Dallas'), 'Dallas City Tax', 0.0100, true),

-- Florida
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'FL'), 'Florida State Tax', 0.0600, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'FL', 'city', 'Miami'), 'Miami-Dade County Tax', 0.0100, true),

-- Illinois
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'IL'), 'Illinois State Tax', 0.0625, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'IL', 'city', 'Chicago'), 'Chicago City Tax', 0.0325, true),

-- Washington (no state income tax)
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'WA'), 'Washington State Tax', 0.0650, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'WA', 'city', 'Seattle'), 'Seattle City Tax', 0.0350, true),

-- Nevada (no state income tax)
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'NV'), 'Nevada State Tax', 0.0685, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'NV', 'city', 'Las Vegas'), 'Las Vegas City Tax', 0.0125, true),

-- Oregon (no sales tax)
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'OR'), 'Oregon State Tax', 0.0000, true),

-- Delaware (no sales tax)
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'DE'), 'Delaware State Tax', 0.0000, true),

-- Montana (no sales tax)
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'MT'), 'Montana State Tax', 0.0000, true),

-- New Hampshire (no sales tax)
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'NH'), 'New Hampshire State Tax', 0.0000, true),

-- Canada - Provincial taxes (GST + PST/HST)
-- British Columbia
(get_next_id('TAX'), JSON_OBJECT('country', 'CA', 'state', 'BC'), 'BC GST', 0.0500, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'CA', 'state', 'BC'), 'BC PST', 0.0700, true),

-- Ontario
(get_next_id('TAX'), JSON_OBJECT('country', 'CA', 'state', 'ON'), 'Ontario HST', 0.1300, true),

-- Quebec
(get_next_id('TAX'), JSON_OBJECT('country', 'CA', 'state', 'QC'), 'Quebec GST', 0.0500, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'CA', 'state', 'QC'), 'Quebec QST', 0.0975, true),

-- Alberta
(get_next_id('TAX'), JSON_OBJECT('country', 'CA', 'state', 'AB'), 'Alberta GST', 0.0500, true),

-- European Union - VAT rates
-- United Kingdom
(get_next_id('TAX'), JSON_OBJECT('country', 'GB'), 'UK VAT', 0.2000, true),

-- Germany
(get_next_id('TAX'), JSON_OBJECT('country', 'DE'), 'German VAT', 0.1900, true),

-- France
(get_next_id('TAX'), JSON_OBJECT('country', 'FR'), 'French VAT', 0.2000, true),

-- Italy
(get_next_id('TAX'), JSON_OBJECT('country', 'IT'), 'Italian VAT', 0.2200, true),

-- Spain
(get_next_id('TAX'), JSON_OBJECT('country', 'ES'), 'Spanish VAT', 0.2100, true),

-- Netherlands
(get_next_id('TAX'), JSON_OBJECT('country', 'NL'), 'Dutch VAT', 0.2100, true),

-- Australia - GST
(get_next_id('TAX'), JSON_OBJECT('country', 'AU'), 'Australian GST', 0.1000, true),

-- New Zealand - GST
(get_next_id('TAX'), JSON_OBJECT('country', 'NZ'), 'New Zealand GST', 0.1500, true),

-- Japan - Consumption Tax
(get_next_id('TAX'), JSON_OBJECT('country', 'JP'), 'Japan Consumption Tax', 0.1000, true),

-- Singapore - GST
(get_next_id('TAX'), JSON_OBJECT('country', 'SG'), 'Singapore GST', 0.0800, true),

-- China - VAT (for international sales)
(get_next_id('TAX'), JSON_OBJECT('country', 'CN'), 'China VAT', 0.1300, true),

-- India - GST
(get_next_id('TAX'), JSON_OBJECT('country', 'IN'), 'India GST', 0.1800, true),

-- Brazil - ICMS (varies by state, using average)
(get_next_id('TAX'), JSON_OBJECT('country', 'BR'), 'Brazil ICMS', 0.1700, true),

-- Mexico - IVA
(get_next_id('TAX'), JSON_OBJECT('country', 'MX'), 'Mexico IVA', 0.1600, true);

-- Add some common zero-tax jurisdictions
INSERT INTO tax_rates (id, location_json, tax_name, tax_rate, is_active) VALUES
-- US states with no sales tax
(get_next_id('TAX'), JSON_OBJECT('country', 'US', 'state', 'AK'), 'Alaska State Tax', 0.0000, true),

-- International locations with no VAT/GST for certain products
(get_next_id('TAX'), JSON_OBJECT('country', 'AE'), 'UAE VAT', 0.0500, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'CH'), 'Switzerland VAT', 0.0770, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'NO'), 'Norway VAT', 0.2500, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'SE'), 'Sweden VAT', 0.2500, true),
(get_next_id('TAX'), JSON_OBJECT('country', 'DK'), 'Denmark VAT', 0.2500, true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tax_rates_country ON tax_rates ((JSON_EXTRACT(location_json, '$.country')));
CREATE INDEX IF NOT EXISTS idx_tax_rates_state ON tax_rates ((JSON_EXTRACT(location_json, '$.state')));
CREATE INDEX IF NOT EXISTS idx_tax_rates_city ON tax_rates ((JSON_EXTRACT(location_json, '$.city')));
CREATE INDEX IF NOT EXISTS idx_tax_rates_active ON tax_rates (is_active);

-- Add a comment to track this migration
INSERT INTO system_settings (id, setting_key, setting_value, setting_type, setting_details, is_public, updated_by) 
VALUES (
  get_next_id('SYS'), 
  'tax_rates_migration_completed', 
  'true', 
  'boolean',
  JSON_OBJECT('description', 'Initial tax rates migration completed', 'version', '1.0', 'date', NOW()),
  false,
  NULL
) ON DUPLICATE KEY UPDATE 
  setting_value = 'true',
  updated_at = CURRENT_TIMESTAMP;